import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The device's local store (SPEC §3: local-first writes).
 *
 * This mirrors `work_session_events` on the server, plus the sync bookkeeping the
 * server has no business knowing about. Two rules shape it:
 *
 * 1. **The event fields are a faithful copy.** Same ids, same timestamps, same
 *    enum spellings — because the same fold in `@trader/api` runs over both, and
 *    DERIVE-6 only holds if the device and server are computing from identical
 *    shapes rather than parallel reimplementations.
 * 2. **Sync state is local-only and never sent.** It describes this device's
 *    knowledge of delivery, not anything true about the labor.
 */

/**
 * LOGIC.md CONFLICT-6: `pending → syncing → synced`, or `failed → retry`.
 *
 * Stored as text rather than an integer enum so a row read in a SQLite browser
 * during a field debugging session says what it means.
 */
export type SyncState = "pending" | "syncing" | "synced" | "failed";

/**
 * Locally recorded labor events, and the outbox — the same table.
 *
 * Keeping them separate would mean writing every event twice and inventing a
 * reconciliation between the two copies. The outbox is simply the rows whose
 * `syncState` is not `synced`.
 */
export const localEvents = sqliteTable(
  "local_events",
  {
    /**
     * The client-generated UUIDv7, generated here, on the device that observed
     * the event. This is the idempotency key the server upserts by (CONFLICT-1),
     * which is why it must never be regenerated on retry — a new id would turn
     * every retry into a duplicate labor record.
     */
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    type: text("type").notNull().$type<LocalEventType>(),
    /** Epoch millis. SQLite has no timestamp type; the fold takes Dates. */
    clientTimestamp: integer("client_timestamp").notNull(),
    /** ATTEST-3, recorded at capture. `none` is honest, not a failure code. */
    attestationLevel: text("attestation_level").notNull().$type<AttestationLevel>(),
    deviceLat: real("device_lat"),
    deviceLng: real("device_lng"),
    deviceAccuracyM: real("device_accuracy_m"),
    /** JSON, or null. Mirrors the server's `payload` column. */
    payload: text("payload"),

    // ---- local-only, never transmitted ----

    syncState: text("sync_state").notNull().$type<SyncState>().default("pending"),
    /**
     * When the in-flight flush began, epoch millis; null unless `syncing`.
     *
     * Exists so a flush killed mid-request can be told from one still running.
     * The OS reaping a backgrounded app is the normal case on a phone, and
     * without this the row stays `syncing` forever and the worker's day never
     * arrives. See `reclaimStale`.
     */
    syncingSince: integer("syncing_since"),
    /** Retry count, feeding the backoff curve in `@trader/api`'s `retryDelayMs`. */
    attempts: integer("attempts").notNull().default(0),
    /** Epoch millis before which no retry should be made. */
    nextAttemptAt: integer("next_attempt_at"),
    /**
     * Why the last attempt failed, shown to the worker verbatim.
     *
     * A `rejected` event is *permanently* failed — SESSION-4 means the server
     * will never accept it — and the worker needs to know that rather than watch
     * a spinner retry forever. CONFLICT-6 requires the UI to show sync state
     * honestly rather than implying delivery.
     */
    lastError: text("last_error"),
    /** Set when the server rejected it: retrying is pointless and must stop. */
    rejected: integer("rejected", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    /** The outbox scan: unsynced rows, oldest-first (CONFLICT-6). */
    index("local_events_sync_idx").on(t.syncState, t.clientTimestamp),
    /** The fold: this device's events in device-time order. */
    index("local_events_time_idx").on(t.clientTimestamp),
  ],
);

export type LocalEventType = "started" | "paused" | "resumed" | "ended" | "voided";
export type AttestationLevel = "biometric" | "device_credential" | "none";

/**
 * Single-row table holding the pull cursor and nothing else.
 *
 * A key/value table rather than an app-preferences store: the cursor must be
 * written in the same SQLite transaction as the events a pull delivered, or a
 * crash between the two would advance the cursor past events never written.
 */
export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const CURSOR_KEY = "pull_cursor";
