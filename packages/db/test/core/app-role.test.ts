// Stage 2 line 7: the runtime role and its grants (ARCHITECTURE invariant 5), asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog is
// read as the owner; the refusals run as trader_app by SET LOCAL ROLE.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { asApp, one, rolledBack, sqlstate, type Tx } from "../helpers";

type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE";
const PRIVILEGES: Privilege[] = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"];

// What 0013 grants, table by table, and 0017 for the closeout tables. Every table in public
// must appear here: a table added without stated grants fails the matrix test.
const GRANTS: Record<string, Privilege[]> = {
  // UPDATE is held on three columns only, never on the table (0041): its own test, below.
  companies: ["SELECT"],
  invoice_counters: ["SELECT", "UPDATE"],
  users: ["SELECT", "INSERT", "UPDATE"],
  crews: ["SELECT", "INSERT", "UPDATE"],
  customers: ["SELECT", "INSERT", "UPDATE"],
  jobs: ["SELECT", "INSERT", "UPDATE"],
  // Insert-only (ARCHITECTURE, roster API): a rate is superseded by a later row. 0027 revoked
  // the UPDATE that 0013 granted with the roster tables.
  pay_rates: ["SELECT", "INSERT"],
  pay_periods: ["SELECT", "INSERT", "UPDATE"],
  approvals: ["SELECT", "INSERT", "UPDATE"],
  materials: ["SELECT", "INSERT", "UPDATE"],
  photos: ["SELECT", "INSERT", "UPDATE"],
  crew_members: ["SELECT", "INSERT", "DELETE"],
  invoices: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  invoice_line_items: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  work_session_events: ["SELECT", "INSERT"],
  credit_memos: ["SELECT", "INSERT"],
  audit_log: ["SELECT", "INSERT"],
  day_closeouts: ["SELECT", "INSERT"],
  day_closeout_workers: ["SELECT", "INSERT"],
  day_closeout_materials: ["SELECT", "INSERT"],
  material_corrections: ["SELECT", "INSERT"],
  // Short-lived (0029): the writer deletes its company's expired lines; never edited.
  sync_diagnostics: ["SELECT", "INSERT", "DELETE"],
  // A plan, not a fact (0031): the office edits and removes it.
  job_assignments: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  shift_overrides: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  shift_override_history: ["SELECT", "INSERT"],
  // What a close exported (0035): added by the closing transaction, never edited or removed.
  pay_period_lines: ["SELECT", "INSERT"],
};

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("trader_app", () => {
  it("logs in, inherits nothing and bypasses nothing", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
      }>(sql`
        select rolcanlogin, rolsuper, rolbypassrls, rolinherit
        from pg_roles where rolname = 'trader_app'
      `);
      expect(one(rows)).toEqual({
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolinherit: false,
      });
    });
  });

  it("holds exactly the stated privileges on every table in public", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ tablename: string }>(sql`
        select tablename from pg_tables where schemaname = 'public' order by tablename
      `);
      expect(rows.length).toBeGreaterThan(0);
      for (const { tablename } of rows) {
        const granted = GRANTS[tablename];
        expect(granted, `${tablename} has no entry in GRANTS`).toBeDefined();
        for (const privilege of PRIVILEGES) {
          const held = one(
            (
              await tx.execute<{ held: boolean }>(
                sql`select has_table_privilege('trader_app', ${tablename}, ${privilege}) as held`,
              )
            ).rows,
          ).held;
          expect(held, `${tablename} ${privilege}`).toBe(granted!.includes(privilege));
        }
      }
    });
  });

  it("may update a company's name and zone and never its enforcement switch (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ column_name: string }>(sql`
        select column_name from information_schema.column_privileges
        where grantee = 'trader_app' and table_schema = 'public'
          and table_name = 'companies' and privilege_type = 'UPDATE'
        order by column_name
      `);
      expect(rows.map((r) => r.column_name)).toEqual(["name", "timezone", "updated_at"]);
      const company = one(
        (
          await tx.execute<{ id: string }>(sql`
            insert into companies (name, timezone) values ('Switch Co', 'America/New_York')
            returning id
          `)
        ).rows,
      ).id;
      await asApp(tx, company);
      const renamed = await tx.execute(sql`update companies set name = 'Switch Co 2'`);
      expect(renamed.rowCount).toBe(1);
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.execute(sql`update companies set schedule_enforced = true`),
          ),
        ),
      ).toBe("42501");
      await tx.execute(sql`reset role`);
      const after = await tx.execute<{ schedule_enforced: boolean }>(
        sql`select schedule_enforced from companies where id = ${company}`,
      );
      expect(after.rows).toEqual([{ schedule_enforced: false }]);
    });
  });

  it("is refused UPDATE on the ledger by privilege, before the trigger (42501)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.execute(sql`update work_session_events set schema_version = 2`),
          ),
        ),
      ).toBe("42501");
    });
  });

  it("is refused TRUNCATE everywhere (42501)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(
        await sqlstate(tx.transaction((sp: Tx) => sp.execute(sql`truncate jobs`))),
      ).toBe("42501");
    });
  });
});
