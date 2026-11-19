// assignment.endEarly and assignment.moveToday: a started shift's end moves earlier and
// nothing else about it changes; a second shift the same day then admits a clock-in under
// schedule enforcement; a trim to the clock-in's minute or before it is refused; a move
// ends one shift and starts the next, both or neither; and no clock event is written by
// either. Every test runs in an owner transaction that is always rolled back, each call as
// trader_app, as authority.test.ts does.
import { companies, jobAssignments, workSessionEvents } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { moveToday } from "../../src/assignments/move";
import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { pushLaborEvent } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import {
  appCallerIn,
  asTenant,
  boundIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  workDayIn,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// A Monday in the past, in New York's winter (UTC-5).
const DAY = "2026-11-16";
const at = (wall: string) => new Date(`${DAY}T${wall}:00-05:00`);
// Any instant of that day on New York's wall clock: what `moveToday` reads today from.
const NOON = at("12:00");

async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  await tx
    .update(companies)
    .set({ scheduleEnforced: true })
    .where(eq(companies.id, d.companyId));
  const asOwner = async <T>(body: () => Promise<T>): Promise<T> => {
    await tx.execute(sql`reset role`);
    return body();
  };
  const office = async () => {
    await asTenant(tx, d.companyId);
    return appCallerIn(tx, admin.who).assignment;
  };
  const adminUser: AppUser = {
    id: admin.id,
    companyId: d.companyId,
    role: "admin",
    name: "n",
    email: "admin@co.test",
    phone: null,
    signInPhone: null,
  };
  // A shift for w1, written through the office.
  const plan = async (jobId: string, expectedStart: string, expectedEnd: string) => {
    const id = uuidv7();
    const answer = await (
      await office()
    ).create({
      userId: d.w1,
      jobId,
      expectedStart,
      expectedEnd,
      days: [{ id, workDate: DAY }],
    });
    return { id, answer };
  };
  // w1's own event, captured offline at a wall-clock time of the day: its result, or code.
  const clock = async (type: "started" | "ended", jobId: string, wall: string) => {
    await asTenant(tx, d.companyId);
    const now = new Date();
    const id = uuidv7(at(wall).getTime());
    const answer = await tx.transaction((sp) =>
      pushLaborEvent(
        sp,
        {
          id: d.w1,
          companyId: d.companyId,
          role: "worker",
          name: "n",
          email: "w1@co.test",
          phone: null,
          signInPhone: null,
        },
        {
          id,
          schemaVersion: 1,
          payload: {
            workerId: d.w1,
            jobId,
            type,
            clientTimestamp: at(wall),
            location: null,
            timeSetByUser: false,
            capturedOffline: true,
          },
        },
        measureSkew(now, now),
      ),
    );
    return answer.result === "rejected" ? answer.code : answer.result;
  };
  const shifts = () =>
    asOwner(async () =>
      (
        await tx
          .select({
            id: jobAssignments.id,
            jobId: jobAssignments.jobId,
            start: jobAssignments.expectedStart,
            end: jobAssignments.expectedEnd,
            locked: sql<boolean>`${jobAssignments.lockedAt} is not null`,
          })
          .from(jobAssignments)
          .where(eq(jobAssignments.userId, d.w1))
          .orderBy(asc(jobAssignments.expectedStart))
      ).map((s) => ({ ...s, start: s.start.slice(0, 5), end: s.end.slice(0, 5) })),
    );
  const events = () =>
    asOwner(async () =>
      (
        await tx
          .select({
            id: workSessionEvents.id,
            type: workSessionEvents.type,
            at: workSessionEvents.clientTimestamp,
            flags: workSessionEvents.flags,
          })
          .from(workSessionEvents)
          .where(eq(workSessionEvents.workerId, d.w1))
          .orderBy(asc(workSessionEvents.clientTimestamp))
      ).map((e) => ({ ...e, at: e.at.toISOString() })),
    );
  const move = async (input: Parameters<typeof moveToday>[2]) => {
    await asTenant(tx, d.companyId);
    return tx.transaction((sp) => moveToday(sp, adminUser, input, NOON));
  };
  return { ...d, admin, office, plan, clock, shifts, events, move };
}

