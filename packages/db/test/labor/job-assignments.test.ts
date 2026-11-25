// Dated worker-job assignments: the job_assignments table, asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog
// side — FORCE, the policy, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's.
import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import {
  customers,
  jobAssignments,
  jobs,
  users,
  workSessionEvents,
} from "../../src/schema";
import {
  asApp,
  fixture,
  lockExclusive,
  one,
  pgError,
  rolledBack,
  sqlstate,
  started,
  type Tx,
} from "../helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;

const plan = (
  refs: Refs,
  over: Partial<typeof jobAssignments.$inferInsert> = {},
): typeof jobAssignments.$inferInsert => ({
  companyId: refs.companyId,
  userId: refs.workerId,
  jobId: refs.jobId,
  workDate: "2026-11-16",
  expectedStart: "07:00",
  expectedEnd: "15:30",
  ...over,
});

const failed = (tx: Tx, row: typeof jobAssignments.$inferInsert) =>
  pgError(tx.transaction((sp: Tx) => sp.insert(jobAssignments).values(row)));

// A statement the schedule's guards refuse: its SQLSTATE and the constraint it names.
async function raised(tx: Tx, statement: SQL) {
  const error = (await pgError(tx.transaction((sp: Tx) => sp.execute(statement)))) as {
    code?: string;
    constraint?: string;
  };
  return { code: error.code, constraint: error.constraint };
}

async function insertShift(tx: Tx, row: typeof jobAssignments.$inferInsert) {
  return one(
    await tx.insert(jobAssignments).values(row).returning({ id: jobAssignments.id }),
  ).id;
}

// A clock-in of the fixture's worker on its job, and the shift locked by it.
async function lockedShift(tx: Tx, refs: Refs) {
  const shift = await insertShift(tx, plan(refs));
  const event = started(refs);
  await tx.insert(workSessionEvents).values(event);
  await tx.execute(sql`
    update job_assignments set locked_at = now(), locked_by_event_id = ${event.id}
    where id = ${shift}
  `);
  return { shift, eventId: event.id };
}

async function secondJob(tx: Tx, refs: Refs) {
  const customer = one(
    await tx
      .insert(customers)
      .values({ companyId: refs.companyId, name: "Second customer" })
      .returning({ id: customers.id }),
  );
  return one(
    await tx
      .insert(jobs)
      .values({ companyId: refs.companyId, customerId: customer.id, name: "Second job" })
      .returning({ id: jobs.id }),
  ).id;
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("job_assignments", () => {
  it("keeps the day and the wall-clock times as written", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      // 02:30 does not exist on the wall in New York on 2027-03-14; it is kept all the same.
      const row = one(
        await tx
          .insert(jobAssignments)
          .values(
            plan(refs, {
              workDate: "2027-03-14",
              expectedStart: "02:30",
              expectedEnd: "03:15",
            }),
          )
          .returning(),
      );
      expect(row.workDate).toBe("2027-03-14");
      expect(row.expectedStart).toBe("02:30:00");
      expect(row.expectedEnd).toBe("03:15:00");
    });
  });

  it("refuses an end at or before its start (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      for (const over of [
        { expectedStart: "15:30", expectedEnd: "07:00" },
        { expectedStart: "07:00", expectedEnd: "07:00" },
        // An overnight shift is not one row.
        { expectedStart: "22:00", expectedEnd: "02:00" },
      ]) {
        const error = await failed(tx, plan(refs, over));
        expect(error.code).toBe("23514");
        expect(error.message).toContain("job_assignments_end_after_start");
      }
    });
  });

  it("refuses the same shift twice and keeps one job twice in a day at other times", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.insert(jobAssignments).values(plan(refs));
      const again = await failed(tx, plan(refs));
      expect(again.code).toBe("23505");
      expect(again.message).toContain("job_assignments_exact_shift_unique");
      // The same job later that day, another job at overlapping times, the same shift on
      // another day: each is a shift of its own. Whether two overlap is the writers' question.
      await tx
        .insert(jobAssignments)
        .values(plan(refs, { expectedStart: "16:00", expectedEnd: "18:00" }));
      await tx
        .insert(jobAssignments)
        .values(plan(refs, { jobId: await secondJob(tx, refs) }));
      await tx.insert(jobAssignments).values(plan(refs, { workDate: "2026-11-17" }));
      const rows = await tx
        .select({ id: jobAssignments.id })
        .from(jobAssignments)
        .where(eq(jobAssignments.companyId, refs.companyId));
      expect(rows).toHaveLength(4);
    });
  });

  it("never changes a shift's person or job", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shift = await insertShift(tx, plan(refs));
      const job = await secondJob(tx, refs);
      const moved = await raised(
        tx,
        sql`update job_assignments set job_id = ${job} where id = ${shift}`,
      );
      expect(moved).toEqual({ code: "23000", constraint: "job_assignments_identity" });
    });
  });

  it("refuses a person or a job of another company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const person = await failed(tx, plan(a, { userId: b.workerId }));
      expect(person.code).toBe("23503");
      expect(person.message).toContain("job_assignments_company_id_user_id_fk");
      const job = await failed(tx, plan(a, { jobId: b.jobId }));
      expect(job.code).toBe("23503");
      expect(job.message).toContain("job_assignments_company_id_job_id_fk");
    });
  });

  it("lets trader_app write, edit and remove its tenant's plans and none of another's", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      await tx.insert(jobAssignments).values(plan(b));
      await asApp(tx, a.companyId);
      await tx.insert(jobAssignments).values(plan(a));
      // Another tenant's row cannot be written (WITH CHECK) …
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) => sp.insert(jobAssignments).values(plan(b))),
        ),
      ).toBe("42501");
      // … nor seen, edited or removed: each statement reaches the tenant's one row.
      expect(
        await tx.select({ id: jobAssignments.id }).from(jobAssignments),
      ).toHaveLength(1);
      const edited = await tx.execute(
        sql`update job_assignments set expected_end = '16:00'`,
      );
      expect(edited.rowCount).toBe(1);
      const gone = await tx.execute(sql`delete from job_assignments`);
      expect(gone.rowCount).toBe(1);
      await tx.execute(sql`reset role`);
      const { rows } = await tx.execute<{ expected_end: string }>(
        sql`select expected_end::text from job_assignments where company_id = ${b.companyId}`,
      );
      expect(rows).toEqual([{ expected_end: "15:30:00" }]);
    });
  });
});

