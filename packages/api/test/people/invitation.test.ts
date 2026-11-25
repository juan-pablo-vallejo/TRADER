// people.sendInvitation and people.noteInvitation: an invitation emailed by TRADER or
// noted as opened on the admin's own phone, each send recorded, and where the invitation
// stands read back from people.list. The mail service is a stand-in that keeps what it was
// handed; the real adapter is apps/web's. Rolled-back transactions: a send is never
// deleted. The table's own guards are the db suite's (core/invitation-sends.test.ts).
import { invitationSends, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createContext, type Tx } from "../../src/core/context";
import { localDirectory } from "../../src/core/identity";
import {
  type Mail,
  type Mailer,
  type MailResult,
  restrictedTo,
} from "../../src/core/mailer";
import { createCallerFactory } from "../../src/core/trpc";
import { INVITATION_EMAILS_A_DAY } from "../../src/people/invitation";
import { appRouter } from "../../src/router";
import {
  becomeApp,
  boundIn,
  companyIn,
  outcome,
  ownerDb,
  quietReporter,
  REQUEST_ID,
  rolledBack,
  txAsDb,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

function recordingMailer(answer: MailResult = { ok: true, messageId: "msg_1" }) {
  const sent: Mail[] = [];
  const mailer: Mailer = {
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve(answer);
    },
  };
  return { sent, mailer };
}

const GET = "https://office.example/get";

type Host = {
  mailer?: Mailer;
  getAppUrl?: string | null;
  closed?: { companyId: string; allowed: string[] };
};

// A company with an admin, a worker who has signed in, and three people invited and not
// yet signed in: by number, by email, and by both.
async function office(tx: Tx) {
  const c = await companyIn(tx, "admin");
  const elsewhere = await companyIn(tx, "admin");
  const worker = await boundIn(tx, c.companyId, "worker");
  const invite = async (
    name: string,
    address: { email?: string; signInPhone?: string },
    opts: { deactivated?: boolean } = {},
  ) => {
    const [row] = await tx
      .insert(users)
      .values({
        companyId: c.companyId,
        name,
        email: address.email ?? null,
        signInPhone: address.signInPhone ?? null,
        deactivatedAt: opts.deactivated ? new Date() : null,
      })
      .returning({ id: users.id });
    return row!.id;
  };
  const run = uuidv7().slice(-8);
  const byNumber = await invite("Nora Number", { signInPhone: "+14015550111" });
  const byEmail = await invite("Elio Email", { email: `elio-${run}@crew.test` });
  const byBoth = await invite("Bea Both", {
    email: `Bea-${run}@Crew.test`,
    signInPhone: "+14015550112",
  });
  const gone = await invite(
    "Gus Gone",
    { email: `gus-${run}@crew.test`, signInPhone: "+14015550113" },
    { deactivated: true },
  );
  const stranger = await tx
    .insert(users)
    .values({
      companyId: elsewhere.companyId,
      name: "Other Co",
      email: `o-${run}@x.test`,
    })
    .returning({ id: users.id });
  await becomeApp(tx);
  const as = (who: unknown, host: Host = {}) =>
    createCallerFactory(appRouter)(
      createContext({
        directory: localDirectory,
        mailer: host.mailer ?? recordingMailer().mailer,
        getAppUrl: host.getAppUrl === undefined ? GET : host.getAppUrl,
        ...(host.closed !== undefined && { closed: host.closed }),
        db: txAsDb(tx),
        identity: who,
        reporter: quietReporter,
        requestId: REQUEST_ID,
        waits: "inherit",
      }),
    ).people;
  // Every send of the company, as the owner sees the table.
  const rows = async () => {
    await tx.execute(sql`reset role`);
    const found = await tx
      .select({
        id: invitationSends.id,
        userId: invitationSends.userId,
        channel: invitationSends.channel,
        recipient: invitationSends.recipient,
        outcome: invitationSends.outcome,
        failure: invitationSends.failure,
        providerMessageId: invitationSends.providerMessageId,
        sentByUserId: invitationSends.sentByUserId,
      })
      .from(invitationSends)
      .where(eq(invitationSends.companyId, c.companyId));
    await becomeApp(tx);
    return found;
  };
  const statusOf = async (userId: string) =>
    (await as(c.who).list()).find((r) => r.id === userId)?.invitation;
  return {
    c,
    worker,
    byNumber,
    byEmail,
    byBoth,
    gone,
    strangerId: stranger[0]!.id,
    run,
    as,
    rows,
    statusOf,
  };
}

