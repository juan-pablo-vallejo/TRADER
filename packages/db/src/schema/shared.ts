// Columns shared by the office-created tables; consumed by every table file in this directory.
import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

// Office-created rows take their id from Postgres 18's uuidv7(): time-ordered, and a raw SQL
// insert works. Rows a phone creates (work_session_events, materials, photos) carry the device's
// UUIDv7 and declare their own id column with no default — invariant 2.
export const id = uuid("id")
  .primaryKey()
  .default(sql`uuidv7()`);

export const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

// Maintained by Drizzle on update, not by the database: a raw SQL UPDATE leaves it stale, so
// writes go through the ORM. Not a trigger, so the append-only tables stay untouched.
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

// Roster state. "Active" is `deactivated_at IS NULL`: derived, never stored as a flag
// (invariant 7). PRD deletion is deactivate-and-pseudonymize, so nothing is deleted.
export const deactivatedAt = timestamp("deactivated_at", { withTimezone: true });
