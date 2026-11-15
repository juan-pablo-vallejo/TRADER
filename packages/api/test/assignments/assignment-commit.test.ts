// TASKS S3, the weekly schedule's writers: the writers against each other and against
// the office's other writers, on real commits. In a disposable database (helpers.ts): two
// connections must see the same rows, and the lock-wait probe reads every backend of its
// database. Each test holds a row from the owner's transaction, lets the calls queue on it,
// and releases them by committing.
import { jobAssignments, shiftOverrideHistory } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
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
  outcome,
  quietReporter,
  uuidv7,
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

const plan = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  ).assignment;

const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };
const DAY = "2026-11-16";

// A committed crew day with two bound admins.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    const second = await boundIn(tx, d.companyId, "admin");
    return { ...d, admin, second };
  });
}

const plansOf = (companyId: string) =>
  D.owner
    .select({
      id: jobAssignments.id,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
    })
    .from(jobAssignments)
    .where(eq(jobAssignments.companyId, companyId));

async function planned(d: Awaited<ReturnType<typeof world>>) {
  await plan(d.admin.who).create({
    userId: d.w1,
    jobId: d.J,
    days: [{ id: uuidv7(), workDate: DAY }],
    ...HOURS,
  });
  return (await plansOf(d.companyId))[0]!.id;
}

describe("two admins at once", () => {
  it("scheduling the same shift leaves one: the day's lock makes the second see the first", async () => {
    const d = await world();
    // Two browsers, so two ids for the one shift.
    const input = () => ({
      userId: d.w1,
      jobId: d.J,
      days: [{ id: uuidv7(), workDate: DAY }],
      ...HOURS,
    });
    let calls!: Promise<Awaited<ReturnType<ReturnType<typeof plan>["create"]>>[]>;
    await D.owner.transaction(async (tx) => {
      // The worker's row held: both calls take the job FOR SHARE, then queue here together.
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).create(input()),
        plan(d.second.who).create(input()),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    const answers = (await calls).map((a) => (a.result === "planned" ? a.days[0]! : a));
    expect(answers.map((a) => a.result).sort()).toEqual(["created", "rejected"]);
    expect(answers.find((a) => a.result === "rejected")).toMatchObject({
      code: "schedule",
      issues: [{ code: "duplicate_shift" }],
    });
    expect(await plansOf(d.companyId)).toHaveLength(1);
  });

  it("scheduling overlapping shifts on one person's day leaves one, the other undecided", async () => {
    const d = await world();
    const at = (jobId: string, expectedStart: string, expectedEnd: string) => ({
      userId: d.w1,
      jobId,
      days: [{ id: uuidv7(), workDate: DAY }],
      expectedStart,
      expectedEnd,
    });
    let calls!: Promise<Awaited<ReturnType<ReturnType<typeof plan>["create"]>>[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).create(at(d.J, "07:00", "15:30")),
        plan(d.second.who).create(at(d.K, "12:00", "17:00")),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    const answers = (await calls).map((a) => (a.result === "planned" ? a.days[0]! : a));
    expect(answers.map((a) => a.result).sort()).toEqual(["created", "rejected"]);
    expect(answers.find((a) => a.result === "rejected")).toMatchObject({
      code: "schedule",
      issues: [{ code: "missing_decision", start: "12:00", end: "15:30" }],
    });
    expect(await plansOf(d.companyId)).toHaveLength(1);
  });

  it("a call that fails after its writes leaves no shift and no history", async () => {
    const d = await world();
    const first = { id: uuidv7(), workDate: DAY };
    await plan(d.admin.who).create({ userId: d.w1, jobId: d.J, days: [first], ...HOURS });
    const overrideId = uuidv7();
    const late = (workDate: string) => ({
      id: uuidv7(),
      workDate,
      decisions: [
        { overrideId, otherId: first.id, holder: "other" as const, reason: "Covering" },
      ],
    });
    const call = (days: ReturnType<typeof late>[]) =>
      plan(d.admin.who).create({
        userId: d.w1,
        jobId: d.K,
        expectedStart: "12:00",
        expectedEnd: "17:00",
        days,
      });
    await call([late(DAY)]);
    const history = () =>
      D.owner
        .select({ action: shiftOverrideHistory.action })
        .from(shiftOverrideHistory)
        .where(eq(shiftOverrideHistory.companyId, d.companyId));
    expect(await history()).toEqual([{ action: "created" }]);
    // The override id taken: the second day's shift is written, then its override is refused,
    // and the whole call is undone — the first day of it included.
    const other = { id: uuidv7(), workDate: "2026-11-17" };
    await plan(d.admin.who).create({ userId: d.w1, jobId: d.J, days: [other], ...HOURS });
    const before = await plansOf(d.companyId);
    const failing = late("2026-11-17");
    failing.decisions[0]!.otherId = other.id;
    expect(
      await outcome(
        call([{ id: uuidv7(), workDate: "2026-11-23", decisions: [] } as never, failing]),
      ),
    ).toBe("FORBIDDEN");
    expect(await plansOf(d.companyId)).toEqual(before);
    expect(await history()).toEqual([{ action: "created" }]);
  });

  it("editing one plan is serialized by its row, and the later edit stands", async () => {
    const d = await world();
    const id = await planned(d);
    let later!: Promise<unknown>;
    await D.owner.transaction(async (tx) => {
      // The earlier edit, not yet committed.
      await tx.execute(
        sql`update job_assignments set expected_end = '12:00' where id = ${id}`,
      );
      later = plan(d.second.who).update({
        assignmentId: id,
        workDate: "2026-11-18",
        expectedStart: "08:00",
        expectedEnd: "16:00",
      });
      await waitForLockWait(D.owner, '%from "job_assignments"%for no key update%');
    });
    expect(await later).toEqual({ result: "updated" });
    expect(await plansOf(d.companyId)).toEqual([
      { id, workDate: "2026-11-18", expectedStart: "08:00:00", expectedEnd: "16:00:00" },
    ]);
  });

  it("an edit queued behind a removal finds nothing and brings nothing back", async () => {
    const d = await world();
    const id = await planned(d);
    let edit!: Promise<string>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`delete from job_assignments where id = ${id}`);
      edit = outcome(
        plan(d.second.who).update({ assignmentId: id, workDate: "2026-11-18", ...HOURS }),
      );
      await waitForLockWait(D.owner, '%from "job_assignments"%for no key update%');
    });
    expect(await edit).toBe("FORBIDDEN");
    expect(await plansOf(d.companyId)).toEqual([]);
  });
});

