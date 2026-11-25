// The Drizzle client over node-postgres, here and deployed: Neon's pooled endpoint is plain
// Postgres over TCP on the Node runtime.
// Lazy by design: nothing connects or validates at module load, so importing the package
// never fails in a process that merely wants the types.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseDatabaseEnv } from "./env";
import { statementLogger } from "./meter";

// How long a caller waits for a free connection before failing. pg's default is to wait for
// ever, which turns an exhausted pool into requests that never answer.
export const CONNECTION_TIMEOUT_MS = 5_000;

// What an idle client's failure leaves in the log: the error's class and SQLSTATE, never its
// message (a driver message can carry SQL and parameters).
export function describePoolError(error: unknown): string {
  const name = error instanceof Error ? error.name : "unknown";
  const code = (error as { code?: unknown } | null)?.code;
  return `database pool: idle client failed (${name}${typeof code === "string" ? ` ${code}` : ""})`;
}

// `tuning` is a host's own floor under the pool's size and its idle timeout (apps/web
// server/db.ts); scripts and suites take pg's defaults.
export function createDb(
  env: Record<string, string | undefined> = process.env,
  tuning: { minMax?: number; idleTimeoutMillis?: number } = {},
) {
  // One parse: the connection and the pool's size come from one validated record.
  const { connection, poolMax } = parseDatabaseEnv(env);
  // A pool, not a single client: tests and the API run concurrent queries.
  const pool = new Pool({
    ...connection,
    max: Math.max(poolMax, tuning.minMax ?? 0),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ...(tuning.idleTimeoutMillis !== undefined && {
      idleTimeoutMillis: tuning.idleTimeoutMillis,
    }),
  });
  // An idle client whose server went away (a restart, Neon scaling to zero) emits `error` on
  // the pool; with no listener Node treats it as uncaught and the process exits. The pool has
  // already discarded the client, so logging is all there is to do.
  pool.on("error", (error) => console.error(describePoolError(error)));
  // The meter counts statements through the logger hook and does nothing else (meter.ts).
  return drizzle({ client: pool, logger: statementLogger });
}

export type Db = ReturnType<typeof createDb>;
