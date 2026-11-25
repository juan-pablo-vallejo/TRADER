// The weekly schedule's writers: shift.create, update and remove — an admin
// schedules any active person of the company on any job of the company that is not
// archived, whatever their role; the day and the times kept as written; ids the browser's,
// a resend `duplicate`; an overlap refused, a day that would not resolve refused with its
// issues; a locked shift and what authorized its clock-in left alone; admin only, a job or a
// person of another company one FORBIDDEN. Every call runs in a rolled-back transaction
// (helpers, "Rolled-back calls"). The
// rules themselves are eligibility.test.ts's, the reads list.test.ts's, what a shift does
// not change about labor authority.test.ts's, and real commits against each other
// shift-commit.test.ts's.
import { jobAssignments, users, workSessionEvents } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  type WorkDay,
  workDayIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const WEEK = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };

// A working day (workers w1 and w2; jobs J and K) with an admin, and a second
// company's day beside it. Fixtures are the owner's; from here the transaction is trader_app.
async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const other = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  const gone = await boundIn(tx, day.companyId, "worker", { deactivated: true });
  await becomeApp(tx);
  const as = (who: unknown) => appCallerIn(tx, who).shift;
  return { day, other, admin, worker, gone, as, plan: as(admin.who) };
}

const plansOf = (tx: Tx, companyId: string) =>
  tx
    .select({
      id: jobAssignments.id,
      userId: jobAssignments.userId,
      jobId: jobAssignments.jobId,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
    })
    .from(jobAssignments)
    .where(eq(jobAssignments.companyId, companyId))
    .orderBy(asc(jobAssignments.workDate), asc(jobAssignments.id));

// What the browser sends for a set of days: an id of its own for each.
const on = (...dates: string[]) => dates.map((workDate) => ({ id: uuidv7(), workDate }));
const created = (days: { id: string; workDate: string }[]) => ({
  result: "planned",
  days: days.map((d) => ({ id: d.id, workDate: d.workDate, result: "created" })),
});

const MON = "2026-11-16";

// One shift of w1 on J on Monday, and its id.
async function shift(
  plan: Awaited<ReturnType<typeof office>>["plan"],
  day: WorkDay,
  expectedStart: string,
  expectedEnd: string,
  over: { jobId?: string; workDate?: string } = {},
) {
  const id = uuidv7();
  const answer = await plan.create({
    userId: day.w1,
    jobId: over.jobId ?? day.J,
    expectedStart,
    expectedEnd,
    days: [{ id, workDate: over.workDate ?? MON }],
  });
  return { id, answer, day: answer.result === "planned" ? answer.days[0]! : undefined };
}

// A clock-in of w1 on `job` at `at` (an instant; New York is UTC-5 that week), and the shift
// locked by it — written as the owner, as push does where the schedule is enforced.
async function punched(tx: Tx, day: WorkDay, shiftId: string, at: string, job = day.J) {
  await tx.execute(sql`reset role`);
  const eventId = await eventIn(tx, day, {
    worker: day.w1,
    job,
    type: "started",
    client: at,
  });
  await tx.execute(sql`
    update job_assignments set locked_at = now(), locked_by_event_id = ${eventId}
    where id = ${shiftId}
  `);
  await becomeApp(tx);
}