describe("assignment.create against the office's other writers", () => {
  it("sees a deactivation committed while it waited on the person's row", async () => {
    const d = await world();
    let call!: Promise<unknown>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      call = plan(d.admin.who).create({
        userId: d.w1,
        jobId: d.J,
        days: [{ id: uuidv7(), workDate: DAY }],
        ...HOURS,
      });
      await waitForLockWait(D.owner, '%from "users"%for share%');
      await tx.execute(sql`update users set deactivated_at = now() where id = ${d.w1}`);
    });
    expect(await call).toEqual({ result: "rejected", code: "user_inactive" });
    expect(await plansOf(d.companyId)).toEqual([]);
  });

  it("sees an archival committed while it waited on the job's row", async () => {
    const d = await world();
    let call!: Promise<unknown>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from jobs where id = ${d.J} for update`);
      call = plan(d.admin.who).create({
        userId: d.w1,
        jobId: d.J,
        days: [{ id: uuidv7(), workDate: DAY }],
        ...HOURS,
      });
      await waitForLockWait(D.owner, '%from "jobs"%for share%');
      await tx.execute(sql`update jobs set status = 'archived' where id = ${d.J}`);
    });
    expect(await call).toEqual({ result: "rejected", code: "job_archived" });
    expect(await plansOf(d.companyId)).toEqual([]);
  });

  it("refuses a caller deactivated while it waited", async () => {
    const d = await world();
    let call!: Promise<string>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.admin.id} for update`);
      call = outcome(
        plan(d.admin.who).create({
          userId: d.w1,
          jobId: d.J,
          days: [{ id: uuidv7(), workDate: DAY }],
          ...HOURS,
        }),
      );
      await waitForLockWait(D.owner, '%from "users"%for share%');
      await tx.execute(
        sql`update users set deactivated_at = now() where id = ${d.admin.id}`,
      );
    });
    expect(await call).toBe("UNAUTHORIZED");
    expect(await plansOf(d.companyId)).toEqual([]);
  });

  it("names days in any order without two calls waiting on each other", async () => {
    const d = await world();
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
    const input = { userId: d.w1, jobId: d.J, ...HOURS };
    const each = (dates: string[]) =>
      dates.map((workDate) => ({ id: uuidv7(), workDate }));
    let calls!: Promise<Awaited<ReturnType<ReturnType<typeof plan>["create"]>>[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).create({ ...input, days: each(days) }),
        plan(d.second.who).create({ ...input, days: each([...days].reverse()) }),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    // Day locks are taken in day order whatever order the days were named in: one call has
    // every day, the other finds each already there.
    const results = (await calls).map((a) =>
      a.result === "planned" ? [...new Set(a.days.map((x) => x.result))] : [a.result],
    );
    expect(results.sort()).toEqual([["created"], ["rejected"]]);
    expect(await plansOf(d.companyId)).toHaveLength(5);
  });
});

