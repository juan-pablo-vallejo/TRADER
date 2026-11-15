// TASKS S3, the weekly schedule's writers: assignment.create, update, remove and decide — an
// admin schedules any active person of the company on any job of the company that is not
// archived, whatever their crews; the day and the times kept as written; ids the browser's,
// a resend `duplicate`; an overlap refused without a decision, a day that would not resolve
// refused with its issues; a locked shift and what authorized its clock-in left alone; every
// override write in the history; admin only, a job or a person of another company one
// FORBIDDEN. Every call runs in a rolled-back transaction (helpers, "Rolled-back calls"). The
// rules themselves are eligibility.test.ts's, the reads list.test.ts's, what a shift does
// not change about labor authority.test.ts's, and real commits against each other
// assignment-commit.test.ts's.
import {
  auditLog,
  crewMembers,
  jobAssignments,
  shiftOverrideHistory,
  shiftOverrides,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  type CrewDay,
  crewDayIn,
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

// A crew's day (w1 and w2 in the crew of job J; job K on no crew) with an admin, and a second
// company's day beside it. Fixtures are the owner's; from here the transaction is trader_app.
async function office(tx: Tx) {
  const day = await crewDayIn(tx);
  const other = await crewDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  const gone = await boundIn(tx, day.companyId, "worker", { deactivated: true });
  await becomeApp(tx);
  const as = (who: unknown) => appCallerIn(tx, who).assignment;
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
const WHY = "Covering the afternoon";

// One shift of w1 on J on Monday, and its id.
async function shift(
  plan: Awaited<ReturnType<typeof office>>["plan"],
  day: CrewDay,
  expectedStart: string,
  expectedEnd: string,
  over: { jobId?: string; workDate?: string; decisions?: unknown[] } = {},
) {
  const id = uuidv7();
  const answer = await plan.create({
    userId: day.w1,
    jobId: over.jobId ?? day.J,
    expectedStart,
    expectedEnd,
    days: [
      {
        id,
        workDate: over.workDate ?? MON,
        decisions: (over.decisions ?? []) as never,
      },
    ],
  });
  return { id, answer, day: answer.result === "planned" ? answer.days[0]! : undefined };
}

const holds = (otherId: string, holder: "this" | "other", reason = WHY) => ({
  overrideId: uuidv7(),
  otherId,
  holder,
  reason,
});

const overridesOf = (tx: Tx) =>
  tx
    .select({
      id: shiftOverrides.id,
      holderId: shiftOverrides.holderId,
      yieldingId: shiftOverrides.yieldingId,
      reason: shiftOverrides.reason,
    })
    .from(shiftOverrides)
    .orderBy(asc(shiftOverrides.id));

const historyOf = (tx: Tx) =>
  tx
    .select({
      overrideId: shiftOverrideHistory.overrideId,
      action: shiftOverrideHistory.action,
      reason: shiftOverrideHistory.reason,
      holderShiftId: shiftOverrideHistory.holderShiftId,
      yieldingShiftId: shiftOverrideHistory.yieldingShiftId,
    })
    .from(shiftOverrideHistory)
    .orderBy(asc(shiftOverrideHistory.createdAt), asc(shiftOverrideHistory.id));

// A clock-in of w1 on `job` at `at` (an instant; New York is UTC-5 that week), and the shift
// locked by it — written as the owner, as push will under enforcement (TASKS S4).
async function punched(tx: Tx, day: CrewDay, shiftId: string, at: string, job = day.J) {
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

describe("assignment.create", () => {
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

  it("schedules several people on one job at once, whatever their crews and roles", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, plan } = await office(tx);
      // K has no crew and w1 is not on it: a shift never reads membership. A foreman and an
      // admin are scheduled like anyone.
      for (const [userId, jobId] of [
        [day.w1, day.J],
        [day.w2, day.J],
        [day.foremanId, day.K],
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

  it("takes one job twice in a day, and shifts that touch, with no decision", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      expect((await shift(plan, day, "07:00", "11:00")).day?.result).toBe("created");
      // Touching: the first ends as the second starts.
      expect((await shift(plan, day, "11:00", "15:00")).day?.result).toBe("created");
      expect(
        (await shift(plan, day, "16:00", "18:00", { jobId: day.K })).day?.result,
      ).toBe("created");
      expect(await overridesOf(tx)).toEqual([]);
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

  it("refuses an overlap without a decision, and takes it with one", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const undecided = await shift(plan, day, "12:00", "17:00", { jobId: day.K });
      expect(undecided.day).toEqual({
        id: undecided.id,
        workDate: MON,
        result: "rejected",
        code: "schedule",
        issues: [
          {
            code: "missing_decision",
            shiftIds: [morning.id, undecided.id],
            start: "12:00",
            end: "15:30",
          },
        ],
      });
      expect(await plansOf(tx, day.companyId)).toHaveLength(1);

      const decision = holds(morning.id, "other");
      const decided = await shift(plan, day, "12:00", "17:00", {
        jobId: day.K,
        decisions: [decision],
      });
      expect(decided.day?.result).toBe("created");
      expect(await overridesOf(tx)).toEqual([
        {
          id: decision.overrideId,
          holderId: morning.id,
          yieldingId: decided.id,
          reason: WHY,
        },
      ]);
      expect(await historyOf(tx)).toEqual([
        {
          overrideId: decision.overrideId,
          action: "created",
          reason: WHY,
          holderShiftId: morning.id,
          yieldingShiftId: decided.id,
        },
      ]);
    });
  });

  it("refuses a decision that leaves a shift no time, names a stranger, or is not needed", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, plan } = await office(tx);
      const whole = await shift(plan, day, "07:00", "15:30");
      // Inside the other and yielding to it: no minute would be its own.
      const inside = await shift(plan, day, "09:00", "11:00", {
        decisions: [holds(whole.id, "other")],
      });
      expect(inside.day).toMatchObject({
        code: "schedule",
        issues: [{ code: "no_eligible_time", shiftId: inside.id }],
      });
      // A shift of another person, of another company, and one that does not exist.
      const theirs = await shift(plan, day, "07:00", "15:30", { workDate: "2026-11-17" });
      await tx.execute(sql`reset role`);
      const [foreign] = await tx
        .insert(jobAssignments)
        .values({
          companyId: other.companyId,
          userId: other.w1,
          jobId: other.J,
          workDate: MON,
          ...HOURS,
        })
        .returning({ id: jobAssignments.id });
      await becomeApp(tx);
      for (const stranger of [theirs.id, foreign!.id, uuidv7()]) {
        const answer = await shift(plan, day, "12:00", "17:00", {
          decisions: [holds(whole.id, "other"), holds(stranger, "this")],
        });
        expect(answer.day).toMatchObject({
          code: "schedule",
          issues: [{ code: "override_unknown_shift" }],
        });
      }
      // A decision about two shifts that do not overlap.
      const apart = await shift(plan, day, "16:00", "18:00", {
        decisions: [holds(whole.id, "this")],
      });
      expect(apart.day).toMatchObject({
        code: "schedule",
        issues: [{ code: "override_not_overlapping" }],
      });
      await tx.execute(sql`select set_config('app.company_id', ${day.companyId}, true)`);
      expect(await plansOf(tx, day.companyId)).toHaveLength(2);
      expect(await overridesOf(tx)).toEqual([]);
      expect(await historyOf(tx)).toEqual([]);
    });
  });

  it("refuses a circle of three decisions", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const a = await shift(plan, day, "07:00", "12:00");
      const b = await shift(plan, day, "09:00", "14:00", {
        decisions: [holds(a.id, "other")],
      });
      expect(b.day?.result).toBe("created");
      // a holds over b; c would yield to b and hold over a.
      const c = await shift(plan, day, "10:00", "16:00", {
        decisions: [holds(b.id, "other"), holds(a.id, "this")],
      });
      expect(c.day).toMatchObject({
        code: "schedule",
        issues: [{ code: "circular_precedence", start: "10:00", end: "12:00" }],
      });
      expect(await plansOf(tx, day.companyId)).toHaveLength(2);
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
      const decided = (d: object) => [{ id: uuidv7(), workDate: MON, decisions: [d] }];
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
        // A decision with no reason, a blank one, and two about one shift.
        { ...good, days: decided({ ...holds(id, "this"), reason: "" }) },
        { ...good, days: decided({ ...holds(id, "this"), reason: "   " }) },
        {
          ...good,
          days: [
            {
              id: uuidv7(),
              workDate: MON,
              decisions: [holds(id, "this"), holds(id, "other")],
            },
          ],
        },
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

describe("assignment.update", () => {
  it("moves a shift's day and times; the same values are `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const { id } = await shift(plan, day, "07:00", "15:30");
      const moved = {
        assignmentId: id,
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

  it("refuses a change into the same shift, an undecided overlap, or no time of its own", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const monday = await shift(plan, day, "07:00", "15:30");
      const tuesday = await shift(plan, day, "07:00", "15:30", {
        workDate: "2026-11-17",
      });
      const late = await shift(plan, day, "16:00", "18:00");
      const before = await plansOf(tx, day.companyId);
      expect(
        await plan.update({ assignmentId: tuesday.id, workDate: MON, ...HOURS }),
      ).toMatchObject({ code: "schedule", issues: [{ code: "duplicate_shift" }] });
      const into = { assignmentId: late.id, workDate: MON, expectedStart: "09:00" };
      expect(await plan.update({ ...into, expectedEnd: "18:00" })).toMatchObject({
        code: "schedule",
        issues: [{ code: "missing_decision", start: "09:00", end: "15:30" }],
      });
      expect(
        await plan.update({
          ...into,
          expectedEnd: "11:00",
          decisions: [holds(monday.id, "other")],
        }),
      ).toMatchObject({
        code: "schedule",
        issues: [{ code: "no_eligible_time", shiftId: late.id }],
      });
      // Each refusal left the transaction usable and every row as it was.
      expect(await plansOf(tx, day.companyId)).toEqual(before);
      expect(await historyOf(tx)).toEqual([]);
    });
  });

  it("keeps a decision while the overlap lasts, changes it when told, and drops it with the overlap", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const made = holds(morning.id, "other");
      const late = await shift(plan, day, "12:00", "17:00", {
        jobId: day.K,
        decisions: [made],
      });
      const at = (expectedStart: string, expectedEnd: string) => ({
        assignmentId: late.id,
        workDate: MON,
        expectedStart,
        expectedEnd,
      });
      // Still overlapping: the decision stands and nothing new is asked.
      expect(await plan.update(at("13:00", "17:00"))).toEqual({ result: "updated" });
      expect(await overridesOf(tx)).toHaveLength(1);
      // The other way round, with its reason.
      expect(
        await plan.update({
          ...at("13:00", "17:00"),
          decisions: [
            { ...holds(morning.id, "this", "Client asked"), overrideId: uuidv7() },
          ],
        }),
      ).toEqual({ result: "updated" });
      expect(await overridesOf(tx)).toEqual([
        {
          id: made.overrideId,
          holderId: late.id,
          yieldingId: morning.id,
          reason: "Client asked",
        },
      ]);
      // No longer overlapping: nothing is left to decide.
      expect(await plan.update(at("15:30", "17:00"))).toEqual({ result: "updated" });
      expect(await overridesOf(tx)).toEqual([]);
      expect(
        (await historyOf(tx)).map((h) => [h.action, h.reason, h.holderShiftId]),
      ).toEqual([
        ["created", WHY, morning.id],
        ["changed", "Client asked", late.id],
        ["removed", "Client asked", late.id],
      ]);
    });
  });

  it("leaves a shift's decisions behind when it moves to another day", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const late = await shift(plan, day, "12:00", "17:00", {
        decisions: [holds(morning.id, "other")],
      });
      expect(
        await plan.update({
          assignmentId: late.id,
          workDate: "2026-11-18",
          expectedStart: "12:00",
          expectedEnd: "17:00",
        }),
      ).toEqual({ result: "updated" });
      expect(await overridesOf(tx)).toEqual([]);
      expect((await historyOf(tx)).map((h) => h.action)).toEqual(["created", "removed"]);
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
        await plan.update({ assignmentId: id, workDate: "2026-11-18", ...HOURS }),
      ).toEqual({ result: "updated" });
    });
  });
});

