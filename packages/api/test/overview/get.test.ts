// TASKS A01: overview.get (overview/get.ts) — each count against the rows that make it, in
// the caller's company alone. Rolled-back transactions; the gate is the inventory's
// (core/gates.test.ts).
import { jobAssignments, syncDiagnostics } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  type CrewDay,
  crewDayIn,
  eventIn,
  ownerDb,
  pendingApproval,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// Today and the days around it on New York's calendar, as the database reads the clock.
async function calendar(tx: Tx) {
  const { rows } = await tx.execute<{ today: string; weekday: number }>(sql`
    select to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD') as today,
      extract(isodow from now() at time zone 'America/New_York')::int as weekday
  `);
  const { today, weekday } = rows[0]!;
  const after = (n: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000)
      .toISOString()
      .slice(0, 10);
  // isodow: Monday is 1.
  return { today, monday: after(1 - weekday), after };
}

const shift = (
  d: CrewDay,
  userId: string,
  workDate: string,
  expectedStart = "07:00",
) => ({
  companyId: d.companyId,
  userId,
  jobId: d.J,
  workDate,
  expectedStart,
  expectedEnd: "15:30",
});

const refusal = (d: CrewDay, age = "0 days") => ({
  companyId: d.companyId,
  userId: d.w1,
  requestId: crypto.randomUUID(),
  recordId: uuidv7(),
  recordKind: "labor_event",
  outcome: "rejected" as const,
  code: "not_permitted",
  createdAt: sql`now() - ${age}::interval`,
});

describe("overview.get", () => {
  it("answers zeros for a company with nothing waiting, and its own week", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const { today, monday } = await calendar(tx);
      await becomeApp(tx);
      expect(await appCallerIn(tx, admin.who).overview.get()).toEqual({
        timezone: "America/New_York",
        today,
        weekStart: monday,
        approvalsPending: 0,
        openSessions: 0,
        refusedEntries: 0,
        shiftsThisWeek: 0,
      });
    });
  });

  it("counts what waits in the caller's company, and nothing of another's", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const { monday, after } = await calendar(tx);
      const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      // Two sessions with no clock-out, one of them waiting for approval; one ended.
      const open = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      const waiting = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await pendingApproval(tx, d.companyId, { eventId: waiting });
      await eventIn(tx, d, {
        worker: d.foremanId,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      const ended = await eventIn(tx, d, {
        worker: d.foremanId,
        job: d.J,
        type: "ended",
        client: "2026-10-05T20:00:00Z",
      });
      // A second approval waiting, and one decided.
      await pendingApproval(tx, d.companyId, { eventId: ended });
      const decided = await pendingApproval(tx, d.companyId, { eventId: open });
      await tx.execute(sql`
        update approvals set decision = 'approved', decided_by_user_id = ${admin.id},
          decided_at = now() where id = ${decided}
      `);
      // Refusals: two the office can still read, one past the retention period.
      await tx.insert(syncDiagnostics).values([refusal(d), refusal(d, "29 days")]);
      await tx.insert(syncDiagnostics).values(refusal(d, "31 days"));
      // Shifts: Monday and Sunday of this week, and the days either side of it.
      await tx
        .insert(jobAssignments)
        .values([
          shift(d, d.w1, monday),
          shift(d, d.w1, sunday),
          shift(d, d.w2, monday),
          shift(d, d.w1, after(-7)),
          shift(
            d,
            d.w1,
            new Date(Date.parse(`${sunday}T00:00:00Z`) + 86_400_000)
              .toISOString()
              .slice(0, 10),
          ),
        ]);
      // The other company's own: an open session, an approval, a refusal, a shift.
      const theirs = await eventIn(tx, other, {
        worker: other.w1,
        job: other.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await pendingApproval(tx, other.companyId, { eventId: theirs });
      await tx.insert(syncDiagnostics).values({ ...refusal(other), userId: other.w1 });
      await tx.insert(jobAssignments).values({
        ...shift(other, other.w1, monday),
        jobId: other.J,
      });

      await becomeApp(tx);
      const office = appCallerIn(tx, admin.who);
      const counts = await office.overview.get();
      // Each count is what its own screen reads: the queue, the week, the hours.
      expect((await office.approval.queue({})).items).toHaveLength(
        counts.approvalsPending,
      );
      expect((await office.assignment.week({ weekStart: monday })).shifts).toHaveLength(
        counts.shiftsThisWeek,
      );
      expect(
        (await office.labor.hours({ from: "2026-10-05", to: "2026-10-05" })).totals
          .openSessions,
      ).toBe(counts.openSessions);
      expect(counts).toMatchObject({
        approvalsPending: 2,
        // The session that waits for approval is among the approvals, not here.
        openSessions: 1,
        refusedEntries: 2,
        shiftsThisWeek: 3,
      });
    });
  });
});
