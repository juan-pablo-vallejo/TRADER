// TASKS S4: a clock-in judged by the weekly schedule, behind the enforcement switch
// (sync/schedule.ts, sync/labor.ts; ARCHITECTURE, 2026-11-15). Rolled-back transactions: the
// fixtures are the owner's, the pushes trader_app's under the day's tenant. `judgeStart` is
// asked at fixed instants, since the schedule's own answer needs no clock. A push is judged
// against the database's clock as well (MEMORY: an online capture more than five minutes old
// is `clock_skewed`), so a push at a fixed past instant is sent as captured offline, and a
// push captured online is timed now. The two commit orders of an edit against a start are
// schedule-commit.test.ts's; the rules themselves eligibility.test.ts's.
import { companies, jobAssignments, workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { pushLaborEvent } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import { workDate } from "../../src/labor/work-date";
import { judgeStart, scheduleEnforced } from "../../src/sync/schedule";
import {
  appCallerIn,
  asTenant,
  boundIn,
  type WorkDay,
  workDayIn,
  ownerDb,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// A Monday in the past, in New York's winter: UTC-5, so 07:00 there is 12:00Z.
const DAY = "2026-11-09";
const at = (wall: string, day = DAY) => new Date(`${day}T${wall}:00-05:00`);

const asOwner = (tx: Tx) => tx.execute(sql`reset role`);

async function enforce(tx: Tx, d: WorkDay, on = true) {
  await asOwner(tx);
  await tx
    .update(companies)
    .set({ scheduleEnforced: on })
    .where(eq(companies.id, d.companyId));
}

// A shift written as the owner: these tests are about what push reads, not how the office
// writes (assignment.test.ts).
async function shift(
  tx: Tx,
  d: WorkDay,
  userId: string,
  jobId: string,
  expectedStart: string,
  expectedEnd: string,
  workDate = DAY,
) {
  await asOwner(tx);
  const [row] = await tx
    .insert(jobAssignments)
    .values({
      companyId: d.companyId,
      userId,
      jobId,
      workDate,
      expectedStart,
      expectedEnd,
    })
    .returning({ id: jobAssignments.id });
  return row!.id;
}

const who = (d: WorkDay, id: string, role: AppUser["role"]): AppUser => ({
  id,
  companyId: d.companyId,
  role,
  name: "n",
  email: "e@co.test",
  phone: null,
  signInPhone: null,
});

type Sent = {
  type?: "started" | "paused" | "resumed" | "ended";
  when?: Date;
  offline?: boolean;
  id?: string;
};

// One labor event pushed by `caller` for `workerId` on `jobId`: its result, or its code when
// refused. Captured offline at a fixed instant unless told otherwise.
async function push(
  tx: Tx,
  d: WorkDay,
  caller: AppUser,
  workerId: string,
  jobId: string,
  o: Sent = {},
) {
  await asTenant(tx, d.companyId);
  const now = new Date();
  const id = o.id ?? uuidv7();
  const answer = await tx.transaction((sp) =>
    pushLaborEvent(
      sp,
      caller,
      {
        id,
        schemaVersion: 1,
        payload: {
          workerId,
          jobId,
          type: o.type ?? "started",
          clientTimestamp: o.when ?? at("07:10"),
          location: null,
          timeSetByUser: false,
          capturedOffline: o.offline ?? true,
        },
      },
      measureSkew(now, now),
    ),
  );
  return {
    id,
    result: answer.result === "rejected" ? answer.code : answer.result,
    reasons: answer.result === "rejected" ? [] : answer.ack.reasons,
  };
}

const lockOf = async (tx: Tx, shiftId: string) => {
  await asOwner(tx);
  const [row] = await tx
    .select({ lockedByEventId: jobAssignments.lockedByEventId })
    .from(jobAssignments)
    .where(eq(jobAssignments.id, shiftId));
  return row!.lockedByEventId;
};

const eventsOf = async (tx: Tx, d: WorkDay) => {
  await asOwner(tx);
  return tx.$count(workSessionEvents, eq(workSessionEvents.companyId, d.companyId));
};

describe("judgeStart", () => {
  const judged = async (tx: Tx, d: WorkDay, jobId: string, when: Date) => {
    await asTenant(tx, d.companyId);
    return judgeStart(tx, d.w1, jobId, when);
  };

  it("admits the shift's own job from its first minute to the one before its end", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const id = await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      const yes = { admitted: true, shiftId: id };
      const no = { admitted: false };
      expect(await judged(tx, d, d.J, at("07:00"))).toEqual(yes);
      expect(await judged(tx, d, d.J, at("15:29"))).toEqual(yes);
      // The end is excluded; the seconds of a recorded time are dropped, never rounded up.
      expect(await judged(tx, d, d.J, at("15:30"))).toEqual(no);
      expect(await judged(tx, d, d.J, new Date("2026-11-09T15:29:59-05:00"))).toEqual(
        yes,
      );
      // Another job at an admitted minute, and the shift's job on another day.
      expect(await judged(tx, d, d.K, at("09:00"))).toEqual(no);
      expect(await judged(tx, d, d.J, at("09:00", "2026-11-10"))).toEqual(no);
    });
  });

  it("admits a start up to fifteen minutes early, and only when no shift holds that minute", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const morning = await shift(tx, d, d.w1, d.J, "07:00", "11:00");
      const late = await shift(tx, d, d.w1, d.K, "11:10", "15:00");
      expect(await judged(tx, d, d.J, at("06:45"))).toEqual({
        admitted: true,
        shiftId: morning,
      });
      expect(await judged(tx, d, d.J, at("06:44"))).toEqual({ admitted: false });
      // 10:50: twenty minutes before the next shift, and the morning one still holds it.
      expect(await judged(tx, d, d.K, at("10:55"))).toEqual({ admitted: false });
      expect(await judged(tx, d, d.J, at("10:55"))).toEqual({
        admitted: true,
        shiftId: morning,
      });
      // The gap between them: early for the next, too late for the first.
      expect(await judged(tx, d, d.K, at("11:05"))).toEqual({
        admitted: true,
        shiftId: late,
      });
      expect(await judged(tx, d, d.J, at("11:05"))).toEqual({ admitted: false });
    });
  });

  it("admits nothing on a day whose shifts overlap", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      // Rows the office's writers would have refused: the day does not resolve, and nothing
      // is admitted on it at all, in the shared time or out of it.
      await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      await shift(tx, d, d.w1, d.K, "12:00", "17:00");
      expect(await judged(tx, d, d.J, at("08:00"))).toEqual({ admitted: false });
      expect(await judged(tx, d, d.J, at("13:00"))).toEqual({ admitted: false });
      expect(await judged(tx, d, d.K, at("13:00"))).toEqual({ admitted: false });
      expect(await judged(tx, d, d.K, at("16:00"))).toEqual({ admitted: false });
    });
  });

  it("reads the wall clock on the days the clocks change", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      // 2026-11-01, New York: 01:30 happens twice. A shift over it is eligible both times.
      const back = await shift(tx, d, d.w1, d.J, "01:00", "02:00", "2026-11-01");
      for (const instant of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
        expect(await judged(tx, d, d.J, new Date(instant))).toEqual({
          admitted: true,
          shiftId: back,
        });
      }
      expect(await judged(tx, d, d.J, new Date("2026-11-01T07:00:00Z"))).toEqual({
        admitted: false,
      });
      // 2026-03-08: 02:00 to 03:00 does not occur. The minute after 01:59 is 03:00, which
      // is the shift's excluded end.
      await shift(tx, d, d.w1, d.J, "02:00", "03:00", "2026-03-08");
      expect(await judged(tx, d, d.J, new Date("2026-03-08T07:00:00Z"))).toEqual({
        admitted: false,
      });
    });
  });

  it("never looks past the day's end at the next day's shifts", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const evening = await shift(tx, d, d.w1, d.J, "22:00", "23:59");
      await shift(tx, d, d.w1, d.J, "00:00", "08:00", "2026-11-10");
      expect(await judged(tx, d, d.J, at("23:58"))).toEqual({
        admitted: true,
        shiftId: evening,
      });
      // 23:59 is the evening shift's excluded end, and one minute before tomorrow's.
      expect(await judged(tx, d, d.J, at("23:59"))).toEqual({ admitted: false });
    });
  });
});