describe("assignment.remove", () => {
  it("removes a shift once; again, or for one that never was, it is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await plan.create({ userId: day.w1, jobId: day.J, days: on(...WEEK), ...HOURS });
      const rows = await plansOf(tx, day.companyId);
      expect(await plan.remove({ assignmentId: rows[0]!.id })).toEqual({
        result: "removed",
      });
      expect(await plan.remove({ assignmentId: rows[0]!.id })).toEqual({
        result: "unchanged",
      });
      expect(await plan.remove({ assignmentId: crypto.randomUUID() })).toEqual({
        result: "unchanged",
      });
      expect((await plansOf(tx, day.companyId)).map((r) => r.workDate)).toEqual(
        WEEK.slice(1),
      );
    });
  });

  it("takes the shift's decisions with it, each into the history", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const made = holds(morning.id, "this");
      const late = await shift(plan, day, "12:00", "17:00", { decisions: [made] });
      expect(await plan.remove({ assignmentId: morning.id })).toEqual({
        result: "removed",
      });
      expect(await overridesOf(tx)).toEqual([]);
      expect(await historyOf(tx)).toEqual([
        {
          overrideId: made.overrideId,
          action: "created",
          reason: WHY,
          holderShiftId: late.id,
          yieldingShiftId: morning.id,
        },
        {
          overrideId: made.overrideId,
          action: "removed",
          reason: WHY,
          holderShiftId: late.id,
          yieldingShiftId: morning.id,
        },
      ]);
    });
  });
});