describe("job_assignments, the punch lock", () => {
  it("creates a shift unlocked and keeps the two lock columns together", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const event = started(refs);
      await tx.insert(workSessionEvents).values(event);
      const born = (await failed(
        tx,
        plan(refs, { lockedAt: new Date(), lockedByEventId: event.id }),
      )) as { code?: string; constraint?: string };
      expect(born.code).toBe("23000");
      expect(born.constraint).toBe("job_assignments_created_unlocked");
      const shift = await insertShift(tx, plan(refs));
      const half = await raised(
        tx,
        // The event without the instant: the trigger answers first for the other half.
        sql`update job_assignments set locked_by_event_id = ${event.id} where id = ${shift}`,
      );
      expect(half).toEqual({
        code: "23514",
        constraint: "job_assignments_lock_complete",
      });
    });
  });

  it("is locked only by a clock-in of its own person on its own job", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shift = await insertShift(tx, plan(refs));
      const lock = (eventId: string) =>
        sql`update job_assignments set locked_at = now(), locked_by_event_id = ${eventId}
            where id = ${shift}`;
      const refused = { code: "23000", constraint: "job_assignments_lock_event" };

      // Another person's clock-in on the same job.
      const other = one(
        await tx
          .insert(users)
          .values({ companyId: refs.companyId, email: "o@co.test", name: "Other" })
          .returning({ id: users.id }),
      );
      const theirs = { ...started(refs), workerId: other.id, initiatorUserId: other.id };
      await tx.insert(workSessionEvents).values(theirs);
      expect(await raised(tx, lock(theirs.id))).toEqual(refused);

      // The person's own clock-in on another job.
      const elsewhere = { ...started(refs), jobId: await secondJob(tx, refs) };
      await tx.insert(workSessionEvents).values(elsewhere);
      expect(await raised(tx, lock(elsewhere.id))).toEqual(refused);

      // The person's own clock-in on this job, and then its end: only the start locks.
      const mine = started(refs);
      await tx.insert(workSessionEvents).values(mine);
      const end = {
        ...started(refs),
        type: "ended" as const,
        clientTimestamp: new Date(Date.now() + 1000),
      };
      await tx.insert(workSessionEvents).values(end);
      expect(await raised(tx, lock(end.id))).toEqual(refused);
      const locked = await tx.execute(lock(mine.id));
      expect(locked.rowCount).toBe(1);
    });
  });

  it("keeps a locked shift's day, start and lock, never moves its end later, and never removes it", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { shift } = await lockedShift(tx, refs);
      const again = started(refs);
      await tx.insert(workSessionEvents).values(again);
      const refused = { code: "23000", constraint: "job_assignments_locked" };
      for (const statement of [
        sql`update job_assignments set work_date = '2026-11-17' where id = ${shift}`,
        sql`update job_assignments set expected_start = '06:00' where id = ${shift}`,
        sql`update job_assignments set expected_end = '16:00' where id = ${shift}`,
        sql`update job_assignments set locked_at = null, locked_by_event_id = null
            where id = ${shift}`,
        sql`update job_assignments set locked_by_event_id = ${again.id} where id = ${shift}`,
        sql`update job_assignments set locked_at = locked_at + interval '1 second'
            where id = ${shift}`,
        sql`delete from job_assignments where id = ${shift}`,
      ]) {
        expect(await raised(tx, statement)).toEqual(refused);
      }
      // What the lock does not cover may still be written.
      const touched = await tx.execute(
        sql`update job_assignments set updated_at = now() where id = ${shift}`,
      );
      expect(touched.rowCount).toBe(1);
      // An unlocked neighbour is edited and removed as before.
      const free = await insertShift(
        tx,
        plan(refs, { expectedStart: "16:00", expectedEnd: "18:00" }),
      );
      await tx.execute(
        sql`update job_assignments set expected_end = '19:00' where id = ${free}`,
      );
      const gone = await tx.execute(sql`delete from job_assignments where id = ${free}`);
      expect(gone.rowCount).toBe(1);
    });
  });

  it("moves a locked shift's end earlier, to any minute after its clock-in, and no other way", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      // 07:00 to 15:30 on the 16th; clocked in at 07:05:40 on New York's wall clock.
      const shift = await insertShift(tx, plan(refs));
      const event = {
        ...started(refs),
        clientTimestamp: new Date("2026-11-16T12:05:40Z"),
      };
      await tx.insert(workSessionEvents).values(event);
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${event.id}
        where id = ${shift}
      `);
      const end = async () =>
        one(
          await tx
            .select({ end: jobAssignments.expectedEnd })
            .from(jobAssignments)
            .where(eq(jobAssignments.id, shift)),
        ).end;
      const to = (time: string) =>
        sql`update job_assignments set expected_end = ${time} where id = ${shift}`;

      // Earlier, and after the clock-in: written. Again, earlier still.
      expect((await tx.execute(to("12:00"))).rowCount).toBe(1);
      expect(await end()).toBe("12:00:00");
      // The minute after the clock-in's own is the earliest end: 07:05:40 is minute 07:05.
      expect((await tx.execute(to("07:06"))).rowCount).toBe(1);
      expect(await end()).toBe("07:06:00");

      // At the clock-in's minute, or before it: refused, by a name of its own.
      const beforeClockIn = { code: "23000", constraint: "job_assignments_locked_end" };
      expect(await raised(tx, to("07:05"))).toEqual(beforeClockIn);
      expect(await raised(tx, to("07:01"))).toEqual(beforeClockIn);
      // Later again, even back to where it was: refused. A trim is not undone.
      const locked = { code: "23000", constraint: "job_assignments_locked" };
      expect(await raised(tx, to("07:07"))).toEqual(locked);
      expect(await raised(tx, to("15:30"))).toEqual(locked);
      // A trim that also moves anything else is refused whole.
      for (const statement of [
        sql`update job_assignments set expected_end = '07:06', expected_start = '06:00'
            where id = ${shift}`,
        sql`update job_assignments set expected_end = '07:06', work_date = '2026-11-17'
            where id = ${shift}`,
        sql`update job_assignments set expected_end = '07:06', locked_at = null,
            locked_by_event_id = null where id = ${shift}`,
        sql`delete from job_assignments where id = ${shift}`,
      ]) {
        expect(await raised(tx, statement)).toEqual(locked);
      }
      expect(await end()).toBe("07:06:00");
      // The clock event is as it was written: nothing here touches it.
      const kept = one(
        await tx
          .select({ at: workSessionEvents.clientTimestamp })
          .from(workSessionEvents)
          .where(eq(workSessionEvents.id, event.id)),
      );
      expect(kept.at.toISOString()).toBe("2026-11-16T12:05:40.000Z");
    });
  });

  it("lets trader_app trim its own tenant's locked shift, the clock-in read behind the wall", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shift = await insertShift(tx, plan(refs));
      const event = {
        ...started(refs),
        clientTimestamp: new Date("2026-11-16T12:05:00Z"),
      };
      await tx.insert(workSessionEvents).values(event);
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${event.id}
        where id = ${shift}
      `);
      await asApp(tx, refs.companyId);
      const trimmed = await tx.execute(
        sql`update job_assignments set expected_end = '11:00' where id = ${shift}`,
      );
      expect(trimmed.rowCount).toBe(1);
      expect(
        await raised(
          tx,
          sql`update job_assignments set expected_end = '07:00' where id = ${shift}`,
        ),
      ).toEqual({ code: "23000", constraint: "job_assignments_locked_end" });
    });
  });

  it("frees a shift whose clock-in is voided, or hands its lock to a clock-in that stands", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { shift, eventId } = await lockedShift(tx, refs);
      const refused = { code: "23000", constraint: "job_assignments_locked" };
      const unlock = sql`update job_assignments set locked_at = null, locked_by_event_id = null
          where id = ${shift}`;
      // While its clock-in stands, the lock holds.
      expect(await raised(tx, unlock)).toEqual(refused);
      await tx
        .insert(workSessionEvents)
        .values({ ...started(refs), type: "voided", voidsEventId: eventId });
      // Voided, the lock may move to another clock-in of the same person on the same job
      // that is not voided, and not to one that is.
      const voidedToo = started(refs);
      await tx.insert(workSessionEvents).values(voidedToo);
      await tx
        .insert(workSessionEvents)
        .values({ ...started(refs), type: "voided", voidsEventId: voidedToo.id });
      expect(
        await raised(
          tx,
          sql`update job_assignments set locked_by_event_id = ${voidedToo.id}
              where id = ${shift}`,
        ),
      ).toEqual(refused);
      const stands = started(refs);
      await tx.insert(workSessionEvents).values(stands);
      const moved = await tx.execute(
        sql`update job_assignments set locked_by_event_id = ${stands.id} where id = ${shift}`,
      );
      expect(moved.rowCount).toBe(1);
      // That one voided too, the shift is free, with its day and times as they were.
      await tx
        .insert(workSessionEvents)
        .values({ ...started(refs), type: "voided", voidsEventId: stands.id });
      expect(
        await raised(
          tx,
          sql`update job_assignments set locked_at = null, locked_by_event_id = null,
              expected_end = '16:00' where id = ${shift}`,
        ),
      ).toEqual(refused);
      expect((await tx.execute(unlock)).rowCount).toBe(1);
      const freed = await tx.execute(
        sql`update job_assignments set expected_end = '16:00' where id = ${shift}`,
      );
      expect(freed.rowCount).toBe(1);
      expect(
        (await tx.execute(sql`delete from job_assignments where id = ${shift}`)).rowCount,
      ).toBe(1);
    });
  });

  it("passes a voided lock to no correction, no clock-in holding another shift, and keeps its moment", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { shift, eventId } = await lockedShift(tx, refs);
      await tx
        .insert(workSessionEvents)
        .values({ ...started(refs), type: "voided", voidsEventId: eventId });
      const refused = { code: "23000", constraint: "job_assignments_locked" };
      // A correction of the voided clock-in is a `started` row too, and never takes the lock.
      const correction = { ...started(refs), correctsEventId: eventId };
      await tx.insert(workSessionEvents).values(correction);
      expect(
        await raised(
          tx,
          sql`update job_assignments set locked_by_event_id = ${correction.id}
              where id = ${shift}`,
        ),
      ).toEqual(refused);
      // A clock-in that holds the person's other shift on the job keeps to that one.
      const other = await insertShift(
        tx,
        plan(refs, { expectedStart: "16:00", expectedEnd: "18:00" }),
      );
      const holder = started(refs);
      await tx.insert(workSessionEvents).values(holder);
      await tx.execute(sql`
        update job_assignments set locked_at = now(), locked_by_event_id = ${holder.id}
        where id = ${other}
      `);
      expect(
        await raised(
          tx,
          sql`update job_assignments set locked_by_event_id = ${holder.id} where id = ${shift}`,
        ),
      ).toEqual(refused);
      // A standing one takes it, with the lock's moment as it was.
      const stands = started(refs);
      await tx.insert(workSessionEvents).values(stands);
      expect(
        await raised(
          tx,
          sql`update job_assignments set locked_by_event_id = ${stands.id},
              locked_at = locked_at + interval '1 minute' where id = ${shift}`,
        ),
      ).toEqual(refused);
      const moved = await tx.execute(
        sql`update job_assignments set locked_by_event_id = ${stands.id} where id = ${shift}`,
      );
      expect(moved.rowCount).toBe(1);
    });
  });

  it("refuses TRUNCATE while any shift is locked", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await lockedShift(tx, refs);
      // The table held first, never waiting (helpers.ts, lockExclusive), and nothing but
      // the TRUNCATE after it: a statement that waited while holding it would stall the
      // suites that write shifts.
      await lockExclusive(tx, ["job_assignments"]);
      expect(await raised(tx, sql`truncate job_assignments cascade`)).toEqual({
        code: "23000",
        constraint: "job_assignments_locked",
      });
    });
  });
});
