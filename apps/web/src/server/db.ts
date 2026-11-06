// The one Drizzle client of this server process (ARCHITECTURE, Web + API: one `pg` Pool),
// created on the first request and never at module load, so `next build` and `next typegen`
// need no database (RULES). Cached on globalThis: `next dev` re-evaluates modules on every
// edit, and each evaluation would otherwise open another pool.
import { createDb, type Db } from "@trader/db";

const KEY = Symbol.for("trader.web.db");
type Holder = { [KEY]?: Db };

export function getDb(env: Record<string, string | undefined> = process.env): Db {
  const holder = globalThis as Holder;
  if (holder[KEY] === undefined) {
    const db = createDb(env);
    // The local login is the compose owner, a superuser, which `assertRuntimeRole` refuses in
    // every protected transaction (api trpc.ts; db guard.ts). So under development and test,
    // every connection the pool opens starts its session as trader_app through the startup
    // parameter `role`, as the api suite does (its helpers' appDb). Production logs in as
    // trader_app and the pool passes no options (verified at Stage 6): a SET ROLE could be
    // reset, a login role cannot.
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      db.$client.options.options = "-c role=trader_app";
    }
    holder[KEY] = db;
  }
  return holder[KEY];
}
