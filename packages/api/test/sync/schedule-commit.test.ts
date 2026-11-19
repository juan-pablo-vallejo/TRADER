// On real commits: a start and an office edit on one person's day, in both orders,
// and the proof that a push never reads the schedule while enforcement is off. In a
// disposable database (helpers.ts): a punch lock can never be removed, two connections must
// see the same rows, and the lock-wait probe reads every backend of its database.
import { companies, jobAssignments, workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import { localDirectory, type VerifiedIdentity } from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  workDayIn,
  disposableDb,
  quietReporter,
  REQUEST_ID,
  uuidv7,
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

// A Monday in the past, in New York's winter (UTC-5).
const DAY = "2026-11-09";
const SEVEN_TEN = new Date(`${DAY}T07:10:00-05:00`);

// A committed working day with a bound admin and a bound worker, one shift of
// hers on J from 07:00 to 15:30, and enforcement as asked.
async function world(enforced: boolean) {
  return D.owner.transaction(async (tx) => {
    const d = await workDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    const ana = await boundIn(tx, d.companyId, "worker");
    const [shift] = await tx
      .insert(jobAssignments)
      .values({
        companyId: d.companyId,
        userId: ana.id,
        jobId: d.J,
        workDate: DAY,
        expectedStart: "07:00",
        expectedEnd: "15:30",
      })
      .returning({ id: jobAssignments.id });
    await tx
      .update(companies)
      .set({ scheduleEnforced: enforced })
      .where(eq(companies.id, d.companyId));
    return { ...d, admin, ana, shiftId: shift!.id };
  });
}

// A start captured offline at 07:10 that Monday, pushed as `who` for `workerId`.
const start = (who: VerifiedIdentity, workerId: string, jobId: string) =>
  caller(who)
    .sync.push({
      protocolVersion: 1,
      deviceNow: new Date(),
      records: [
        {
          id: uuidv7(),
          kind: "labor_event",
          schemaVersion: 1,
          payload: {
            workerId,
            jobId,
            type: "started",
            clientTimestamp: SEVEN_TEN,
            location: null,
            timeSetByUser: false,
            capturedOffline: true,
          },
        },
      ],
    })
    .then((answer) => answer.results[0]!);

// The flags a labor acknowledgement carries.
const reasonsOf = (answer: Awaited<ReturnType<typeof start>>) =>
  answer.result === "accepted" && "reasons" in answer.ack ? answer.ack.reasons : null;

const shiftRow = async (id: string) =>
  (
    await D.owner
      .select({
        expectedStart: jobAssignments.expectedStart,
        lockedByEventId: jobAssignments.lockedByEventId,
      })
      .from(jobAssignments)
      .where(eq(jobAssignments.id, id))
  )[0]!;

const dayLock = (userId: string) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${`shift-day:${userId}:${DAY}`}, 0))`;

describe("with enforcement off", () => {
  it("a push never reads the schedule: it completes while the table is locked against every reader", async () => {
    const d = await world(false);
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`lock table job_assignments in access exclusive mode`);
      // A worker's own start with no shift, as before the schedule existed.
      const answer = await start(d.who, d.userId, d.J);
      expect(answer).toMatchObject({ result: "accepted" });
    });
  });
});

describe("with enforcement on", () => {
  it("a push reads the schedule: it waits while the table is locked", async () => {
    const d = await world(true);
    let pushed!: ReturnType<typeof start>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`lock table job_assignments in access exclusive mode`);
      pushed = start(d.ana.who, d.ana.id, d.J);
      await waitForLockWait(D.owner, "%from job_assignments a%", {
        waitEvent: "relation",
      });
    });
    expect(await pushed).toMatchObject({ result: "accepted" });
  });

  it("an edit committed first: the start is judged against the edited day and stored and flagged", async () => {
    const d = await world(true);
    let pushed!: ReturnType<typeof start>;
    await D.owner.transaction(async (tx) => {
      // The office's write, not yet committed: the day's lock, then the shift moved to noon.
      await tx.execute(dayLock(d.ana.id));
      await tx.execute(
        sql`update job_assignments set expected_start = '12:00' where id = ${d.shiftId}`,
      );
      pushed = start(d.ana.who, d.ana.id, d.J);
      await waitForLockWait(D.owner, "select pg_advisory_xact_lock(hashtextextended(%", {
        waitEvent: "advisory",
      });
    });
    const answer = await pushed;
    expect(answer).toMatchObject({ result: "accepted" });
    expect(reasonsOf(answer)).toEqual(["offline", "location", "unscheduled"]);
    expect(await shiftRow(d.shiftId)).toEqual({
      expectedStart: "12:00:00",
      lockedByEventId: null,
    });
  });

  it("a start committed first: the edit queued behind it finds the shift locked", async () => {
    const d = await world(true);
    let pushed!: ReturnType<typeof start>;
    let edited!: Promise<unknown>;
    await D.owner.transaction(async (tx) => {
      // The shift's row held: the push is admitted, writes its event, and waits to lock it —
      // holding the day's lock, which the office's edit then queues on.
      await tx.execute(
        sql`select 1 from job_assignments where id = ${d.shiftId} for update`,
      );
      pushed = start(d.ana.who, d.ana.id, d.J);
      await waitForLockWait(D.owner, "%update job_assignments set locked_at%");
      edited = caller(d.admin.who).assignment.update({
        assignmentId: d.shiftId,
        workDate: DAY,
        expectedStart: "12:00",
        expectedEnd: "15:30",
      });
      await waitForLockWait(D.owner, "select pg_advisory_xact_lock(hashtextextended(%", {
        waitEvent: "advisory",
      });
    });
    const answer = await pushed;
    expect(answer).toMatchObject({ result: "accepted" });
    expect(reasonsOf(answer)).toEqual(["offline", "location"]);
    expect(await edited).toEqual({ result: "rejected", code: "locked" });
    const row = await shiftRow(d.shiftId);
    expect(row.expectedStart).toBe("07:00:00");
    const [event] = await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.workerId, d.ana.id));
    expect(row.lockedByEventId).toBe(event!.id);
  });
});
