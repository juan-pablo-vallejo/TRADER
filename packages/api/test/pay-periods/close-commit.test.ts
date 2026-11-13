// Stage 4, pay periods (V1-D03): payPeriod.close on real commits — two admins at once, a
// caller changed while waiting, a decision that lands while the close waits. In a disposable
// database (helpers.ts): a closed period and its lines can never be deleted, two connections
// must see the same rows, and the lock-wait probe reads every backend of its database. Here
// the deferred line seal fires at a true commit.
import { approvals, payPeriodLines, payPeriods } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDirectory } from "../../src/core/identity";
import { createContext } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  crewDayIn,
  disposableDb,
  eventIn,
  outcome,
  pendingApproval,
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

const caller = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  );
const api = (who: VerifiedIdentity) => caller(who).payPeriod;

const W1 = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const W2 = { startsOn: "2026-10-12", endsOn: "2026-10-18" };

// A committed crew day with two admins: w1 worked 4 h on the Monday, approved; w2's 8 h on
// the same day wait for approval. Week one is open.
async function world() {
  const d = await D.owner.transaction(async (tx) => {
    const day = await crewDayIn(tx);
    const admin = await boundIn(tx, day.companyId, "admin");
    const second = await boundIn(tx, day.companyId, "admin");
    const at = (hhmm: string) => `2026-10-05T${hhmm}:00.000Z`;
    await eventIn(tx, day, {
      worker: day.w1,
      job: day.J,
      type: "started",
      client: at("12:00"),
    });
    await eventIn(tx, day, {
      worker: day.w1,
      job: day.J,
      type: "ended",
      client: at("16:00"),
    });
    const late = await eventIn(tx, day, {
      worker: day.w2,
      job: day.J,
      type: "started",
      client: at("13:00"),
    });
    await eventIn(tx, day, {
      worker: day.w2,
      job: day.J,
      type: "ended",
      client: at("21:00"),
    });
    const approvalId = await pendingApproval(tx, day.companyId, { eventId: late });
    return { ...day, admin, second, approvalId };
  });
  const first = await api(d.admin.who).open(W1);
  if (first.result !== "opened") throw new Error("fixture");
  return { ...d, periodId: first.period.id };
}

const WAITING = { pendingSessions: 1, openSessions: 0 };

const linesOf = (companyId: string) =>
  D.owner
    .select({
      periodId: payPeriodLines.periodId,
      workerId: payPeriodLines.workerId,
      workDate: payPeriodLines.workDate,
      hundredths: payPeriodLines.hundredths,
    })
    .from(payPeriodLines)
    .where(eq(payPeriodLines.companyId, companyId))
    .orderBy(asc(payPeriodLines.createdAt), asc(payPeriodLines.id));

const closedAt = async (periodId: string) =>
  (await D.owner.select().from(payPeriods).where(eq(payPeriods.id, periodId)))[0]!
    .closedAt;

// Runs `calls` while the owner holds the company's pay-period lock, and releases them once
// all of them wait on it; `meanwhile` runs, and commits, before the release.
async function behindTheLock<T>(
  companyId: string,
  calls: (() => Promise<T>)[],
  meanwhile: () => Promise<void> = async () => {},
) {
  let answers!: Promise<T[]>;
  await D.owner.transaction(async (tx) => {
    await tx.execute(sql`select lock_pay_periods(${companyId}::uuid)`);
    answers = Promise.all(calls.map((call) => call()));
    await waitForLockWait(D.owner, "%lock_pay_periods%", {
      n: calls.length,
      waitEvent: "advisory",
    });
    await meanwhile();
  });
  return answers;
}