describe("sync.push with schedule enforcement off", () => {
  it("lets a worker start on any job that is not archived: a shift admits nobody and its absence refuses nobody", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const onK = await shift(tx, d, d.w1, d.K, "07:00", "15:30");
      await asTenant(tx, d.companyId);
      expect(await scheduleEnforced(tx)).toBe(false);
      const worker = who(d, d.w1, "worker");
      // No shift on J, captured online: nothing asks for one.
      expect(
        await push(tx, d, worker, d.w1, d.J, {
          offline: false,
          when: new Date(Date.now() - 2000),
        }),
      ).toMatchObject({ result: "accepted", reasons: ["location"] });
      await push(tx, d, worker, d.w1, d.J, {
        type: "ended",
        offline: false,
        when: new Date(Date.now() - 1000),
      });
      // A shift on K: the start there is accepted like any other, and locks nothing.
      const onShift = await push(tx, d, worker, d.w1, d.K, {
        offline: false,
        when: new Date(),
      });
      expect(onShift).toMatchObject({ result: "accepted", reasons: ["location"] });
      expect(await lockOf(tx, onK)).toBeNull();
      // An archived job is the one a start is refused on.
      const other = who(d, d.w2, "worker");
      await asOwner(tx);
      await tx.execute(sql`update jobs set status = 'archived' where id = ${d.J}`);
      expect((await push(tx, d, other, d.w2, d.J)).result).toBe("not_permitted");
      expect((await push(tx, d, other, d.w2, d.K)).result).toBe("accepted");
    });
  });
});

