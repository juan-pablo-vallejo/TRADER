import { companies, jobs, users, workSessionEvents, type Db } from "@trader/db";
import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "./helpers";

/**
 * An isolated, empty copy of every table the sync path touches, rolled back after
 * each test.
 *
 * Extends the `withEmptyTenantTables` probe in `helpers.ts` for the same reason it
 * exists: `work_session_events` is append-only by trigger, so a suite cannot clean
 * up after itself by deleting rows. A throwaway schema in front of `public` on the
 * search path gives Drizzle's unqualified names an empty copy to resolve to.
 *
 * `LIKE ... INCLUDING ALL` deliberately does **not** copy triggers, which is what
 * lets the fixtures be torn down. The append-only guard itself is proven against
 * the real table in `packages/db/test/schema-invariants.test.ts`; duplicating that
 * here would only test the copy.
 */

export const TEST_COMPANY = "00000000-0000-7000-8000-0000000c0001";
export const TEST_WORKER = "00000000-0000-7000-8000-0000000ce001";
export const TEST_OTHER_WORKER = "00000000-0000-7000-8000-0000000ce002";
export const TEST_JOB_A = "00000000-0000-7000-8000-00000000b001";
export const TEST_JOB_B = "00000000-0000-7000-8000-00000000b002";

const TABLES = ["companies", "users", "jobs", "work_session_events"] as const;

export type SyncFixture = {
  db: Db;
  companyId: string;
  workerId: string;
  otherWorkerId: string;
  jobA: string;
  jobB: string;
};

export async function withSyncFixture<T>(fn: (f: SyncFixture) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA sync_probe");
    for (const table of TABLES) {
      await client.query(
        `CREATE TABLE sync_probe.${table} (LIKE public.${table} INCLUDING ALL)`,
      );
    }
    await client.query("SET LOCAL search_path TO sync_probe, public");

    await client.query(
      `INSERT INTO companies (id,name,timezone) VALUES ($1,'Sync Test Co','America/New_York')`,
      [TEST_COMPANY],
    );
    // Ids are supplied explicitly: `id` comes from Drizzle's `$defaultFn`, not a
    // database default, so raw SQL inserts would hit a NOT NULL violation.
    for (const [id, clerkId, role] of [
      [TEST_WORKER, "sync_test_worker", "worker"],
      [TEST_OTHER_WORKER, "sync_test_other", "worker"],
    ] as const) {
      await client.query(
        `INSERT INTO users (id,company_id,clerk_user_id,role,name) VALUES ($1,$2,$3,$4,$5)`,
        [id, TEST_COMPANY, clerkId, role, clerkId],
      );
    }
    // Jobs are identified by address, not a name — a painting job *is* a house.
    for (const [id, address] of [
      [TEST_JOB_A, "1 Test Street, Providence RI"],
      [TEST_JOB_B, "2 Test Street, Providence RI"],
    ] as const) {
      await client.query(`INSERT INTO jobs (id,company_id,address) VALUES ($1,$2,$3)`, [
        id,
        TEST_COMPANY,
        address,
      ]);
    }

    const db = drizzle(client, {
      schema: { companies, users, jobs, workSessionEvents },
    }) as unknown as Db;

    return await fn({
      db,
      companyId: TEST_COMPANY,
      workerId: TEST_WORKER,
      otherWorkerId: TEST_OTHER_WORKER,
      jobA: TEST_JOB_A,
      jobB: TEST_JOB_B,
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** A caller-shaped user row, so tests need not round-trip through the database. */
export function actor(f: SyncFixture, id: string = f.workerId) {
  return {
    id,
    companyId: f.companyId,
    clerkUserId: "sync_test",
    role: "worker" as const,
    name: "Sync Test",
    phone: null,
    payRateCents: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

let seq = 0;
/** Deterministic, ordered UUIDv7-shaped ids so tests never depend on randomness. */
export function eventId(): string {
  seq += 1;
  return `00000000-0000-7000-8000-${String(seq).padStart(12, "0")}`;
}
