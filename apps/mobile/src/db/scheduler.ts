/**
 * When a sync cycle is allowed to run — CONFLICT-6's "on reconnect, on app
 * foreground, and on a timer".
 *
 * Pure except for the callback it drives, so the awkward parts are testable: the
 * three triggers fire independently and routinely fire *together*. Regaining
 * signal typically also foregrounds the app, and a crew leaving a basement does
 * both within the same second — so without coalescing, one event produces three
 * overlapping cycles pushing the same rows.
 */

export type SyncReason = "manual" | "foreground" | "reconnect" | "timer";

export type RequestOutcome =
  /** A cycle ran to completion for this request. */
  | "ran"
  /** A cycle was already running; this request was folded into a follow-up. */
  | "coalesced"
  /** Too soon after the last cycle, and not worth the radio. */
  | "throttled";

/**
 * Minimum gap between automatic cycles.
 *
 * Deliberately not applied to `manual`: when a worker taps Sync they are usually
 * standing somewhere with a bar of signal, watching to see whether their day
 * left the phone. Refusing them because a timer fired 20 seconds ago would be
 * the app deciding it knows better than the person holding it.
 */
export const MIN_SYNC_INTERVAL_MS = 30 * 1000;

export type Scheduler = {
  request: (reason: SyncReason) => Promise<RequestOutcome>;
  isRunning: () => boolean;
};

export function createScheduler(
  run: (reason: SyncReason) => Promise<void>,
  opts: { minIntervalMs?: number; now?: () => number } = {},
): Scheduler {
  const minIntervalMs = opts.minIntervalMs ?? MIN_SYNC_INTERVAL_MS;
  const now = opts.now ?? Date.now;

  let running = false;
  let lastRunAt = -Infinity;
  /** Set when a request arrives mid-cycle: something changed, so run once more. */
  let followUp: SyncReason | null = null;

  async function cycle(reason: SyncReason): Promise<void> {
    running = true;
    try {
      await run(reason);
    } finally {
      // Stamped after the run, not before: throttling should measure the gap
      // between cycles finishing, or a slow cycle immediately permits another.
      lastRunAt = now();
      running = false;
    }

    const next = followUp;
    followUp = null;
    // The follow-up is not throttled. A request arrived while this cycle was
    // already in flight, so it may describe events that cycle never saw.
    if (next) await cycle(next);
  }

  return {
    isRunning: () => running,
    async request(reason) {
      if (running) {
        // Keep the most recent reason; they are equivalent in effect and the
        // newest is the more honest description of why the follow-up ran.
        followUp = reason;
        return "coalesced";
      }
      if (reason !== "manual" && now() - lastRunAt < minIntervalMs) return "throttled";
      await cycle(reason);
      return "ran";
    },
  };
}