describe("sync.push with schedule enforcement on", () => {
  it("admits a worker's start on a shift of theirs, and locks the shift", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const id = await shift(tx, d, d.w1, d.K, "07:00", "15:30");
      await enforce(tx, d);
      const start = await push(tx, d, who(d, d.w1, "worker"), d.w1, d.K);
      // No location stamp came with it: a reason for the office, never a refusal.
      expect(start).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location"],
      });
      expect(await lockOf(tx, id)).toBe(start.id);
      // The same record again changes nothing, lock included.
      const again = await push(tx, d, who(d, d.w1, "worker"), d.w1, d.K, {
        id: start.id,
      });
      expect(again.result).toBe("duplicate");
      expect(await eventsOf(tx, d)).toBe(1);
      // The office can no longer change or remove what admitted it.
      const admin = await boundIn(tx, d.companyId, "admin");
      await asTenant(tx, d.companyId);
      const office = appCallerIn(tx, admin.who).assignment;
      expect(
        await office.update({
          assignmentId: id,
          workDate: DAY,
          expectedStart: "08:00",
          expectedEnd: "15:30",
        }),
      ).toEqual({ result: "rejected", code: "locked" });
      expect(await office.remove({ assignmentId: id })).toEqual({
        result: "rejected",
        code: "locked",
      });
      // Nor take the minute it was admitted at for another shift.
      const over = uuidv7();
      expect(
        await office.create({
          userId: d.w1,
          jobId: d.J,
          expectedStart: "07:00",
          expectedEnd: "08:00",
          days: [{ id: over, workDate: DAY }],
        }),
      ).toMatchObject({
        days: [
          {
            result: "rejected",
            code: "schedule",
            issues: [{ code: "overlap", start: "07:00", end: "08:00" }],
          },
        ],
      });
    });
  });

  it("admits a worker's start up to fifteen minutes before their shift, and no earlier", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const id = await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      await enforce(tx, d);
      const worker = who(d, d.w1, "worker");
      // Sixteen minutes early no shift admits it: stored, being offline, and flagged.
      const early = await push(tx, d, worker, d.w1, d.J, { when: at("06:44") });
      expect(early).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location", "unscheduled"],
      });
      expect(await lockOf(tx, id)).toBeNull();
      await push(tx, d, worker, d.w1, d.J, { type: "ended", when: at("06:44") });
      const start = await push(tx, d, worker, d.w1, d.J, { when: at("06:45") });
      expect(start).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location"],
      });
      expect(await lockOf(tx, id)).toBe(start.id);
    });
  });

  it("locks a shift once: a second start on it leaves the first lock", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const id = await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      await enforce(tx, d);
      const worker = who(d, d.w1, "worker");
      const first = await push(tx, d, worker, d.w1, d.J);
      await push(tx, d, worker, d.w1, d.J, { type: "ended", when: at("09:00") });
      const second = await push(tx, d, worker, d.w1, d.J, { when: at("10:00") });
      expect(second.result).toBe("accepted");
      expect(await lockOf(tx, id)).toBe(first.id);
    });
  });

  it("refuses a worker's start captured online that no shift admits as not_scheduled, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      await enforce(tx, d);
      const worker = who(d, d.w1, "worker");
      const now = { offline: false, when: new Date(Date.now() - 1000) };
      // No shift at all.
      expect((await push(tx, d, worker, d.w1, d.J, now)).result).toBe("not_scheduled");
      // A shift through the whole of today and tomorrow, on the other job.
      await asTenant(tx, d.companyId);
      const { rows } = await tx.execute<{ today: string; tomorrow: string }>(sql`
        select to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD') as today,
          to_char((now() + interval '1 day') at time zone 'America/New_York',
            'YYYY-MM-DD') as tomorrow
      `);
      for (const day of [rows[0]!.today, rows[0]!.tomorrow]) {
        await shift(tx, d, d.w1, d.K, "00:00", "23:59", day);
      }
      expect((await push(tx, d, worker, d.w1, d.J, now)).result).toBe("not_scheduled");
      expect(await eventsOf(tx, d)).toBe(0);
    });
  });

  it("stores a worker's start captured offline that no shift admits, flagged unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      // The phone's copy said J at 07:00; the office has since moved the day to K.
      const id = await shift(tx, d, d.w1, d.K, "07:00", "15:30");
      await enforce(tx, d);
      const worker = who(d, d.w1, "worker");
      const start = await push(tx, d, worker, d.w1, d.J);
      expect(start).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location", "unscheduled"],
      });
      // Stored under its own id at its recorded time, with its flags; it locks nothing.
      await asOwner(tx);
      const [event] = await tx
        .select({
          clientTimestamp: workSessionEvents.clientTimestamp,
          jobId: workSessionEvents.jobId,
          flags: workSessionEvents.flags,
        })
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start.id));
      expect(event).toEqual({
        clientTimestamp: at("07:10"),
        jobId: d.J,
        flags: ["offline", "location", "unscheduled"],
      });
      expect(await lockOf(tx, id)).toBeNull();
      // Being stored, what follows it is judged against it and accepted — and never by the
      // schedule: a pause, a resume and an end outside every shift.
      for (const [type, wall] of [
        ["paused", "11:00"],
        ["resumed", "11:30"],
        ["ended", "18:00"],
      ] as const) {
        expect(
          (await push(tx, d, worker, d.w1, d.J, { type, when: at(wall) })).result,
        ).toBe("accepted");
      }
      // A resend adds nothing.
      expect((await push(tx, d, worker, d.w1, d.J, { id: start.id })).result).toBe(
        "duplicate",
      );
      expect(await eventsOf(tx, d)).toBe(4);
    });
  });

  it("accepts an admin's start that no shift admits, captured online, flagged unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await enforce(tx, d);
      const start = await push(tx, d, who(d, admin.id, "admin"), admin.id, d.K, {
        offline: false,
        when: new Date(Date.now() - 1000),
      });
      // No shift: an admin starts on any open job all the same, and the office sees it was
      // outside the schedule. Its other flags are anyone's: this one carries no stamp.
      expect(start).toMatchObject({
        result: "accepted",
        reasons: ["location", "unscheduled"],
      });
      expect(await eventsOf(tx, d)).toBe(1);
    });
  });

  it("stores an admin's unscheduled start captured offline too, flagged the same", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      // w1 becomes an admin, with a shift on the other job.
      await asOwner(tx);
      await tx.execute(sql`update users set role = 'admin' where id = ${d.w1}`);
      const onK = await shift(tx, d, d.w1, d.K, "07:00", "15:30");
      await enforce(tx, d);
      expect(await push(tx, d, who(d, d.w1, "admin"), d.w1, d.J)).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location", "unscheduled"],
      });
      expect(await lockOf(tx, onK)).toBeNull();
      expect(await eventsOf(tx, d)).toBe(1);
    });
  });

  it("admits an admin's start on a shift of theirs like anyone's: locked, and not unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const id = await shift(tx, d, admin.id, d.J, "07:00", "15:30");
      await enforce(tx, d);
      const start = await push(tx, d, who(d, admin.id, "admin"), admin.id, d.J);
      expect(start).toMatchObject({
        result: "accepted",
        reasons: ["offline", "location"],
      });
      expect(await lockOf(tx, id)).toBe(start.id);
    });
  });

  it("refuses a start recorded for somebody else, shift or no shift, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const id = await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      await enforce(tx, d);
      // w1's own shift admits w1's own start, and nobody else's record of it.
      for (const caller of [who(d, d.w2, "worker"), who(d, admin.id, "admin")]) {
        expect((await push(tx, d, caller, d.w1, d.J)).result).toBe("not_permitted");
      }
      expect(await lockOf(tx, id)).toBeNull();
      expect(await eventsOf(tx, d)).toBe(0);
    });
  });

  it("still refuses an archived job, a future time and a second open session by their own names", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      await shift(tx, d, d.w1, d.J, "07:00", "15:30");
      await shift(tx, d, d.w1, d.K, "16:00", "20:00");
      await enforce(tx, d);
      const worker = who(d, d.w1, "worker");
      expect(
        (
          await push(tx, d, worker, d.w1, d.J, {
            offline: false,
            when: new Date(Date.now() + 3_600_000),
          })
        ).result,
      ).toBe("time_in_future");
      expect((await push(tx, d, worker, d.w1, d.J)).result).toBe("accepted");
      // A second start while the first session is open: validation's answer, before the
      // schedule is asked.
      expect((await push(tx, d, worker, d.w1, d.K, { when: at("16:05") })).result).toBe(
        "session_already_open",
      );
      await asOwner(tx);
      await tx.execute(sql`update jobs set status = 'archived' where id = ${d.K}`);
      await push(tx, d, worker, d.w1, d.J, { type: "ended", when: at("15:00") });
      expect((await push(tx, d, worker, d.w1, d.K, { when: at("16:05") })).result).toBe(
        "not_permitted",
      );
    });
  });
});

