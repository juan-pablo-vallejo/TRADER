// The approval rule's facts at push (PRD, Office approval; ARCHITECTURE, sync decisions of
// 2026-11-05). Pure: no database, no clock. Every reason is computed here, in one place, and
// written once with the entry it describes; the database requires the column-derived ones
// (migrations 0022 and 0026). Consumed by sync/labor.ts, sync/material.ts and labor/repair.ts.
import type { approvalReason } from "@trader/db/schema";

export type ApprovalReason = (typeof approvalReason.enumValues)[number];

// ARCHITECTURE, Sync protocol: device skew is |device_now − server_now| against a five-minute
// tolerance, measured once per push. Strictly beyond it is skewed: exactly five minutes is not.
// One of the two sources of a labor event's `clock_skewed`; judgeEventTime below is the other.
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type Skew = { clockSkewMs: number; clockSkewed: boolean };

// Signed, device minus server, so a ledger that cannot be backfilled keeps the direction.
export function measureSkew(deviceNow: Date, serverNow: Date): Skew {
  const clockSkewMs = deviceNow.getTime() - serverNow.getTime();
  return { clockSkewMs, clockSkewed: Math.abs(clockSkewMs) > CLOCK_SKEW_TOLERANCE_MS };
}

// The server's own check on the time an event claims (V1-D01; ARCHITECTURE, Sync protocol),
// against its receipt: the stamp the event is stored with (`server_timestamp`), so the verdict
// can be read back off the row. `future`: later than the receipt by more than the tolerance,
// whatever the event says of itself; it is refused. `skewed`: it claims an online capture at
// the moment it carries — not captured offline, not timed by the user — yet precedes its
// receipt by more than the tolerance; it is stored at that time, flagged, and a person
// decides. An offline or user-timed event is already in approval for that, however old.
// Strict on both sides, as measureSkew is: exactly the tolerance is neither.
export type EventTimeVerdict = "plausible" | "skewed" | "future";

export function judgeEventTime(e: {
  clientTimestamp: Date;
  receivedAt: Date;
  capturedOffline: boolean;
  timeSetByUser: boolean;
}): EventTimeVerdict {
  const ahead = e.clientTimestamp.getTime() - e.receivedAt.getTime();
  if (ahead > CLOCK_SKEW_TOLERANCE_MS) return "future";
  const claimsNow = !e.capturedOffline && !e.timeSetByUser;
  return claimsNow && ahead < -CLOCK_SKEW_TOLERANCE_MS ? "skewed" : "plausible";
}

export type Point = { lat: number; lng: number };

// The mean Earth radius (IUGG), in metres. A job's radius is hundreds of metres, so the
// sphere's error against the ellipsoid (under 0.5 %) never decides a flag that matters.
const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type JobPlace = { lat: number; lng: number; radiusM: number } | null;

// "Its location stamp is missing or outside the job's radius" (PRD). Stamps are taken at
// clock-in, clock-out and job switch — `started` and `ended` — so a pause or resume is never
// flagged. Accuracy is not subtracted: an imprecise fix errs toward approval. A job with no
// place can only flag a missing stamp (jobs.ts).
export function locationFlagged(
  type: "started" | "paused" | "resumed" | "ended",
  stamp: Point | null,
  job: JobPlace,
): boolean {
  if (type !== "started" && type !== "ended") return false;
  if (stamp === null) return true;
  return job !== null && haversineMeters(stamp, job) > job.radiusM;
}

// Reasons in the enum's order, so equal facts give equal arrays.
const ordered = (flags: Partial<Record<ApprovalReason, boolean>>): ApprovalReason[] =>
  (
    [
      "offline",
      "corrected",
      "user_timed",
      "location",
      "clock_skewed",
      "after_closeout",
    ] as const
  ).filter((r) => flags[r] === true);

// `corrected` is a corrects_event_id or a void (enums.ts): only the office writes either
// (labor.repair); a device push never does. A void carries no stamp and is never flagged for one.
export function laborReasons(e: {
  type: "started" | "paused" | "resumed" | "ended" | "voided";
  corrected: boolean;
  capturedOffline: boolean;
  timeSetByUser: boolean;
  stamp: Point | null;
  job: JobPlace;
  clockSkewed: boolean;
  afterCloseout: boolean;
}): ApprovalReason[] {
  return ordered({
    offline: e.capturedOffline,
    corrected: e.corrected,
    user_timed: e.timeSetByUser,
    location: e.type !== "voided" && locationFlagged(e.type, e.stamp, e.job),
    clock_skewed: e.clockSkewed,
    after_closeout: e.afterCloseout,
  });
}

// A receipt has no user-set time and no stamp (PRD: stamps are at clock events only).
export function receiptReasons(r: {
  capturedOffline: boolean;
  clockSkewed: boolean;
  afterCloseout: boolean;
}): ApprovalReason[] {
  return ordered({
    offline: r.capturedOffline,
    clock_skewed: r.clockSkewed,
    after_closeout: r.afterCloseout,
  });
}
