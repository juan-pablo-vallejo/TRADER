import { localDb } from "./client";
import { readCursor, writeCursor } from "./cursor";
import type { PullDeps, PulledEvent } from "./pull";
import { localEvents } from "./schema";

/**
 * The SQLite half of pulling — deliberately the only part of the pull path that
 * touches the device database.
 *
 * `pull.ts` stays free of this import so the cursor loop can be tested in node:
 * `client.ts` opens the database at module load, so importing it anywhere in a
 * module's graph makes that graph require a native runtime. Same split as
 * `outbox-logic.ts` (pure) against `sync.ts` (SQLite).
 */

/** The transaction handle Drizzle hands the callback, without naming its internals. */
type LocalTx = Parameters<Parameters<typeof localDb.transaction>[0]>[0];

export const livePullDeps: PullDeps = {
  readCursor,
  persist: (events, cursor) => {
    if (events.length === 0 && !cursor) return;
    // Events and cursor commit together or not at all: a crash between them would
    // advance the cursor past rows that were never stored, and CONFLICT-8's
    // overlap window is far too small to recover a gap of that shape.
    localDb.transaction((tx) => {
      for (const event of events) upsertPulled(tx, event);
      if (cursor) writeCursor(tx, cursor);
    });
  },
};

/**
 * Writes one server event into the local store.
 *
 * Arriving from the server **is** delivery, so the row is `synced` either way: a
 * row this device pushed and then pulled back is confirmed, and a row from the
 * worker's other phone is new. CONFLICT-5 makes this an overwrite rather than a
 * merge — the device does not argue with the server — and the event columns are
 * overwritten too, not just the sync state, because a correction issued elsewhere
 * is exactly what this path exists to deliver.
 */
function upsertPulled(tx: LocalTx, event: PulledEvent): void {
  const row = {
    id: event.id,
    workerId: event.workerId,
    jobId: event.jobId,
    type: event.type,
    clientTimestamp: event.clientTimestamp.getTime(),
    attestationLevel: event.attestationLevel,
    deviceLat: event.deviceLat,
    deviceLng: event.deviceLng,
    deviceAccuracyM: event.deviceAccuracyM,
    payload: event.payload === null ? null : JSON.stringify(event.payload),
    syncState: "synced" as const,
    attempts: 0,
    nextAttemptAt: null,
    syncingSince: null,
    lastError: null,
    rejected: false,
  };

  tx.insert(localEvents)
    .values(row)
    .onConflictDoUpdate({ target: localEvents.id, set: row })
    .run();
}
