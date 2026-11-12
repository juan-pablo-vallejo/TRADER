// TASKS, dated worker-job assignments (V1-D07): the writers against each other and against
// the office's other writers, on real commits. In a disposable database (helpers.ts): two
// connections must see the same rows, and the lock-wait probe reads every backend of its
// database. Each test holds a row from the owner's transaction, lets the calls queue on it,
// and releases them by committing.
import { jobAssignments } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
    workDates: [DAY],
    ...HOURS,
  });
  return (await plansOf(d.companyId))[0]!.id;
}

describe("two admins at once", () => {
  it("planning the same person, job and day leaves one plan: `created` and `unchanged`", async () => {
    const d = await world();
    const input = { userId: d.w1, jobId: d.J, workDates: [DAY], ...HOURS };
    let calls!: Promise<{ result: string }[]>;
    await D.owner.transaction(async (tx) => {
      // The worker's row held: both calls take the job FOR SHARE, then queue here together.
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).create(input),
        plan(d.second.who).create({ ...input, expectedStart: "09:00" }),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    expect((await calls).map((a) => a.result).sort()).toEqual(["created", "unchanged"]);
    expect(await plansOf(d.companyId)).toHaveLength(1);
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
        workDates: [DAY],
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
        workDates: [DAY],
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
          workDates: [DAY],
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
    let calls!: Promise<{ result: string }[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${d.w1} for update`);
      calls = Promise.all([
        plan(d.admin.who).create({ ...input, workDates: days }),
        plan(d.second.who).create({ ...input, workDates: [...days].reverse() }),
      ]);
      await waitForLockWait(D.owner, '%from "users"%for share%', { n: 2 });
    });
    expect((await calls).map((a) => a.result).sort()).toEqual(["created", "unchanged"]);
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
