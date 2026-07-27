import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { migrationDatabaseUrl } from "./env.js";

config({ path: "../../.env" });

/**
 * Applies migrations, including the hand-written SQL ones drizzle-kit did not
 * generate (see 0001_append_only_guard.sql).
 *
 * Uses node-postgres even against Neon: migrations run from a machine or CI job,
 * not a serverless function, so the direct connection is both available and
 * correct. Neon's HTTP driver is single-statement and cannot run DDL
 * transactionally.
 */
async function main() {
  const url = migrationDatabaseUrl();
  const pool = new Pool({ connectionString: url });

  try {
    const db = drizzle(pool);
    console.log("Applying migrations...");
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
