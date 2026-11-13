// Stage 4, pay periods (V1-D03): payPeriod.open and update against each other, on real
// commits. In a disposable database (helpers.ts): two connections must see the same rows, and
// the lock-wait probe reads every backend of its database. Each test holds a lock from the
// owner's transaction, lets the calls queue on it, and releases them by committing.
import { payPeriods } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDirectory } from "../../src/core/identity";
import { createContext } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  companyIn,
  disposableDb,
  outcome,
  quietReporter,
  REQUEST_ID,
  waitForLockWait,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app({ max: 6 });
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const api = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  ).payPeriod;

const W1 = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const W2 = { startsOn: "2026-10-12", endsOn: "2026-10-18" };

// A committed company with two bound admins.
async function world() {
  return D.owner.transaction(async (tx) => {
    const c = await companyIn(tx, "admin");
    const second = await boundIn(tx, c.companyId, "admin");
    return { ...c, second };
  });
}

const calendar = (companyId: string) =>
  D.owner
    .select({ startsOn: payPeriods.startsOn, endsOn: payPeriods.endsOn })
    .from(payPeriods)
    .where(eq(payPeriods.companyId, companyId))
    .orderBy(asc(payPeriods.startsOn));

// Runs `calls` while the owner holds the company's pay-period lock, and releases them once
// all of them wait on it.
async function behindTheLock<T>(companyId: string, calls: (() => Promise<T>)[]) {
  let answers!: Promise<T[]>;
  await D.owner.transaction(async (tx) => {
    await tx.execute(sql`select lock_pay_periods(${companyId}::uuid)`);
    answers = Promise.all(calls.map((call) => call()));
    await waitForLockWait(D.owner, "%lock_pay_periods%", {
      n: calls.length,
      waitEvent: "advisory",
    });
  });
  return answers;
}

describe("two admins at once", () => {
  it("opening the same first period leaves one: `opened` and `exists`", async () => {
    const c = await world();
    const answers = await behindTheLock(c.companyId, [
      () => api(c.who).open(W1),
      () => api(c.second.who).open(W1),
    ]);
    expect(answers.map((a) => a.result).sort()).toEqual(["exists", "opened"]);
    expect(await calendar(c.companyId)).toEqual([W1]);
  });

  it("opening two different first periods leaves one, and names its successor", async () => {
    const c = await world();
    const answers = await behindTheLock(c.companyId, [
      () => api(c.who).open(W1),
      () => api(c.second.who).open({ startsOn: "2026-10-08", endsOn: "2026-10-14" }),
    ]);
    expect(answers.map((a) => a.result).sort()).toEqual(["opened", "rejected"]);
    const rows = await calendar(c.companyId);
    expect(rows).toHaveLength(1);
    const loser = answers.find((a) => a.result === "rejected");
    const next = new Date(`${rows[0]!.endsOn}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(loser).toEqual({
      result: "rejected",
      code: "not_contiguous",
      expectedStartsOn: next.toISOString().slice(0, 10),
    });
  });

  it("opening the next period and moving the latest one's end leaves no overlap", async () => {
    const c = await world();
    const first = await api(c.who).open(W1);
    if (first.result !== "opened") throw new Error("fixture");
    const answers = await behindTheLock<{ result: string }>(c.companyId, [
      () => api(c.who).open(W2),
      () =>
        api(c.second.who).update({
          periodId: first.period.id,
          startsOn: W1.startsOn,
          endsOn: "2026-10-14",
        }),
    ]);
    // Whichever ran first stands; the other is refused by the calendar it then read, never
    // by a constraint.
    const results = answers.map((a) => a.result).sort();
    const rows = await calendar(c.companyId);
    if (results.includes("opened")) {
      expect(results).toEqual(["opened", "rejected"]);
      expect(rows).toEqual([W1, W2]);
    } else {
      expect(results).toEqual(["rejected", "updated"]);
      expect(rows).toEqual([{ startsOn: W1.startsOn, endsOn: "2026-10-14" }]);
    }
  });
});

describe("payPeriod.open and update re-read the caller", () => {
  for (const change of ["deactivated_at = now()", "role = 'worker'"] as const) {
    const expected = change.startsWith("role") ? "FORBIDDEN" : "UNAUTHORIZED";
    it(`refuse an admin whose ${change} committed while they waited: ${expected}`, async () => {
      const c = await world();
      const first = await api(c.who).open(W1);
      if (first.result !== "opened") throw new Error("fixture");
      for (const call of [
        () => api(c.second.who).open(W2),
        () =>
          api(c.second.who).update({
            periodId: first.period.id,
            startsOn: W1.startsOn,
            endsOn: "2026-10-12",
          }),
      ]) {
        let answer!: Promise<string>;
        await D.owner.transaction(async (tx) => {
          await tx.execute(sql`select 1 from users where id = ${c.second.id} for update`);
          answer = outcome(call());
          await waitForLockWait(D.owner, '%from "users"%for share%');
          await tx.execute(
            sql`update users set ${sql.raw(change)} where id = ${c.second.id}`,
          );
        });
        expect(await answer).toBe(expected);
        // Put back for the second call.
        await D.owner.execute(
          sql`update users set deactivated_at = null, role = 'admin' where id = ${c.second.id}`,
        );
      }
      expect(await calendar(c.companyId)).toEqual([W1]);
    });
  }
});