describe("assignment.decide", () => {
  it("turns a decision round or restates its reason; the same again is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const made = holds(morning.id, "other");
      const late = await shift(plan, day, "12:00", "17:00", { decisions: [made] });
      const turned = { overrideId: made.overrideId, holderId: late.id, reason: "Swap" };
      expect(await plan.decide(turned)).toEqual({ result: "updated" });
      expect(await plan.decide(turned)).toEqual({ result: "unchanged" });
      expect(await plan.decide({ ...turned, reason: "Swap, confirmed" })).toEqual({
        result: "updated",
      });
      expect(await overridesOf(tx)).toEqual([
        {
          id: made.overrideId,
          holderId: late.id,
          yieldingId: morning.id,
          reason: "Swap, confirmed",
        },
      ]);
      expect((await historyOf(tx)).map((h) => [h.action, h.reason])).toEqual([
        ["created", WHY],
        ["changed", "Swap"],
        ["changed", "Swap, confirmed"],
      ]);
    });
  });

  it("refuses a turn that leaves a shift no time, and a holder outside the pair", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const whole = await shift(plan, day, "07:00", "15:30");
      const made = holds(whole.id, "this");
      const inside = await shift(plan, day, "09:00", "11:00", { decisions: [made] });
      expect(inside.day?.result).toBe("created");
      expect(
        await plan.decide({
          overrideId: made.overrideId,
          holderId: whole.id,
          reason: WHY,
        }),
      ).toMatchObject({
        code: "schedule",
        issues: [{ code: "no_eligible_time", shiftId: inside.id }],
      });
      const elsewhere = await shift(plan, day, "16:00", "18:00");
      // One at a time: the calls share this transaction's one connection.
      for (const call of [
        () =>
          plan.decide({
            overrideId: made.overrideId,
            holderId: elsewhere.id,
            reason: WHY,
          }),
        () => plan.decide({ overrideId: uuidv7(), holderId: whole.id, reason: WHY }),
      ]) {
        expect(await outcome(call())).toBe("FORBIDDEN");
      }
      expect(
        await outcome(
          plan.decide({ overrideId: made.overrideId, holderId: whole.id, reason: " " }),
        ),
      ).toBe("BAD_REQUEST");
      expect((await historyOf(tx)).map((h) => h.action)).toEqual(["created"]);
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
        expect(await plan.update({ assignmentId: id, ...change })).toEqual({
          result: "rejected",
          code: "locked",
        });
      }
      expect(await plan.remove({ assignmentId: id })).toEqual({
        result: "rejected",
        code: "locked",
      });
      // The same day and times again is still nothing to do.
      expect(await plan.update({ assignmentId: id, workDate: MON, ...HOURS })).toEqual({
        result: "unchanged",
      });
      expect(await plansOf(tx, day.companyId)).toHaveLength(1);
    });
  });

  it("keeps what admitted its clock-in: no shift, decision or removal may take that minute", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const made = holds(morning.id, "other");
      const late = await shift(plan, day, "12:00", "17:00", {
        jobId: day.K,
        decisions: [made],
      });
      // 13:00 in New York: the shared time, which the morning shift holds.
      await punched(tx, day, morning.id, "2026-11-16T18:00:00Z");
      const refusal = { result: "rejected", code: "authorization", shiftId: morning.id };

      // A new shift that would hold 13:00 against it.
      const over = await shift(plan, day, "12:30", "13:30", {
        jobId: day.K,
        decisions: [holds(morning.id, "this"), holds(late.id, "this")],
      });
      expect(over.day).toEqual({ id: over.id, workDate: MON, ...refusal });
      // The decision turned round, by `decide` and through a change of the other shift.
      expect(
        await plan.decide({
          overrideId: made.overrideId,
          holderId: late.id,
          reason: WHY,
        }),
      ).toEqual(refusal);
      expect(
        await plan.update({
          assignmentId: late.id,
          workDate: MON,
          expectedStart: "12:00",
          expectedEnd: "17:00",
          decisions: [holds(morning.id, "this")],
        }),
      ).toEqual(refusal);
      // What leaves that minute alone is still allowed: a shift after both, and the other
      // shift's own end.
      expect((await shift(plan, day, "18:00", "20:00")).day?.result).toBe("created");
      expect(
        await plan.update({
          assignmentId: late.id,
          workDate: MON,
          expectedStart: "12:00",
          expectedEnd: "17:30",
        }),
      ).toEqual({ result: "updated" });
      expect(await overridesOf(tx)).toEqual([
        { id: made.overrideId, holderId: morning.id, yieldingId: late.id, reason: WHY },
      ]);
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
        code: "authorization",
        shiftId: id,
      });
      // Ending before that minute changes nothing about it.
      expect(
        (await shift(plan, day, "05:00", "06:45", { jobId: day.K })).day?.result,
      ).toBe("created");
    });
  });
});

