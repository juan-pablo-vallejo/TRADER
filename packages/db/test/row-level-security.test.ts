// Stage 2 line 7: row-level security on every tenant table (ARCHITECTURE invariant 4),
// asserted against the migrated container. Rolled-back transactions throughout; see
// helpers.ts. Fixtures are written as the owner, which bypasses RLS; every assertion after
// asApp() runs as trader_app, the role the policies name.
import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import {
  approvals,
  auditLog,
  creditMemos,
  crewMembers,
  crews,
  customers,
  dayCloseoutMaterials,
  dayCloseouts,
  dayCloseoutWorkers,
  invoiceLineItems,
  invoices,
  materialCorrections,
  materials,
  payPeriods,
  payRates,
  photos,
  workSessionEvents,
} from "../src/schema";
import {
  asApp,
  billing,
  company,
  type Billing,
  draftInvoice,
  issue,
  one,
  pgError,
  rolledBack,
  started,
  uuidv7,
  type Tx,
} from "./helpers";

// The tables that carry company_id, as 0014, 0017 and 0020 list them; companies is checked on its own id.
const TENANT_TABLES = [
  "approvals",
  "audit_log",
  "credit_memos",
  "crew_members",
  "crews",
  "customers",
  "day_closeout_materials",
  "day_closeout_workers",
  "day_closeouts",
  "invoice_counters",
  "invoice_line_items",
  "invoices",
  "jobs",
  "material_corrections",
  "materials",
  "pay_periods",
  "pay_rates",
  "photos",
  "users",
  "work_session_events",
];
const ALL_TABLES = [...TENANT_TABLES, "companies"].sort();

// The column a table's policy compares with the tenant.
const tenantColumn = (table: string) => (table === "companies" ? "id" : "company_id");

// The trigger (0010) assigns the number; the column is NOT NULL, so the insert says NULL.
type MemoInsert = Omit<typeof creditMemos.$inferInsert, "number"> & { number: SQL };

const memo = (refs: Billing, invoiceId: string): MemoInsert => ({
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  number: sql`NULL`,
  amountCents: 500,
  reason: "Touch-up not completed",
  issuedByUserId: refs.adminId,
});

// One row in every tenant table for a new company, written as the owner.
async function everything(tx: Tx, name: string) {
  const refs = await billing(tx, { ...company, name });
  const crew = one(
    await tx
      .insert(crews)
      .values({ companyId: refs.companyId, name: "Crew", foremanUserId: refs.workerId })
      .returning({ id: crews.id }),
  );
  await tx
    .insert(crewMembers)
    .values({ companyId: refs.companyId, crewId: crew.id, userId: refs.workerId });
  await tx.insert(payRates).values({
    companyId: refs.companyId,
    userId: refs.workerId,
    effectiveFrom: "2026-10-19",
    hourlyRateCents: 2500,
    currency: "USD",
  });
  await tx.insert(payPeriods).values({
    companyId: refs.companyId,
    startsOn: "2026-10-19",
    endsOn: "2026-11-01",
  });
  const event = started(refs);
  await tx.insert(workSessionEvents).values(event);
  await tx
    .insert(approvals)
    .values({ companyId: refs.companyId, eventId: event.id!, reasons: ["offline"] });
  const materialId = uuidv7();
  await tx.insert(materials).values({
    id: materialId,
    companyId: refs.companyId,
    jobId: refs.jobId,
    loggedByUserId: refs.workerId,
    description: "Eggshell, white",
    quantity: "2.000",
    unit: "gal",
    loggedAt: new Date(),
  });
  const photoId = uuidv7();
  await tx.insert(photos).values({
    id: photoId,
    companyId: refs.companyId,
    jobId: refs.jobId,
    materialId,
    takenByUserId: refs.workerId,
    takenAt: new Date(),
    objectKey: `${refs.companyId}/photos/${photoId}`,
    contentType: "image/jpeg",
    byteSize: 1_843_201,
    sha256: "a".repeat(64),
  });
  const closeoutId = uuidv7();
  await tx.insert(dayCloseouts).values({
    id: closeoutId,
    companyId: refs.companyId,
    jobId: refs.jobId,
    workDate: "2026-10-19",
    timezone: "America/New_York",
    jobStatus: "open",
    jobStatusApplied: true,
    submittedByUserId: refs.workerId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 1,
    materialCount: 1,
  });
  await tx.insert(dayCloseoutWorkers).values({
    companyId: refs.companyId,
    closeoutId,
    workerId: refs.workerId,
    ledgerThrough: new Date(),
  });
  await tx.insert(dayCloseoutMaterials).values({
    companyId: refs.companyId,
    closeoutId,
    jobId: refs.jobId,
    materialId,
  });
  const correctionId = uuidv7();
  await tx.insert(materialCorrections).values({
    id: correctionId,
    companyId: refs.companyId,
    materialId,
    kind: "void",
    submittedByUserId: refs.workerId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
  });
  await tx.insert(approvals).values({
    companyId: refs.companyId,
    materialCorrectionId: correctionId,
    reasons: ["corrected"],
  });
  const { invoiceId } = await draftInvoice(tx, refs);
  await issue(tx, refs, invoiceId);
  await tx.insert(creditMemos).values(memo(refs, invoiceId));
  await tx.insert(auditLog).values({
    companyId: refs.companyId,
    action: "companies.export",
    entityTable: "companies",
    after: { format: "csv" },
  });
  return refs;
}

// Rows visible in `table`, and how many of them belong to `companyId`.
async function visible(tx: Tx, table: string, companyId: string) {
  const column = sql.identifier(tenantColumn(table));
  const { rows } = await tx.execute<{ total: number; mine: number }>(sql`
    select count(*)::int as total, count(*) filter (where ${column} = ${companyId})::int as mine
    from ${sql.identifier(table)}
  `);
  return one(rows);
}

