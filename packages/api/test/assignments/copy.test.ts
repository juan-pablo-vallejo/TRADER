// Copy Last Week: assignment.copyPreview, copyConfirm and copyUndo (copy.ts). The
// preview writes nothing and says what will be created and what is left out and why; a
// confirmation writes exactly the preview it names, or nothing and the new one; sent again it
// creates nothing; undo removes the whole copy or none of it. Every
// call runs in a rolled-back transaction (helpers, "Rolled-back calls"); two admins copying
// at once and a failure part-way are assignment-commit.test.ts's.
import { jobAssignments, users } from "@trader/db/schema";
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

// The source week and the week being filled: Mondays, New York's winter (UTC-5).
const LAST = "2026-11-02";
const THIS = "2026-11-09";
const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };

async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const other = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  // A shift written as the owner: the fixture is last week as it stands, however it got so.
  const put = async (
    userId: string,
    jobId: string,
    workDate: string,
    hours = HOURS,
    companyId = day.companyId,
  ) =>
    (
      await tx
        .insert(jobAssignments)
        .values({ companyId, userId, jobId, workDate, ...hours })
        .returning({ id: jobAssignments.id })
    )[0]!.id;
  const as = (who: unknown) => appCallerIn(tx, who).assignment;
  return { day, other, admin, worker, put, as, plan: as(admin.who) };
}

const shiftsOf = async (tx: Tx, d: WorkDay, from = THIS) =>
  tx
    .select({
      userId: jobAssignments.userId,
      jobId: jobAssignments.jobId,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      copyId: jobAssignments.copyId,
    })
    .from(jobAssignments)
    .where(
      sql`${jobAssignments.companyId} = ${d.companyId} and ${jobAssignments.workDate} >= ${from}`,
    )
    .orderBy(asc(jobAssignments.workDate), asc(jobAssignments.expectedStart));

const brief = (p: { create: object[]; leftOut: object[] }) => ({
  create: (p.create as { workDate: string; expectedStart: string }[]).map(
    (o) => `${o.workDate} ${o.expectedStart}`,
  ),
  leftOut: (
    p.leftOut as { workDate: string; expectedStart: string; reason: string }[]
  ).map((o) => `${o.workDate} ${o.expectedStart} ${o.reason}`),
});

