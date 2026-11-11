// The Drizzle client behind the driver seam. The driver comes from DATABASE_DRIVER (see
// env.ts); `pg` is the only branch until Neon's first consumer (Stage 6) adds the second.
// Lazy by design: nothing connects or validates at module load, so importing the package
// never fails in a process that merely wants the types.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseDatabaseEnv } from "./env";

// How long a caller waits for a free connection before failing. pg's default is to wait for
// ever, which turns an exhausted pool into requests that never answer.
export const CONNECTION_TIMEOUT_MS = 5_000;

// What an idle client's failure leaves in the log: the error's class and SQLSTATE, never its
// message (RULES: a driver message can carry SQL and parameters).
export function describePoolError(error: unknown): string {
  const name = error instanceof Error ? error.name : "unknown";
  const code = (error as { code?: unknown } | null)?.code;
  return `database pool: idle client failed (${name}${typeof code === "string" ? ` ${code}` : ""})`;
}

export function createDb(env: Record<string, string | undefined> = process.env) {
  // One parse: the driver, the connection and the pool's size come from one validated record.
  const { driver, connection, poolMax } = parseDatabaseEnv(env);
  switch (driver) {
    case "pg": {
      // A pool, not a single client: tests and the API run concurrent queries.
      const pool = new Pool({
        ...connection,
        max: poolMax,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      });
      // An idle client whose server went away (a restart, Neon scaling to zero) emits `error`
      // on the pool; with no listener Node treats it as uncaught and the process exits. The
      // pool has already discarded the client, so logging is all there is to do.
      pool.on("error", (error) => console.error(describePoolError(error)));
      return drizzle({ client: pool });
    }
  }
}

export type Db = ReturnType<typeof createDb>;