describe("people.sendInvitation", () => {
  it("emails the invitation to the person's own address and records the send", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const id = uuidv7();
      expect(
        await o.as(o.c.who, { mailer }).sendInvitation({ id, userId: o.byBoth }),
      ).toEqual({ result: "sent" });
      // The address as the roster holds it, lowercased as it is compared; both languages,
      // the host's own link, and the sentence that names an email; the browser's id.
      expect(sent).toHaveLength(1);
      const mail = sent[0]!;
      expect(mail.to).toBe(`bea-${o.run}@crew.test`);
      expect(mail.idempotencyKey).toBe(id);
      expect(mail.attachment).toBeUndefined();
      expect(mail.subject).toMatch(/^Rolled Co .+: get the TRADER app \/ obtén/);
      expect(mail.text).toHaveLength(2);
      expect(mail.text[0]).toMatch(/^Bea Both: Rolled Co .+ uses TRADER/);
      expect(mail.text[0]).toContain(
        `Get the app: ${GET} Then sign in with this email address.`,
      );
      expect(mail.text[1]).toContain(
        `Obtén la aplicación: ${GET} Después inicia sesión con este correo.`,
      );
      expect(await o.rows()).toEqual([
        {
          id,
          userId: o.byBoth,
          channel: "email",
          recipient: `bea-${o.run}@crew.test`,
          outcome: "sent",
          failure: null,
          providerMessageId: "msg_1",
          sentByUserId: o.c.userId,
        },
      ]);
    });
  });

  it("records a send the mail service did not take, and says so", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      for (const failure of ["provider_refused", "provider_unreachable"] as const) {
        const { mailer } = recordingMailer({ ok: false, failure });
        expect(
          await o
            .as(o.c.who, { mailer })
            .sendInvitation({ id: uuidv7(), userId: o.byEmail }),
        ).toEqual({ result: "failed", failure });
      }
      // Outside the deployment's allow-list, the service is never asked.
      const { sent, mailer } = recordingMailer();
      expect(
        await o
          .as(o.c.who, { mailer: restrictedTo(["someone@else.test"], mailer) })
          .sendInvitation({ id: uuidv7(), userId: o.byEmail }),
      ).toEqual({ result: "failed", failure: "recipient_not_allowed" });
      expect(sent).toEqual([]);
      expect((await o.rows()).map((r) => [r.outcome, r.failure])).toEqual([
        ["failed", "provider_refused"],
        ["failed", "provider_unreachable"],
        ["failed", "recipient_not_allowed"],
      ]);
      // Three tries that went nowhere: the invitation has not been sent.
      expect((await o.statusOf(o.byEmail))?.status).toBe("not_sent");
    });
  });

  it("answers a repeat of the same request without sending again", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const call = o.as(o.c.who, { mailer });
      const id = uuidv7();
      await call.sendInvitation({ id, userId: o.byEmail });
      expect(await call.sendInvitation({ id, userId: o.byEmail })).toEqual({
        result: "duplicate",
        outcome: "sent",
      });
      // The id is one send's: not another person's, and not a text's.
      expect(await call.sendInvitation({ id, userId: o.byBoth })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await call.noteInvitation({ id, userId: o.byEmail, act: "sent" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(sent).toHaveLength(1);
      expect(await o.rows()).toHaveLength(1);
    });
  });

  it("sends to nobody it should not: no email, signed in, deactivated, no link", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const call = o.as(o.c.who, { mailer });
      const send = (userId: string) => call.sendInvitation({ id: uuidv7(), userId });
      expect(await send(o.byNumber)).toEqual({ result: "rejected", code: "no_email" });
      expect(await send(o.worker.id)).toEqual({ result: "rejected", code: "signed_in" });
      expect(await send(o.gone)).toEqual({ result: "rejected", code: "deactivated" });
      // A host that names no address of its own has no link to send.
      expect(
        await o
          .as(o.c.who, { mailer, getAppUrl: null })
          .sendInvitation({ id: uuidv7(), userId: o.byEmail }),
      ).toEqual({ result: "rejected", code: "no_link" });
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([]);
    });
  });

  it("stops after a few in a day, so nobody's inbox is the office's to fill", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const call = o.as(o.c.who, { mailer });
      for (let n = 0; n < INVITATION_EMAILS_A_DAY; n += 1) {
        expect(await call.sendInvitation({ id: uuidv7(), userId: o.byEmail })).toEqual({
          result: "sent",
        });
      }
      expect(await call.sendInvitation({ id: uuidv7(), userId: o.byEmail })).toEqual({
        result: "rejected",
        code: "too_many",
      });
      expect(sent).toHaveLength(INVITATION_EMAILS_A_DAY);
      // Another person's are their own count.
      expect(await call.sendInvitation({ id: uuidv7(), userId: o.byBoth })).toEqual({
        result: "sent",
      });
    });
  });

  it("is the office's alone, in its own company", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const input = { id: uuidv7(), userId: o.byEmail };
      expect(await outcome(o.as(o.worker.who, { mailer }).sendInvitation(input))).toBe(
        "FORBIDDEN",
      );
      expect(
        await outcome(o.as(o.worker.who).noteInvitation({ ...input, act: "sent" })),
      ).toBe("FORBIDDEN");
      // Another company's person, and nobody at all: one answer.
      for (const userId of [o.strangerId, uuidv7()]) {
        expect(
          await outcome(
            o.as(o.c.who, { mailer }).sendInvitation({ id: uuidv7(), userId }),
          ),
        ).toBe("FORBIDDEN");
        expect(
          await outcome(
            o.as(o.c.who).noteInvitation({ id: uuidv7(), userId, act: "sent" }),
          ),
        ).toBe("FORBIDDEN");
      }
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([]);
    });
  });

  it("is refused to the closed company before anything is sent or recorded", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const closed = { companyId: o.c.companyId, allowed: [`elio-${o.run}@crew.test`] };
      const call = o.as(o.c.who, { mailer, closed });
      expect(await call.sendInvitation({ id: uuidv7(), userId: o.byEmail })).toEqual({
        result: "rejected",
        code: "company_closed",
      });
      expect(
        await call.noteInvitation({ id: uuidv7(), userId: o.byNumber, act: "sent" }),
      ).toEqual({
        result: "rejected",
        code: "company_closed",
      });
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([]);
    });
  });
});

