import { companies, users, type Db } from "@trader/db";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

config({ path: "../../.env" });

/**
 * A dedicated pool rather than `getDb()`: these tests must reach local Postgres
 * regardless of how the ambient environment is configured.
 */
export const pool = new Pool({
  connectionString:
    process.env.LOCAL_DATABASE_URL ?? "postgresql://trader:trader@localhost:5432/trader",
});

export const testDb = drizzle(pool, { schema: { companies, users } }) as unknown as Db;

/** Namespaced so these rows never collide with the db package's fixtures. */
export const API_TEST_COMPANY = "00000000-0000-7000-8000-00000000a100";

export async function seedCompany(): Promise<void> {
  await pool.query(
    `INSERT INTO companies (id,name,timezone) VALUES ($1,'API Test Co','America/New_York')
     ON CONFLICT DO NOTHING`,
    [API_TEST_COMPANY],
  );
}

/** Removes every user this suite created, so each test starts from a known state. */
export async function clearTestUsers(): Promise<void> {
  await pool.query(`DELETE FROM users WHERE clerk_user_id LIKE 'api_test_%'`);
}

/**
 * Runs `fn` against structurally identical but **empty** `users` and `companies`
 * tables, then rolls everything back.
 *
 * Deleting the real rows is not an option: `work_session_events` references
 * users and is append-only by trigger, so the history that protects payroll also
 * makes "remove every company" impossible — correctly. Instead a throwaway
 * schema is put in front of `public` on the search path, and Drizzle's
 * unqualified table names resolve to the empty copies. `LIKE ... INCLUDING ALL`
 * keeps column types and defaults identical, and the enum types still resolve
 * from `public`.
 *
 * Binding the Drizzle instance to one checked-out client matters: a pool hands
 * out a different connection per query, so a `BEGIN` issued through the pool
 * would be released immediately and the code under test would never see the
 * uncommitted schema.
 */
export async function withEmptyTenantTables<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA empty_probe");
    await client.query(
      "CREATE TABLE empty_probe.companies (LIKE public.companies INCLUDING ALL)",
    );
    await client.query(
      "CREATE TABLE empty_probe.users (LIKE public.users INCLUDING ALL)",
    );
    await client.query("SET LOCAL search_path TO empty_probe, public");
    const txDb = drizzle(client, { schema: { companies, users } }) as unknown as Db;
    return await fn(txDb);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

export async function findUser(clerkUserId: string) {
  const rows = await testDb
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  return rows[0];
}

/** The company the resolver will pick: oldest first. */
export async function oldestCompanyId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`,
  );
  if (!rows[0]) throw new Error("No company seeded for the API test suite.");
  return rows[0].id;
}

export async function countUsers(clerkUserId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM users WHERE clerk_user_id=$1`,
    [clerkUserId],
  );
  return Number(rows[0]?.n ?? "0");
}
