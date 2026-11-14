// The database environment contract. Pure: validates a record it is handed and never reads a
// file or touches process state, so tests pass records and entry points (drizzle.config.ts,
// test/setup.ts) own the loading of .env. The three POSTGRES_* names are the ones
// docker-compose.yml reads, so a password exists in exactly one place.
import { z } from "zod";

// docker-compose.yml publishes the container on the loopback interface only; the host and
// port are fixed there, not configurable here.
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 5432;

// `pg` is the only driver, deployed as well: Neon's pooled endpoint is plain Postgres over
// TCP on the Node runtime (ARCHITECTURE, 2026-11-12 deployed database path). The seam stays
// for a runtime that cannot open a socket; any other value is a validation error, not a
// stub that fails later.
const driverSchema = z.object({ DATABASE_DRIVER: z.enum(["pg"]).default("pg") });
const urlSchema = z.object({ DATABASE_URL: z.string().min(1) });
// Connections one server instance may hold. pg's own default, stated so it is a decision: a
// deployment sizes it against the database's connection limit and its instance count.
const poolSchema = z.object({
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});
const composeSchema = z.object({
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
});

export type DatabaseDriver = z.infer<typeof driverSchema>["DATABASE_DRIVER"];

// Both shapes are what pg.Pool takes as its config and drizzle-kit takes as dbCredentials.
export type DatabaseConnection =
  | { connectionString: string }
  | {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      ssl: false;
    };

export type DatabaseEnv = {
  driver: DatabaseDriver;
  connection: DatabaseConnection;
  poolMax: number;
};

// A blank value in .env (`DATABASE_URL=`) arrives as "" and means "unset".
const withoutBlanks = (env: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === "" ? undefined : v]));

// DATABASE_URL set: used verbatim, the deployed shape, POSTGRES_* not required.
// DATABASE_URL unset: all three compose variables are required.
export function parseDatabaseEnv(env: Record<string, string | undefined>): DatabaseEnv {
  const clean = withoutBlanks(env);
  const driver = driverSchema.parse(clean).DATABASE_DRIVER;
  const poolMax = poolSchema.parse(clean).DATABASE_POOL_MAX;
  if (clean.DATABASE_URL !== undefined) {
    const { DATABASE_URL } = urlSchema.parse(clean);
    return { driver, poolMax, connection: { connectionString: DATABASE_URL } };
  }
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = composeSchema.parse(clean);
  return {
    driver,
    poolMax,
    connection: {
      host: LOCAL_HOST,
      port: LOCAL_PORT,
      user: POSTGRES_USER,
      password: POSTGRES_PASSWORD,
      database: POSTGRES_DB,
      // The container speaks no TLS and is loopback-only. Explicit, because drizzle-kit turns an
      // absent `ssl` into `{}`, which makes pg attempt TLS and fail.
      ssl: false,
    },
  };
}

export function databaseConnection(
  env: Record<string, string | undefined> = process.env,
): DatabaseConnection {
  return parseDatabaseEnv(env).connection;
}

export function databaseDriver(
  env: Record<string, string | undefined> = process.env,
): DatabaseDriver {
  return parseDatabaseEnv(env).driver;
}

// Refuses a deployed database. Tests commit fixtures and create and drop databases, and the
// seed writes a placeholder company: all three belong on the local compose server or CI's
// service container, both reached through the POSTGRES_* variables. DATABASE_URL is the
// deployed shape, so its presence means the target is not one of those. Consumed by every
// package's test/setup.ts and by run-seed.ts; the migrator does not call it.
export function assertLocalDatabase(
  env: Record<string, string | undefined>,
  what: string,
): void {
  if ((env.DATABASE_URL ?? "") !== "") {
    throw new Error(
      `refusing to run ${what}: DATABASE_URL is set. ${what} run only against the local ` +
        "compose database (POSTGRES_* variables), never a deployed one.",
    );
  }
}