describe("shift.create", () => {
  it("schedules a week for a worker in one call, the day and times as written", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const days = on(...WEEK);
      expect(await plan.create({ userId: day.w1, jobId: day.J, days, ...HOURS })).toEqual(
        created(days),
      );
      const rows = await plansOf(tx, day.companyId);
      expect(rows.map((r) => r.workDate)).toEqual(WEEK);
      expect(rows.map((r) => r.id).sort()).toEqual(days.map((d) => d.id).sort());
      for (const row of rows) {
        expect(row).toMatchObject({
          userId: day.w1,
          jobId: day.J,
          expectedStart: "07:00:00",
          expectedEnd: "15:30:00",
        });
      }
    });
  });

  it("schedules several people on one job at once, whatever their roles", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, plan } = await office(tx);
      // An admin is scheduled like anyone.
      for (const [userId, jobId] of [
        [day.w1, day.J],
        [day.w2, day.J],
        [day.userId, day.K],
        [admin.id, day.K],
      ] as const) {
        const days = on(MON);
        expect(await plan.create({ userId, jobId, days, ...HOURS })).toEqual(
          created(days),
        );
      }
      expect(await plansOf(tx, day.companyId)).toHaveLength(4);
    });
  });

  it("takes one job twice in a day, and shifts that touch", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      expect((await shift(plan, day, "07:00", "11:00")).day?.result).toBe("created");
      // Touching: the first ends as the second starts.
      expect((await shift(plan, day, "11:00", "15:00")).day?.result).toBe("created");
      expect(
        (await shift(plan, day, "16:00", "18:00", { jobId: day.K })).day?.result,
      ).toBe("created");
      expect(await plansOf(tx, day.companyId)).toHaveLength(3);
    });
  });

  it("answers a resend `duplicate`, and the same id with other contents `id_conflict`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const days = on(...WEEK.slice(0, 3));
      const first = { userId: day.w1, jobId: day.J, days, ...HOURS };
      await plan.create(first);
      expect(await plan.create(first)).toEqual({
        result: "planned",
        days: days.map((d) => ({ ...d, result: "duplicate" })),
      });
      // The week sent again with two more days: three are the shifts they were.
      const more = [...days, ...on(...WEEK.slice(3))];
      const again = await plan.create({ ...first, days: more });
      expect(again.result === "planned" && again.days.map((d) => d.result)).toEqual([
        "duplicate",
        "duplicate",
        "duplicate",
        "created",
        "created",
      ]);
      // The id of Monday's shift, for other hours, another day, another job, another person.
      for (const other of [
        { ...first, expectedEnd: "16:00", days: [days[0]!] },
        { ...first, days: [{ id: days[0]!.id, workDate: "2026-11-30" }] },
        { ...first, jobId: day.K, days: [days[0]!] },
        { ...first, userId: day.w2, days: [days[0]!] },
      ]) {
        const answer = await plan.create(other);
        expect(answer).toMatchObject({
          result: "planned",
          days: [{ result: "rejected", code: "id_conflict" }],
        });
      }
      expect(await plansOf(tx, day.companyId)).toHaveLength(5);
    });
  });

  it("refuses the same shift twice under another id", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const first = await shift(plan, day, "07:00", "15:30");
      const again = await shift(plan, day, "07:00", "15:30");
      expect(again.day).toMatchObject({
        result: "rejected",
        code: "schedule",
        issues: [{ code: "duplicate_shift" }],
      });
      expect((await plansOf(tx, day.companyId)).map((r) => r.id)).toEqual([first.id]);
    });
  });

  it("refuses an overlap, naming both shifts and the shared time, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      // Another jobsite, the same jobsite, and a shift inside the first: one person is on one
      // job at a time.
      for (const [start, end, jobId, shared] of [
        ["12:00", "17:00", day.K, ["12:00", "15:30"]],
        ["12:00", "17:00", day.J, ["12:00", "15:30"]],
        ["09:00", "11:00", day.K, ["09:00", "11:00"]],
        ["06:00", "07:01", day.K, ["07:00", "07:01"]],
      ] as const) {
        const late = await shift(plan, day, start, end, { jobId });
        expect(late.day).toEqual({
          id: late.id,
          workDate: MON,
          result: "rejected",
          code: "schedule",
          issues: [
            {
              code: "overlap",
              shiftIds: [morning.id, late.id].sort(),
              start: shared[0],
              end: shared[1],
            },
          ],
        });
      }
      expect((await plansOf(tx, day.companyId)).map((r) => r.id)).toEqual([morning.id]);
    });
  });

  it("answers each day on its own: a refused day writes nothing and the others stand", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await shift(plan, day, "07:00", "15:30", { workDate: "2026-11-17" });
      const days = on(MON, "2026-11-17", "2026-11-18");
      const answer = await plan.create({
        userId: day.w1,
        jobId: day.K,
        expectedStart: "12:00",
        expectedEnd: "17:00",
        days,
      });
      expect(answer.result === "planned" && answer.days.map((d) => d.result)).toEqual([
        "created",
        "rejected",
        "created",
      ]);
      expect((await plansOf(tx, day.companyId)).map((r) => r.workDate)).toEqual([
        MON,
        "2026-11-17",
        "2026-11-18",
      ]);
    });
  });

  it("refuses a deactivated person and an archived job, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, gone, admin, plan } = await office(tx);
      expect(
        await plan.create({ userId: gone.id, jobId: day.J, days: on(...WEEK), ...HOURS }),
      ).toEqual({ result: "rejected", code: "user_inactive" });
      await appCallerIn(tx, admin.who).job.setStatus({
        jobId: day.K,
        status: "archived",
      });
      expect(
        await plan.create({ userId: day.w1, jobId: day.K, days: on(...WEEK), ...HOURS }),
      ).toEqual({ result: "rejected", code: "job_archived" });
      expect(await plansOf(tx, day.companyId)).toEqual([]);
    });
  });

  it("refuses a malformed shift as BAD_REQUEST", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const good = { userId: day.w1, jobId: day.J, days: on(MON), ...HOURS };
      const fifteen = on(
        ...Array.from(
          { length: 15 },
          (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`,
        ),
      );
      const id = uuidv7();
      for (const bad of [
        { ...good, expectedStart: "15:30", expectedEnd: "07:00" },
        { ...good, expectedStart: "07:00", expectedEnd: "07:00" },
        // Across midnight is not one shift.
        { ...good, expectedStart: "22:00", expectedEnd: "02:00" },
        { ...good, expectedEnd: "24:00" },
        { ...good, expectedStart: "7:5" },
        { ...good, expectedStart: "07:00:00" },
        { ...good, days: [] },
        { ...good, days: fifteen },
        { ...good, days: on(MON, MON) },
        {
          ...good,
          days: [
            { id, workDate: MON },
            { id, workDate: "2026-11-17" },
          ],
        },
        { ...good, days: [{ id: "not-an-id", workDate: MON }] },
        { ...good, days: on("2026-02-30") },
        { ...good, days: on("11/16/2026") },
        // A year Postgres has no date for, and one nobody schedules in.
        { ...good, days: on("0000-12-27") },
        { ...good, days: on("1999-12-31") },
        { ...good, days: on("2100-01-01") },
      ]) {
        expect([bad, await outcome(plan.create(bad as never))]).toEqual([
          bad,
          "BAD_REQUEST",
        ]);
      }
      expect(await plansOf(tx, day.companyId)).toEqual([]);
    });
  });
});

describe("shift.update", () => {
  it("moves a shift's day and times; the same values are `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      const moved = {
        shiftId: id,
        workDate: "2026-11-19",
        expectedStart: "08:00",
        expectedEnd: "12:15",
      };
      expect(await plan.update(moved)).toEqual({ result: "updated" });
      expect(await plan.update(moved)).toEqual({ result: "unchanged" });
      expect(await plansOf(tx, day.companyId)).toEqual([
        {
          id,
          userId: day.w1,
          jobId: day.J,
          workDate: "2026-11-19",
          expectedStart: "08:00:00",
          expectedEnd: "12:15:00",
        },
      ]);
    });
  });

  it("refuses a change into the same shift or into an overlap, on its own day or the day it moves to", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const monday = await shift(plan, day, "07:00", "15:30");
      const tuesday = await shift(plan, day, "07:00", "15:30", {
        workDate: "2026-11-17",
      });
      const late = await shift(plan, day, "16:00", "18:00");
      const before = await plansOf(tx, day.companyId);
      expect(
        await plan.update({ shiftId: tuesday.id, workDate: MON, ...HOURS }),
      ).toMatchObject({ code: "schedule", issues: [{ code: "duplicate_shift" }] });
      // Its own day: Monday's late shift pulled back over Monday's morning.
      expect(
        await plan.update({
          shiftId: late.id,
          workDate: MON,
          expectedStart: "09:00",
          expectedEnd: "18:00",
        }),
      ).toEqual({
        result: "rejected",
        code: "schedule",
        issues: [
          {
            code: "overlap",
            shiftIds: [monday.id, late.id].sort(),
            start: "09:00",
            end: "15:30",
          },
        ],
      });
      // Another day: Tuesday's shift moved to Monday is judged among Monday's shifts.
      expect(
        await plan.update({
          shiftId: tuesday.id,
          workDate: MON,
          expectedStart: "15:00",
          expectedEnd: "17:00",
        }),
      ).toEqual({
        result: "rejected",
        code: "schedule",
        issues: [
          {
            code: "overlap",
            shiftIds: [monday.id, tuesday.id].sort(),
            start: "15:00",
            end: "15:30",
          },
          {
            code: "overlap",
            shiftIds: [late.id, tuesday.id].sort(),
            start: "16:00",
            end: "17:00",
          },
        ],
      });
      // Each refusal left the transaction usable and every row as it was.
      expect(await plansOf(tx, day.companyId)).toEqual(before);
      // Touching both is no overlap, and the day it left no longer holds it.
      expect(
        await plan.update({
          shiftId: tuesday.id,
          workDate: MON,
          expectedStart: "15:30",
          expectedEnd: "16:00",
        }),
      ).toEqual({ result: "updated" });
    });
  });

  it("still edits a shift whose job was archived or whose person was deactivated since", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, plan } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      await appCallerIn(tx, admin.who).job.setStatus({
        jobId: day.J,
        status: "archived",
      });
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, day.w1));
      await becomeApp(tx);
      expect(
        await plan.update({ shiftId: id, workDate: "2026-11-18", ...HOURS }),
      ).toEqual({ result: "updated" });
    });
  });
});

