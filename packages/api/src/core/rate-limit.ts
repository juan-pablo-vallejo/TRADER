// The API's rate limit (ARCHITECTURE, Edge protection; TASKS, edge protection for a public
// host): a fixed window counted in Postgres, because a serverless deployment keeps nothing
// between requests and a limit must hold across every instance of it. One statement per
// hit: the caller's count for the current window is inserted or raised and read back, so two
// instances counting at once never lose a hit. It runs on the pool, outside any request
// transaction: a request that fails, or is refused, has still been counted.
//
// A key is `scope:value` hashed (SHA-256): the table never holds an address or a signed-in
// subject, only that somebody was counted. Windows that ended an hour or more ago are
// deleted by the first hit of a new window for the same scope, so the table stays the size
// of what is being counted now.
//
// The clock is the database's, so every instance agrees on where a window starts.
// Consumed by apps/web (server/edge.ts).
import { createHash } from "node:crypto";

import type { Db } from "@trader/db";
import { sql } from "drizzle-orm";

export type RateLimit = {
  // What is being limited: `address` or `identity`. Part of the key.
  scope: string;
  // Hits allowed in one window.
  limit: number;
  windowSeconds: number;
};

export type RateVerdict = {
  limited: boolean;
  // Seconds until the window ends: what a refused caller is told to wait.
  retryAfterSeconds: number;
};

export const rateKey = (scope: string, value: string): string =>
  createHash("sha256").update(`${scope}:${value}`).digest("hex");

// One hit by `value` under `rule`. `db` is the pool, or a transaction in a test.
export async function hitRateLimit(
  db: Pick<Db, "execute">,
  rule: RateLimit,
  value: string,
): Promise<RateVerdict> {
  if (!Number.isInteger(rule.limit) || rule.limit < 1)
    throw new Error("a limit is 1 or more");
  if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new Error("a window is a whole number of seconds");
  }
  const key = rateKey(rule.scope, value);
  const { rows } = await db.execute<{ count: number; remaining: number }>(sql`
    with w as (
      select to_timestamp(
        floor(extract(epoch from now()) / ${rule.windowSeconds}) * ${rule.windowSeconds}
      ) as start
    )
    insert into rate_limit_windows (key, window_start, count)
    select ${key}, w.start, 1 from w
    on conflict on constraint rate_limit_windows_pk
      do update set count = rate_limit_windows.count + 1
    returning count,
      ceil(extract(epoch from (window_start + make_interval(secs => ${rule.windowSeconds}) - now())))::int
        as remaining
  `);
  const row = rows[0];
  if (row === undefined) throw new Error("a hit is counted");
  // The first hit of a window: a moment to drop what nobody will read again.
  if (row.count === 1) {
    await db.execute(
      sql`delete from rate_limit_windows where window_start < now() - interval '1 hour'`,
    );
  }
  return {
    limited: row.count > rule.limit,
    retryAfterSeconds: Math.max(1, row.remaining),
  };
}
