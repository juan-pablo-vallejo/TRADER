import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import * as schema from "./schema";

/**
 * The device database.
 *
 * `openDatabaseSync` rather than the async variant: every caller here is already
 * inside a React render or an event handler, and the synchronous handle avoids
 * threading a promise through the store before a worker can tap anything.
 */
const sqlite = SQLite.openDatabaseSync("trader.db");

export const localDb = drizzle(sqlite, { schema });

/**
 * Device-side migrations.
 *
 * Written as plain SQL executed in order rather than through `drizzle-kit`'s
 * generated bundle. The generated path needs a Babel plugin to inline migration
 * files into the bundle, and for a schema this size that is more moving parts
 * than it removes — SPEC §1's principle applied to the toolchain. When the device
 * schema starts changing shape per release, revisit.
 *
 * `IF NOT EXISTS` everywhere, and `user_version` as the ratchet: an upgrade that
 * runs twice must be a no-op, because an app can be killed mid-migration and will
 * simply try again on next launch.
 */
const MIGRATIONS: readonly string[] = [
  // 1 — the local event store and the outbox, which are the same table.
  `
  CREATE TABLE IF NOT EXISTS local_events (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL,
    client_timestamp INTEGER NOT NULL,
    attestation_level TEXT NOT NULL DEFAULT 'none',
    device_lat REAL,
    device_lng REAL,
    device_accuracy_m REAL,
    payload TEXT,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    last_error TEXT,
    rejected INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS local_events_sync_idx
    ON local_events (sync_state, client_timestamp);
  CREATE INDEX IF NOT EXISTS local_events_time_idx
    ON local_events (client_timestamp);
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
  `,

  // 2 — when the in-flight flush began, so a killed one can be reclaimed.
  //
  // No `IF NOT EXISTS` on ADD COLUMN: SQLite has not supported it, and it is not
  // needed — `user_version` already guarantees each migration runs once, and a
  // partial failure re-runs the whole statement rather than half of it.
  `ALTER TABLE local_events ADD COLUMN syncing_since INTEGER;`,
];

export function migrateLocalDb(): void {
  const row = sqlite.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  const applied = row?.user_version ?? 0;

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    sqlite.execSync(MIGRATIONS[version]!);
    // `user_version` cannot be parameterised — it is a pragma, not a statement.
    // The value is a loop index, never user input.
    sqlite.execSync(`PRAGMA user_version = ${version + 1}`);
  }
}