describe("assignment.copyPreview", () => {
  it("offers last week's shifts on the same weekdays and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, put, plan } = await office(tx);
      const mon = await put(day.w1, day.J, "2026-11-02");
      await put(day.w1, day.K, "2026-11-04", {
        expectedStart: "08:00",
        expectedEnd: "12:00",
      });
      await put(day.w2, day.J, "2026-11-08");
      // The week before last, this week, and another company's last week: none is a source.
      await put(day.w1, day.J, "2026-10-28");
      await put(other.w1, other.J, "2026-11-02", HOURS, other.companyId);
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      expect(preview).toMatchObject({
        weekStart: THIS,
        sourceWeekStart: LAST,
        leftOut: [],
      });
      expect(preview.create).toHaveLength(3);
      expect(preview.create.find((o) => o.sourceId === mon)).toEqual({
        sourceId: mon,
        worker: { id: day.w1, name: expect.any(String) },
        job: { id: day.J, name: expect.any(String) },
        workDate: THIS,
        ...HOURS,
      });
      expect(preview.create.map((o) => o.workDate).sort()).toEqual([
        "2026-11-09",
        "2026-11-11",
        "2026-11-15",
      ]);
      expect(preview.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      // The same again is the same plan; nothing was written.
      expect((await plan.copyPreview({ weekStart: THIS })).fingerprint).toBe(
        preview.fingerprint,
      );
      expect(await shiftsOf(tx, day)).toEqual([]);
    });
  });

  it("leaves out a deactivated person, an archived job, the same shift and an overlap, each with its reason", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, put, plan } = await office(tx);
      const gone = await boundIn(tx, day.companyId, "worker");
      await put(gone.id, day.J, "2026-11-02");
      await put(day.w2, day.K, "2026-11-02");
      // w1's Monday: already there this week. Tuesday: this week holds an overlapping shift.
      await put(day.w1, day.J, "2026-11-02");
      await put(day.w1, day.J, THIS);
      await put(day.w1, day.J, "2026-11-03");
      await put(day.w1, day.J, "2026-11-10", {
        expectedStart: "12:00",
        expectedEnd: "17:00",
      });
      // Wednesday is clear.
      await put(day.w1, day.J, "2026-11-04", {
        expectedStart: "09:00",
        expectedEnd: "13:00",
      });
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, gone.id));
      await becomeApp(tx);
      await appCallerIn(tx, admin.who).job.setStatus({
        jobId: day.K,
        status: "archived",
      });
      const preview = await plan.copyPreview({ weekStart: THIS });
      expect(brief(preview)).toEqual({
        create: ["2026-11-11 09:00"],
        leftOut: expect.arrayContaining([
          "2026-11-09 07:00 user_inactive",
          "2026-11-09 07:00 job_archived",
          "2026-11-09 07:00 duplicate",
          "2026-11-10 07:00 overlap",
        ]),
      });
      expect(preview.leftOut).toHaveLength(4);
    });
  });

  it("copies, of two shifts that overlapped last week, the earlier one alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, put, plan } = await office(tx);
      await put(day.w1, day.J, "2026-11-02");
      await put(day.w1, day.K, "2026-11-02", {
        expectedStart: "12:00",
        expectedEnd: "17:00",
      });
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      expect(brief(preview)).toEqual({
        create: ["2026-11-09 07:00"],
        leftOut: ["2026-11-09 12:00 overlap"],
      });
      await plan.copyConfirm({
        copyId: uuidv7(),
        weekStart: THIS,
        fingerprint: preview.fingerprint,
      });
      expect((await shiftsOf(tx, day)).map((s) => s.expectedStart)).toEqual(["07:00:00"]);
    });
  });

  it("leaves out a shift that would take a clock-in's early leave", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, put, plan } = await office(tx);
      // This Monday: w1 clocked in at 06:50 on the 07:00 shift. Last Monday held 06:00-07:00.
      const held = await put(day.w1, day.J, THIS);
      await put(day.w1, day.K, "2026-11-02", {
        expectedStart: "06:00",
        expectedEnd: "07:00",
      });
      const eventId = await eventIn(tx, day, {
        worker: day.w1,
        job: day.J,
        type: "started",
        client: "2026-11-09T11:50:00Z",
      });
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${eventId}
        where id = ${held}
      `);
      await becomeApp(tx);
      expect(brief(await plan.copyPreview({ weekStart: THIS }))).toEqual({
        create: [],
        leftOut: ["2026-11-09 06:00 authorization"],
      });
    });
  });

  it("refuses a week that does not start on a Monday", async () => {
    await rolledBack(owner, async (tx) => {
      const { plan } = await office(tx);
      await becomeApp(tx);
      for (const weekStart of ["2026-11-08", "2026-11-10"]) {
        expect(await outcome(plan.copyPreview({ weekStart }))).toBe("BAD_REQUEST");
        expect(
          await outcome(
            plan.copyConfirm({
              copyId: uuidv7(),
              weekStart,
              fingerprint: "0".repeat(64),
            }),
          ),
        ).toBe("BAD_REQUEST");
      }
    });
  });
});

describe("assignment.copyConfirm", () => {
  it("writes what was previewed, marked as one copy, and nothing twice", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, put, plan } = await office(tx);
      await put(day.w1, day.J, "2026-11-02");
      await put(day.w1, day.J, "2026-11-03");
      await put(day.w2, day.K, "2026-11-06", {
        expectedStart: "08:00",
        expectedEnd: "12:00",
      });
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      const copyId = uuidv7();
      const confirm = { copyId, weekStart: THIS, fingerprint: preview.fingerprint };
      expect(await plan.copyConfirm(confirm)).toEqual({ result: "copied", created: 3 });
      expect(await shiftsOf(tx, day)).toEqual([
        {
          userId: day.w1,
          jobId: day.J,
          workDate: "2026-11-09",
          expectedStart: "07:00:00",
          copyId,
        },
        {
          userId: day.w1,
          jobId: day.J,
          workDate: "2026-11-10",
          expectedStart: "07:00:00",
          copyId,
        },
        {
          userId: day.w2,
          jobId: day.K,
          workDate: "2026-11-13",
          expectedStart: "08:00:00",
          copyId,
        },
      ]);
      // Sent again, whatever the fingerprint now is: the copy is there already.
      expect(await plan.copyConfirm(confirm)).toEqual({
        result: "duplicate",
        created: 3,
      });
      expect(await shiftsOf(tx, day)).toHaveLength(3);
      // A second copy of the same week offers nothing: every shift is already there.
      const again = await plan.copyPreview({ weekStart: THIS });
      expect(again.create).toEqual([]);
      expect(again.leftOut.map((o) => o.reason)).toEqual([
        "duplicate",
        "duplicate",
        "duplicate",
      ]);
      expect(
        await plan.copyConfirm({
          copyId: uuidv7(),
          weekStart: THIS,
          fingerprint: again.fingerprint,
        }),
      ).toEqual({ result: "nothing" });
    });
  });

  it("writes nothing when the plan is no longer the one previewed, and answers the plan as it is", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, put, plan } = await office(tx);
      await put(day.w1, day.J, "2026-11-02");
      await put(day.w2, day.J, "2026-11-02");
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      expect(preview.create).toHaveLength(2);
      // Meanwhile the office schedules w2 this Monday at overlapping hours.
      await appCallerIn(tx, admin.who).assignment.create({
        userId: day.w2,
        jobId: day.K,
        expectedStart: "12:00",
        expectedEnd: "17:00",
        days: [{ id: uuidv7(), workDate: THIS }],
      });
      const answer = await plan.copyConfirm({
        copyId: uuidv7(),
        weekStart: THIS,
        fingerprint: preview.fingerprint,
      });
      expect(answer.result).toBe("stale");
      expect(answer.result === "stale" && brief(answer.preview)).toEqual({
        create: ["2026-11-09 07:00"],
        leftOut: ["2026-11-09 07:00 overlap"],
      });
      // Only the office's own shift is there.
      expect((await shiftsOf(tx, day)).map((s) => s.copyId)).toEqual([null]);
      // The new preview, confirmed, is written.
      expect(
        await plan.copyConfirm({
          copyId: uuidv7(),
          weekStart: THIS,
          fingerprint: answer.result === "stale" ? answer.preview.fingerprint : "",
        }),
      ).toEqual({ result: "copied", created: 1 });
    });
  });
});

describe("assignment.copyConfirm, what was left out", () => {
  it("is part of what was previewed: a shift newly left out makes the preview stale", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, put, plan } = await office(tx);
      await put(day.w1, day.J, "2026-11-02");
      const onK = await put(day.w2, day.K, "2026-11-03");
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      expect(preview.create).toHaveLength(2);
      // K is archived since: what would be created shrinks and what is left out grows.
      await appCallerIn(tx, admin.who).job.setStatus({
        jobId: day.K,
        status: "archived",
      });
      const shrunk = await plan.copyConfirm({
        copyId: uuidv7(),
        weekStart: THIS,
        fingerprint: preview.fingerprint,
      });
      expect(shrunk.result === "stale" && brief(shrunk.preview)).toEqual({
        create: ["2026-11-09 07:00"],
        leftOut: ["2026-11-10 07:00 job_archived"],
      });
      // The job opened again, but its person deactivated: the same shift is still left
      // out, for another reason, and the same one shift would be created — stale all the same.
      await appCallerIn(tx, admin.who).job.setStatus({ jobId: day.K, status: "open" });
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, day.w2));
      await becomeApp(tx);
      const again = await plan.copyConfirm({
        copyId: uuidv7(),
        weekStart: THIS,
        fingerprint: shrunk.result === "stale" ? shrunk.preview.fingerprint : "",
      });
      expect(again.result === "stale" && again.preview.leftOut).toMatchObject([
        { sourceId: onK, reason: "user_inactive" },
      ]);
      expect(await shiftsOf(tx, day)).toEqual([]);
    });
  });
});

describe("assignment.copyUndo", () => {
  async function copied(tx: Tx) {
    const o = await office(tx);
    await o.put(o.day.w1, o.day.J, "2026-11-02");
    await o.put(o.day.w1, o.day.J, "2026-11-03");
    await o.put(o.day.w2, o.day.J, "2026-11-02");
    // Already there this week, and not the copy's.
    await o.put(o.day.w2, o.day.K, "2026-11-12");
    await becomeApp(tx);
    const preview = await o.plan.copyPreview({ weekStart: THIS });
    const copyId = uuidv7();
    await o.plan.copyConfirm({
      copyId,
      weekStart: THIS,
      fingerprint: preview.fingerprint,
    });
    return { ...o, copyId };
  }

  it("removes every shift of the copy and nothing else; again it is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan, copyId } = await copied(tx);
      expect(await shiftsOf(tx, day)).toHaveLength(4);
      expect(await plan.copyUndo({ copyId })).toEqual({ result: "undone", removed: 3 });
      expect((await shiftsOf(tx, day)).map((s) => [s.workDate, s.copyId])).toEqual([
        ["2026-11-12", null],
      ]);
      expect(await plan.copyUndo({ copyId })).toEqual({ result: "unchanged" });
      expect(await plan.copyUndo({ copyId: uuidv7() })).toEqual({ result: "unchanged" });
      // Last week is as it was.
      expect(await shiftsOf(tx, day, LAST)).toHaveLength(4);
    });
  });

  it("removes none of it once someone has clocked in on one of its shifts", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan, copyId } = await copied(tx);
      await tx.execute(sql`reset role`);
      const [monday] = await tx
        .select({ id: jobAssignments.id })
        .from(jobAssignments)
        .where(
          sql`${jobAssignments.copyId} = ${copyId} and ${jobAssignments.userId} = ${day.w1}
            and ${jobAssignments.workDate} = ${THIS}`,
        );
      const eventId = await eventIn(tx, day, {
        worker: day.w1,
        job: day.J,
        type: "started",
        client: "2026-11-09T12:10:00Z",
      });
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${eventId}
        where id = ${monday!.id}
      `);
      await becomeApp(tx);
      expect(await plan.copyUndo({ copyId })).toEqual({
        result: "rejected",
        code: "locked",
        shiftId: monday!.id,
      });
      expect(await shiftsOf(tx, day)).toHaveLength(4);
    });
  });
});