describe("assignment.endEarly", () => {
  it("trims a started shift, and the second shift the same day admits the next clock-in", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const first = await w.plan(w.J, "07:00", "15:30");
      expect(await w.clock("started", w.J, "07:05")).toBe("accepted");
      expect(await w.shifts()).toMatchObject([{ id: first.id, locked: true }]);
      const before = await w.events();

      // Until the first shift ends earlier, nobody can be planned elsewhere that afternoon,
      // and the schedule refuses a clock-in on the other job.
      const blocked = await w.plan(w.K, "11:00", "15:30");
      expect(blocked.answer).toMatchObject({
        result: "planned",
        days: [{ result: "rejected", code: "schedule", issues: [{ code: "overlap" }] }],
      });

      expect(
        await (
          await w.office()
        ).endEarly({ assignmentId: first.id, expectedEnd: "11:00" }),
      ).toEqual({ result: "updated" });
      expect(await w.shifts()).toEqual([
        { id: first.id, jobId: w.J, start: "07:00", end: "11:00", locked: true },
      ]);

      const second = await w.plan(w.K, "11:00", "15:30");
      expect(second.answer).toMatchObject({ days: [{ result: "created" }] });
      // The switch on the phone: out of J, into K, which its own shift now admits.
      expect(await w.clock("ended", w.J, "11:01")).toBe("accepted");
      expect(await w.clock("started", w.K, "11:02")).toBe("accepted");
      expect(await w.shifts()).toEqual([
        { id: first.id, jobId: w.J, start: "07:00", end: "11:00", locked: true },
        { id: second.id, jobId: w.K, start: "11:00", end: "15:30", locked: true },
      ]);
      // The clock-in that locked the first shift is as it was written.
      expect((await w.events()).slice(0, 1)).toEqual(before);
    });
  });

  it("refuses a trim to the clock-in's minute or before it, and one that is no trim", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const { id } = await w.plan(w.J, "07:00", "15:30");
      expect(await w.clock("started", w.J, "07:05")).toBe("accepted");
      const end = async (expectedEnd: string) =>
        (await w.office()).endEarly({ assignmentId: id, expectedEnd });

      const beforeClockIn = { result: "rejected", code: "authorization", shiftId: id };
      expect(await end("07:05")).toEqual(beforeClockIn);
      expect(await end("07:01")).toEqual(beforeClockIn);
      // At its own start it is no shift at all.
      expect(await end("07:00")).toMatchObject({
        result: "rejected",
        code: "schedule",
        issues: [{ code: "invalid_interval", shiftId: id }],
      });
      expect(await end("16:00")).toEqual({ result: "rejected", code: "not_earlier" });
      expect(await end("15:30")).toEqual({ result: "unchanged" });
      expect(await w.shifts()).toMatchObject([{ start: "07:00", end: "15:30" }]);

      // The minute after the clock-in is the earliest end.
      expect(await end("07:06")).toEqual({ result: "updated" });
      // A trim is not undone, here or by the ordinary edit.
      expect(await end("15:30")).toEqual({ result: "rejected", code: "not_earlier" });
      expect(await w.shifts()).toMatchObject([{ start: "07:00", end: "07:06" }]);
    });
  });

  it("leaves every other change to a started shift refused, by the API and by the database", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const { id } = await w.plan(w.J, "07:00", "15:30");
      expect(await w.clock("started", w.J, "07:05")).toBe("accepted");
      const office = await w.office();
      const locked = { result: "rejected", code: "locked" };
      expect(
        await office.update({
          assignmentId: id,
          workDate: DAY,
          expectedStart: "06:00",
          expectedEnd: "15:30",
        }),
      ).toEqual(locked);
      // Even an earlier end goes through endEarly and not through the ordinary edit.
      expect(
        await office.update({
          assignmentId: id,
          workDate: DAY,
          expectedStart: "07:00",
          expectedEnd: "11:00",
        }),
      ).toEqual(locked);
      expect(await office.remove({ assignmentId: id })).toEqual(locked);

      // Past the API, as the application's own role: the database's answer.
      await asTenant(tx, w.companyId);
      const refused = async (statement: ReturnType<typeof sql>) => {
        try {
          await tx.transaction((sp) => sp.execute(statement));
          return "written";
        } catch (error) {
          const cause = (error as { cause?: { constraint?: string } }).cause;
          return cause?.constraint ?? (error as { constraint?: string }).constraint;
        }
      };
      for (const statement of [
        sql`update job_assignments set expected_start = '06:00' where id = ${id}`,
        sql`update job_assignments set work_date = '2026-11-17' where id = ${id}`,
        sql`update job_assignments set expected_end = '16:00' where id = ${id}`,
        sql`update job_assignments set locked_at = null, locked_by_event_id = null
            where id = ${id}`,
        sql`delete from job_assignments where id = ${id}`,
      ]) {
        expect(await refused(statement)).toBe("job_assignments_locked");
      }
      expect(
        await refused(
          sql`update job_assignments set expected_end = '07:05' where id = ${id}`,
        ),
      ).toBe("job_assignments_locked_end");
      expect(await w.shifts()).toEqual([
        { id, jobId: w.J, start: "07:00", end: "15:30", locked: true },
      ]);
    });
  });

  it("trims a shift nobody has clocked in on too, and never reaches another company's", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const { id } = await w.plan(w.J, "07:00", "15:30");
      expect(
        await (await w.office()).endEarly({ assignmentId: id, expectedEnd: "12:00" }),
      ).toEqual({ result: "updated" });
      expect(await w.shifts()).toMatchObject([{ end: "12:00", locked: false }]);

      await tx.execute(sql`reset role`);
      const other = await world(tx);
      const theirs = await other.plan(other.J, "07:00", "15:30");
      const office = await w.office();
      expect(
        await outcome(office.endEarly({ assignmentId: theirs.id, expectedEnd: "12:00" })),
      ).toBe("FORBIDDEN");
      expect(
        await outcome(office.endEarly({ assignmentId: uuidv7(), expectedEnd: "12:00" })),
      ).toBe("FORBIDDEN");
      expect(await other.shifts()).toMatchObject([{ end: "15:30" }]);
    });
  });
});

