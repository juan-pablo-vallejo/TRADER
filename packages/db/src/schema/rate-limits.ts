import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// How many requests one caller made in one window of time (ARCHITECTURE, Edge protection;
// TASKS, edge protection for a public host). The API's own rate limit counts here because a
// serverless deployment has no memory between requests and the limit must hold across every
// instance of it. Not tenant data and not tenant-scoped: a request is counted before anyone
// has signed in. `key` is a hash — of the scope and the caller's address, or of the scope and
// the signed-in subject — never the address or the subject itself, so nothing here says who
// called. A window that has ended is deleted by a later write (api core/rate-limit.ts);
// nothing reads an old one.
export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ name: "rate_limit_windows_pk", columns: [t.key, t.windowStart] }),
    check("rate_limit_windows_key_is_a_hash", sql`${t.key} ~ '^[0-9a-f]{64}$'`),
    check("rate_limit_windows_count_positive", sql`${t.count} > 0`),
  ],
);
