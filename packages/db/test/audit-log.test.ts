// Stage 2 line 6: the audit log, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. V1 writes no row here (the writers are after-V1
// wiring), so these tests are the only writer and insert as the API will.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { auditLog, companies, payRates, users } from "../src/schema";
import { company, fixture, one, pgError, rolledBack, sqlstate, type Tx } from "./helpers";

// A company-level action: no audited row, so `after` carries the action's parameters.
const exported = (companyId: string): typeof auditLog.$inferInsert => ({
  companyId,
  action: "companies.export",
  entityTable: "companies",
  after: { format: "csv", period: "2026-10-19..2026-11-01" },
});

// A rate change as the Stage 4 procedure would record it: both snapshots, one actor.
async function rateChange(tx: Tx) {
  const refs = await fixture(tx);
  const rate = one(
    await tx
      .insert(payRates)
      .values({
        companyId: refs.companyId,
        userId: refs.workerId,
        effectiveFrom: "2026-10-19",
        hourlyRateCents: 2500,
        currency: "USD",
      })
      .returning({ id: payRates.id }),
  );
  const row: typeof auditLog.$inferInsert = {
    companyId: refs.companyId,
    actorUserId: refs.workerId,
    action: "pay_rates.update",
    entityTable: "pay_rates",
    entityId: rate.id,
    before: { hourly_rate_cents: 2500 },
    after: { hourly_rate_cents: 2600 },
  };
  return { refs, row };
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("audit_log", () => {
  it("accepts a system row with no actor and no audited row", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId } = await fixture(tx);
      const row = one(await tx.insert(auditLog).values(exported(companyId)).returning());
      expect(row.actorUserId).toBeNull();
      expect(row.entityId).toBeNull();
      expect(row.before).toBeNull();
      expect(row.after).toEqual(exported(companyId).after);
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    });
  });

  it("accepts an actor's row with both snapshots", async () => {
    await rolledBack(db, async (tx) => {
      const { row } = await rateChange(tx);
      const stored = one(await tx.insert(auditLog).values(row).returning());
      expect(stored.actorUserId).toBe(row.actorUserId);
      expect(stored.before).toEqual(row.before);
      expect(stored.after).toEqual(row.after);
    });
  });

  it("rejects an actor of another company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const { row } = await rateChange(tx);
      const other = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const outsider = one(
        await tx
          .insert(users)
          .values({ companyId: other.id, email: "o@other.test", name: "Outsider" })
          .returning({ id: users.id }),
      );
      expect(
        await sqlstate(tx.insert(auditLog).values({ ...row, actorUserId: outsider.id })),
      ).toBe("23503");
    });
  });

  it("rejects an action without a table prefix (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const { row } = await rateChange(tx);
      const error = await pgError(
        tx.insert(auditLog).values({ ...row, action: "update" }),
      );
      expect(error.code).toBe("23514");
      expect(error.message).toContain("audit_log_action_format");
    });
  });

  it("rejects an action whose prefix is not entity_table (23514)", async () => {
    // 'pay_rate.update' passes the format check; only the prefix check refuses it.
    await rolledBack(db, async (tx) => {
      const { row } = await rateChange(tx);
      const error = await pgError(
        tx.insert(auditLog).values({ ...row, action: "pay_rate.update" }),
      );
      expect(error.code).toBe("23514");
      expect(error.message).toContain("audit_log_action_prefix");
    });
  });

  it("rejects a row with neither snapshot (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const { row } = await rateChange(tx);
      const error = await pgError(
        tx.insert(auditLog).values({ ...row, before: null, after: null }),
      );
      expect(error.code).toBe("23514");
      expect(error.message).toContain("audit_log_snapshot_present");
    });
  });
});