describe("assignment.moveToday", () => {
  it("ends the shift that covers the minute and starts one on the other job to the old end", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const first = await w.plan(w.J, "07:00", "15:30");
      expect(await w.clock("started", w.J, "07:05")).toBe("accepted");
      const before = await w.events();

      const id = uuidv7();
      const input = { id, userId: w.w1, jobId: w.K, at: "11:00" };
      expect(await w.move(input)).toEqual({
        result: "moved",
        shift: { id, workDate: DAY, expectedStart: "11:00", expectedEnd: "15:30" },
        ended: { id: first.id, result: "ended" },
      });
      expect(await w.shifts()).toEqual([
        { id: first.id, jobId: w.J, start: "07:00", end: "11:00", locked: true },
        { id, jobId: w.K, start: "11:00", end: "15:30", locked: false },
      ]);
      // No clock event read into anything, none written: the ledger is as it was.
      expect(await w.events()).toEqual(before);

      // Sent again, it is the same move, and writes nothing.
      expect(await w.move(input)).toEqual({
        result: "duplicate",
        shift: { id, workDate: DAY, expectedStart: "11:00", expectedEnd: "15:30" },
      });
      expect(await w.shifts()).toHaveLength(2);
      // The same id for another move is refused.
      expect(await w.move({ ...input, at: "13:00" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });

      // The worker's phone, after its next pull: out of J, into K.
      expect(await w.clock("ended", w.J, "11:01")).toBe("accepted");
      expect(await w.clock("started", w.K, "11:02")).toBe("accepted");
      expect(await w.shifts()).toMatchObject([{ locked: true }, { id, locked: true }]);
    });
  });

  it("gives a person with no shift the new one, to the end the caller names", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const id = uuidv7();
      const input = { id, userId: w.w1, jobId: w.K, at: "11:00" };
      // Nothing to end, so no end to inherit.
      expect(await w.move(input)).toEqual({ result: "rejected", code: "end_required" });
      expect(await w.shifts()).toEqual([]);
      expect(await w.move({ ...input, expectedEnd: "15:00" })).toEqual({
        result: "moved",
        shift: { id, workDate: DAY, expectedStart: "11:00", expectedEnd: "15:00" },
        ended: null,
      });
      expect(await w.clock("started", w.K, "11:02")).toBe("accepted");

      // After a shift that is over, the same: the minute is covered by none.
      const later = uuidv7();
      expect(
        await w.move({
          id: later,
          userId: w.w1,
          jobId: w.J,
          at: "15:00",
          expectedEnd: "17:00",
        }),
      ).toMatchObject({ result: "moved", ended: null });
      // An end that would run into a shift already there is refused whole.
      expect(
        await w.move({
          id: uuidv7(),
          userId: w.w1,
          jobId: w.K,
          at: "09:00",
          expectedEnd: "12:00",
        }),
      ).toMatchObject({
        result: "rejected",
        code: "schedule",
        issues: [{ code: "overlap" }],
      });
      expect(await w.shifts()).toHaveLength(2);
    });
  });

  it("writes both changes or neither", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const first = await w.plan(w.J, "07:00", "15:30");
      expect(await w.clock("started", w.J, "07:05")).toBe("accepted");
      const asItWas = [
        { id: first.id, jobId: w.J, start: "07:00", end: "15:30", locked: true },
      ];
      const base = { userId: w.w1, jobId: w.K };

      // At the clock-in's minute or before it: the first shift cannot end there, and the
      // second is not written.
      for (const minute of ["07:05", "07:03"]) {
        expect(await w.move({ ...base, id: uuidv7(), at: minute })).toEqual({
          result: "rejected",
          code: "authorization",
          shiftId: first.id,
        });
      }
      // At its very start it would be removed, and a started shift never is.
      expect(await w.move({ ...base, id: uuidv7(), at: "07:00" })).toEqual({
        result: "rejected",
        code: "authorization",
        shiftId: first.id,
      });
      // Already on that job.
      expect(
        await w.move({ userId: w.w1, jobId: w.J, id: uuidv7(), at: "11:00" }),
      ).toEqual({ result: "rejected", code: "same_job" });
      // The new shift's id is another shift's: refused, and the first shift keeps its end.
      expect(await w.move({ ...base, id: first.id, at: "11:00" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await w.shifts()).toEqual(asItWas);
    });
  });

  it("removes a shift nobody started when the move is at its first minute", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const first = await w.plan(w.J, "07:00", "15:30");
      const id = uuidv7();
      expect(await w.move({ id, userId: w.w1, jobId: w.K, at: "07:00" })).toEqual({
        result: "moved",
        shift: { id, workDate: DAY, expectedStart: "07:00", expectedEnd: "15:30" },
        ended: { id: first.id, result: "removed" },
      });
      expect(await w.shifts()).toEqual([
        { id, jobId: w.K, start: "07:00", end: "15:30", locked: false },
      ]);
    });
  });

  it("is the admin's alone, on an active person and a job that is not archived", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const input = {
        id: uuidv7(),
        userId: w.w1,
        jobId: w.K,
        at: "11:00",
        expectedEnd: "15:00",
      };
      await asTenant(tx, w.companyId);
      expect(await outcome(appCallerIn(tx, w.who).assignment.moveToday(input))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(appCallerIn(tx, null).assignment.moveToday(input))).toBe(
        "UNAUTHORIZED",
      );
      // Through the router as the admin: today is the server's, so only the answer's shape
      // is read here; the day's arithmetic is the tests' above.
      expect(await (await w.office()).moveToday(input)).toMatchObject({
        result: "moved",
        shift: { id: input.id, expectedStart: "11:00", expectedEnd: "15:00" },
        ended: null,
      });
      expect(
        await outcome(
          (await w.office()).moveToday({ ...input, id: uuidv7(), jobId: uuidv7() }),
        ),
      ).toBe("FORBIDDEN");
      expect(
        await outcome((await w.office()).moveToday({ ...input, expectedEnd: "11:00" })),
      ).toBe("BAD_REQUEST");
    });
  });
});
