// The database environment contract. Pure: validates a record it is handed and never reads a
// file or touches process state, so tests pass records and entry points (drizzle.config.ts,
// test/setup.ts) own the loading of .env. The three POSTGRES_* names are the ones
// docker-compose.yml reads, so a password exists in exactly one place.
import { z } from "zod";

// docker-compose.yml publishes the container on the loopback interface only; the host and
// port are fixed there, not configurable here.
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 5432;

// `pg` is the only driver until Neon's first consumer (Stage 6) extends the enum; any other
// value is a validation error, not a stub that fails later.
const driverSchema = z.object({ DATABASE_DRIVER: z.enum(["pg"]).default("pg") });
const urlSchema = z.object({ DATABASE_URL: z.string().min(1) });
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

export type DatabaseEnv = { driver: DatabaseDriver; connection: DatabaseConnection };

// A blank value in .env (`DATABASE_URL=`) arrives as "" and means "unset".
const withoutBlanks = (env: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === "" ? undefined : v]));

// DATABASE_URL set: used verbatim, the deployed shape, POSTGRES_* not required.
// DATABASE_URL unset: all three compose variables are required.
export function parseDatabaseEnv(env: Record<string, string | undefined>): DatabaseEnv {
  const clean = withoutBlanks(env);
  const driver = driverSchema.parse(clean).DATABASE_DRIVER;
  if (clean.DATABASE_URL !== undefined) {
    const { DATABASE_URL } = urlSchema.parse(clean);
    return { driver, connection: { connectionString: DATABASE_URL } };
  }
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = composeSchema.parse(clean);
  return {
    driver,
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
