// people.setEmail and people.setSignInPhone: the office changes the address a worker signs
// in with. The provider is a stand-in that keeps what it was handed and answers as it is
// told; the real one is apps/web's (clerk-directory.ts). Rolled-back transactions: a
// change's record is never deleted. Two calls at once, and a clock tap during a change,
// need real commits and are address-commit.test.ts's; the table's own guards are the db
// suite's (core/address-changes.test.ts).
import { addressChanges, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createContext, type Tx } from "../../src/core/context";
import {
  localDirectory,
  type IdentityDirectory,
  type Readdressed,
} from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
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

type Told = Parameters<IdentityDirectory["readdress"]>[0];

// A provider that keeps what it was handed and answers as it is told, or fails.
function provider(answer: Readdressed | Error = "done") {
  const told: Told[] = [];
  const directory: IdentityDirectory = {
    ...localDirectory,
    readdress: (person) => {
      told.push(person);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { told, directory };
}

// A company with an admin (the caller), a second admin, a worker who has signed in and has
// both addresses, and two people invited and not signed in: one by number, one by email.
async function office(tx: Tx) {
  const c = await companyIn(tx, "admin");
  const elsewhere = await companyIn(tx, "admin");
  const run = uuidv7().slice(-8);
  const otherAdmin = await boundIn(tx, c.companyId, "admin");
  const worker = await boundIn(tx, c.companyId, "worker");
  const [bound] = await tx
    .update(users)
    .set({ signInPhone: "+14015550121" })
    .where(eq(users.id, worker.id))
    .returning({ email: users.email, subject: users.identitySubject });
  const person = async (values: Partial<typeof users.$inferInsert>) => {
    const [row] = await tx
      .insert(users)
      .values({ companyId: c.companyId, name: "Person", ...values })
      .returning({ id: users.id });
    return row!.id;
  };
  const byNumber = await person({ name: "Nora Number", signInPhone: "+14015550122" });
  const byEmail = await person({ name: "Elio Email", email: `elio-${run}@crew.test` });
  const gone = await person({
    name: "Gus Gone",
    email: `gus-${run}@crew.test`,
    deactivatedAt: new Date(),
  });
  const stranger = await tx
    .insert(users)
    .values({ companyId: elsewhere.companyId, name: "Other", email: `o-${run}@x.test` })
    .returning({ id: users.id });
  await becomeApp(tx);
  const as = (
    who: unknown,
    directory: IdentityDirectory = provider().directory,
    closed?: { companyId: string; allowed: string[] },
  ) =>
    createCallerFactory(appRouter)(
      createContext({
        directory,
        ...(closed !== undefined && { closed }),
        db: txAsDb(tx),
        identity: who,
        reporter: quietReporter,
        requestId: REQUEST_ID,
        waits: "inherit",
      }),
    ).people;
  // As the owner sees them: the person's two addresses, and every change on record.
  const state = async (userId: string) => {
    await tx.execute(sql`reset role`);
    const [row] = await tx
      .select({ email: users.email, signInPhone: users.signInPhone })
      .from(users)
      .where(eq(users.id, userId));
    const changes = await tx
      .select({
        userId: addressChanges.userId,
        field: addressChanges.field,
        from: addressChanges.oldValue,
        to: addressChanges.newValue,
        by: addressChanges.changedByUserId,
      })
      .from(addressChanges)
      .where(eq(addressChanges.companyId, c.companyId));
    await becomeApp(tx);
    return { ...row!, changes };
  };
  return {
    c,
    run,
    otherAdmin,
    worker: { ...worker, email: bound!.email!, subject: bound!.subject! },
    byNumber,
    byEmail,
    gone,
    strangerId: stranger[0]!.id,
    as,
    state,
  };
}

describe("people.setEmail and people.setSignInPhone", () => {
  it("changes a worker's email among the company's people and at the provider, and records it", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const email = `new-${o.run}@crew.test`;
      const answer = await o
        .as(o.c.who, p.directory)
        .setEmail({ userId: o.worker.id, email });
      expect(answer).toMatchObject({
        result: "changed",
        user: {
          id: o.worker.id,
          email,
          signInPhone: "+14015550121",
          addressChanges: [
            { field: "email", from: o.worker.email, to: email, by: "Rolled" },
          ],
        },
      });
      // The provider is handed the row, the login bound to it, and both addresses the row
      // now holds: never the address it had.
      expect(p.told).toEqual([
        {
          id: o.worker.id,
          subject: o.worker.subject,
          email,
          phone: "+14015550121",
          fresh: true,
        },
      ]);
      expect(JSON.stringify(p.told)).not.toContain(o.worker.email);
      expect(await o.state(o.worker.id)).toEqual({
        email,
        signInPhone: "+14015550121",
        changes: [
          {
            userId: o.worker.id,
            field: "email",
            from: o.worker.email,
            to: email,
            by: o.c.userId,
          },
        ],
      });
    });
  });

  it("gives a number, as it is typed, to a person invited by email, then takes the email away", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const call = o.as(o.c.who, p.directory);
      expect(
        await call.setSignInPhone({ userId: o.byEmail, phone: "(401) 555-0133" }),
      ).toMatchObject({ result: "changed", user: { signInPhone: "+14015550133" } });
      expect(await call.setEmail({ userId: o.byEmail, email: null })).toMatchObject({
        result: "changed",
        user: { email: null, signInPhone: "+14015550133" },
      });
      // A person who has not signed in has no login bound: the provider finds theirs by
      // the row.
      expect(p.told).toEqual([
        {
          id: o.byEmail,
          subject: null,
          email: `elio-${o.run}@crew.test`,
          phone: "+14015550133",
          fresh: true,
        },
        {
          id: o.byEmail,
          subject: null,
          email: null,
          phone: "+14015550133",
          fresh: true,
        },
      ]);
      expect(
        (await o.state(o.byEmail)).changes.map((c) => [c.field, c.from, c.to]),
      ).toEqual([
        ["sign_in_phone", null, "+14015550133"],
        ["email", `elio-${o.run}@crew.test`, null],
      ]);
    });
  });

  it("leaves a person the one address they have", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const call = o.as(o.c.who, p.directory);
      expect(await call.setSignInPhone({ userId: o.byNumber, phone: null })).toEqual({
        result: "rejected",
        code: "last_address",
      });
      expect(await call.setEmail({ userId: o.byEmail, email: null })).toEqual({
        result: "rejected",
        code: "last_address",
      });
      expect(p.told).toEqual([]);
      expect((await o.state(o.byNumber)).changes).toEqual([]);
    });
  });

  it("writes nothing for the address a person already has, and still hands the row to the provider", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      // The provider's login was left half-changed by an earlier try: this finishes it.
      const half = provider("done");
      expect(
        await o
          .as(o.c.who, half.directory)
          .setSignInPhone({ userId: o.worker.id, phone: "401-555-0121" }),
      ).toMatchObject({ result: "matched", user: { signInPhone: "+14015550121" } });
      const whole = provider("unchanged");
      expect(
        await o
          .as(o.c.who, whole.directory)
          .setEmail({ userId: o.worker.id, email: o.worker.email }),
      ).toMatchObject({ result: "unchanged" });
      for (const p of [half, whole]) {
        expect(p.told).toEqual([
          {
            id: o.worker.id,
            subject: o.worker.subject,
            email: o.worker.email,
            phone: "+14015550121",
            // The person's row did not change here: nobody is signed out for it.
            fresh: false,
          },
        ]);
      }
      expect((await o.state(o.worker.id)).changes).toEqual([]);
    });
  });

  it("refuses an admin's addresses, the caller's own among them, and a deactivated person's", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const call = o.as(o.c.who, p.directory);
      for (const userId of [o.otherAdmin.id, o.c.userId]) {
        expect(await call.setEmail({ userId, email: `x-${o.run}@crew.test` })).toEqual({
          result: "rejected",
          code: "admin",
        });
        expect(await call.setSignInPhone({ userId, phone: "+14015550140" })).toEqual({
          result: "rejected",
          code: "admin",
        });
      }
      expect(
        await call.setEmail({ userId: o.gone, email: `y-${o.run}@crew.test` }),
      ).toEqual({ result: "rejected", code: "deactivated" });
      expect(p.told).toEqual([]);
      expect((await o.state(o.c.userId)).changes).toEqual([]);
    });
  });

  it("refuses an address someone among the company's people has, and goes on working afterwards", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const call = o.as(o.c.who, p.directory);
      // Whatever its case, and whoever has it: a deactivated person keeps theirs.
      for (const email of [o.worker.email.toUpperCase(), `gus-${o.run}@crew.test`]) {
        expect(await call.setEmail({ userId: o.byNumber, email })).toEqual({
          result: "rejected",
          code: "email_taken",
        });
      }
      expect(
        await call.setSignInPhone({ userId: o.byEmail, phone: "+14015550122" }),
      ).toEqual({ result: "rejected", code: "phone_taken" });
      expect(p.told).toEqual([]);
      expect(await o.state(o.byNumber)).toEqual({
        email: null,
        signInPhone: "+14015550122",
        changes: [],
      });
      // The refusal was the database's, inside a savepoint: the next call is unharmed.
      expect(
        await call.setEmail({ userId: o.byNumber, email: `free-${o.run}@crew.test` }),
      ).toMatchObject({ result: "changed" });
    });
  });

  it("changes nothing when the provider holds the address under another login, or has no login for the row", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      for (const [answer, code] of [
        ["held", "address_held"],
        ["no_login", "no_login"],
      ] as const) {
        const p = provider(answer);
        expect(
          await o
            .as(o.c.who, p.directory)
            .setEmail({ userId: o.byNumber, email: `held-${o.run}@crew.test` }),
        ).toEqual({ result: "rejected", code });
        expect(p.told).toHaveLength(1);
        // The row and the record were written before the provider was asked, and undone.
        expect(await o.state(o.byNumber)).toEqual({
          email: null,
          signInPhone: "+14015550122",
          changes: [],
        });
      }
    });
  });

  it("changes nothing when the provider is down or answers too late", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      for (const failure of [
        new Error("the provider refused"),
        new DOMException("timed out", "TimeoutError"),
      ]) {
        const p = provider(failure);
        expect(
          await outcome(
            o
              .as(o.c.who, p.directory)
              .setSignInPhone({ userId: o.byEmail, phone: "+14015550141" }),
          ),
        ).toBe("INTERNAL_SERVER_ERROR");
        expect(await o.state(o.byEmail)).toEqual({
          email: `elio-${o.run}@crew.test`,
          signInPhone: null,
          changes: [],
        });
      }
    });
  });

  it("is the office's alone, in its own company, and takes only an address", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const email = `z-${o.run}@crew.test`;
      expect(
        await outcome(
          o.as(o.worker.who, p.directory).setEmail({ userId: o.byEmail, email }),
        ),
      ).toBe("FORBIDDEN");
      // Another company's person, and nobody at all: one answer.
      for (const userId of [o.strangerId, uuidv7()]) {
        expect(
          await outcome(o.as(o.c.who, p.directory).setEmail({ userId, email })),
        ).toBe("FORBIDDEN");
        expect(
          await outcome(
            o.as(o.c.who, p.directory).setSignInPhone({ userId, phone: "+14015550142" }),
          ),
        ).toBe("FORBIDDEN");
      }
      const call = o.as(o.c.who, p.directory);
      // In turn: the calls share the transaction's one connection.
      for (const bad of [
        () => call.setEmail({ userId: o.byNumber, email: "not an email" }),
        () => call.setEmail({ userId: o.byNumber, email: "" }),
        () => call.setSignInPhone({ userId: o.byEmail, phone: "555-0100" }),
        () => call.setSignInPhone({ userId: o.byEmail, phone: "+44 20 7946 0000" }),
        () => call.setSignInPhone({ userId: o.byEmail, phone: "" }),
      ]) {
        expect(await outcome(bad())).toBe("BAD_REQUEST");
      }
      expect(p.told).toEqual([]);
    });
  });

  it("is refused to the closed company before anything is read or told", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const p = provider();
      const call = o.as(o.c.who, p.directory, { companyId: o.c.companyId, allowed: [] });
      expect(
        await call.setEmail({ userId: o.byNumber, email: `c-${o.run}@crew.test` }),
      ).toEqual({ result: "rejected", code: "company_closed" });
      expect(
        await call.setSignInPhone({ userId: o.byEmail, phone: "+14015550143" }),
      ).toEqual({ result: "rejected", code: "company_closed" });
      expect(p.told).toEqual([]);
      expect((await o.state(o.byEmail)).changes).toEqual([]);
    });
  });

  it("moves an invitation's standing with the address: a send to the old one no longer counts", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const call = o.as(o.c.who);
      await call.noteInvitation({ id: uuidv7(), userId: o.byNumber, act: "sent" });
      const standing = async () =>
        (await call.list()).find((r) => r.id === o.byNumber)?.invitation.status;
      expect(await standing()).toBe("sent");
      await call.setSignInPhone({ userId: o.byNumber, phone: "+14015550144" });
      expect(await standing()).toBe("not_sent");
    });
  });
});

