// Stage 2 line 7: the startup guard (ARCHITECTURE invariant 5), asserted against the migrated
// container. Rolled-back transactions throughout; see helpers.ts. Each refusal removes one
// condition inside the transaction, so nothing outlives the test.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { assertRuntimeRole } from "../src/guard";
import { asApp, rolledBack } from "./helpers";

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("assertRuntimeRole", () => {
  it("refuses the owner, a superuser, and names it", async () => {
    const { rows } = await db.execute<{ me: string }>(sql`select current_user as me`);
    await expect(assertRuntimeRole(db)).rejects.toThrow(
      `refusing to run as ${rows[0]!.me}: superuser`,
    );
  });

  it("refuses a role with BYPASSRLS", async () => {
    await rolledBack(db, async (tx) => {
      await tx.execute(sql`create role trader_guard_probe nologin bypassrls`);
      await tx.execute(sql`set local role trader_guard_probe`);
      await expect(assertRuntimeRole(tx)).rejects.toThrow(
        "refusing to run as trader_guard_probe: bypasses row-level security",
      );
    });
  });

  it("refuses when a tenant table is not forced, and names it", async () => {
    await rolledBack(db, async (tx) => {
      await tx.execute(sql`alter table jobs no force row level security`);
      await asApp(tx);
      await expect(assertRuntimeRole(tx)).rejects.toThrow(
        "refusing to run as trader_app: tables without forced RLS: jobs",
      );
    });
  });

  it("passes as trader_app on the migrated schema", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await expect(assertRuntimeRole(tx)).resolves.toBeUndefined();
    });
  });
});
