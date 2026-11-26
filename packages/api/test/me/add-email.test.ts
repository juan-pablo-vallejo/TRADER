// me.sendEmailCode and me.addEmail: a person invited by number alone adds an email from Me,
// proved by a code mailed to it. The mailer and the provider are stand-ins that keep what
// they were handed; the real provider is apps/web's (clerk-directory.ts, addEmail).
// Rolled-back transactions throughout. Also here: a worker's name is the office's
// (me.update), and an email a person added leaves their own Face ID key standing (me.get).
import { addressChanges, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createContext, type Tx } from "../../src/core/context";
import { localDirectory, type IdentityDirectory } from "../../src/core/identity";
import type { Mail, Mailer } from "../../src/core/mailer";
import { createCallerFactory } from "../../src/core/trpc";
import { CODE_LIFE_MS, RESEND_AFTER_MS, TRIES_A_DAY } from "../../src/me/add-email";
import { appRouter } from "../../src/router";
import {
  becomeApp,
  companyIn,
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

type Added = Parameters<IdentityDirectory["addEmail"]>[0];

// A mailer that keeps each mail, or refuses every one.
function mailbox(ok = true) {
  const sent: Mail[] = [];
  const mailer: Mailer = {
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve(
        ok ? { ok: true, messageId: "m" } : { ok: false, failure: "provider_refused" },
      );
    },
  };
  // The code the last mail carried.
  const code = () => /\b(\d{6})\b/.exec(sent.at(-1)?.text.join(" ") ?? "")?.[1] ?? "";
  return { sent, mailer, code };
}

function provider(answer: Awaited<ReturnType<IdentityDirectory["addEmail"]>> = "done") {
  const told: Added[] = [];
  const directory: IdentityDirectory = {
    ...localDirectory,
    addEmail: (person) => {
      told.push(person);
      return Promise.resolve(answer);
    },
  };
  return { told, directory };
}

// A company with an admin, a worker invited by number who has signed in, and a person who
// holds an email already.
async function crew(tx: Tx) {
  const c = await companyIn(tx, "admin");
  const run = uuidv7().slice(-8);
  const subject = `sub-phone-${run}`;
  const [worker] = await tx
    .insert(users)
    .values({
      companyId: c.companyId,
      name: "Nora Number",
      signInPhone: "+14015550177",
      identitySubject: subject,
    })
    .returning({ id: users.id });
  const takenEmail = `Taken-${run}@crew.test`;
  await tx
    .insert(users)
    .values({ companyId: c.companyId, name: "Tess Taken", email: takenEmail });
  await becomeApp(tx);
  const who = { subject, phone: "+14015550177", phoneVerified: true as const };
  const as = (
    identity: unknown,
    opts: {
      mailer?: Mailer;
      directory?: IdentityDirectory;
      emailCode?: string | null;
      closed?: { companyId: string; allowed: string[] };
    } = {},
  ) =>
    createCallerFactory(appRouter)(
      createContext({
        directory: opts.directory ?? provider().directory,
        ...(opts.mailer !== undefined && { mailer: opts.mailer }),
        ...(opts.emailCode !== undefined && { emailCode: opts.emailCode }),
        ...(opts.closed !== undefined && { closed: opts.closed }),
        db: txAsDb(tx),
        identity,
        reporter: quietReporter,
        requestId: REQUEST_ID,
        waits: "inherit",
      }),
    ).me;
  // As the owner sees the worker's row, and the address changes on record.
  const state = async () => {
    await tx.execute(sql`reset role`);
    const [row] = await tx
      .select({
        email: users.email,
        claim: users.emailClaim,
        hash: users.emailClaimCodeHash,
        tries: users.emailClaimTries,
      })
      .from(users)
      .where(eq(users.id, worker!.id));
    const changes = await tx
      .select({
        field: addressChanges.field,
        from: addressChanges.oldValue,
        to: addressChanges.newValue,
        by: addressChanges.changedByUserId,
      })
      .from(addressChanges)
      .where(eq(addressChanges.userId, worker!.id));
    await becomeApp(tx);
    return { ...row!, changes };
  };
  // The code was sent this long ago.
  const age = async (ms: number) => {
    await tx.execute(sql`reset role`);
    await tx
      .update(users)
      .set({ emailClaimSentAt: new Date(Date.now() - ms) })
      .where(eq(users.id, worker!.id));
    await becomeApp(tx);
  };
  return { c, run, workerId: worker!.id, subject, who, takenEmail, as, state, age };
}

