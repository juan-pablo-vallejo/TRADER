// Where the demo fixture may write (TASKS, Stage 4: "never the pilot's database"). The demo
// owns a database of its own on the local compose server and nothing else: a positive check,
// failing closed. (1) `DATABASE_URL` must be unset — set, it is the deployed shape (db env.ts),
// which is how the pilot's and production databases are reached. (2) The compose shape pins the
// loopback host and port in env.ts; the configured development database is used for exactly
// two statements, CREATE DATABASE and, under `reset`, DROP DATABASE, of a name this module has
// matched against DEMO_DB_PATTERN. (3) An existing target is refused unless `reset` asked for
// it to be dropped: append-only rows make a second run on the same data meaningless, and the
// recovery is printed. (4) On the target, `current_database()` is matched again before any
// write, so a misrouted connection is caught. Consumed by run-demo.ts and the demo tests.
import { createDb as realCreateDb, parseDatabaseEnv, type Db } from "@trader/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export const DEFAULT_DEMO_DB = "trader_demo";
export const DEMO_DB_PATTERN = /^trader_demo(_[a-z0-9]{1,16})?$/;

export type Env = Record<string, string | undefined>;

// A refusal the operator reads; never a defect.
export class DemoTargetRefused extends Error {}

const refuse = (message: string) => new DemoTargetRefused(message);

export const recovery = (name: string) =>
  name === DEFAULT_DEMO_DB ? "pnpm demo --reset" : `pnpm demo --reset --db ${name}`;

// The environment the target's pools are built from, or a refusal. Pure.
export function demoTargetEnv(env: Env, name: string): Env {
  if ((env.DATABASE_URL ?? "") !== "") {
    throw refuse(
      "DATABASE_URL is set: the demo runs only on the local compose server, never a deployed database",
    );
  }
  if (!DEMO_DB_PATTERN.test(name)) {
    throw refuse(`"${name}" is not a demo database name (${DEMO_DB_PATTERN})`);
  }
  let configured: string;
  try {
    const { connection } = parseDatabaseEnv(env);
    if (!("database" in connection))
      throw new Error("unreachable: DATABASE_URL was unset");
    configured = connection.database;
  } catch (error) {
    throw refuse(`the compose variables are incomplete: ${(error as Error).message}`);
  }
  if (configured === name) {
    throw refuse(
      `"${name}" is the configured development database; the demo never writes into it`,
    );
  }
  return { ...env, POSTGRES_DB: name, DATABASE_URL: "" };
}

export type Target = {
  name: string;
  // Writes the bootstrap only (seed); the migrator ran on it already.
  owner: Db;
  // Every procedure call: sessions start as trader_app, which the runtime guard requires.
  app: Db;
  // Ends the target's pools.
  close: () => Promise<void>;
  // Ends the pools, then drops the database: the recovery path and the failed-init path.
  drop: () => Promise<void>;
};

export type PrepareOptions = {
  env: Env;
  name: string;
  reset: boolean;
  migrationsFolder: string;
  // Injected by tests to count what reaches which connection.
  createDb?: (env: Env) => Db;
};

async function exists(admin: Db, name: string): Promise<boolean> {
  const { rows } = await admin.execute<{ n: number }>(
    sql`select count(*)::int as n from pg_database where datname = ${name}`,
  );
  return (rows[0]?.n ?? 0) > 0;
}

// Waits until no backend is attached to the database, then drops it. pool.end() resolves before
// the server's backends are gone, and dropping under them would kill them mid-close
// (MEMORY: disposableDb).
async function dropDatabase(admin: Db, name: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const { rows } = await admin.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
    );
    if (rows[0]?.n === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await admin.execute(sql`drop database ${sql.identifier(name)}`);
}

// The target, created and migrated; or a refusal, with nothing created.
export async function prepareTarget(opts: PrepareOptions): Promise<Target> {
  const createDb = opts.createDb ?? realCreateDb;
  const targetEnv = demoTargetEnv(opts.env, opts.name);
  const admin = createDb(opts.env);
  try {
    if (await exists(admin, opts.name)) {
      if (!opts.reset) {
        throw refuse(
          `database "${opts.name}" already exists; a demo run is not repeatable on its own rows. ` +
            `To start over: ${recovery(opts.name)}`,
        );
      }
      await dropDatabase(admin, opts.name);
    }
    await admin.execute(sql`create database ${sql.identifier(opts.name)}`);
  } finally {
    await admin.$client.end();
  }

  const owner = createDb(targetEnv);
  const app = createDb(targetEnv);
  app.$client.options.options = "-c role=trader_app";
  const pools = [owner, app];
  const close = async () => {
    await Promise.all(pools.map((p) => p.$client.end()));
  };
  const drop = async () => {
    await close();
    const again = createDb(opts.env);
    try {
      await dropDatabase(again, opts.name);
    } finally {
      await again.$client.end();
    }
  };
  try {
    const { rows } = await owner.execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    if (rows[0]?.name !== opts.name || !DEMO_DB_PATTERN.test(rows[0].name)) {
      throw refuse(
        `connected to "${rows[0]?.name}", not the demo database "${opts.name}"`,
      );
    }
    await migrate(owner, { migrationsFolder: opts.migrationsFolder });
  } catch (error) {
    await drop();
    throw error;
  }
  return { name: opts.name, owner, app, close, drop };
}