// A phone signed in by its Face ID or fingerprint key says so, and when the key was made: a
// key older than a change to the person's sign-in address is refused as a deactivated
// person is, so a lost phone's key stops once the office changes the address.
describe("a key sign-in after an address change", () => {
  it("is refused when the key is older than the change, and admitted otherwise", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const me = () =>
        createCallerFactory(appRouter)(
          createContext({
            directory: provider().directory,
            db: txAsDb(tx),
            identity: o.worker.who,
            reporter: quietReporter,
            requestId: REQUEST_ID,
            waits: "inherit",
          }),
        ).me;
      const before = new Date(Date.now() - 60_000);
      // No change yet: the key is admitted, and so is a sign-in that names no key.
      expect((await me().get({ keyMadeAt: before })).id).toBe(o.worker.id);
      await o
        .as(o.c.who)
        .setEmail({ userId: o.worker.id, email: `moved-${o.run}@crew.test` });
      expect(await outcome(me().get({ keyMadeAt: before }))).toBe("UNAUTHORIZED");
      // A key made after the change, and a sign-in by a code, are the person's own.
      expect((await me().get({ keyMadeAt: new Date(Date.now() + 60_000) })).id).toBe(
        o.worker.id,
      );
      expect((await me().get()).id).toBe(o.worker.id);
      // A key dated past the server's clock and its tolerance is taken as the oldest: a
      // phone whose clock ran ahead when the key was made cannot outlast the change.
      expect(
        await outcome(me().get({ keyMadeAt: new Date(Date.now() + 24 * 3_600_000) })),
      ).toBe("UNAUTHORIZED");
    });
  });
});