describe("people.noteInvitation", () => {
  it("records that the text was opened to send, to the number the roster holds", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const id = uuidv7();
      const call = o.as(o.c.who, { mailer });
      expect(await call.noteInvitation({ id, userId: o.byNumber, act: "sent" })).toEqual({
        result: "noted",
      });
      expect(await call.noteInvitation({ id, userId: o.byNumber, act: "sent" })).toEqual({
        result: "duplicate",
      });
      // TRADER sends nothing for a text.
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([
        {
          id,
          userId: o.byNumber,
          channel: "whatsapp",
          recipient: "+14015550111",
          outcome: "sent",
          failure: null,
          providerMessageId: null,
          sentByUserId: o.c.userId,
        },
      ]);
    });
  });

  it("leaves a copied or opened invitation not sent until the admin says it went", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const call = o.as(o.c.who);
      const note = (act: "copied" | "opened" | "sent") =>
        call.noteInvitation({ id: uuidv7(), userId: o.byNumber, act });
      expect(await note("copied")).toEqual({ result: "noted" });
      expect(await note("opened")).toEqual({ result: "noted" });
      const standing = await o.statusOf(o.byNumber);
      expect(standing?.status).toBe("not_sent");
      expect(standing?.sends.map((s) => s.outcome).sort()).toEqual(["copied", "opened"]);
      expect(await note("sent")).toEqual({ result: "noted" });
      expect((await o.statusOf(o.byNumber))?.status).toBe("sent");
    });
  });

  it("notes nothing for a person with no number, signed in, or deactivated", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const note = (userId: string) =>
        o.as(o.c.who).noteInvitation({ id: uuidv7(), userId, act: "sent" });
      expect(await note(o.byEmail)).toEqual({ result: "rejected", code: "no_number" });
      expect(await note(o.worker.id)).toEqual({ result: "rejected", code: "signed_in" });
      expect(await note(o.gone)).toEqual({ result: "rejected", code: "deactivated" });
      expect(await o.rows()).toEqual([]);
    });
  });
});

describe("where an invitation stands, in people.list", () => {
  it("is not sent, then sent, with each send newest first and who made it", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      expect(await o.statusOf(o.byBoth)).toEqual({ status: "not_sent", sends: [] });
      const text = uuidv7();
      await o.as(o.c.who).noteInvitation({ id: text, userId: o.byBoth, act: "sent" });
      const email = uuidv7();
      await o
        .as(o.c.who, {
          mailer: recordingMailer({ ok: false, failure: "provider_refused" }).mailer,
        })
        .sendInvitation({ id: email, userId: o.byBoth });
      const standing = await o.statusOf(o.byBoth);
      expect(standing?.status).toBe("sent");
      expect(standing?.sends.map((s) => s.id).sort()).toEqual([text, email].sort());
      expect(standing?.sends.find((s) => s.id === text)).toMatchObject({
        channel: "whatsapp",
        by: "Rolled",
        outcome: "sent",
        failure: null,
      });
      expect(standing?.sends.find((s) => s.id === email)).toMatchObject({
        channel: "email",
        by: "Rolled",
        outcome: "failed",
        failure: "provider_refused",
      });
      // Nobody else's row carries them.
      expect(await o.statusOf(o.byEmail)).toEqual({ status: "not_sent", sends: [] });
    });
  });

  it("is verified for a person who has signed in, whatever was sent", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      expect(await o.statusOf(o.worker.id)).toEqual({ status: "verified", sends: [] });
    });
  });

  it("counts only a send to an address the person still has", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o
        .as(o.c.who)
        .noteInvitation({ id: uuidv7(), userId: o.byNumber, act: "sent" });
      expect((await o.statusOf(o.byNumber))?.status).toBe("sent");
      // The number is changed (as the owner, here): the old send reached another number.
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ signInPhone: "+14015550199" })
        .where(eq(users.id, o.byNumber));
      await becomeApp(tx);
      const standing = await o.statusOf(o.byNumber);
      expect(standing?.status).toBe("not_sent");
      // The record of it stays.
      expect(standing?.sends).toHaveLength(1);
    });
  });
});
