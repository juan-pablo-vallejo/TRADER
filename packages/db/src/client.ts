// The Drizzle client behind the driver seam. The driver comes from DATABASE_DRIVER (see
// env.ts); `pg` is the only branch until Neon's first consumer (Stage 6) adds the second.
// Lazy by design: nothing connects or validates at module load, so importing the package
// never fails in a process that merely wants the types.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseDatabaseEnv } from "./env";

export function createDb(env: Record<string, string | undefined> = process.env) {
  // One parse: the driver and the connection come from the same validated record.
  const { driver, connection } = parseDatabaseEnv(env);
  switch (driver) {
    case "pg":
      // A pool, not a single client: tests and the API run concurrent queries.
      return drizzle({ client: new Pool(connection) });
  }
}

export type Db = ReturnType<typeof createDb>;
