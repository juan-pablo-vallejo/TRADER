// Stage 2 line 8: the seed, run as CI runs everything here — as the owner, in rolled-back
// transactions (helpers.ts), so it leaves no rows for other tests. The tests assume no
// committed rows in SEED.companyId beyond the seed's own; CI never has any.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { invoiceCounters, users } from "../../src/schema";
import { SEED, seed, type SeedCompany } from "../../src/seed";
import { asApp, one, rolledBack, type Tx } from "../helpers";

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

const counter = async (tx: Tx) =>
  one(
    await tx
      .select({
        next: invoiceCounters.nextInvoiceNumber,
        nextMemo: invoiceCounters.nextCreditMemoNumber,
      })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.companyId, SEED.companyId)),
  );

const admin = async (tx: Tx) =>
  one(
    await tx
      .select({
        role: users.role,
        identitySubject: users.identitySubject,
        email: users.email,
      })
      .from(users)
      .where(eq(users.companyId, SEED.companyId)),
  );

describe("seed", () => {
  it("creates one company, its counter at 1 and 1, and one admin; a re-run adds nothing", async () => {
    await rolledBack(db, async (tx) => {
      const first = await seed(tx);
      const second = await seed(tx);
      expect(first).toEqual({
        currentUser: expect.any(String),
        companies: 1,
        invoiceCounters: 1,
        users: 1,
      });
      expect(second).toEqual(first);
      expect(await counter(tx)).toEqual({ next: 1, nextMemo: 1 });
      expect(await admin(tx)).toEqual({
        role: "admin",
        identitySubject: null,
        email: SEED.adminEmail,
      });
    });
  });

  it("never rewinds the counter and restores the admin's role on a re-run", async () => {
    await rolledBack(db, async (tx) => {
      await seed(tx);
      await tx
        .update(invoiceCounters)
        .set({ nextInvoiceNumber: 1043, nextCreditMemoNumber: 8 })
        .where(eq(invoiceCounters.companyId, SEED.companyId));
      await tx
        .update(users)
        .set({ role: "worker" })
        .where(eq(users.companyId, SEED.companyId));
      await seed(tx);
      expect(await counter(tx)).toEqual({ next: 1043, nextMemo: 8 });
      expect((await admin(tx)).role).toBe("admin");
    });
  });

  it("bootstraps a second company without touching the first", async () => {
    const other: SeedCompany = {
      companyId: "019a4a00-0000-7000-8000-0000000000ff",
      companyName: "Second Co",
      timezone: "America/Chicago",
      adminEmail: "owner@second.test",
      adminName: "Owner",
    };
    await rolledBack(db, async (tx) => {
      const first = await seed(tx);
      const second = await seed(tx, other);
      expect(second).toEqual({ ...first, currentUser: first.currentUser });
      expect(await seed(tx)).toEqual(first);
      expect(await counter(tx)).toEqual({ next: 1, nextMemo: 1 });
      expect(await admin(tx)).toEqual({
        role: "admin",
        identitySubject: null,
        email: SEED.adminEmail,
      });
      const rows = await tx
        .select({ email: users.email, role: users.role })
        .from(users)
        .where(eq(users.companyId, other.companyId));
      expect(rows).toEqual([{ email: other.adminEmail, role: "admin" }]);
    });
  });

  it("refuses trader_app before any write", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await expect(seed(tx)).rejects.toThrow(
        "refusing to seed as trader_app: the role has neither rolsuper nor rolbypassrls",
      );
    });
  });
});