describe("assignment.update and remove re-read the caller", () => {
  for (const change of ["deactivated_at = now()", "role = 'worker'"] as const) {
    const expected = change.startsWith("role") ? "FORBIDDEN" : "UNAUTHORIZED";
    it(`refuse an admin whose ${change} committed while they waited: ${expected}`, async () => {
      const d = await world();
      const id = await planned(d);
      for (const call of [
        () =>
          plan(d.second.who).update({
            assignmentId: id,
            workDate: "2026-11-18",
            ...HOURS,
          }),
        () => plan(d.second.who).remove({ assignmentId: id }),
      ]) {
        let answer!: Promise<string>;
        await D.owner.transaction(async (tx) => {
          await tx.execute(sql`select 1 from users where id = ${d.second.id} for update`);
          answer = outcome(call());
          await waitForLockWait(D.owner, '%from "users"%for share%');
          await tx.execute(
            sql`update users set ${sql.raw(change)} where id = ${d.second.id}`,
          );
        });
        expect(await answer).toBe(expected);
        // Put back for the second call.
        await D.owner.execute(
          sql`update users set deactivated_at = null, role = 'admin' where id = ${d.second.id}`,
        );
      }
      expect(await plansOf(d.companyId)).toEqual([
        { id, workDate: DAY, expectedStart: "07:00:00", expectedEnd: "15:30:00" },
      ]);
    });
  }
});

describe("Copy Last Week on real commits", () => {
  const LAST = ["2026-11-02", "2026-11-03", "2026-11-04"];
  const THIS = "2026-11-09";

  // Last week: w1 on J, Monday to Wednesday.
  async function lastWeek() {
    const d = await world();
    await plan(d.admin.who).create({
      userId: d.w1,
      jobId: d.J,
      days: LAST.map((workDate) => ({ id: uuidv7(), workDate })),
      ...HOURS,
    });
    return d;
  }

  const thisWeek = async (companyId: string) =>
    (await plansOf(companyId)).filter((r) => r.workDate >= THIS);

  it("two admins confirming the same preview leave one copy; the other is answered the plan as it now is", async () => {
    const d = await lastWeek();
    const preview = await plan(d.admin.who).copyPreview({ weekStart: THIS });
    expect(preview.create).toHaveLength(3);
    const confirm = () => ({
      copyId: uuidv7(),
      weekStart: THIS,
      fingerprint: preview.fingerprint,
    });
    let calls!: Promise<Awaited<ReturnType<ReturnType<typeof plan>["copyConfirm"]>>[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).copyConfirm(confirm()),
        plan(d.second.who).copyConfirm(confirm()),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    const answers = await calls;
    expect(answers.map((a) => a.result).sort()).toEqual(["copied", "stale"]);
    const stale = answers.find((a) => a.result === "stale");
    expect(stale?.result === "stale" && stale.preview.create).toEqual([]);
    expect(
      stale?.result === "stale" && stale.preview.leftOut.map((o) => o.reason),
    ).toEqual(["duplicate", "duplicate", "duplicate"]);
    expect(await thisWeek(d.companyId)).toHaveLength(3);
  });

  it("the same confirmation sent twice at once leaves one copy: `copied` and `duplicate`", async () => {
    const d = await lastWeek();
    const preview = await plan(d.admin.who).copyPreview({ weekStart: THIS });
    const confirm = {
      copyId: uuidv7(),
      weekStart: THIS,
      fingerprint: preview.fingerprint,
    };
    let calls!: Promise<Awaited<ReturnType<ReturnType<typeof plan>["copyConfirm"]>>[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).copyConfirm(confirm),
        plan(d.admin.who).copyConfirm(confirm),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    expect((await calls).map((a) => a.result).sort()).toEqual(["copied", "duplicate"]);
    expect(await thisWeek(d.companyId)).toHaveLength(3);
  });

  it("a failure part-way writes nothing", async () => {
    const d = await lastWeek();
    const preview = await plan(d.admin.who).copyPreview({ weekStart: THIS });
    // The third row of the one statement fails, on a guard made for this test alone.
    await D.owner.execute(sql`
      create function fail_copy_test() returns trigger language plpgsql as $$
      begin
        if new.work_date = '2026-11-11' and new.copy_id is not null then
          raise exception 'made to fail';
        end if;
        return new;
      end $$
    `);
    await D.owner.execute(sql`
      create trigger fail_copy_test before insert on job_assignments
      for each row execute function fail_copy_test()
    `);
    try {
      expect(
        await outcome(
          plan(d.admin.who).copyConfirm({
            copyId: uuidv7(),
            weekStart: THIS,
            fingerprint: preview.fingerprint,
          }),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
    } finally {
      await D.owner.execute(sql`drop trigger fail_copy_test on job_assignments`);
      await D.owner.execute(sql`drop function fail_copy_test()`);
    }
    expect(await thisWeek(d.companyId)).toEqual([]);
  });
});
