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
  companies: ["SELECT", "UPDATE"],
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
