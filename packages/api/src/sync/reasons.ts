// An entry's flags (offline, corrected, user-timed, location, clock skew, unscheduled). Pure:
// no database, no clock. Every flag is computed here, in one place, and written once with
// the entry it describes (work_session_events.flags). A flag is evidence for the office and
// never keeps an entry from counting.
import type { entryFlag } from "@trader/db/schema";

export type EntryFlag = (typeof entryFlag.enumValues)[number];

// Device skew is |device_now − server_now| against a five-minute
// tolerance, measured once per push. Strictly beyond it is skewed: exactly five minutes is not.
// One of the two sources of a labor event's `clock_skewed`; judgeEventTime below is the other.
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

// The push's reading of the device's clock: `deviceNow` as the push carried it, and its skew.
export type Skew = { clockSkewMs: number; clockSkewed: boolean; deviceNow: Date };

// Signed, device minus server, so a ledger that cannot be backfilled keeps the direction.
export function measureSkew(deviceNow: Date, serverNow: Date): Skew {
  const clockSkewMs = deviceNow.getTime() - serverNow.getTime();
  return {
    clockSkewMs,
    clockSkewed: Math.abs(clockSkewMs) > CLOCK_SKEW_TOLERANCE_MS,
    deviceNow,
  };
}

// "Captured online" is the phone's word that an entry was sent as it was tapped. One that
// reaches the server more than two minutes after its tap, by the device's own clock (so no
// skew enters it), waited somewhere: it is judged as captured offline (the owner's decision
// 6, M3). Strictly beyond: exactly two minutes is at once. The row keeps what the phone sent.
const LATE_PUSH_MS = 2 * 60 * 1000;

export function capturedOfflineIn(
  e: { capturedOffline: boolean; clientTimestamp: Date },
  deviceNow: Date,
): boolean {
  return (
    e.capturedOffline || deviceNow.getTime() - e.clientTimestamp.getTime() > LATE_PUSH_MS
  );
}

// The server's own check on the time an event claims (invariant 3),
// against its receipt: the stamp the event is stored with (`server_timestamp`), so the verdict
// can be read back off the row. `future`: later than the receipt by more than the tolerance,
// whatever the event says of itself; it is refused. `skewed`: it claims an online capture at
// the moment it carries — not captured offline, not timed by the user — yet precedes its
// receipt by more than the tolerance; it is stored at that time and flagged for the
// office. An offline or user-timed event already carries its own flag, however old.
// Strict on both sides, as measureSkew is: exactly the tolerance is neither.
type EventTimeVerdict = "plausible" | "skewed" | "future";

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

// Its location stamp is missing or outside the job's radius. Stamps are taken at
// clock-in, clock-out and job switch — `started` and `ended` — so a pause or resume is never
// flagged. Accuracy is not subtracted: an imprecise fix errs toward the flag. A job with no
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

// The enum's order, so equal facts give equal arrays.
export const REASON_ORDER: readonly EntryFlag[] = [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
  "unscheduled",
];
const ordered = (flags: Partial<Record<EntryFlag, boolean>>): EntryFlag[] =>
  REASON_ORDER.filter((r) => flags[r] === true);

// `corrected` is an entry the office wrote (labor.repair): a correction, a void, or hours
// it added. A device push never is. `stamped` is whether a location is asked of the entry at
// all: never of one the office wrote, and not of a tap where the company's switch or the
// person's has the stamps off (sync/scope.ts). Not asked, it is never flagged `location`.
// A void carries no stamp and is never flagged for one.
export function laborReasons(e: {
  type: "started" | "paused" | "resumed" | "ended" | "voided";
  corrected: boolean;
  capturedOffline: boolean;
  timeSetByUser: boolean;
  stamped: boolean;
  stamp: Point | null;
  job: JobPlace;
  clockSkewed: boolean;
  // A start the schedule did not admit, stored flagged (sync/schedule.ts). Push alone
  // says so: an office repair is never judged by the schedule.
  unscheduled?: boolean;
}): EntryFlag[] {
  return ordered({
    offline: e.capturedOffline,
    corrected: e.corrected,
    user_timed: e.timeSetByUser,
    location: e.stamped && e.type !== "voided" && locationFlagged(e.type, e.stamp, e.job),
    clock_skewed: e.clockSkewed,
    unscheduled: e.unscheduled === true,
  });
}