describe("gates", () => {
  it("is admin only, and another company's copy is not there to undo", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, worker, put, as, plan } = await office(tx);
      await put(day.w1, day.J, "2026-11-02");
      const foreignCopy = uuidv7();
      await tx.insert(jobAssignments).values({
        companyId: other.companyId,
        userId: other.w1,
        jobId: other.J,
        workDate: THIS,
        ...HOURS,
        copyId: foreignCopy,
      });
      await becomeApp(tx);
      const preview = await plan.copyPreview({ weekStart: THIS });
      for (const who of [worker.who, day.who]) {
        for (const call of [
          () => as(who).copyPreview({ weekStart: THIS }),
          () =>
            as(who).copyConfirm({
              copyId: uuidv7(),
              weekStart: THIS,
              fingerprint: preview.fingerprint,
            }),
          () => as(who).copyUndo({ copyId: foreignCopy }),
        ]) {
          expect(await outcome(call())).toBe("FORBIDDEN");
        }
      }
      expect(await plan.copyUndo({ copyId: foreignCopy })).toEqual({
        result: "unchanged",
      });
      await tx.execute(sql`reset role`);
      expect(
        await tx.$count(jobAssignments, eq(jobAssignments.copyId, foreignCopy)),
      ).toBe(1);
    });
  });
});
