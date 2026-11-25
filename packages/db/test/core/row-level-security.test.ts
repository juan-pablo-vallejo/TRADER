// Row-level security on every tenant table (invariant 5),
// asserted against the migrated container. Rolled-back transactions throughout; see
// helpers.ts. Fixtures are written as the owner, which bypasses RLS; every assertion after
// asApp() runs as trader_app, the role the policies name.
import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import {
  customers,
  addressChanges,
  invitationSends,
  invoiceLineItems,
  invoicePayments,
  invoiceSends,
  invoices,
  shifts,
  entries,
} from "../../src/schema";
import {
  asApp,
  billing,
  company,
  draftInvoice,
  issue,
  one,
  pgError,
  rolledBack,
  started,
  uuidv7,
  type Tx,
} from "../helpers";

// The tables that carry company_id; companies is checked on its own id.
const TENANT_TABLES = [
  "address_changes",
  "customers",
  "invitation_sends",
  "invoice_counters",
  "invoice_line_items",
  "invoice_payments",
  "invoice_sends",
  "invoices",
  "shifts",
  "jobs",
  "users",
  "entries",
];
const ALL_TABLES = [...TENANT_TABLES, "companies"].sort();

// Every policy in public: one per table for the tenant, and the four of the first sign-in.
const POLICIES = [
  ...ALL_TABLES.map((table) => `${table}_tenant`),
  "users_identity_bind",
  "users_identity_bind_phone",
  "users_identity_select",
  "users_identity_select_phone",
].sort();

// The column a table's policy compares with the tenant.
const tenantColumn = (table: string) => (table === "companies" ? "id" : "company_id");

// One row in every tenant table for a new company, written as the owner.
async function everything(tx: Tx, name: string) {
  const refs = await billing(tx, { ...company, name });
  await tx.insert(entries).values(started(refs));
  const { invoiceId } = await draftInvoice(tx, refs);
  await issue(tx, refs, invoiceId);
  await tx.insert(invoicePayments).values({
    id: uuidv7(),
    companyId: refs.companyId,
    invoiceId,
    currency: "USD",
    amountCents: 100,
    paidOn: "2026-11-02",
    method: "check",
    recordedByUserId: refs.adminId,
  });
  await tx.insert(invoiceSends).values({
    id: uuidv7(),
    companyId: refs.companyId,
    invoiceId,
    recipient: "billing@customer.test",
    outcome: "sent",
    sentByUserId: refs.adminId,
  });
  await tx.insert(addressChanges).values({
    companyId: refs.companyId,
    userId: refs.workerId,
    field: "email",
    newValue: "worker@crew.test",
    changedByUserId: refs.adminId,
  });
  await tx.insert(invitationSends).values({
    id: uuidv7(),
    companyId: refs.companyId,
    userId: refs.workerId,
    channel: "email",
    recipient: "worker@crew.test",
    outcome: "sent",
    sentByUserId: refs.adminId,
  });
  await tx.insert(shifts).values({
    companyId: refs.companyId,
    userId: refs.workerId,
    jobId: refs.jobId,
    workDate: "2026-11-16",
    expectedStart: "07:00",
    expectedEnd: "15:30",
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
  it("is enabled and forced on every table in public", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ relname: string }>(sql`
        select c.relname::text from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and c.relrowsecurity and c.relforcerowsecurity
        order by c.relname
      `);
      expect(rows.map((r) => r.relname)).toEqual(ALL_TABLES);
      const all = await tx.execute<{ count: string }>(
        sql`select count(*) from pg_tables where schemaname = 'public'`,
      );
      expect(Number(one(all.rows).count)).toBe(ALL_TABLES.length);
    });
  });

  it("holds exactly the thirteen tenant policies and the four sign-in policies", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ policyname: string; roles: string[] }>(sql`
        select policyname::text, roles::text[] as roles from pg_policies
        where schemaname = 'public' order by policyname
      `);
      expect(rows.map((r) => r.policyname)).toEqual(POLICIES);
      expect(rows).toHaveLength(17);
      for (const row of rows) expect(row.roles, row.policyname).toEqual(["trader_app"]);
    });
  });

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
        await rowCount(tx, sql`delete from shifts where company_id = ${b.companyId}`),
      ).toBe(0);
      await tx.execute(sql`reset role`);
      const { rows } = await tx.execute<{ name: string }>(
        sql`select name from customers where company_id = ${b.companyId}`,
      );
      expect(rows).toEqual([{ name: "Customer" }]);
    });
  });

  it("numbers an invoice as trader_app", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await asApp(tx, refs.companyId);
      expect((await issue(tx, refs, invoiceId)).number).toBe(1042);
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
