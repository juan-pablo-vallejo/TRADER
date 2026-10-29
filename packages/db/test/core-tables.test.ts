// Stage 2 line 2: the six core tables, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { companies, crews, customers, jobs, users } from "../src/schema";
import { company, one, rolledBack, sqlstate } from "./helpers";

const TENANT_TABLES = [
  "users",
  "crews",
  "crew_members",
  "customers",
  "jobs",
  "work_session_events",
  "pay_rates",
  "pay_periods",
  "approvals",
];

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("core tables", () => {
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
      for (const table of TENANT_TABLES.filter((t) => t !== "crew_members")) {
        const pair = rows.find(
          (r) => r.table_name === table && r.columns.join(",") === "company_id,id",
        );
        expect(pair, `${table} has no unique (company_id, id)`).toBeDefined();
      }
    });
  });

  it("rejects a job whose crew belongs to another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const b = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const foreman = one(
        await tx
          .insert(users)
          .values({ companyId: b.id, email: "f@b.test", name: "Foreman B" })
          .returning({ id: users.id }),
      );
      const crewB = one(
        await tx
          .insert(crews)
          .values({ companyId: b.id, name: "Crew B", foremanUserId: foreman.id })
          .returning({ id: crews.id }),
      );
      const customerA = one(
        await tx
          .insert(customers)
          .values({ companyId: a.id, name: "Customer A" })
          .returning({ id: customers.id }),
      );
      const code = await sqlstate(
        tx.insert(jobs).values({
          companyId: a.id,
          customerId: customerA.id,
          crewId: crewB.id,
          name: "Job",
        }),
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

  it("rejects a crew without a foreman", async () => {
    await rolledBack(db, async (tx) => {
      const c = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      // Raw SQL: the Drizzle insert type already refuses to omit a NOT NULL column.
      const code = await sqlstate(
        tx.execute(sql`insert into crews (company_id, name) values (${c.id}, 'Crew')`),
      );
      expect(code).toBe("23502");
    });
  });
});
