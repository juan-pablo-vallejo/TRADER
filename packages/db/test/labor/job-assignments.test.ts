// Stage 4, dated worker-job assignments (V1-D07): the job_assignments table, asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog
// side — FORCE, the policy, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { customers, jobAssignments, jobs } from "../../src/schema";
import { asApp, fixture, one, pgError, rolledBack, sqlstate, type Tx } from "../helpers";

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

  it("keeps one plan per person, job and day, and any number of jobs in a day", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.insert(jobAssignments).values(plan(refs));
      const again = await failed(
        tx,
        plan(refs, { expectedStart: "09:00", expectedEnd: "10:00" }),
      );
      expect(again.code).toBe("23505");
      expect(again.message).toContain("job_assignments_user_id_work_date_job_id_unique");
      // Another job the same day, at overlapping times; the same job another day.
      await tx
        .insert(jobAssignments)
        .values(plan(refs, { jobId: await secondJob(tx, refs) }));
      await tx.insert(jobAssignments).values(plan(refs, { workDate: "2026-11-17" }));
      const rows = await tx
        .select({ id: jobAssignments.id })
        .from(jobAssignments)
        .where(eq(jobAssignments.companyId, refs.companyId));
      expect(rows).toHaveLength(3);
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
