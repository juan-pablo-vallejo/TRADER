// Stage 2 line 4: the pay calendar, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The closed-period rules are triggers from
// migration 0004, so the mutations here go through Drizzle like the office's will.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { companies, payPeriods, payRates, users } from "../src/schema";
import { company, one, pgError, rolledBack, sqlstate, type Tx } from "./helpers";

// One company and one admin, the rows a rate or a close must reference.
async function fixture(tx: Tx) {
  const c = one(
    await tx.insert(companies).values(company).returning({ id: companies.id }),
  );
  const admin = one(
    await tx
      .insert(users)
      .values({ companyId: c.id, email: "a@co.test", name: "Admin", role: "admin" })
      .returning({ id: users.id }),
  );
  return { companyId: c.id, adminId: admin.id };
}

const rate = (companyId: string, userId: string, effectiveFrom: string) => ({
  companyId,
  userId,
  effectiveFrom,
  hourlyRateCents: 2500,
  currency: "USD",
});

const period = (companyId: string, startsOn: string, endsOn: string) => ({
  companyId,
  startsOn,
  endsOn,
});

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("pay_rates", () => {
  it("rejects two rates for one worker from the same day", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      await tx.insert(payRates).values(rate(companyId, adminId, "2026-10-05"));
      const code = await sqlstate(
        tx.insert(payRates).values({
          ...rate(companyId, adminId, "2026-10-05"),
          hourlyRateCents: 2600,
        }),
      );
      expect(code).toBe("23505");
    });
  });

  it("rejects a negative hourly rate", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const code = await sqlstate(
        tx
          .insert(payRates)
          .values({ ...rate(companyId, adminId, "2026-10-05"), hourlyRateCents: -1 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a currency that is not three upper-case letters", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const code = await sqlstate(
        tx
          .insert(payRates)
          .values({ ...rate(companyId, adminId, "2026-10-05"), currency: "usd" }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a rate for a worker of another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const code = await sqlstate(
        tx.insert(payRates).values(rate(a.companyId, b.adminId, "2026-10-05")),
      );
      expect(code).toBe("23503");
    });
  });
});

describe("pay_periods", () => {
  it("rejects two periods of one company that share a day", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId } = await fixture(tx);
      await tx.insert(payPeriods).values(period(companyId, "2026-10-05", "2026-10-11"));
      // Inclusive bounds: the 11th belongs to both.
      const code = await sqlstate(
        tx.insert(payPeriods).values(period(companyId, "2026-10-11", "2026-10-17")),
      );
      expect(code).toBe("23P01");
    });
  });

  it("accepts the same dates in another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      await tx.insert(payPeriods).values(period(a.companyId, "2026-10-05", "2026-10-11"));
      await tx.insert(payPeriods).values(period(b.companyId, "2026-10-05", "2026-10-11"));
      expect(await tx.select().from(payPeriods)).toHaveLength(2);
    });
  });

  it("rejects a period that ends before it starts", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId } = await fixture(tx);
      const code = await sqlstate(
        tx.insert(payPeriods).values(period(companyId, "2026-10-11", "2026-10-05")),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects closed_at without closed_by_user_id", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId } = await fixture(tx);
      const code = await sqlstate(
        tx.insert(payPeriods).values({
          ...period(companyId, "2026-10-05", "2026-10-11"),
          closedAt: new Date(),
        }),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses UPDATE of a closed period and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const closed = one(
        await tx
          .insert(payPeriods)
          .values({
            ...period(companyId, "2026-10-05", "2026-10-11"),
            closedAt: new Date(),
            closedByUserId: adminId,
          })
          .returning({ id: payPeriods.id }),
      );
      const error = await pgError(
        tx.transaction((sp) =>
          sp
            .update(payPeriods)
            .set({ endsOn: "2026-10-12" })
            .where(eq(payPeriods.id, closed.id)),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods row is frozen once closed_at is set: UPDATE rejected",
      );
      const row = one(await tx.select().from(payPeriods));
      expect(row.endsOn).toBe("2026-10-11");
    });
  });

  it("refuses DELETE of a closed period", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      await tx.insert(payPeriods).values({
        ...period(companyId, "2026-10-05", "2026-10-11"),
        closedAt: new Date(),
        closedByUserId: adminId,
      });
      const error = await pgError(
        tx.transaction((sp) => sp.execute(sql`delete from pay_periods`)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods row is frozen once closed_at is set: DELETE rejected",
      );
      expect(await tx.select().from(payPeriods)).toHaveLength(1);
    });
  });

  it("refuses closing a period while an earlier one is open", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      await tx.insert(payPeriods).values(period(companyId, "2026-10-05", "2026-10-11"));
      const later = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-12", "2026-10-18"))
          .returning({ id: payPeriods.id }),
      );
      const error = await pgError(
        tx
          .update(payPeriods)
          .set({ closedAt: new Date(), closedByUserId: adminId })
          .where(eq(payPeriods.id, later.id)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods close in order: an earlier period is still open",
      );
    });
  });

  it("refuses closing and moving the bounds in one statement", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      const error = await pgError(
        tx
          .update(payPeriods)
          .set({ endsOn: "2026-10-12", closedAt: new Date(), closedByUserId: adminId })
          .where(eq(payPeriods.id, open.id)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods: close the period as it stands; move its bounds first",
      );
    });
  });

  it("moves an open period's bounds, then closes it", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      await tx
        .update(payPeriods)
        .set({ endsOn: "2026-10-12" })
        .where(eq(payPeriods.id, open.id));
      await tx
        .update(payPeriods)
        .set({ closedAt: new Date(), closedByUserId: adminId })
        .where(eq(payPeriods.id, open.id));
      const row = one(await tx.select().from(payPeriods));
      expect(row.endsOn).toBe("2026-10-12");
      expect(row.closedAt).not.toBeNull();
      expect(row.closedByUserId).toBe(adminId);
    });
  });
});
