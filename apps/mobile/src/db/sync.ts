import type { PushResult } from "@trader/api/sync";
import { asc } from "drizzle-orm";

import { localDb } from "./client";
import { applyPushResult, applyTransportFailure, isDue } from "./outbox-logic";
import { localEvents } from "./schema";
import { applyTransition, markSyncing, type LocalEventRow } from "./store";

/**
 * The flush: everything due, oldest-first (CONFLICT-6).
 *
 * Takes the push call as an argument rather than importing a tRPC client, so the
 * scheduling logic can be exercised without a server, and so this file has no
 * opinion about transport.
 */
export type PushFn = (batch: {
  deviceNow: Date;
  events: {
    id: string;
    jobId: string;
    type: LocalEventRow["type"];
    clientTimestamp: Date;
    attestationLevel: LocalEventRow["attestationLevel"];
    deviceLat: number | null;
    deviceLng: number | null;
    deviceAccuracyM: number | null;
  }[];
}) => Promise<{ results: PushResult[]; skewMs: number }>;

export type FlushOutcome = {
  attempted: number;
  synced: number;
  rejected: number;
  retrying: number;
};

export async function flushOutbox(
  push: PushFn,
  now: number = Date.now(),
  random: () => number = Math.random,
): Promise<FlushOutcome> {
  const due = localDb
    .select()
    .from(localEvents)
    .orderBy(asc(localEvents.clientTimestamp))
    .all()
    .filter((row) => isDue(row, now));

  if (due.length === 0) return { attempted: 0, synced: 0, rejected: 0, retrying: 0 };

  markSyncing(due.map((r) => r.id));

  let results: PushResult[];
  try {
    const response = await push({
      // CONFLICT-4: the device's clock *now*, so the server can tell a wrong
      // clock from an event that merely waited in this outbox.
      deviceNow: new Date(now),
      events: due.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        type: r.type,
        clientTimestamp: new Date(r.clientTimestamp),
        attestationLevel: r.attestationLevel,
        deviceLat: r.deviceLat,
        deviceLng: r.deviceLng,
        deviceAccuracyM: r.deviceAccuracyM,
      })),
    });
    results = response.results;
  } catch (error) {
    // The request never landed. Every row goes back to waiting — none of them is
    // known to be bad, so none may be abandoned.
    const message = error instanceof Error ? error.message : "Sync failed";
    for (const row of due) {
      applyTransition(
        row.id,
        applyTransportFailure(row.attempts, message, now, random()),
      );
    }
    return { attempted: due.length, synced: 0, rejected: 0, retrying: due.length };
  }

  const outcome: FlushOutcome = {
    attempted: due.length,
    synced: 0,
    rejected: 0,
    retrying: 0,
  };
  const answered = new Set(results.map((r) => r.id));

  for (const result of results) {
    const row = due.find((r) => r.id === result.id);
    if (!row) continue;
    const transition = applyPushResult(result, row.attempts);
    applyTransition(row.id, transition);
    if (transition.syncState === "synced") outcome.synced += 1;
    else outcome.rejected += 1;
  }

  // A response that omits a row is not success. Leaving it in `syncing` would
  // strand it forever, so it is treated as a transport failure and retried.
  for (const row of due) {
    if (answered.has(row.id)) continue;
    applyTransition(
      row.id,
      applyTransportFailure(
        row.attempts,
        "No result returned for this event",
        now,
        random(),
      ),
    );
    outcome.retrying += 1;
  }

  return outcome;
}
