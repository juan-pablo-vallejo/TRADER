import { retryDelayMs, type PushResult } from "@trader/api/sync";

import type { SyncState } from "./schema";

/**
 * The outbox state machine, as pure functions.
 *
 * Deliberately separated from the SQLite calls in `outbox.ts`. Everything that
 * decides *what happens to a record* is here, takes its clock and its randomness
 * as arguments, and is unit-testable without a device — which matters because
 * this is the code that decides whether a worker's hours are retried, abandoned
 * or silently lost.
 */

export type OutboxTransition = {
  syncState: SyncState;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  rejected: boolean;
};

/**
 * What to do with a record the server has answered on.
 *
 * The three server answers are not three failures with different messages —
 * they have genuinely different consequences:
 *
 * - `accepted` / `duplicate` are **both success**. CONFLICT-1 makes a repeat a
 *   no-op that returns success, so a device that pushed, lost the response, and
 *   pushed again must treat `duplicate` as delivered. Treating it as an error
 *   would leave the row retrying forever against a server that already has it.
 * - `rejected` is **permanent**. SESSION-4 rejects at the boundary and never
 *   writes, and the timeline that made it illegal is append-only — so no future
 *   retry can succeed. Retrying would burn battery to no end and, worse, show the
 *   worker a spinner implying their hours are on their way.
 */
export function applyPushResult(result: PushResult, attempts: number): OutboxTransition {
  switch (result.status) {
    case "accepted":
    case "duplicate":
      return {
        syncState: "synced",
        attempts,
        nextAttemptAt: null,
        lastError: null,
        rejected: false,
      };
    case "rejected":
      return {
        syncState: "failed",
        attempts,
        nextAttemptAt: null,
        lastError: result.reason,
        rejected: true,
      };
  }
}

/**
 * What to do when the push never reached the server at all — no signal, timeout,
 * a 500. Distinct from `rejected`: the event may still be perfectly legal, so it
 * must keep trying.
 */
export function applyTransportFailure(
  attempts: number,
  message: string,
  now: number,
  random: number,
): OutboxTransition {
  const next = attempts + 1;
  return {
    syncState: "failed",
    attempts: next,
    nextAttemptAt: now + retryDelayMs(next, random),
    lastError: message,
    rejected: false,
  };
}

/**
 * Whether a record should be included in the next flush.
 *
 * `rejected` rows are excluded permanently. `failed` rows wait out their backoff.
 * `syncing` rows are excluded because a flush is already in flight — but see
 * `reclaimStale`: a process killed mid-flush would otherwise strand them.
 */
export function isDue(
  row: { syncState: SyncState; rejected: boolean; nextAttemptAt: number | null },
  now: number,
): boolean {
  if (row.rejected) return false;
  if (row.syncState === "synced" || row.syncState === "syncing") return false;
  if (row.syncState === "pending") return true;
  return row.nextAttemptAt === null || row.nextAttemptAt <= now;
}

/**
 * How long a row may sit in `syncing` before a flush is presumed dead.
 *
 * The app can be killed by the OS mid-request — backgrounded on a phone in a
 * pocket is the normal case, not the exception — leaving rows marked `syncing`
 * with no request behind them. Without reclamation those rows never sync again
 * and a worker's day silently never arrives.
 */
export const STALE_SYNCING_MS = 2 * 60 * 1000;

export function isStaleSyncing(
  row: { syncState: SyncState; nextAttemptAt: number | null },
  startedAt: number | null,
  now: number,
): boolean {
  if (row.syncState !== "syncing") return false;
  return startedAt === null || now - startedAt > STALE_SYNCING_MS;
}

/**
 * A worker-facing summary of the outbox. CONFLICT-6 requires the UI to show sync
 * state honestly rather than implying delivery, and "honestly" means separating
 * *not yet sent* from *will never send*.
 */
export type OutboxSummary = {
  pending: number;
  failed: number;
  rejected: number;
  synced: number;
};

export function summarize(
  rows: readonly { syncState: SyncState; rejected: boolean }[],
): OutboxSummary {
  const summary: OutboxSummary = { pending: 0, failed: 0, rejected: 0, synced: 0 };
  for (const row of rows) {
    if (row.rejected) summary.rejected += 1;
    else if (row.syncState === "synced") summary.synced += 1;
    else if (row.syncState === "failed") summary.failed += 1;
    else summary.pending += 1;
  }
  return summary;
}