describe("two admins closing at once", () => {
  it("leave one close: `closed`, and the standing close for the other", async () => {
    const d = await world();
    const answers = await behindTheLock(d.companyId, [
      () => api(d.admin.who).close({ periodId: d.periodId, acknowledged: WAITING }),
      () => api(d.second.who).close({ periodId: d.periodId, acknowledged: WAITING }),
    ]);
    const winner = answers.find((a) => a.result === "closed");
    const loser = answers.find((a) => a.result === "rejected");
    if (winner?.result !== "closed") throw new Error("nobody closed the period");
    expect(loser).toEqual({
      result: "rejected",
      code: "already_closed",
      period: winner.period,
    });
    expect(winner.period.closed!.unresolved).toEqual(WAITING);
    expect([d.admin.id, d.second.id]).toContain(winner.period.closed!.by.id);
    // One set of lines, committed with the close: the deferred seal passed at commit.
    expect(await linesOf(d.companyId)).toEqual([
      { periodId: d.periodId, workerId: d.w1, workDate: "2026-10-05", hundredths: 400 },
    ]);
    expect(await closedAt(d.periodId)).toEqual(winner.period.closed!.at);
  });
});

describe("a decision that commits while the close waits", () => {
  it("is judged by the close: the acknowledgment is stale, and the hours are the period's", async () => {
    const d = await world();
    const [answer] = await behindTheLock(
      d.companyId,
      [() => api(d.admin.who).close({ periodId: d.periodId, acknowledged: WAITING })],
      async () => {
        expect(
          await caller(d.admin.who).approval.decide({
            approvalId: d.approvalId,
            decision: "approved",
          }),
        ).toMatchObject({ result: "decided" });
      },
    );
    // What the admin ticked no longer stands, so nothing was closed on their word.
    expect(answer).toEqual({
      result: "rejected",
      code: "unresolved_changed",
      unresolved: { pendingSessions: 0, openSessions: 0 },
    });
    expect(await closedAt(d.periodId)).toBeNull();
    expect(await linesOf(d.companyId)).toEqual([]);

    expect(await api(d.admin.who).close({ periodId: d.periodId })).toMatchObject({
      result: "closed",
      lines: { own: 2, adjustments: 0 },
    });
  });

  it("after the close is an adjustment of the next period, committed once", async () => {
    const d = await world();
    expect(
      await api(d.admin.who).close({ periodId: d.periodId, acknowledged: WAITING }),
    ).toMatchObject({ result: "closed", lines: { own: 1, adjustments: 0 } });
    await caller(d.second.who).approval.decide({
      approvalId: d.approvalId,
      decision: "approved",
    });
    const second = await api(d.admin.who).open(W2);
    if (second.result !== "opened") throw new Error("fixture");
    // Both admins close the next period at once: the adjustment is still one line.
    const answers = await behindTheLock(d.companyId, [
      () => api(d.admin.who).close({ periodId: second.period.id }),
      () => api(d.second.who).close({ periodId: second.period.id }),
    ]);
    expect(answers.map((a) => a.result).sort()).toEqual(["closed", "rejected"]);
    expect(await linesOf(d.companyId)).toEqual([
      { periodId: d.periodId, workerId: d.w1, workDate: "2026-10-05", hundredths: 400 },
      {
        periodId: second.period.id,
        workerId: d.w2,
        workDate: "2026-10-05",
        hundredths: 800,
      },
    ]);
    // The approvals row is the only thing that changed under the first period.
    const [decided] = await D.owner
      .select({ decision: approvals.decision })
      .from(approvals)
      .where(eq(approvals.id, d.approvalId));
    expect(decided).toEqual({ decision: "approved" });
  });
});

describe("payPeriod.close re-reads the caller", () => {
  for (const change of ["deactivated_at = now()", "role = 'worker'"] as const) {
    const expected = change.startsWith("role") ? "FORBIDDEN" : "UNAUTHORIZED";
    it(`refuses an admin whose ${change} committed while they waited: ${expected}`, async () => {
      const d = await world();
      let answer!: Promise<string>;
      await D.owner.transaction(async (tx) => {
        await tx.execute(sql`select 1 from users where id = ${d.second.id} for update`);
        answer = outcome(
          api(d.second.who).close({ periodId: d.periodId, acknowledged: WAITING }),
        );
        await waitForLockWait(D.owner, '%from "users"%for share%');
        await tx.execute(
          sql`update users set ${sql.raw(change)} where id = ${d.second.id}`,
        );
      });
      expect(await answer).toBe(expected);
      expect(await closedAt(d.periodId)).toBeNull();
      expect(await linesOf(d.companyId)).toEqual([]);
    });
  }
});