async function totals(tx: Tx) {
  const counts: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    const { rows } = await tx.execute<{ total: number }>(
      sql`select count(*)::int as total from ${sql.identifier(table)}`,
    );
    counts[table] = one(rows).total;
  }
  return counts;
}

const zeros = Object.fromEntries(ALL_TABLES.map((t) => [t, 0]));

async function rowCount(tx: Tx, statement: SQL) {
  return (await tx.execute(statement)).rowCount;
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("row-level security", () => {
  it("is enabled and forced on companies and every table with company_id", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(sql`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and (c.relname = 'companies' or exists (
            select 1 from pg_attribute a
            where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped))
        order by c.relname
      `);
      expect(rows.map((r) => r.relname)).toEqual(ALL_TABLES);
      for (const row of rows) {
        expect(row, row.relname).toEqual({
          relname: row.relname,
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
      }
    });
  });

  it("gives every tenant table its <table>_tenant policy for trader_app", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{
        tablename: string;
        roles: string[];
        cmd: string;
        same: boolean;
      }>(sql`
        select tablename, roles::text[] as roles, cmd, qual = with_check as same
        from pg_policies
        where schemaname = 'public' and policyname = tablename || '_tenant'
        order by tablename
      `);
      expect(rows.map((r) => r.tablename)).toEqual(ALL_TABLES);
      for (const row of rows) {
        expect(row, row.tablename).toEqual({
          tablename: row.tablename,
          roles: ["trader_app"],
          cmd: "ALL",
          same: true,
        });
      }
    });
  });

  it("shows nothing when no tenant is set", async () => {
    await rolledBack(db, async (tx) => {
      await everything(tx, "Tenant A");
      await everything(tx, "Tenant B");
      await asApp(tx);
      expect(await totals(tx)).toEqual(zeros);
    });
  });

  it("shows nothing, and raises nothing, when the tenant is ''", async () => {
    await rolledBack(db, async (tx) => {
      await everything(tx, "Tenant A");
      await asApp(tx, "");
      expect(await totals(tx)).toEqual(zeros);
    });
  });

  it("shows only the tenant's rows in every table", async () => {
    await rolledBack(db, async (tx) => {
      const a = await everything(tx, "Tenant A");
      const b = await everything(tx, "Tenant B");
      for (const table of ALL_TABLES) {
        // As the owner, B's rows are there to be hidden.
        expect((await visible(tx, table, b.companyId)).mine, table).toBeGreaterThan(0);
      }
      await asApp(tx, a.companyId);
      for (const table of ALL_TABLES) {
        const { total, mine } = await visible(tx, table, a.companyId);
        expect(mine, table).toBeGreaterThan(0);
        expect(total, table).toBe(mine);
      }
    });
  });

  it("shows a company only its own companies row", async () => {
    await rolledBack(db, async (tx) => {
      const a = await everything(tx, "Tenant A");
      await everything(tx, "Tenant B");
      await asApp(tx, a.companyId);
      const { rows } = await tx.execute<{ id: string }>(sql`select id from companies`);
      expect(rows).toEqual([{ id: a.companyId }]);
    });
  });

  it("rejects inserting another tenant's row (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await everything(tx, "Tenant A");
      const b = await everything(tx, "Tenant B");
      await asApp(tx, a.companyId);
      const error = await pgError(
        tx.transaction((sp: Tx) =>
          sp.insert(customers).values({ companyId: b.companyId, name: "Stray" }),
        ),
      );
      expect(error.code).toBe("42501");
      expect(error.message).toContain('row-level security policy for table "customers"');
    });
  });

  it("rejects moving a row to another tenant (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await everything(tx, "Tenant A");
      const b = await everything(tx, "Tenant B");
      await asApp(tx, a.companyId);
      const error = await pgError(
        tx.transaction((sp: Tx) =>
          sp
            .update(customers)
            .set({ companyId: b.companyId })
            .where(eq(customers.companyId, a.companyId)),
        ),
      );
      expect(error.code).toBe("42501");
    });
  });

  it("updates and deletes none of another tenant's rows", async () => {
    await rolledBack(db, async (tx) => {
      const a = await everything(tx, "Tenant A");
      const b = await everything(tx, "Tenant B");
      await asApp(tx, a.companyId);
      expect(
        await rowCount(
          tx,
          sql`update customers set name = 'Taken' where company_id = ${b.companyId}`,
        ),
      ).toBe(0);
      expect(
        await rowCount(
          tx,
          sql`delete from crew_members where company_id = ${b.companyId}`,
        ),
      ).toBe(0);
      await tx.execute(sql`reset role`);
      const { rows } = await tx.execute<{ name: string }>(
        sql`select name from customers where company_id = ${b.companyId}`,
      );
      expect(rows).toEqual([{ name: "Customer" }]);
    });
  });

  it("numbers an invoice and a credit memo as trader_app", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await asApp(tx, refs.companyId);
      expect((await issue(tx, refs, invoiceId)).number).toBe(1042);
      const credit = one(
        await tx
          .insert(creditMemos)
          .values(memo(refs, invoiceId))
          .returning({ number: creditMemos.number }),
      );
      expect(credit.number).toBe(7);
    });
  });

  it("deletes a draft and its lines as trader_app", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await asApp(tx, refs.companyId);
      await tx.delete(invoices).where(eq(invoices.id, invoiceId));
      await tx.execute(sql`reset role`);
      expect(
        await tx
          .select()
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, invoiceId)),
      ).toEqual([]);
    });
  });
});
