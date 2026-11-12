// TASKS, dated worker-job assignments (V1-D07): assignment.create, update and remove — an
// admin plans any active person of the company on any job of the company that is not
// archived, whatever their crews; the day and the times kept as written; a day already planned
// left as it is; admin only, a job or a person of another company one FORBIDDEN. Every call
// runs in a rolled-back transaction (helpers, "Rolled-back calls"). The reads are
// list.test.ts's, what a plan does not change about labor is authority.test.ts's, and real
// commits against each other are assignment-commit.test.ts's.
import {
  auditLog,
  crewMembers,
  jobAssignments,
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
  crewDayIn,
  outcome,
  ownerDb,
  rolledBack,
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

describe("assignment.create", () => {
  it("plans a week for a worker in one call, the day and times as written", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      expect(
        await plan.create({ userId: day.w1, jobId: day.J, workDates: WEEK, ...HOURS }),
      ).toEqual({ result: "created", created: 5, existing: 0 });
      const rows = await plansOf(tx, day.companyId);
      expect(rows.map((r) => r.workDate)).toEqual(WEEK);
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

  it("plans several people on one job, and one person on several jobs, the same day", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, plan } = await office(tx);
      const on = (userId: string, jobId: string) =>
        plan.create({ userId, jobId, workDates: ["2026-11-16"], ...HOURS });
      // K has no crew, w1 is not on it, and the times overlap: none of it is judged. A
      // foreman and an admin are planned like anyone.
      for (const [userId, jobId] of [
        [day.w1, day.J],
        [day.w2, day.J],
        [day.w1, day.K],
        [day.foremanId, day.K],
        [admin.id, day.K],
      ] as const) {
        expect(await on(userId, jobId)).toEqual({
          result: "created",
          created: 1,
          existing: 0,
        });
      }
      expect(await plansOf(tx, day.companyId)).toHaveLength(5);
    });
  });

  it("leaves a day already planned exactly as it is: a retry is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const first = {
        userId: day.w1,
        jobId: day.J,
        workDates: WEEK.slice(0, 3),
        ...HOURS,
      };
      await plan.create(first);
      expect(await plan.create(first)).toEqual({ result: "unchanged" });
      // The whole week at other times: the three planned days keep theirs.
      expect(
        await plan.create({
          ...first,
          workDates: WEEK,
          expectedStart: "09:00",
          expectedEnd: "12:00",
        }),
      ).toEqual({ result: "created", created: 2, existing: 3 });
      const rows = await plansOf(tx, day.companyId);
      expect(rows.map((r) => r.expectedStart)).toEqual([
        "07:00:00",
        "07:00:00",
        "07:00:00",
        "09:00:00",
        "09:00:00",
      ]);
    });
  });

  it("refuses a deactivated person and an archived job, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, gone, admin, plan } = await office(tx);
      expect(
        await plan.create({ userId: gone.id, jobId: day.J, workDates: WEEK, ...HOURS }),
      ).toEqual({ result: "rejected", code: "user_inactive" });
      await appCallerIn(tx, admin.who).job.setStatus({
        jobId: day.K,
        status: "archived",
      });
      expect(
        await plan.create({ userId: day.w1, jobId: day.K, workDates: WEEK, ...HOURS }),
      ).toEqual({ result: "rejected", code: "job_archived" });
      expect(await plansOf(tx, day.companyId)).toEqual([]);
    });
  });

  it("refuses a malformed plan as BAD_REQUEST", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const good = { userId: day.w1, jobId: day.J, workDates: ["2026-11-16"], ...HOURS };
      const fifteen = Array.from(
        { length: 15 },
        (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`,
      );
      for (const bad of [
        { ...good, expectedStart: "15:30", expectedEnd: "07:00" },
        { ...good, expectedStart: "07:00", expectedEnd: "07:00" },
        // Overnight is not one plan.
        { ...good, expectedStart: "22:00", expectedEnd: "02:00" },
        { ...good, expectedEnd: "24:00" },
        { ...good, expectedStart: "7:5" },
        { ...good, expectedStart: "07:00:00" },
        { ...good, workDates: [] },
        { ...good, workDates: fifteen },
        { ...good, workDates: ["2026-11-16", "2026-11-16"] },
        { ...good, workDates: ["2026-02-30"] },
        { ...good, workDates: ["11/16/2026"] },
        // A year Postgres has no date for, and one nobody plans in.
        { ...good, workDates: ["0000-12-27"] },
        { ...good, workDates: ["1999-12-31"] },
        { ...good, workDates: ["2100-01-01"] },
      ]) {
        expect([bad, await outcome(plan.create(bad))]).toEqual([bad, "BAD_REQUEST"]);
      }
      expect(await plansOf(tx, day.companyId)).toEqual([]);
    });
  });
});

describe("assignment.update", () => {
  it("moves a plan's day and times; the same values are `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await plan.create({
        userId: day.w1,
        jobId: day.J,
        workDates: ["2026-11-16"],
        ...HOURS,
      });
      const [row] = await plansOf(tx, day.companyId);
      const moved = {
        assignmentId: row!.id,
        workDate: "2026-11-19",
        expectedStart: "08:00",
        expectedEnd: "12:15",
      };
      expect(await plan.update(moved)).toEqual({ result: "updated" });
      expect(await plan.update(moved)).toEqual({ result: "unchanged" });
      expect(await plansOf(tx, day.companyId)).toEqual([
        {
          id: row!.id,
          userId: day.w1,
          jobId: day.J,
          workDate: "2026-11-19",
          expectedStart: "08:00:00",
          expectedEnd: "12:15:00",
        },
      ]);
    });
  });

  it("refuses a day the person is already planned on that job, and keeps both plans", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await plan.create({
        userId: day.w1,
        jobId: day.J,
        workDates: ["2026-11-16", "2026-11-17"],
        ...HOURS,
      });
      const before = await plansOf(tx, day.companyId);
      expect(
        await plan.update({
          assignmentId: before[0]!.id,
          workDate: "2026-11-17",
          expectedStart: "09:00",
          expectedEnd: "10:00",
        }),
      ).toEqual({ result: "rejected", code: "already_planned" });
      // The refusal left the transaction usable and both rows as they were.
      expect(await plansOf(tx, day.companyId)).toEqual(before);
    });
  });

  it("still edits a plan whose job was archived or whose person was deactivated since", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, plan } = await office(tx);
      await plan.create({
        userId: day.w1,
        jobId: day.J,
        workDates: ["2026-11-16"],
        ...HOURS,
      });
      const [row] = await plansOf(tx, day.companyId);
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
        await plan.update({ assignmentId: row!.id, workDate: "2026-11-18", ...HOURS }),
      ).toEqual({ result: "updated" });
    });
  });
});