describe("shift.remove", () => {
  it("removes a shift once; again, or for one that never was, it is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await plan.create({ userId: day.w1, jobId: day.J, days: on(...WEEK), ...HOURS });
      const rows = await plansOf(tx, day.companyId);
      expect(await plan.remove({ shiftId: rows[0]!.id })).toEqual({
        result: "removed",
      });
      expect(await plan.remove({ shiftId: rows[0]!.id })).toEqual({
        result: "unchanged",
      });
      expect(await plan.remove({ shiftId: crypto.randomUUID() })).toEqual({
        result: "unchanged",
      });
      expect((await plansOf(tx, day.companyId)).map((r) => r.workDate)).toEqual(
        WEEK.slice(1),
      );
    });
  });
});

describe("a shift locked by a clock-in", () => {
  it("is neither changed nor removed", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      await punched(tx, day, id, "2026-11-16T12:05:00Z");
      for (const change of [
        { workDate: MON, expectedStart: "07:00", expectedEnd: "16:00" },
        { workDate: MON, expectedStart: "06:00", expectedEnd: "15:30" },
        { workDate: "2026-11-17", ...HOURS },
      ]) {
        expect(await plan.update({ shiftId: id, ...change })).toEqual({
          result: "rejected",
          code: "locked",
        });
      }
      expect(await plan.remove({ shiftId: id })).toEqual({
        result: "rejected",
        code: "locked",
      });
      // The same day and times again is still nothing to do.
      expect(await plan.update({ shiftId: id, workDate: MON, ...HOURS })).toEqual({
        result: "unchanged",
      });
      expect(await plansOf(tx, day.companyId)).toHaveLength(1);
    });
  });

  it("is free again once the office voids its clock-in: the lock Today reads as clocked in is gone", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan, admin } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      await tx.execute(sql`reset role`);
      const clockIn = await eventIn(tx, day, {
        worker: day.w1,
        job: day.J,
        type: "started",
        client: "2026-11-16T12:05:00Z",
      });
      await eventIn(tx, day, {
        worker: day.w1,
        job: day.J,
        type: "ended",
        client: "2026-11-16T20:00:00Z",
      });
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${clockIn}
        where id = ${id}
      `);
      await becomeApp(tx);
      expect(await plan.remove({ shiftId: id })).toEqual({
        result: "rejected",
        code: "locked",
      });
      const voided = await appCallerIn(tx, admin.who).labor.correct({
        workerId: day.w1,
        operations: [{ kind: "void", id: uuidv7(), voidsEventId: clockIn }],
      });
      expect(voided.result).toBe("accepted");
      // The lock is gone: what Today reads as clocked in (overview/today.ts).
      const [row] = await tx
        .select({ lockedAt: jobAssignments.lockedAt, by: jobAssignments.lockedByEventId })
        .from(jobAssignments)
        .where(eq(jobAssignments.id, id));
      expect(row).toEqual({ lockedAt: null, by: null });
      // Edited, then removed, as any shift nobody has clocked in on.
      expect(
        await plan.update({
          shiftId: id,
          workDate: MON,
          expectedStart: "08:00",
          expectedEnd: "15:30",
        }),
      ).toEqual({ result: "updated" });
      expect(await plan.remove({ shiftId: id })).toEqual({ result: "removed" });
      // No entry was touched: the clock-in and its void stand.
      const entries = await tx
        .select({ id: workSessionEvents.id })
        .from(workSessionEvents)
        .where(eq(workSessionEvents.workerId, day.w1));
      expect(entries).toHaveLength(3);
    });
  });

  it("passes a voided clock-in's lock to one that stands, never to a correction or another shift's, and holds on a resend", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan, admin } = await office(tx);
      // The same job twice on Monday: two shifts, each locked by its own clock-in.
      const morning = (await shift(plan, day, "07:00", "11:00")).id;
      const afternoon = (await shift(plan, day, "13:00", "17:00")).id;
      await tx.execute(sql`reset role`);
      const worked = async (from: string, to: string) => {
        const id = await eventIn(tx, day, {
          worker: day.w1,
          job: day.J,
          type: "started",
          client: from,
        });
        await eventIn(tx, day, { worker: day.w1, job: day.J, type: "ended", client: to });
        return id;
      };
      // 07:05 to 10:00 in New York, then 10:10 to 10:50, then 13:05 to 16:00.
      const a = await worked("2026-11-16T12:05:00Z", "2026-11-16T15:00:00Z");
      const later = await worked("2026-11-16T15:10:00Z", "2026-11-16T15:50:00Z");
      const b = await worked("2026-11-16T18:05:00Z", "2026-11-16T21:00:00Z");
      // A correction of the first clock-in's time: a `started` row naming it.
      await eventIn(tx, day, {
        worker: day.w1,
        job: day.J,
        type: "started",
        client: "2026-11-16T12:10:00Z",
        corrects: a,
        initiator: admin.id,
      });
      for (const [shiftId, by] of [
        [morning, a],
        [afternoon, b],
      ] as const) {
        await tx.execute(sql`
          update job_assignments set locked_at = now(), locked_by_event_id = ${by}
          where id = ${shiftId}
        `);
      }
      await becomeApp(tx);
      const lockOf = async (shiftId: string) =>
        (
          await tx
            .select({ by: jobAssignments.lockedByEventId })
            .from(jobAssignments)
            .where(eq(jobAssignments.id, shiftId))
        )[0]?.by;
      const voidA = { kind: "void" as const, id: uuidv7(), voidsEventId: a };
      const correct = (operations: (typeof voidA)[]) =>
        appCallerIn(tx, admin.who).labor.correct({ workerId: day.w1, operations });
      expect((await correct([voidA])).result).toBe("accepted");
      // Not to A's correction, not to the clock-in that holds the afternoon: to 10:10.
      expect(await lockOf(morning)).toBe(later);
      expect(await lockOf(afternoon)).toBe(b);
      // The answer was lost and the office sends the same void again: nothing moves.
      expect((await correct([voidA])).result).toBe("duplicate");
      expect(await lockOf(morning)).toBe(later);
      // That one voided too, nothing of the morning stands: the shift is free.
      expect(
        (await correct([{ kind: "void", id: uuidv7(), voidsEventId: later }])).result,
      ).toBe("accepted");
      expect(await lockOf(morning)).toBeNull();
      expect(await lockOf(afternoon)).toBe(b);
      expect(await plan.remove({ shiftId: morning })).toEqual({ result: "removed" });
    });
  });

  it("frees two shifts voided in one correction, the one clock-in left taken by one of them", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan, admin } = await office(tx);
      const morning = (await shift(plan, day, "07:00", "11:00")).id;
      const afternoon = (await shift(plan, day, "13:00", "17:00")).id;
      await tx.execute(sql`reset role`);
      const worked = async (from: string, to: string) => {
        const id = await eventIn(tx, day, {
          worker: day.w1,
          job: day.J,
          type: "started",
          client: from,
        });
        await eventIn(tx, day, { worker: day.w1, job: day.J, type: "ended", client: to });
        return id;
      };
      const a = await worked("2026-11-16T12:05:00Z", "2026-11-16T15:00:00Z");
      const left = await worked("2026-11-16T15:10:00Z", "2026-11-16T15:50:00Z");
      const b = await worked("2026-11-16T18:05:00Z", "2026-11-16T21:00:00Z");
      for (const [shiftId, by] of [
        [morning, a],
        [afternoon, b],
      ] as const) {
        await tx.execute(sql`
          update job_assignments set locked_at = now(), locked_by_event_id = ${by}
          where id = ${shiftId}
        `);
      }
      await becomeApp(tx);
      const answer = await appCallerIn(tx, admin.who).labor.correct({
        workerId: day.w1,
        operations: [
          { kind: "void", id: uuidv7(), voidsEventId: a },
          { kind: "void", id: uuidv7(), voidsEventId: b },
        ],
      });
      expect(answer.result).toBe("accepted");
      const locks = await tx
        .select({ id: jobAssignments.id, by: jobAssignments.lockedByEventId })
        .from(jobAssignments)
        .where(eq(jobAssignments.userId, day.w1));
      const byShift = new Map(locks.map((l) => [l.id, l.by]));
      // The clock-in left holds one shift; the other is free.
      expect([byShift.get(morning), byShift.get(afternoon)].sort()).toEqual(
        [left, null].sort(),
      );
    });
  });

  it("keeps an early clock-in's leave: nothing may become eligible before its shift", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      // 06:50 in New York: ten minutes early, admitted on the 07:00 shift.
      await punched(tx, day, id, "2026-11-16T11:50:00Z");
      const before = await shift(plan, day, "06:00", "07:00", { jobId: day.K });
      expect(before.day).toEqual({
        id: before.id,
        workDate: MON,
        result: "rejected",
        code: "started",
        shiftId: id,
      });
      // Ending before that minute changes nothing about it.
      const earlier = await shift(plan, day, "05:00", "06:45", { jobId: day.K });
      expect(earlier.day?.result).toBe("created");
      // Stretched over that minute, the clock-in would have been on this shift instead.
      expect(
        await plan.update({
          shiftId: earlier.id,
          workDate: MON,
          expectedStart: "05:00",
          expectedEnd: "07:00",
        }),
      ).toEqual({ result: "rejected", code: "started", shiftId: id });
      expect(await plan.remove({ shiftId: earlier.id })).toEqual({
        result: "removed",
      });
    });
  });
});

describe("gates and targets", () => {
  it("is admin only: a worker schedules nobody, not even themselves", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, worker, as, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const before = await plansOf(tx, day.companyId);
      // Two workers: day.who is one more.
      for (const [who, self] of [
        [worker.who, worker.id],
        [day.who, day.userId],
      ] as const) {
        for (const call of [
          () =>
            as(who).create({
              userId: self,
              jobId: day.J,
              days: on("2026-11-17"),
              ...HOURS,
            }),
          () =>
            as(who).update({
              shiftId: morning.id,
              workDate: "2026-11-18",
              ...HOURS,
            }),
          () => as(who).remove({ shiftId: morning.id }),
          () => as(who).week({ weekStart: MON }),
        ]) {
          expect(await outcome(call())).toBe("FORBIDDEN");
        }
      }
      expect(await outcome(as(null).remove({ shiftId: morning.id }))).toBe(
        "UNAUTHORIZED",
      );
      await tx.execute(sql`select set_config('app.company_id', ${day.companyId}, true)`);
      expect(await plansOf(tx, day.companyId)).toEqual(before);
    });
  });

  it("answers FORBIDDEN for a job or a person that is missing or another company's", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, plan } = await office(tx);
      const good = { userId: day.w1, jobId: day.J, days: on(MON), ...HOURS };
      for (const over of [
        { jobId: other.J },
        { jobId: crypto.randomUUID() },
        { userId: other.w1 },
        { userId: crypto.randomUUID() },
        // Both of the other company: still nothing of ours to write under.
        { userId: other.w1, jobId: other.J },
      ]) {
        expect([over, await outcome(plan.create({ ...good, ...over }))]).toEqual([
          over,
          "FORBIDDEN",
        ]);
      }
      await tx.execute(sql`reset role`);
      const { rows } = await tx.execute(sql`select 1 from job_assignments
        where company_id in (${day.companyId}, ${other.companyId})`);
      expect(rows).toEqual([]);
    });
  });

  it("neither edits nor removes another company's shift, nor takes its id", async () => {
    await rolledBack(owner, async (tx) => {
      const day = await workDayIn(tx);
      const other = await workDayIn(tx);
      const admin = await boundIn(tx, day.companyId, "admin");
      const theirs = (expectedStart: string, expectedEnd: string) => ({
        companyId: other.companyId,
        userId: other.w1,
        jobId: other.J,
        workDate: MON,
        expectedStart,
        expectedEnd,
      });
      const [foreign, second] = await tx
        .insert(jobAssignments)
        .values([theirs("07:00", "15:30"), theirs("12:00", "17:00")])
        .returning({ id: jobAssignments.id });
      await becomeApp(tx);
      const plan = appCallerIn(tx, admin.who).shift;
      for (const shiftId of [foreign!.id, crypto.randomUUID()]) {
        expect(
          await outcome(plan.update({ shiftId, workDate: "2026-11-18", ...HOURS })),
        ).toBe("FORBIDDEN");
      }
      expect(await plan.remove({ shiftId: foreign!.id })).toEqual({
        result: "unchanged",
      });
      // Its id for a shift of ours: taken, though this tenant cannot see by what.
      expect(
        await plan.create({
          userId: day.w1,
          jobId: day.J,
          days: [{ id: foreign!.id, workDate: MON }],
          ...HOURS,
        }),
      ).toMatchObject({ days: [{ result: "rejected", code: "id_conflict" }] });
      await tx.execute(sql`reset role`);
      expect((await plansOf(tx, other.companyId)).map((r) => r.id).sort()).toEqual(
        [foreign!.id, second!.id].sort(),
      );
      expect(await plansOf(tx, day.companyId)).toEqual([]);
    });
  });
});

describe("what a shift leaves alone", () => {
  it("writes no labor event", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const counts = async () => ({
        events: await tx.$count(
          workSessionEvents,
          eq(workSessionEvents.companyId, day.companyId),
        ),
      });
      // A first call, so the tenant is set for the counts that follow.
      await plan.remove({ shiftId: crypto.randomUUID() });
      const before = await counts();
      await plan.create({ userId: day.w1, jobId: day.K, days: on(...WEEK), ...HOURS });
      const [row] = await plansOf(tx, day.companyId);
      await plan.update({ shiftId: row!.id, workDate: "2026-11-23", ...HOURS });
      await plan.remove({ shiftId: row!.id });
      expect(await counts()).toEqual(before);
      expect(before).toEqual({ events: 0 });
    });
  });
});
