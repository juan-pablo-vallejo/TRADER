import { bigint, char, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/**
 * Columns every table carries (SPEC §4).
 *
 * `updatedAt` is NOT auto-maintained by the database. Postgres has no ON UPDATE
 * clause, so application writes must set it. Deliberately not a trigger: the
 * append-only tables must reject UPDATE entirely, and a global update trigger
 * would muddy that.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Primary key: UUIDv7 (time-sortable, so it clusters well in a btree).
 *
 * Generated in JS rather than by the database. Postgres only gained a native
 * `uuidv7()` in 18, and pinning the schema to that would tie us to a server
 * version Neon may not offer. SPEC §3 also requires *client*-generated UUIDv7
 * for offline records, so the app owns ID generation regardless — this keeps
 * one mechanism instead of two.
 */
export const primaryId = uuid("id")
  .primaryKey()
  .$defaultFn(() => uuidv7());

/**
 * Money, per SPEC §4: integer minor units, never floats.
 *
 * bigint rather than integer — int4 caps at 2,147,483,647 cents (~$21.4M),
 * which is plausibly reachable in aggregate over a company's lifetime. The
 * extra four bytes are cheap insurance against a migration nobody wants.
 *
 * `mode: "number"` keeps values as JS numbers: safe to Number.MAX_SAFE_INTEGER
 * (~$90 trillion), far beyond any real amount here, and avoids BigInt
 * serialization friction across the tRPC boundary.
 */
export const cents = (name: string) => bigint(name, { mode: "number" });

/** ISO-4217. Paired with every monetary amount; no bare numbers. */
export const currency = (name = "currency") => char(name, { length: 3 });