describe("assignment.remove", () => {
  it("removes a plan once; again, or for a plan that never was, it is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      await plan.create({ userId: day.w1, jobId: day.J, workDates: WEEK, ...HOURS });
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
});

describe("gates and targets", () => {
  it("is admin only: a worker and a foreman plan nobody, not even themselves", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, worker, as, plan } = await office(tx);
      await plan.create({
        userId: day.w1,
        jobId: day.J,
        workDates: ["2026-11-16"],
        ...HOURS,
      });
      const [row] = await plansOf(tx, day.companyId);
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
              workDates: ["2026-11-17"],
              ...HOURS,
            }),
          () =>
            as(who).update({ assignmentId: row!.id, workDate: "2026-11-18", ...HOURS }),
          () => as(who).remove({ assignmentId: row!.id }),
        ]) {
          expect(await outcome(call())).toBe("FORBIDDEN");
        }
      }
      expect(await outcome(as(null).remove({ assignmentId: row!.id }))).toBe(
        "UNAUTHORIZED",
      );
      await tx.execute(sql`select set_config('app.company_id', ${day.companyId}, true)`);
      expect(await plansOf(tx, day.companyId)).toEqual([row]);
    });
  });

  it("answers FORBIDDEN for a job or a person that is missing or another company's", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, plan } = await office(tx);
      const good = { userId: day.w1, jobId: day.J, workDates: ["2026-11-16"], ...HOURS };
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

  it("neither edits nor removes another company's plan", async () => {
    await rolledBack(owner, async (tx) => {
      const day = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, day.companyId, "admin");
      const [foreign] = await tx
        .insert(jobAssignments)
        .values({
          companyId: other.companyId,
          userId: other.w1,
          jobId: other.J,
          workDate: "2026-11-16",
          ...HOURS,
        })
        .returning({ id: jobAssignments.id });
      await becomeApp(tx);
      const plan = appCallerIn(tx, admin.who).assignment;
      expect(
        await outcome(
          plan.update({ assignmentId: foreign!.id, workDate: "2026-11-18", ...HOURS }),
        ),
      ).toBe("FORBIDDEN");
      expect(
        await outcome(
          plan.update({
            assignmentId: crypto.randomUUID(),
            workDate: "2026-11-18",
            ...HOURS,
          }),
        ),
      ).toBe("FORBIDDEN");
      expect(await plan.remove({ assignmentId: foreign!.id })).toEqual({
        result: "unchanged",
      });
      await tx.execute(sql`reset role`);
      expect(await plansOf(tx, other.companyId)).toEqual([
        {
          id: foreign!.id,
          userId: other.w1,
          jobId: other.J,
          workDate: "2026-11-16",
          expectedStart: "07:00:00",
          expectedEnd: "15:30:00",
        },
      ]);
    });
  });
});

describe("what a plan leaves alone", () => {
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
      await plan.create({ userId: day.w1, jobId: day.K, workDates: WEEK, ...HOURS });
      const [row] = await plansOf(tx, day.companyId);
      await plan.update({ assignmentId: row!.id, workDate: "2026-11-23", ...HOURS });
      await plan.remove({ assignmentId: row!.id });
      expect(await counts()).toEqual(before);
      expect(before).toEqual({ members: 3, events: 0, audit: 0 });
    });
  });
});