describe("me.sendEmailCode and me.addEmail", () => {
  it("mails a code in the person's language, keeps only its hash, and adds the email with it", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const p = provider();
      const me = k.as(k.who, { mailer: box.mailer, directory: p.directory });
      const email = `nora-${k.run}@crew.test`;
      expect(await me.sendEmailCode({ email, language: "es" })).toEqual({
        result: "sent",
      });
      expect(box.sent).toHaveLength(1);
      expect(box.sent[0]).toMatchObject({ to: email, subject: "Tu código de TRADER" });
      const code = box.code();
      expect(code).toMatch(/^\d{6}$/);
      const pending = await k.state();
      expect(pending).toMatchObject({ email: null, claim: email, tries: 1 });
      expect(pending.hash).not.toContain(code);

      expect(await me.addEmail({ code })).toEqual({ result: "added", email });
      // The login gains the email and nothing else is asked of the provider.
      expect(p.told).toEqual([{ id: k.workerId, subject: k.subject, email }]);
      expect(await k.state()).toEqual({
        email,
        claim: null,
        hash: null,
        tries: 1,
        changes: [{ field: "email", from: null, to: email, by: k.workerId }],
      });
      // Now the email is the office's to change: a second claim is refused.
      expect(
        await me.sendEmailCode({ email: `x-${k.run}@crew.test`, language: "en" }),
      ).toEqual({ result: "rejected", code: "has_email" });
      expect(await me.addEmail({ code })).toEqual({
        result: "rejected",
        code: "has_email",
      });
    });
  });

  it("writes the mail in English when the app is in English", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      await k
        .as(k.who, { mailer: box.mailer })
        .sendEmailCode({ email: `nora-${k.run}@crew.test`, language: "en" });
      expect(box.sent[0]!.subject).toBe("Your TRADER code");
      expect(box.sent[0]!.text[0]).toContain(box.code());
    });
  });

  it(`holds sends and wrong codes to ${TRIES_A_DAY} a day, which a new code does not reset`, async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const me = k.as(k.who, { mailer: box.mailer });
      const email = `nora-${k.run}@crew.test`;
      const wrongFor = (right: string) => (right === "000000" ? "111111" : "000000");
      // A send and four wrong codes, then a new code a minute later: five more tries.
      await me.sendEmailCode({ email, language: "en" });
      for (let i = 0; i < 4; i++) {
        expect(await me.addEmail({ code: wrongFor(box.code()) })).toEqual({
          result: "rejected",
          code: "wrong_code",
        });
      }
      await k.age(RESEND_AFTER_MS + 1_000);
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "sent",
      });
      const right = box.code();
      for (let i = 0; i < 3; i++) {
        expect(await me.addEmail({ code: wrongFor(right) })).toEqual({
          result: "rejected",
          code: "wrong_code",
        });
      }
      // The tenth: the day's last.
      expect(await me.addEmail({ code: wrongFor(right) })).toEqual({
        result: "rejected",
        code: "too_many",
      });
      // Neither the right code nor a new one, for the rest of the day.
      expect(await me.addEmail({ code: right })).toEqual({
        result: "rejected",
        code: "too_many",
      });
      await k.age(RESEND_AFTER_MS + 1_000);
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "rejected",
        code: "too_many",
      });
      expect((await k.state()).email).toBeNull();
      // A day after the last send, the count starts again.
      await k.age(24 * 60 * 60_000 + 1_000);
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "sent",
      });
      expect(await me.addEmail({ code: box.code() })).toEqual({ result: "added", email });
    });
  });

  it("refuses the closed company: a Demo login gains no email", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const me = k.as(k.who, {
        mailer: box.mailer,
        closed: { companyId: k.c.companyId, allowed: [] },
      });
      expect(
        await me.sendEmailCode({ email: `nora-${k.run}@crew.test`, language: "en" }),
      ).toEqual({ result: "rejected", code: "company_closed" });
      expect(await me.addEmail({ code: "123456" })).toEqual({
        result: "rejected",
        code: "company_closed",
      });
      expect(box.sent).toHaveLength(0);
      expect(await k.state()).toMatchObject({ email: null, claim: null });
    });
  });

  it("refuses a caller deactivated before the row was theirs", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const me = k.as(k.who, { emailCode: "123456" });
      await me.sendEmailCode({ email: `nora-${k.run}@crew.test`, language: "en" });
      // Deactivated after the request found its caller: the lock sees it.
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, k.workerId));
      await becomeApp(tx);
      await expect(me.addEmail({ code: "123456" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  it("refuses a code older than its life, and a check with no code sent", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const me = k.as(k.who, { mailer: box.mailer });
      expect(await me.addEmail({ code: "123456" })).toEqual({
        result: "rejected",
        code: "no_code",
      });
      await me.sendEmailCode({ email: `nora-${k.run}@crew.test`, language: "en" });
      await k.age(CODE_LIFE_MS + 1_000);
      expect(await me.addEmail({ code: box.code() })).toEqual({
        result: "rejected",
        code: "expired",
      });
    });
  });

  it("gives a new code at most once a minute, and the new one replaces the last", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const me = k.as(k.who, { mailer: box.mailer });
      const email = `nora-${k.run}@crew.test`;
      await me.sendEmailCode({ email, language: "en" });
      const first = box.code();
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "rejected",
        code: "too_soon",
      });
      expect(box.sent).toHaveLength(1);
      await k.age(RESEND_AFTER_MS + 1_000);
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "sent",
      });
      const second = box.code();
      if (first !== second) {
        expect(await me.addEmail({ code: first })).toEqual({
          result: "rejected",
          code: "wrong_code",
        });
      }
      expect(await me.addEmail({ code: second })).toEqual({ result: "added", email });
    });
  });

  it("refuses an email another person of the company holds, whatever its case", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      expect(
        await k
          .as(k.who, { mailer: box.mailer })
          .sendEmailCode({ email: k.takenEmail.toLowerCase(), language: "en" }),
      ).toEqual({ result: "rejected", code: "email_taken" });
      expect(box.sent).toHaveLength(0);
    });
  });

  it("keeps no claim when the mail does not go", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const email = `nora-${k.run}@crew.test`;
      const refused = mailbox(false);
      expect(
        await k
          .as(k.who, { mailer: refused.mailer })
          .sendEmailCode({ email, language: "en" }),
      ).toEqual({ result: "rejected", code: "not_sent" });
      // A send that did not go counts for nothing, and holds the next back by nothing.
      expect(await k.state()).toMatchObject({ claim: null, hash: null, tries: 0 });
      const box = mailbox();
      expect(
        await k
          .as(k.who, { mailer: box.mailer })
          .sendEmailCode({ email, language: "en" }),
      ).toEqual({ result: "sent" });
    });
  });

  it("changes nothing when another login holds the email, and the claim stands", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const email = `nora-${k.run}@crew.test`;
      await k.as(k.who, { mailer: box.mailer }).sendEmailCode({ email, language: "en" });
      expect(
        await k.as(k.who, { directory: provider("held").directory }).addEmail({
          code: box.code(),
        }),
      ).toEqual({ result: "rejected", code: "address_held" });
      expect(await k.state()).toMatchObject({ email: null, claim: email, changes: [] });
    });
  });

  it("mails nothing under the development identity, where its one code proves the email", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const box = mailbox();
      const me = k.as(k.who, { mailer: box.mailer, emailCode: "123456" });
      const email = `nora-${k.run}@crew.test`;
      expect(await me.sendEmailCode({ email, language: "en" })).toEqual({
        result: "sent",
      });
      expect(box.sent).toHaveLength(0);
      expect(await me.addEmail({ code: "123456" })).toEqual({ result: "added", email });
    });
  });

  it("leaves a worker's name to the office, and an admin's own to the admin", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      await expect(
        k.as(k.who).update({ name: "Someone Else", phone: null }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        await k.as(k.c.who).update({ name: "The Admin", phone: null }),
      ).toMatchObject({ name: "The Admin" });
    });
  });

  it("leaves the person's own Face ID key standing after they add an email", async () => {
    await rolledBack(owner, async (tx) => {
      const k = await crew(tx);
      const madeBefore = new Date(Date.now() - 60_000);
      const me = k.as(k.who, { emailCode: "123456" });
      await me.sendEmailCode({ email: `nora-${k.run}@crew.test`, language: "en" });
      await me.addEmail({ code: "123456" });
      expect(await me.get({ keyMadeAt: madeBefore })).toMatchObject({ id: k.workerId });
      // The office's change after it still stops the key.
      await tx.execute(sql`reset role`);
      await tx.insert(addressChanges).values({
        companyId: k.c.companyId,
        userId: k.workerId,
        field: "sign_in_phone",
        oldValue: "+14015550177",
        newValue: "+14015550178",
        changedByUserId: k.c.userId,
      });
      await becomeApp(tx);
      await expect(me.get({ keyMadeAt: madeBefore })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });
});
