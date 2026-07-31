import type { PullCursor } from "@trader/api/sync";
import { eq } from "drizzle-orm";

import { localDb } from "./client";
import { CURSOR_KEY, syncMeta } from "./schema";

/**
 * The pull cursor, persisted.
 *
 * Stored as JSON in `sync_meta` rather than in app preferences for one reason:
 * it must be writable **inside the same SQLite transaction as the events a pull
 * delivered**. A crash between writing events and advancing the cursor would
 * otherwise leave the cursor past rows that were never stored, and CONFLICT-8's
 * overlap window is far too small to recover a gap of that shape.
 *
 * Timestamps are epoch millis on the way in and out. `Date` does not survive
 * `JSON.stringify` as a `Date`, and silently reviving one as a string is exactly
 * the bug STORE-4 exists to prevent.
 */

type StoredCursor = { serverTimestamp: number; id: string };

export function readCursor(): PullCursor | null {
  const row = localDb.select().from(syncMeta).where(eq(syncMeta.key, CURSOR_KEY)).get();

  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(row.value) as StoredCursor;
    if (typeof parsed.serverTimestamp !== "number" || typeof parsed.id !== "string") {
      return null;
    }
    return { serverTimestamp: new Date(parsed.serverTimestamp), id: parsed.id };
  } catch {
    // A corrupt cursor is recoverable: null means "pull from the beginning",
    // and every redelivered event is a no-op upsert (CONFLICT-1). Throwing here
    // would strand the device instead.
    return null;
  }
}

/** The Drizzle handle, or a transaction on it — whichever the caller is inside. */
type Writable = Pick<typeof localDb, "insert">;

/**
 * Serialises a cursor. Takes the handle rather than closing over `localDb`, so a
 * caller inside a transaction can commit the cursor and its events together.
 */
export function writeCursor(db: Writable, cursor: PullCursor): void {
  const value: StoredCursor = {
    serverTimestamp: cursor.serverTimestamp.getTime(),
    id: cursor.id,
  };
  db.insert(syncMeta)
    .values({ key: CURSOR_KEY, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: JSON.stringify(value) } })
    .run();
}
