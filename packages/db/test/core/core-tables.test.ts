// The tables and their triggers, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { companies, customers, jobs, users } from "../../src/schema";
import { company, one, rolledBack, sqlstate } from "../helpers";

// Every table in public. The inventory tests below hold the catalog to exactly this list.
const TABLES = [
  "companies",
  "customers",
  "invitation_sends",
  "invoice_counters",
  "invoice_line_items",
  "invoice_payments",
  "invoice_sends",
  "invoices",
  "job_assignments",
  "jobs",
  "users",
  "work_session_events",
];

const TENANT_TABLES = TABLES.filter((t) => t !== "companies");

// Every trigger a table in public carries, the ones Postgres makes for foreign keys aside.
const TRIGGERS = [
  "invitation_sends_no_delete",
  "invitation_sends_no_truncate",
  "invitation_sends_no_update",
  "invoice_line_items_check_mutation",
  "invoice_payments_check_insert",
  "invoice_payments_no_delete",
  "invoice_payments_no_truncate",
  "invoice_payments_no_update",
  "invoice_sends_check_insert",
  "invoice_sends_no_delete",
  "invoice_sends_no_truncate",
  "invoice_sends_no_update",
  "invoices_check_mutation",
  "job_assignments_check_insert",
  "job_assignments_check_mutation",
  "job_assignments_check_truncate",
  "users_identity_guard",
  "work_session_events_check_references",
  "work_session_events_no_delete",
  "work_session_events_no_truncate",
  "work_session_events_no_update",
];

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("core tables", () => {
  it("holds exactly twelve tables in public", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ count: string }>(
        sql`select count(*) from pg_tables where schemaname = 'public'`,
      );
      expect(Number(one(rows).count)).toBe(12);
    });
  });

  it("holds exactly the twelve named tables in public", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ tablename: string }>(sql`
        select tablename::text from pg_tables where schemaname = 'public' order by tablename
      `);
      expect(rows.map((r) => r.tablename)).toEqual(TABLES);
    });
  });

  it("carries exactly the twenty-one named triggers on the tables in public", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ tgname: string }>(sql`
        select t.tgname::text from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by t.tgname
      `);
      expect(rows.map((r) => r.tgname)).toEqual(TRIGGERS);
      expect(rows).toHaveLength(21);
    });
  });

  it("defaults an office-created id to a version 7 UUID from Postgres", async () => {
    await rolledBack(db, async (tx) => {
      const row = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      expect(row.id.charAt(14)).toBe("7");
    });
  });

  it("carries company_id NOT NULL on every tenant table", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ table_name: string; is_nullable: string }>(sql`
        select table_name, is_nullable from information_schema.columns
        where table_schema = 'public' and column_name = 'company_id'
      `);
      const nullable = new Map(rows.map((r) => [r.table_name, r.is_nullable]));
      expect([...nullable.keys()].sort()).toEqual(TENANT_TABLES);
      for (const table of TENANT_TABLES) expect(nullable.get(table), table).toBe("NO");
    });
  });

  it("carries a unique (company_id, id) on every tenant table with an id", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ table_name: string; columns: string[] }>(sql`
        select c.conrelid::regclass::text as table_name,
               array_agg(a.attname::text order by k.ord) as columns
        from pg_constraint c
        join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'u'
        group by c.oid, c.conrelid
      `);
      // invoice_counters has no id: its key is the company.
      for (const table of TENANT_TABLES.filter((t) => t !== "invoice_counters")) {
        const pair = rows.find(
          (r) => r.table_name === table && r.columns.join(",") === "company_id,id",
        );
        expect(pair, `${table} has no unique (company_id, id)`).toBeDefined();
      }
    });
  });

  it("rejects a job whose customer belongs to another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const b = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const customerB = one(
        await tx
          .insert(customers)
          .values({ companyId: b.id, name: "Customer B" })
          .returning({ id: customers.id }),
      );
      const code = await sqlstate(
        tx
          .insert(jobs)
          .values({ companyId: a.id, customerId: customerB.id, name: "Job" }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects a partial location and a blank name on jobs", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const customer = one(
        await tx
          .insert(customers)
          .values({ companyId: c.id, name: "Customer" })
          .returning({ id: customers.id }),
      );
      const job = { companyId: c.id, customerId: customer.id, name: "Job" };
      // Each failure aborts its own savepoint, so the outer transaction stays usable.
      const partial = await sqlstate(
        tx.transaction((sp) => sp.insert(jobs).values({ ...job, locationLat: 41.8 })),
      );
      expect(partial).toBe("23514");
      const blank = await sqlstate(
        tx.transaction((sp) => sp.insert(jobs).values({ ...job, name: "   " })),
      );
      expect(blank).toBe("23514");
    });
  });

  it("starts a new user as a worker", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const user = one(
        await tx
          .insert(users)
          .values({ companyId: c.id, email: "w@co.test", name: "Worker" })
          .returning({ role: users.role }),
      );
      expect(user.role).toBe("worker");
    });
  });

  it("rejects two users in one company whose emails differ only in case", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      await tx
        .insert(users)
        .values({ companyId: c.id, email: "Ana@Co.test", name: "Ana" });
      const code = await sqlstate(
        tx
          .insert(users)
          .values({ companyId: c.id, email: "ana@co.test", name: "Ana again" }),
      );
      expect(code).toBe("23505");
    });
  });

  it("rejects a repeated identity subject and accepts repeated null ones", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      await tx.insert(users).values([
        { companyId: c.id, email: "one@co.test", name: "Invited" },
        { companyId: c.id, email: "two@co.test", name: "Also invited" },
        {
          companyId: c.id,
          email: "three@co.test",
          name: "Signed in",
          identitySubject: "sub_1",
        },
      ]);
      const code = await sqlstate(
        tx.insert(users).values({
          companyId: c.id,
          email: "four@co.test",
          name: "Same login",
          identitySubject: "sub_1",
        }),
      );
      expect(code).toBe("23505");
    });
  });

  it.each(["4015550100", "+14015550100x", "+441632960100", "+11015550100", ""])(
    "rejects a sign-in number that is not a +1 E.164 number (%j)",
    async (signInPhone) => {
      await rolledBack(db, async (tx) => {
        const c = one(
          await tx.insert(companies).values(company).returning({ id: companies.id }),
        );
        const code = await sqlstate(
          tx
            .insert(users)
            .values({ companyId: c.id, email: "ana@co.test", name: "Ana", signInPhone }),
        );
        expect(code).toBe("23514");
      });
    },
  );

  it("rejects a user with neither an email nor a sign-in number, and accepts either alone", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      await tx.insert(users).values([
        { companyId: c.id, email: "office@co.test", name: "By email" },
        { companyId: c.id, signInPhone: "+14015550100", name: "By number" },
        { companyId: c.id, signInPhone: "+14015550101", name: "By number too" },
      ]);
      const code = await sqlstate(
        tx.insert(users).values({ companyId: c.id, name: "No address" }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects one sign-in number twice in a company and accepts it in two", async () => {
    await rolledBack(db, async (tx) => {
      const [a, b] = await tx
        .insert(companies)
        .values([company, { ...company, name: "Other Co" }])
        .returning({ id: companies.id });
      if (a === undefined || b === undefined) throw new Error("two companies expected");
      const signInPhone = "+14015550100";
      await tx.insert(users).values([
        { companyId: a.id, email: "ana@co.test", name: "Ana", signInPhone },
        { companyId: b.id, email: "ana@co.test", name: "Ana elsewhere", signInPhone },
        { companyId: a.id, email: "no-number@co.test", name: "No number" },
        { companyId: a.id, email: "none-either@co.test", name: "None either" },
      ]);
      const code = await sqlstate(
        tx
          .insert(users)
          .values({ companyId: a.id, email: "ben@co.test", name: "Ben", signInPhone }),
      );
      expect(code).toBe("23505");
    });
  });
});
