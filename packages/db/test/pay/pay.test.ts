// Stage 2 line 4: the pay calendar, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The closed-period rules are triggers from
// migrations 0004 and 0036, so the mutations here go through Drizzle like the office's will.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { companies, payPeriods, payRates, users } from "../../src/schema";
import { company, one, pgError, rolledBack, sqlstate, type Tx } from "../helpers";

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

// What a closing update sets (0036): the closer, the instant, and what was left unresolved.
const closing = (adminId: string) => ({
  closedAt: new Date(),
  closedByUserId: adminId,
  unresolvedPendingSessions: 0,
  unresolvedOpenSessions: 0,
});

// A period inserted open and then closed, as 0036 requires.
async function closedPeriod(
  tx: Tx,
  companyId: string,
  adminId: string,
  startsOn: string,
  endsOn: string,
) {
  const row = one(
    await tx
      .insert(payPeriods)
      .values(period(companyId, startsOn, endsOn))
      .returning({ id: payPeriods.id }),
  );
  await tx.update(payPeriods).set(closing(adminId)).where(eq(payPeriods.id, row.id));
  return row;
}

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
      const { companyId, adminId } = await fixture(tx);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      const code = await sqlstate(
        tx
          .update(payPeriods)
          .set({ ...closing(adminId), closedByUserId: null })
          .where(eq(payPeriods.id, open.id)),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses UPDATE of a closed period and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const closed = await closedPeriod(
        tx,
        companyId,
        adminId,
        "2026-10-05",
        "2026-10-11",
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
      await closedPeriod(tx, companyId, adminId, "2026-10-05", "2026-10-11");
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
        tx.update(payPeriods).set(closing(adminId)).where(eq(payPeriods.id, later.id)),
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
          .set({ endsOn: "2026-10-12", ...closing(adminId) })
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
      await tx.update(payPeriods).set(closing(adminId)).where(eq(payPeriods.id, open.id));
      const row = one(await tx.select().from(payPeriods));
      expect(row.endsOn).toBe("2026-10-12");
      expect(row.closedAt).not.toBeNull();
      expect(row.closedByUserId).toBe(adminId);
    });
  });

  it("refuses a period inserted already closed", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const error = await pgError(
        tx.insert(payPeriods).values({
          ...period(companyId, "2026-10-05", "2026-10-11"),
          ...closing(adminId),
        }),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods: a period is inserted open and closed by an update",
      );
    });
  });

  it("refuses a period inserted earlier than a closed one, and accepts a later one", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      await closedPeriod(tx, companyId, adminId, "2026-10-12", "2026-10-18");
      const error = await pgError(
        tx.transaction((sp) =>
          sp.insert(payPeriods).values(period(companyId, "2026-10-05", "2026-10-11")),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods: a period never lies earlier than a closed one",
      );
      await tx.insert(payPeriods).values(period(companyId, "2026-10-19", "2026-10-25"));
      expect(await tx.select().from(payPeriods)).toHaveLength(2);
    });
  });

  it("places a period against its own company's closed periods only", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      await closedPeriod(tx, a.companyId, a.adminId, "2026-10-12", "2026-10-18");
      await tx.insert(payPeriods).values(period(b.companyId, "2026-10-05", "2026-10-11"));
      expect(await tx.select().from(payPeriods)).toHaveLength(2);
    });
  });

  it("refuses moving an open period's bounds earlier than a closed one", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      await closedPeriod(tx, companyId, adminId, "2026-10-12", "2026-10-18");
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-19", "2026-10-25"))
          .returning({ id: payPeriods.id }),
      );
      const error = await pgError(
        tx
          .update(payPeriods)
          .set({ startsOn: "2026-10-01", endsOn: "2026-10-07" })
          .where(eq(payPeriods.id, open.id)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "pay_periods: a period never lies earlier than a closed one",
      );
    });
  });

  it("refuses a close that does not state what it left unresolved", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      for (const missing of ["unresolvedPendingSessions", "unresolvedOpenSessions"]) {
        const error = await pgError(
          tx.transaction((sp) =>
            sp
              .update(payPeriods)
              .set({ ...closing(adminId), [missing]: null })
              .where(eq(payPeriods.id, open.id)),
          ),
        );
        expect(error.code, missing).toBe("23000");
        expect(error.message, missing).toBe(
          "pay_periods: a close states how many sessions it left unresolved",
        );
      }
    });
  });

  it("refuses unresolved counts on an open period, and a negative one", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      expect(
        await sqlstate(
          tx.transaction((sp) =>
            sp
              .update(payPeriods)
              .set({ unresolvedPendingSessions: 2 })
              .where(eq(payPeriods.id, open.id)),
          ),
        ),
      ).toBe("23514");
      expect(
        await sqlstate(
          tx
            .update(payPeriods)
            .set({ ...closing(adminId), unresolvedOpenSessions: -1 })
            .where(eq(payPeriods.id, open.id)),
        ),
      ).toBe("23514");
    });
  });

  it("takes the company's pay-period lock when a period is placed or closed", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, adminId } = await fixture(tx);
      const held = async () => {
        const { rows } = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n from pg_locks
          where locktype = 'advisory' and pid = pg_backend_pid() and granted
            and ((classid::bigint << 32) | objid::bigint)
              = hashtextextended(${`pay-periods:${companyId}`}, 0)
        `);
        return one(rows).n;
      };
      expect(await held()).toBe(0);
      const open = one(
        await tx
          .insert(payPeriods)
          .values(period(companyId, "2026-10-05", "2026-10-11"))
          .returning({ id: payPeriods.id }),
      );
      expect(await held()).toBe(1);
      await tx.update(payPeriods).set(closing(adminId)).where(eq(payPeriods.id, open.id));
      expect(await held()).toBe(1);
    });
  });
});
