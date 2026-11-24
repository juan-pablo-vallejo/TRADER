// The one Drizzle client of this server process (one `pg` Pool),
// created on the first request and never at module load, so `next build` and `next typegen`
// need no database. Cached on globalThis: `next dev` re-evaluates modules on every
// edit, and each evaluation would otherwise open another pool.
import { createDb, type Db } from "@trader/db";
import { attachDatabasePool } from "@vercel/functions";

import { MAX_BATCH_SIZE } from "./handler";

const KEY = Symbol.for("trader.web.db");
type Holder = { [KEY]?: Db };

// The pool rule (docs/ARCHITECTURE.md, Schema rule): at least twice the calls one request
// may batch, since each holds a connection while it runs, and idle clients closed after five
// seconds. attachDatabasePool lets Vercel keep a function alive until an idle client is
// closed, rather than suspend it holding one; outside Vercel it does nothing.
export const IDLE_TIMEOUT_MS = 5_000;

export function serverDb(env: Record<string, string | undefined>): Db {
  const db = createDb(env, {
    minMax: 2 * MAX_BATCH_SIZE,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  attachDatabasePool(db.$client);
  return db;
}

export function getDb(env: Record<string, string | undefined> = process.env): Db {
  const holder = globalThis as Holder;
  if (holder[KEY] === undefined) {
    const db = serverDb(env);
    // The local login is the compose owner, a superuser, which `assertRuntimeRole` refuses
    // before any protected call is served (api trpc.ts; db guard.ts). So under development and test,
    // every connection the pool opens starts its session as trader_app through the startup
    // parameter `role`, as the api suite does (its helpers' appDb). Production logs in as
    // trader_app and the pool passes no options: a SET ROLE could be reset, a login role
    // cannot, and the pooled endpoint accepts no startup option. The readiness check holds a
    // deployment to that login (ready.ts).
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      db.$client.options.options = "-c role=trader_app";
    }
    holder[KEY] = db;
  }
  return holder[KEY];
}
