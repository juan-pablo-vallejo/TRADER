import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { runtimeDatabaseUrl, useLocalPostgres } from "./env.js";
import * as schema from "./schema/index.js";

/**
 * Dual driver, one env switch.
 *
 * `@neondatabase/serverless` speaks HTTP/WebSocket to Neon's proxy — it cannot
 * connect to a plain Postgres server. So local development against the Docker
 * container in docker-compose.yml uses node-postgres, and Neon is used in
 * deployed environments. Both are wrapped by Drizzle, so callers see one API and
 * queries are written once.
 *
 * Set USE_LOCAL_POSTGRES=true in .env for local work.
 */
function createDb() {
  const url = runtimeDatabaseUrl();

  if (useLocalPostgres()) {
    // A pool, not a single client: seeds and tests run concurrent queries, and a
    // lone client serializes them.
    return drizzleNode(new Pool({ connectionString: url }), { schema });
  }

  return drizzleNeon(neon(url), { schema });
}

/**
 * Lazy singleton. Module-level instantiation would throw at import time whenever
 * the environment is not configured — which breaks `drizzle-kit`, unit tests that
 * never touch the database, and any tooling that merely imports the schema.
 */
let instance: ReturnType<typeof createDb> | undefined;

export function getDb(): ReturnType<typeof createDb> {
  instance ??= createDb();
  return instance;
}

export type Db = ReturnType<typeof createDb>;
