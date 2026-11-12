// What a pay-period close exported (schema/pay.ts; migrations 0034–0036), asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. A line is
// written while its period is open and the period is closed in the same transaction, so the
// fixture does both; the deferred check fires only when a test says SET CONSTRAINTS.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { payPeriodLines, payPeriods, users } from "../../src/schema";
import { asApp, fixture, one, pgError, rolledBack, type Tx } from "../helpers";

type Refs = Awaited<ReturnType<typeof world>>;

// One company with a worker, a job, an admin and an open period of one week.
async function world(tx: Tx) {
  const refs = await fixture(tx);
  const admin = one(
    await tx
      .insert(users)
      .values({
        companyId: refs.companyId,
        email: "a@co.test",
        name: "Admin",
        role: "admin",
      })
      .returning({ id: users.id }),
  );
  const period = one(
    await tx
      .insert(payPeriods)
      .values({ companyId: refs.companyId, startsOn: "2026-10-12", endsOn: "2026-10-18" })
      .returning({ id: payPeriods.id }),
  );
  return { ...refs, adminId: admin.id, periodId: period.id };
}

const line = (refs: Refs, workDate = "2026-10-13", hundredths = 800) => ({
  companyId: refs.companyId,
  periodId: refs.periodId,
  workerId: refs.workerId,
  jobId: refs.jobId,
  workDate,
  hundredths,
});

const close = (tx: Tx, refs: Refs, periodId = refs.periodId) =>
  tx
    .update(payPeriods)
    .set({
      closedAt: new Date(),
      closedByUserId: refs.adminId,
      unresolvedPendingSessions: 0,
      unresolvedOpenSessions: 0,
    })
    .where(eq(payPeriods.id, periodId));

// A statement expected to fail, in a savepoint so the test goes on after it.
const refused = (tx: Tx, statement: (sp: Tx) => Promise<unknown>) =>
  pgError(tx.transaction((sp) => statement(sp)));

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("pay_period_lines", () => {
  it("keeps a period's own hours and a signed adjustment, closed in one transaction", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      await tx.insert(payPeriodLines).values([
        line(refs),
        // A date before the period: an adjustment, and it may be negative.
        line(refs, "2026-10-06", -125),
      ]);
      await close(tx, refs);
      await tx.execute(sql`set constraints all immediate`);
      const rows = await tx
        .select({ d: payPeriodLines.workDate, h: payPeriodLines.hundredths })
        .from(payPeriodLines)
        .orderBy(payPeriodLines.workDate);
      expect(rows).toEqual([
        { d: "2026-10-06", h: -125 },
        { d: "2026-10-13", h: 800 },
      ]);
    });
  });

  it("rejects a second line for one worker, job and date in a period", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      await tx.insert(payPeriodLines).values(line(refs));
      const error = await refused(tx, (sp) =>
        sp.insert(payPeriodLines).values(line(refs, "2026-10-13", 50)),
      );
      expect(error.code).toBe("23505");
    });
  });

  it("rejects a line of zero", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      const error = await refused(tx, (sp) =>
        sp.insert(payPeriodLines).values(line(refs, "2026-10-13", 0)),
      );
      expect(error.code).toBe("23514");
    });
  });

  it("rejects a worker, a job or a period of another company", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      const other = await world(tx);
      for (const foreign of [
        { workerId: other.workerId },
        { jobId: other.jobId },
        { periodId: other.periodId },
      ]) {
        const error = await refused(tx, (sp) =>
          sp.insert(payPeriodLines).values({ ...line(refs), ...foreign }),
        );
        // The period is refused by 0036's check before the foreign key answers.
        expect(["23503", "23000"], JSON.stringify(foreign)).toContain(error.code);
      }
    });
  });

  it("refuses UPDATE, DELETE and TRUNCATE for every role", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      await tx.insert(payPeriodLines).values(line(refs));
      await close(tx, refs);
      // Fired here: a pending deferred event would make TRUNCATE fail 55006 first.
      await tx.execute(sql`set constraints all immediate`);
      for (const statement of [
        sql`update pay_period_lines set hundredths = 900`,
        sql`delete from pay_period_lines`,
        sql`truncate pay_period_lines`,
      ]) {
        const error = await refused(tx, (sp) => sp.execute(statement));
        expect(error.code).toBe("23000");
        expect(error.message).toMatch(/^pay_period_lines is append-only: /);
      }
      expect(await tx.select().from(payPeriodLines)).toHaveLength(1);
    });
  });

  it("refuses UPDATE, DELETE and TRUNCATE to trader_app by privilege (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await world(tx);
      await tx.insert(payPeriodLines).values(line(refs));
      await close(tx, refs);
      await tx.execute(sql`set constraints all immediate`);
      await asApp(tx, refs.companyId);
      for (const statement of [
        sql`update pay_period_lines set hundredths = 900`,
        sql`delete from pay_period_lines`,
        sql`truncate pay_period_lines`,
      ]) {
        expect((await refused(tx, (sp) => sp.execute(statement))).code).toBe("42501");
      }
    });
  });

  it("lets trader_app write and read its own tenant's lines and no other's", async () => {
    await rolledBack(db, async (tx) => {
      const mine = await world(tx);
      const theirs = await world(tx);
      await tx.insert(payPeriodLines).values(line(theirs));
      await close(tx, theirs);
      await asApp(tx, mine.companyId);
      await tx.insert(payPeriodLines).values(line(mine));
      await close(tx, mine);
      await tx.execute(sql`set constraints all immediate`);
      const rows = await tx
        .select({ companyId: payPeriodLines.companyId })
        .from(payPeriodLines);
      expect(rows).toEqual([{ companyId: mine.companyId }]);
      const error = await refused(tx, (sp) =>
        sp.insert(payPeriodLines).values(line(theirs, "2026-10-14")),
      );
      // The tenant policy's WITH CHECK, or 0036's check finding no visible open period.
      expect(["42501", "23000"]).toContain(error.code);
    });
  });
});
