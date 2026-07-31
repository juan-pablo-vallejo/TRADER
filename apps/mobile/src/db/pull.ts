import { rewindCursor, type PullCursor } from "@trader/api/sync";

import type { AttestationLevel, LocalEventType } from "./schema";

/**
 * The pull half of sync — CONFLICT-5, "the losing device snaps to server truth".
 *
 * The loop below is separated from SQLite by `PullDeps` so that the parts worth
 * reasoning about — rewind exactly once, terminate, respect the page cap — can be
 * tested without a device. That matters here more than anywhere: this is the
 * subsystem ROADMAP names as the project's real risk, and its failure mode is a
 * silent livelock rather than an error.
 */

/** One event as the server returns it. */
export type PulledEvent = {
  id: string;
  workerId: string;
  jobId: string;
  type: LocalEventType;
  clientTimestamp: Date;
  serverTimestamp: Date;
  attestationLevel: AttestationLevel;
  deviceLat: number | null;
  deviceLng: number | null;
  deviceAccuracyM: number | null;
  payload: unknown;
};

export type PullFn = (input: {
  cursor: PullCursor | null;
  limit: number;
}) => Promise<{ events: PulledEvent[]; nextCursor: PullCursor | null }>;

export type PullOutcome = { received: number; pages: number; reachedEnd: boolean };

/**
 * Reading the stored cursor, and committing a page.
 *
 * `persist` must write the events and the cursor **atomically** — a crash between
 * them would leave the cursor past rows that were never stored, and CONFLICT-8's
 * overlap window is far too small to recover a gap of that shape.
 */
export type PullDeps = {
  readCursor: () => PullCursor | null;
  persist: (events: readonly PulledEvent[], cursor: PullCursor | null) => void;
};

/**
 * Hard ceiling on pages per cycle.
 *
 * The strict keyset already guarantees termination (CONFLICT-8), so this is not
 * the correctness mechanism — it bounds how long one cycle may hold the device
 * busy. A phone offline for a week catches up over several cycles rather than one
 * unbounded loop, and because the cursor is durable, stopping early costs nothing
 * but a later resume.
 */
export const MAX_PAGES_PER_CYCLE = 20;

export async function pullEvents(
  pull: PullFn,
  limit: number,
  deps: PullDeps,
): Promise<PullOutcome> {
  // CONFLICT-8: rewind **once**, here at the start of the cycle. Rewinding inside
  // the page loop is the non-termination bug the rule exists to prevent.
  let cursor = rewindCursor(deps.readCursor());

  let received = 0;
  let pages = 0;
  let reachedEnd = false;

  while (pages < MAX_PAGES_PER_CYCLE) {
    const page = await pull({ cursor, limit });
    pages += 1;
    received += page.events.length;

    // A short page still advances the cursor, using its own last row — otherwise
    // the final partial page would be re-read on every future cycle forever.
    deps.persist(page.events, page.nextCursor ?? lastCursorOf(page.events));

    cursor = page.nextCursor;
    if (!cursor) {
      reachedEnd = true;
      break;
    }
  }

  return { received, pages, reachedEnd };
}

/** The keyset of the last row on a page. Null for an empty page. */
export function lastCursorOf(events: readonly PulledEvent[]): PullCursor | null {
  const last = events[events.length - 1];
  return last ? { serverTimestamp: last.serverTimestamp, id: last.id } : null;
}
