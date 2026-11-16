// The reading that decides whether a migration may reach staging with nobody looking
// (ARCHITECTURE, 2026-11-16, migration gate). No database: it reads text.
import { describe, expect, it } from "vitest";

import { readMigration } from "../../src/promotion/reading";

describe("readMigration", () => {
  it("passes an additive migration", () => {
    expect(
      readMigration(
        `CREATE TABLE "a" ("id" uuid PRIMARY KEY, "n" integer NOT NULL);--> statement-breakpoint
         ALTER TABLE "a" ADD COLUMN "m" integer NOT NULL DEFAULT 0;--> statement-breakpoint
         ALTER TABLE "a" ADD COLUMN "o" text;--> statement-breakpoint
         CREATE INDEX "a_n" ON "a" ("n");--> statement-breakpoint
         GRANT SELECT, INSERT ON a TO trader_app;`,
      ),
    ).toEqual([]);
  });

  it.each([
    ["drop", `DROP TABLE "a";`],
    ["drop", `ALTER TABLE "a" DROP COLUMN "n";`],
    ["drop", `ALTER TABLE "a" DROP CONSTRAINT "a_unique";`],
    ["drop", `DROP TRIGGER a_guard ON a;`],
    ["drop", `DROP POLICY a_tenant ON a;`],
    ["truncate", `TRUNCATE "a";`],
    ["truncate", `DO $$ BEGIN TRUNCATE a; END $$;`],
    ["delete", `DELETE FROM "a" WHERE n = 1;`],
    ["update_without_where", `UPDATE "a" SET n = 0;`],
    ["revoke", `REVOKE UPDATE ON a FROM trader_app;`],
    ["role_change", `ALTER ROLE trader_app BYPASSRLS;`],
    ["role_change", `CREATE ROLE other LOGIN;`],
    ["row_security_weakened", `ALTER TABLE a DISABLE ROW LEVEL SECURITY;`],
    ["row_security_weakened", `ALTER TABLE a NO FORCE ROW LEVEL SECURITY;`],
    ["enum_value_added", `ALTER TYPE "public"."reason" ADD VALUE 'late';`],
    ["not_null_without_default", `ALTER TABLE "a" ADD COLUMN "m" integer NOT NULL;`],
    ["set_not_null", `ALTER TABLE "a" ALTER COLUMN "n" SET NOT NULL;`],
    ["column_type_changed", `ALTER TABLE "a" ALTER COLUMN "n" SET DATA TYPE bigint;`],
    ["rename", `ALTER TABLE "a" RENAME COLUMN "n" TO "m";`],
  ])("flags %s in %s", (flag, sql) => {
    expect(readMigration(sql)).toContain(flag);
  });

  it("does not flag what only looks like one", () => {
    expect(
      readMigration(
        `-- the writers drop the override first, then DELETE FROM it
         /* TRUNCATE a; */
         ALTER TABLE "a" ALTER COLUMN "n" DROP NOT NULL;--> statement-breakpoint
         ALTER TABLE "a" ALTER COLUMN "n" DROP DEFAULT;--> statement-breakpoint
         CREATE TRIGGER a_no_truncate BEFORE TRUNCATE ON a
           FOR EACH STATEMENT EXECUTE FUNCTION refuse();--> statement-breakpoint
         CREATE TRIGGER a_guard BEFORE UPDATE OR DELETE ON a
           FOR EACH ROW EXECUTE FUNCTION refuse();--> statement-breakpoint
         ALTER TABLE "b" ADD CONSTRAINT "b_a" FOREIGN KEY ("a_id") REFERENCES "a"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
         UPDATE "a" SET n = 0 WHERE id = '00000000-0000-7000-8000-000000000000';--> statement-breakpoint
         INSERT INTO a (note) VALUES ('DROP TABLE a; REVOKE ALL');--> statement-breakpoint
         INSERT INTO a (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET n = 1;`,
      ),
    ).toEqual([]);
  });

  it("does not read a function's body, which runs when called", () => {
    expect(
      readMigration(
        `CREATE OR REPLACE FUNCTION sweep() RETURNS void LANGUAGE plpgsql AS $$
         BEGIN DELETE FROM a; TRUNCATE b; END $$;`,
      ),
    ).toEqual([]);
  });

  it("reads a DO block, which runs at once", () => {
    expect(readMigration(`DO $$ BEGIN DELETE FROM a; END $$;`)).toEqual(["delete"]);
  });

  it("answers each flag once, sorted", () => {
    expect(
      readMigration(`REVOKE ALL ON a FROM x;--> statement-breakpoint
        DROP TABLE a;--> statement-breakpoint
        DROP TABLE b;`),
    ).toEqual(["drop", "revoke"]);
  });
});