describe("gates and targets", () => {
  it("is admin only: a worker and a foreman schedule nobody, not even themselves", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, worker, as, plan } = await office(tx);
      const morning = await shift(plan, day, "07:00", "15:30");
      const made = holds(morning.id, "other");
      await shift(plan, day, "12:00", "17:00", { decisions: [made] });
      const before = await plansOf(tx, day.companyId);
      // day.who is the foreman of J's crew.
      for (const [who, self] of [
        [worker.who, worker.id],
        [day.who, day.foremanId],
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
              assignmentId: morning.id,
              workDate: "2026-11-18",
              ...HOURS,
            }),
          () => as(who).remove({ assignmentId: morning.id }),
          () =>
            as(who).decide({
              overrideId: made.overrideId,
              holderId: morning.id,
              reason: WHY,
            }),
          () => as(who).week({ weekStart: MON }),
        ]) {
          expect(await outcome(call())).toBe("FORBIDDEN");
        }
      }
      expect(await outcome(as(null).remove({ assignmentId: morning.id }))).toBe(
        "UNAUTHORIZED",
      );
      await tx.execute(sql`select set_config('app.company_id', ${day.companyId}, true)`);
      expect(await plansOf(tx, day.companyId)).toEqual(before);
      expect((await historyOf(tx)).map((h) => h.action)).toEqual(["created"]);
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

  it("neither edits nor removes another company's shift, nor takes its id or its decision", async () => {
    await rolledBack(owner, async (tx) => {
      const day = await crewDayIn(tx);
      const other = await crewDayIn(tx);
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
      const [decided] = await tx
        .insert(shiftOverrides)
        .values({
          companyId: other.companyId,
          holderId: foreign!.id,
          yieldingId: second!.id,
          reason: WHY,
          createdBy: other.w1,
        })
        .returning({ id: shiftOverrides.id });
      await becomeApp(tx);
      const plan = appCallerIn(tx, admin.who).assignment;
      for (const assignmentId of [foreign!.id, crypto.randomUUID()]) {
        expect(
          await outcome(plan.update({ assignmentId, workDate: "2026-11-18", ...HOURS })),
        ).toBe("FORBIDDEN");
      }
      expect(await plan.remove({ assignmentId: foreign!.id })).toEqual({
        result: "unchanged",
      });
      expect(
        await outcome(
          plan.decide({ overrideId: decided!.id, holderId: second!.id, reason: WHY }),
        ),
      ).toBe("FORBIDDEN");
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
      const { rows } = await tx.execute<{ holder_id: string }>(
        sql`select holder_id from shift_overrides where id = ${decided!.id}`,
      );
      expect(rows).toEqual([{ holder_id: foreign!.id }]);
    });
  });
});

describe("what a shift leaves alone", () => {
  it("writes no membership, no labor event and no audit row", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const counts = async () => ({
        members: await tx.$count(crewMembers, eq(crewMembers.companyId, day.companyId)),
        events: await tx.$count(
          workSessionEvents,
          eq(workSessionEvents.companyId, day.companyId),
        ),
        audit: await tx.$count(auditLog, eq(auditLog.companyId, day.companyId)),
      });
      // A first call, so the tenant is set for the counts that follow.
      await plan.remove({ assignmentId: crypto.randomUUID() });
      const before = await counts();
      // w1 is not on K's crew — K has none.
      await plan.create({ userId: day.w1, jobId: day.K, days: on(...WEEK), ...HOURS });
      const [row] = await plansOf(tx, day.companyId);
      await plan.update({ assignmentId: row!.id, workDate: "2026-11-23", ...HOURS });
      await plan.remove({ assignmentId: row!.id });
      expect(await counts()).toEqual(before);
      expect(before).toEqual({ members: 3, events: 0, audit: 0 });
    });
  });
});
