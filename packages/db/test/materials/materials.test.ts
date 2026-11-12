// Stage 2 line 5: materials, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { companies, materials } from "../../src/schema";
import { company, fixture, one, rolledBack, sqlstate, type Tx, uuidv7 } from "../helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;

// A complete receipt as the push handler will write it: no cost yet.
const material = (refs: Refs): typeof materials.$inferInsert => ({
  id: uuidv7(),
  companyId: refs.companyId,
  jobId: refs.jobId,
  loggedByUserId: refs.workerId,
  description: "Eggshell, white",
  quantity: "2.500",
  unit: "gal",
  loggedAt: new Date(),
  capturedOffline: false,
  clockSkewed: false,
  clockSkewMs: 0,
  enteredByOffice: false,
});

// A statement expected to fail, in its own savepoint so the test can go on.
const rejected = (tx: Tx, values: typeof materials.$inferInsert) =>
  sqlstate(tx.transaction((sp) => sp.insert(materials).values(values)));

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("materials", () => {
  it("accepts a receipt without cost, then the office prices it", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const row = one(
        await tx.insert(materials).values(material(refs)).returning({ id: materials.id }),
      );
      const priced = one(
        await tx
          .update(materials)
          .set({ costCents: 8999, currency: "USD" })
          .where(eq(materials.id, row.id))
          .returning({ costCents: materials.costCents, currency: materials.currency }),
      );
      expect(row.id).toBeTruthy();
      expect(priced).toEqual({ costCents: 8999, currency: "USD" });
    });
  });

  it("rejects an id that is not version 7", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const code = await sqlstate(
        tx.insert(materials).values({ ...material(refs), id: crypto.randomUUID() }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a job of another company", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const other = one(
        await tx
          .insert(companies)
          .values({ ...company, name: "Other Co" })
          .returning({ id: companies.id }),
      );
      const code = await sqlstate(
        tx.insert(materials).values({ ...material(refs), companyId: other.id }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects a blank description and a blank unit", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      expect(await rejected(tx, { ...material(refs), description: " " })).toBe("23514");
      expect(await rejected(tx, { ...material(refs), unit: "" })).toBe("23514");
    });
  });

  it("rejects a quantity of zero", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const code = await sqlstate(
        tx.insert(materials).values({ ...material(refs), quantity: "0" }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a cost without its currency, and the reverse", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      expect(await rejected(tx, { ...material(refs), costCents: 100 })).toBe("23514");
      expect(await rejected(tx, { ...material(refs), currency: "USD" })).toBe("23514");
    });
  });

  it("stores an office entry's provenance and refuses a receipt that states none", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const row = one(
        await tx
          .insert(materials)
          .values({ ...material(refs), enteredByOffice: true })
          .returning({ enteredByOffice: materials.enteredByOffice }),
      );
      expect(row.enteredByOffice).toBe(true);
      // 0033 leaves no default behind: a writer that names no provenance is refused.
      const code = await sqlstate(
        tx.transaction((sp) =>
          sp.execute(sql`
            insert into materials (id, company_id, job_id, logged_by_user_id, description,
              quantity, unit, logged_at, captured_offline, clock_skewed, clock_skew_ms)
            values (${uuidv7()}, ${refs.companyId}, ${refs.jobId}, ${refs.workerId}, 'x',
              1, 'ea', now(), false, false, 0)
          `),
        ),
      );
      expect(code).toBe("23502");
    });
  });

  it("rejects an office entry that claims device evidence", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const office = { ...material(refs), enteredByOffice: true };
      expect(await rejected(tx, { ...office, capturedOffline: true })).toBe("23514");
      expect(await rejected(tx, { ...office, clockSkewed: true })).toBe("23514");
      expect(await rejected(tx, { ...office, clockSkewMs: 1 })).toBe("23514");
    });
  });

  it("rejects a negative cost and a lower-case currency", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      expect(
        await rejected(tx, { ...material(refs), costCents: -1, currency: "USD" }),
      ).toBe("23514");
      expect(
        await rejected(tx, { ...material(refs), costCents: 1, currency: "usd" }),
      ).toBe("23514");
    });
  });
});
