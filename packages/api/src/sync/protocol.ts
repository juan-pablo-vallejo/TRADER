/**
 * Sync protocol parameters (logic.md `CONFLICT-4`, `CONFLICT-4a`).
 *
 * Gathered here rather than inlined because every one of them was a decision with
 * reasoning behind it, recorded in DECISIONS.md under "Settled at the start of
 * Phase 1". A magic number at a call site loses that.
 */

/**
 * CONFLICT-4. Skew is `|device_now − server_now|`, measured **at sync time**.
 *
 * Not per event: a device offline for two days produces a 48-hour gap between an
 * event's `client_timestamp` and its `server_timestamp` entirely legitimately —
 * that is the case SPEC §3 exists to serve. Only the device's *current* clock
 * says anything about whether its clock is wrong.
 *
 * Five minutes: phones sync time from the network automatically and healthy drift
 * is seconds, while five minutes cannot meaningfully reorder a workday.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** CONFLICT-4a. Events returned per pull. */
export const PULL_BATCH_SIZE = 200;

/**
 * CONFLICT-4a. How far *behind* the cursor each pull re-reads.
 *
 * Transactions do not become visible in `server_timestamp` order — a row can
 * commit after a client has already read past its timestamp — so resuming exactly
 * where the last pull stopped can silently skip a labor event. Re-reading a window
 * costs redundant traffic and nothing else, because CONFLICT-1 makes a redelivered
 * event a no-op upsert. The window only needs to exceed the longest plausible gap
 * between a transaction taking its `now()` and committing.
 */
export const PULL_OVERLAP_MS = 30 * 1000;

export type PullCursor = { serverTimestamp: Date; id: string };

/**
 * Rewinds a cursor by the overlap window — applied **once when a sync cycle
 * starts**, never inside pagination.
 *
 * Keeping these separate is the whole correctness argument. `sync.pull` uses a
 * strict keyset so a run always terminates; if pagination itself began a window
 * behind its own cursor, a full batch fitting inside that window would return the
 * same page forever. The re-read has to happen exactly once per cycle, here.
 *
 * `id` resets to the nil UUID: the rewound timestamp must include *every* id at
 * that instant, and the nil UUID sorts before any UUIDv7. It is also a valid
 * UUID, so the cursor stays one type rather than gaining a nullable field.
 */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function rewindCursor(cursor: PullCursor | null): PullCursor | null {
  if (!cursor) return null;
  return {
    serverTimestamp: new Date(cursor.serverTimestamp.getTime() - PULL_OVERLAP_MS),
    id: NIL_UUID,
  };
}

/** CONFLICT-6 / CONFLICT-4a: retry backoff, exponential from 1s to 5min. */
export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 5 * 60 * 1000;

/**
 * Delay before retry `attempt` (0-based), with full jitter.
 *
 * Jitter is not decoration: a crew of thirty phones losing signal in the same
 * basement regains it at the same moment, and un-jittered backoff would march
 * them into synchronised retry storms against one serverless deployment.
 *
 * Exported as a pure function of `attempt` and `random` so the curve is testable
 * without a clock or a real RNG.
 */
export function retryDelayMs(attempt: number, random: number): number {
  const ceiling = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  return Math.round(ceiling * random);
}

/** CONFLICT-4: whether a device's clock is trustworthy enough to order events. */
export function clockSkewMs(deviceNow: Date, serverNow: Date): number {
  return Math.abs(deviceNow.getTime() - serverNow.getTime());
}

export const isClockTrusted = (skewMs: number): boolean =>
  skewMs <= CLOCK_SKEW_TOLERANCE_MS;
