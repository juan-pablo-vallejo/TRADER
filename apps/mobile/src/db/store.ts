import type { FoldEvent } from "@trader/api/sync";
import { asc, eq, inArray } from "drizzle-orm";

import { localDb } from "./client";
import { localEvents, type AttestationLevel, type LocalEventType } from "./schema";

/**
 * Reading and writing the device's labor events.
 *
 * The write path is the one that must never fail for an avoidable reason: SPEC
 * §3 puts the network off the critical path of a user action, so `recordEvent`
 * touches nothing but SQLite.
 */

export type LocalEventRow = typeof localEvents.$inferSelect;

/**
 * UUIDv7, generated on the device that observed the event.
 *
 * Hand-rolled rather than pulled from a dependency: it is twenty lines, the
 * layout is fixed by RFC 9562, and this runs before a worker can clock in — a
 * package that fails to resolve under Metro would take the whole capture path
 * down with it. Time-sortable by construction, which is what makes ids useful as
 * a CONFLICT-2 tiebreaker rather than merely unique.
 */
export function uuidv7(now: number = Date.now(), rand = Math.random): string {
  const ms = BigInt(now);
  const hex = ms.toString(16).padStart(12, "0");
  const b = new Uint8Array(16);
  for (let i = 0; i < 6; i += 1)
    b[i] = Number(BigInt(`0x${hex.slice(i * 2, i * 2 + 2)}`));
  for (let i = 6; i < 16; i += 1) b[i] = Math.floor(rand() * 256);
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 9562 variant
  const s = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export type NewEvent = {
  jobId: string;
  type: LocalEventType;
  clientTimestamp?: Date;
  attestationLevel?: AttestationLevel;
  deviceLat?: number | null;
  deviceLng?: number | null;
  deviceAccuracyM?: number | null;
};

/**
 * Records a labor event locally and returns immediately.
 *
 * No network, no await on anything remote, no attestation gate (ATTEST-4) and no
 * GPS wait (SPEC §3). The event is durable the moment this returns; sync is a
 * separate concern that runs later and may run many times.
 */
export function recordEvent(event: NewEvent): LocalEventRow {
  const row = {
    id: uuidv7(),
    jobId: event.jobId,
    type: event.type,
    clientTimestamp: (event.clientTimestamp ?? new Date()).getTime(),
    attestationLevel: event.attestationLevel ?? "none",
    deviceLat: event.deviceLat ?? null,
    deviceLng: event.deviceLng ?? null,
    deviceAccuracyM: event.deviceAccuracyM ?? null,
    payload: null,
    syncState: "pending" as const,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    rejected: false,
  };
  localDb.insert(localEvents).values(row).run();
  return row;
}

export function allEvents(): LocalEventRow[] {
  return localDb
    .select()
    .from(localEvents)
    .orderBy(asc(localEvents.clientTimestamp))
    .all();
}

/**
 * Local rows as the shared fold expects them.
 *
 * The fold lives in `@trader/api` and runs unchanged on both sides — DERIVE-6
 * permits a device to compute the same values for display, and using the same
 * code means a disagreement can only ever be a data difference, never two
 * implementations drifting apart.
 *
 * `serverTimestamp` is the local timestamp here, because the device does not know
 * the server's. It only matters as a CONFLICT-2 tiebreaker between events sharing
 * a `client_timestamp`, and locally that ordering is already settled by id.
 */
export function toFoldEvents(rows: readonly LocalEventRow[]): FoldEvent[] {
  return rows
    .filter((r) => !r.rejected) // Never written server-side; must not appear in a local total either.
    .map((r) => ({
      id: r.id,
      workerId: "self",
      jobId: r.jobId,
      type: r.type,
      clientTimestamp: new Date(r.clientTimestamp),
      serverTimestamp: new Date(r.clientTimestamp),
    }));
}

export function markSyncing(ids: readonly string[]): void {
  if (ids.length === 0) return;
  localDb
    .update(localEvents)
    .set({ syncState: "syncing" })
    .where(inArray(localEvents.id, [...ids]))
    .run();
}

export function applyTransition(
  id: string,
  t: {
    syncState: LocalEventRow["syncState"];
    attempts: number;
    nextAttemptAt: number | null;
    lastError: string | null;
    rejected: boolean;
  },
): void {
  localDb.update(localEvents).set(t).where(eq(localEvents.id, id)).run();
}
