// The gate inventory: every procedure of the application's router, by name, with the gate it
// must sit behind. A procedure added without a line here fails the first test; a gate loosened
// or dropped fails the second. Each call carries no input, so nothing is written: a gate runs
// before input validation, and what comes back is the gate's own answer (UNAUTHORIZED or
// FORBIDDEN) or anything else, which means the caller was let in. Resource checks inside a
// procedure (a foreman's own crew, an admin-or-foreman rule) are that procedure's tests'.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import {
  createCallerFactory,
  PROTECTED_TIMEOUTS,
  protectedProcedure,
  router,
} from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  appCaller,
  appDb,
  member,
  outcome,
  ownerDb,
  quietReporter,
  REQUEST_ID,
  world,
  type World,
} from "../helpers";

type Role = "worker" | "foreman" | "admin";
// `public`: no identity. `protected`: any active user. Otherwise the roles admitted.
type Gate = "public" | "protected" | readonly Role[];

const ADMIN = ["admin"] as const;
const EXPECTED: Record<string, Gate> = {
  "approval.queue": ADMIN,
  "approval.decide": ADMIN,
  "assignment.list": ADMIN,
  "assignment.mine": "protected",
  "assignment.create": ADMIN,
  "assignment.update": ADMIN,
  "assignment.remove": ADMIN,
  "closeout.review": ["foreman", "admin"],
  "closeout.submit": "protected",
  "crew.list": ADMIN,
  "crew.create": ADMIN,
  "crew.update": ADMIN,
  "crew.setForeman": ADMIN,
  "crew.addMember": ADMIN,
  "crew.removeMember": ADMIN,
  "crew.deactivate": ADMIN,
  "crew.reactivate": ADMIN,
  "customer.list": ADMIN,
  "customer.create": ADMIN,
  "customer.update": ADMIN,
  "customer.deactivate": ADMIN,
  "customer.reactivate": ADMIN,
  "diagnostic.list": ADMIN,
  "job.list": ADMIN,
  "job.cost": ADMIN,
  "job.create": ADMIN,
  "job.update": ADMIN,
  "job.assign": ADMIN,
  "job.setStatus": ADMIN,
  "labor.hours": ADMIN,
  "labor.ledger": ADMIN,
  "labor.repair": ADMIN,
  "material.correct": "protected",
  "material.create": ADMIN,
  "material.list": ADMIN,
  "material.setCost": ADMIN,
  "me.get": "protected",
  "me.update": "protected",
  "payPeriod.close": ADMIN,
  "payPeriod.list": ADMIN,
  "payPeriod.open": ADMIN,
  "payPeriod.read": ADMIN,
  "payPeriod.update": ADMIN,
  "roster.list": ADMIN,
  "roster.invite": ADMIN,
  "roster.setRole": ADMIN,
  "roster.deactivate": ADMIN,
  "roster.reactivate": ADMIN,
  "roster.setPayRate": ADMIN,
  "roster.payRates": ADMIN,
  "status.get": "public",
  "sync.pull": "protected",
  "sync.push": "protected",
};

const owner = ownerDb();
const app = appDb();
let w: World;

beforeAll(async () => {
  w = await world(owner);
});
afterAll(async () => {
  await w.cleanup();
  await app.$client.end();
  await owner.$client.end();
});

// The procedure at a dotted path, called with no input.
function call(who: unknown, path: string): Promise<unknown> {
  const [namespace, name] = path.split(".") as [string, string];
  const routers = appCaller(app, who) as unknown as Record<
    string,
    Record<string, (input?: unknown) => Promise<unknown>>
  >;
  return routers[namespace]![name]!();
}

const admits = (gate: Gate, role: Role) =>
  gate === "public" || gate === "protected" || gate.includes(role);

describe("the gate inventory", () => {
  it("names every procedure of the router, and nothing else", () => {
    const actual = Object.keys(appRouter._def.procedures).sort();
    expect(actual).toEqual(Object.keys(EXPECTED).sort());
  });

  it("refuses an anonymous caller everywhere but the public procedures", async () => {
    for (const [path, gate] of Object.entries(EXPECTED)) {
      const answer = await outcome(call(null, path));
      if (gate === "public") expect([path, answer]).not.toEqual([path, "UNAUTHORIZED"]);
      else expect([path, answer]).toEqual([path, "UNAUTHORIZED"]);
    }
  });

  for (const role of ["worker", "foreman", "admin"] as const) {
    it(`admits a ${role} at exactly the gates that name the role`, async () => {
      const { who } = await member(owner, w, "a", role, { label: "gates" });
      for (const [path, gate] of Object.entries(EXPECTED)) {
        const answer = await outcome(call(who, path));
        expect(answer).not.toBe("UNAUTHORIZED");
        expect([path, answer === "FORBIDDEN"]).toEqual([path, !admits(gate, role)]);
      }
    });
  }
});

describe("a protected call's waits", () => {
  const probe = router({
    waits: protectedProcedure.query(async ({ ctx }) => {
      const { rows } = await ctx.tx.execute<{ lock: string; statement: string }>(sql`
        select current_setting('lock_timeout') as lock,
          current_setting('statement_timeout') as statement
      `);
      return rows[0];
    }),
  });

  it("are bounded from the transaction's first statements", async () => {
    const { who } = await member(owner, w, "a", "worker", { label: "waits" });
    const waits = await createCallerFactory(probe)(
      createContext({
        db: app,
        identity: who,
        reporter: quietReporter,
        requestId: REQUEST_ID,
      }),
    ).waits();
    expect(waits).toEqual({
      lock: PROTECTED_TIMEOUTS.lockTimeout,
      statement: PROTECTED_TIMEOUTS.statementTimeout,
    });
  });
});
