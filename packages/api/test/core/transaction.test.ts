// Stage 3 line 1b: the protected procedure's transaction. One per procedure call; settings
// established inside it whatever the pooled connection carries; the runtime role checked in
// each; a failed procedure leaves nothing behind; the procedure sees no pool.
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { companies, customers, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";

import {
  appDb,
  becomeApp,
  caller,
  callerIn,
  companyIn,
  customerNames,
  failure,
  http,
  identity,
  outcome,
  ownerDb,
  rolledBack,
  testPhone,
  userRow,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb();
let w: World;

beforeEach(async () => {
  w = await world(owner);
});
afterEach(async () => {
  await w.cleanup();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const asA = () => identity(w.a.boundSubject, w.a.boundEmail);

describe("the procedure context", () => {
  it("holds tx, user and the reporter: the pool and the identity are gone at runtime", async () => {
    const seen = await caller(app, asA()).probe.inside();
    expect(seen.dbIsUndefined).toBe(true);
    expect(seen.identityIsUndefined).toBe(true);
    // `reporter` is a stateless sink (report.ts): it opens no connection and names no one.
    // `waits` is present and undefined, like the pool: a procedure cannot read or change its bounds.
    // `requestId` is the HTTP request's (context.ts): random, and nobody's.
    expect(seen.keys).toEqual([
      "db",
      "identity",
      "reporter",
      "requestId",
      "tx",
      "user",
      "waits",
    ]);
  });

  it("runs with the caller's tenant and no identity setting", async () => {
    const seen = await caller(app, asA()).probe.inside();
    expect(seen).toMatchObject({
      company: w.a.companyId,
      subject: null,
      email: null,
      phone: null,
    });
    expect(seen.customers).toEqual([w.a.customerId]);
  });

  it("cannot read another tenant's row by id", async () => {
    expect(await caller(app, asA()).probe.customer({ id: w.b.customerId })).toEqual([]);
  });
});

describe("settings on a reused connection", () => {
  it("override session values left on the connection, for resolution and the procedure", async () => {
    const single = appDb({ max: 1 });
    try {
      // Pollute the one physical connection, session-level, with company B and B's login,
      // and with the number of an invitation in B that the caller must never be shown.
      const leftPhone = testPhone();
      const [left] = await owner
        .insert(users)
        .values({
          companyId: w.b.companyId,
          email: `left-${w.run}@co.test`,
          name: "Left on the connection",
          signInPhone: leftPhone,
        })
        .returning({ id: users.id });
      await single.execute(sql`
        select set_config('app.company_id', ${w.b.companyId}, false),
          set_config('app.identity_subject', ${w.b.boundSubject}, false),
          set_config('app.identity_email', ${w.b.inviteEmail}, false),
          set_config('app.identity_phone', ${leftPhone}, false)
      `);
      const before = [
        await userRow(owner, w.b.boundId),
        await userRow(owner, w.b.inviteId),
      ];
      const seen = await caller(
        single,
        identity(`sub-new-${w.run}`, w.a.inviteEmail),
      ).probe.inside();
      expect(seen.user.id).toBe(w.a.inviteId);
      expect(seen).toMatchObject({
        company: w.a.companyId,
        subject: null,
        email: null,
        phone: null,
      });
      expect(await userRow(owner, left!.id)).toMatchObject({ identity_subject: null });
      expect(seen.customers).toEqual([w.a.customerId]);
      expect(await userRow(owner, w.a.inviteId)).toMatchObject({
        identity_subject: `sub-new-${w.run}`,
      });
      expect([
        await userRow(owner, w.b.boundId),
        await userRow(owner, w.b.inviteId),
      ]).toEqual(before);
      // Inside the transaction only: the session values return after COMMIT, by design.
    } finally {
      await single.$client.end();
    }
  });
});

describe("the runtime role", () => {
  it("refuses a superuser connection before resolving anyone", async () => {
    expect(
      await outcome(
        caller(owner, identity(`sub-new-${w.run}`, w.a.inviteEmail)).probe.inside(),
      ),
    ).toBe("INTERNAL_SERVER_ERROR");
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({ identity_subject: null });
  });

  it("is checked in every transaction, not once per pool", async () => {
    const single = appDb({ max: 1 });
    try {
      expect(await outcome(caller(single, asA()).probe.inside())).toBe("OK");
      // The same physical connection, now the owner again (NONE: RESET would restore the
      // startup role).
      await single.execute(sql`set role none`);
      expect(
        await outcome(
          caller(single, identity(`sub-new-${w.run}`, w.a.inviteEmail)).probe.inside(),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(await userRow(owner, w.a.inviteId)).toMatchObject({
        identity_subject: null,
      });
    } finally {
      await single.$client.end();
    }
  });
});

describe("rollback", () => {
  it("keeps nothing a failed procedure wrote", async () => {
    const result = await outcome(
      caller(app, asA()).probe.write({ name: "Rolled back", fail: true }),
    );
    expect(result).toBe("INTERNAL_SERVER_ERROR");
    expect(await customerNames(owner, w.a.companyId)).toEqual(["Customer a"]);
  });

  it("keeps what a successful procedure wrote", async () => {
    await caller(app, asA()).probe.write({ name: "Committed", fail: false });
    expect(await customerNames(owner, w.a.companyId)).toEqual([
      "Committed",
      "Customer a",
    ]);
  });

  it("undoes a first-sign-in bind when the procedure fails", async () => {
    await outcome(
      caller(app, identity(`sub-new-${w.run}`, w.a.inviteEmail)).probe.write({
        name: "Rolled back",
        fail: true,
      }),
    );
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({ identity_subject: null });
  });
});

describe("over HTTP", () => {
  it("gives each call in a batch its own transaction", async () => {
    const {
      results: [one, two],
    } = await http(app, asA(), [{ path: "probe.inside" }, { path: "probe.inside" }]);
    const txid = (r: typeof one) => (r?.result?.data.json as { txid: string }).txid;
    expect(txid(one)).not.toBe(txid(two));
  });

  it("commits one call of a batch when the other fails", async () => {
    const { results } = await http(app, asA(), [
      { path: "probe.write", input: { name: "Kept", fail: false }, mutation: true },
      { path: "probe.write", input: { name: "Dropped", fail: true }, mutation: true },
    ]);
    expect(results.map((r) => (r.error ? r.error.json.data.code : "OK"))).toEqual([
      "OK",
      "INTERNAL_SERVER_ERROR",
    ]);
    expect(await customerNames(owner, w.a.companyId)).toEqual(["Customer a", "Kept"]);
  });

  it("answers every resolution failure with one message", async () => {
    const answers = [];
    for (const who of [
      null,
      identity(`sub-new-${w.run}`, "stranger@co.test"),
      identity(`sub-other-${w.run}`, w.a.boundEmail),
    ]) {
      const {
        status,
        results: [r],
      } = await http(app, who, [{ path: "probe.inside" }]);
      answers.push({ status, ...failure(r) });
    }
    expect(new Set(answers.map((a) => JSON.stringify(a)))).toEqual(
      new Set([
        JSON.stringify({
          status: 401,
          code: "UNAUTHORIZED",
          message: "Sign-in required.",
          httpStatus: 401,
        }),
      ]),
    );
  });

  it("sends no database text with an internal error", async () => {
    const {
      results: [r],
    } = await http(app, asA(), [{ path: "probe.divideByZero" }]);
    expect(r?.error?.json.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(r?.error?.json.message).toBe("Internal server error.");
    expect(JSON.stringify(r)).not.toMatch(/division|select 1/i);
  });
});

// The harness the closeout tests stand on (helpers.ts, "Rolled-back calls"): a protected call
// run inside an owner transaction that is always rolled back.
describe("a rolled-back call", () => {
  it("runs as trader_app in a savepoint, its writes visible to the outer transaction", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx);
      await becomeApp(tx);
      const seen = await callerIn(tx, c.who).probe.inside();
      expect(seen).toMatchObject({ company: c.companyId, subject: null, email: null });
      expect(await callerIn(tx, c.who).probe.write({ name: "Kept", fail: false })).toBe(
        "written",
      );
      const names = await tx
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.companyId, c.companyId));
      expect(names.map((n) => n.name).sort()).toEqual(["Customer", "Kept"]);
    });
  });

  it("rolls a failed call back to its savepoint and leaves the outer transaction usable", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx);
      await becomeApp(tx);
      await expect(
        callerIn(tx, c.who).probe.write({ name: "Lost", fail: true }),
      ).rejects.toThrow();
      // The rollback also undid the tenant the call set; read back as the owner.
      await tx.execute(sql`reset role`);
      const names = await tx
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.companyId, c.companyId));
      expect(names.map((n) => n.name)).toEqual(["Customer"]);
    });
  });

  it("refuses to run before the transaction becomes trader_app", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx);
      await expect(callerIn(tx, c.who).probe.inside()).rejects.toThrow();
    });
  });

  it("leaves nothing behind once the outer transaction rolls back", async () => {
    let companyId: string | undefined;
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx);
      companyId = c.companyId;
      await becomeApp(tx);
      await callerIn(tx, c.who).probe.write({ name: "Gone", fail: false });
    });
    expect(await owner.$count(companies, eq(companies.id, companyId!))).toBe(0);
  });
});
