import { defineConfig } from "drizzle-kit";

import { assertMigrationPurpose, databaseConnection } from "./src/env";

// Entry point, so it reads .env. The path is cwd-relative on purpose: drizzle-kit resolves
// this config from the cwd and every `pnpm --filter @trader/db` script runs in packages/db.
try {
  process.loadEnvFile("../../.env");
} catch (error) {
  // No .env in CI: the job sets the variables directly. Anything else is a real failure.
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Every drizzle-kit command loads this file: none of them reaches a deployed database
// unless its caller is one of the two that may (src/env.ts).
assertMigrationPurpose(process.env);

// drizzle-kit spells the string form `url` where pg spells it `connectionString`.
const connection = databaseConnection();
const dbCredentials =
  "connectionString" in connection ? { url: connection.connectionString } : connection;

// drizzle-kit sees tables, enums, constraints and indexes only. Triggers, functions, roles,
// grants, policies and FORCE are hand-written in a `drizzle-kit generate --custom` file,
// statements separated by `--> statement-breakpoint`.
// Pending migrations run in one transaction, so a label added by ALTER TYPE ... ADD VALUE is
// unusable (55P04) in any CHECK, DEFAULT or index predicate of the same run; name it in
// plpgsql, which resolves at run time.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials,
});