describe("sync.pull", () => {
  it("says whether the schedule is enforced", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      await asTenant(tx, d.companyId);
      const pull = () => appCallerIn(tx, worker.who).sync.pull({ protocolVersion: 1 });
      expect((await pull()).scheduleEnforced).toBe(false);
      await enforce(tx, d);
      await asTenant(tx, d.companyId);
      expect((await pull()).scheduleEnforced).toBe(true);
    });
  });

  // TASKS S7: the caller's own shifts. The window is counted from the company's today, so
  // these fixtures are dated from the pull's own clock.
  const dayFrom = (day: string, n: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  it("answers the caller's own shifts with their hours, and nobody else's", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      await asTenant(tx, d.companyId);
      const pull = () => appCallerIn(tx, worker.who).sync.pull({ protocolVersion: 1 });
      const first = await pull();
      const today = workDate(first.serverNow, first.company.timezone);
      expect(first.shifts).toEqual([]);

      const early = await shift(tx, d, worker.id, d.J, "07:00", "12:00", today);
      const late = await shift(tx, d, worker.id, d.K, "12:00", "15:00", today);
      // Not the caller's; and the caller's own, outside the fourteen days either way.
      await shift(tx, d, d.w1, d.J, "07:00", "12:00", today);
      await shift(tx, d, worker.id, d.J, "07:00", "12:00", dayFrom(today, 14));
      await shift(tx, d, worker.id, d.J, "07:00", "12:00", dayFrom(today, -7));
      await asTenant(tx, d.companyId);

      const snapshot = await pull();
      expect(snapshot.shifts.map((s) => s.id)).toEqual([early, late]);
      expect(snapshot.shifts[0]).toMatchObject({
        workDate: today,
        start: "07:00",
        end: "12:00",
        locked: false,
      });
      expect(snapshot.shifts[1]).toMatchObject({ start: "12:00", end: "15:00" });
      // The jobsite travels with the shift, and is among the open jobs as well.
      expect(snapshot.shifts[0]!.job.id).toBe(d.J);
      expect(snapshot.shifts[0]!.job.name).not.toBe("");
      expect(snapshot.jobs.map((j) => j.id)).toContain(d.J);
    });
  });
});
