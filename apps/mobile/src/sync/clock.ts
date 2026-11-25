// What the clock shows and what a tap on it records.
// Pure: the snapshot of the last pull, the records still on this phone, and the
// time. The phone shows what follows from them; the server alone decides what counts.
import {
  clockAfter,
  EARLY_MINUTES,
  type ClockStep,
  type LaborPayload,
  type PullOutput,
} from "@trader/api/contract";

import type { NewRecord, OutboxRecord } from "./types";

// A capture is "online" only on a confirmed reading of the API no
// older than this. The cycle's timer runs every minute while the app is in front
// (provider.tsx), so a fresh reading means at most one cycle was missed.
export const READING_FRESH_MS = 2 * 60_000;

export function capturedOffline(reading: number | null, now: number): boolean {
  return reading === null || now < reading || now - reading > READING_FRESH_MS;
}

export type ClockState =
  { status: "off" } | { status: "working" | "paused"; jobId: string; since: Date };

const stepOf = (state: ClockState): ClockStep =>
  state.status === "off" ? "idle" : state.status;

// The open session the server knows of, then every record of this phone the snapshot does
// not show yet, in the order they were captured. A record the server refused changes nothing;
// one it accepted moves the clock as it moved the server's; one not answered yet moves it only
// by the server's own rule (the contract's clockAfter), so a second clock-in while one is open
// changes nothing. A voided session still open is open: the server's fold reads it so and
// refuses a clock-in on top of it (packages/api labor/fold.ts), and the office ends one
// before voiding it.
export function clockState(
  snapshot: PullOutput | null,
  records: readonly OutboxRecord[],
): ClockState {
  let state: ClockState = { status: "off" };
  const open = snapshot?.sessions.find((s) => s.endedAt === null);
  if (open !== undefined && open.state !== "ended") {
    state = { status: open.state, jobId: open.jobId, since: open.startedAt };
  }
  const known = new Set(snapshot?.events.map((e) => e.id));
  for (const r of records) {
    if (r.standing === "rejected" || known.has(r.id)) continue;
    const { type, jobId, clientTimestamp } = r.payload;
    // A settled record is the server's own verdict: it moved the server's clock, whatever this
    // phone's last snapshot still shows. One not answered yet moves it only as the server's
    // rule would.
    if (r.standing !== "settled" && clockAfter(stepOf(state), type) === undefined)
      continue;
    if (type === "started") state = { status: "working", jobId, since: clientTimestamp };
    else if (type === "ended") state = { status: "off" };
    else if (state.status !== "off") {
      state = { ...state, status: type === "paused" ? "paused" : "working" };
    }
  }
  return state;
}

export type Tap =
  | { action: "start"; jobId: string }
  | { action: "pause" | "resume" | "end" }
  | { action: "switch"; jobId: string };

export type Capture = {
  me: string;
  now: number;
  // The last time the API answered, or null if it never has (engine.ts, READING_KEY).
  reading: number | null;
  // A position already in hand, or null: a capture never waits for one.
  location: LaborPayload["location"];
  mint: (now: number) => string;
};

// The records a tap writes, or none when the tap makes no sense from where the clock
// stands — the button for it is not shown then, so this is the second line of defence.
// A job switch is `ended` then `started`, minted and timed in that order: the server
// validates each at its own place in the batch (sync.push).
export function recordsFor(tap: Tap, state: ClockState, c: Capture): NewRecord[] {
  const event = (type: LaborPayload["type"], jobId: string, at: number): NewRecord => ({
    id: c.mint(at),
    ownerId: c.me,
    payload: {
      workerId: c.me,
      jobId,
      type,
      clientTimestamp: new Date(at),
      location: c.location,
      timeSetByUser: false,
      capturedOffline: capturedOffline(c.reading, c.now),
    },
  });
  // The server's rule decides what a tap may write from where the clock stands.
  const may = (entry: LaborPayload["type"]) =>
    clockAfter(stepOf(state), entry) !== undefined;
  switch (tap.action) {
    case "start":
      return may("started") ? [event("started", tap.jobId, c.now)] : [];
    case "pause":
      return may("paused") && state.status !== "off"
        ? [event("paused", state.jobId, c.now)]
        : [];
    case "resume":
      return may("resumed") && state.status !== "off"
        ? [event("resumed", state.jobId, c.now)]
        : [];
    case "end":
      return may("ended") && state.status !== "off"
        ? [event("ended", state.jobId, c.now)]
        : [];
    case "switch":
      return state.status === "off" || state.jobId === tap.jobId
        ? []
        : [event("ended", state.jobId, c.now), event("started", tap.jobId, c.now + 1)];
  }
}

// An instant as a day and a minute on a zone's wall clock: how the server places a start
// (sync/schedule.ts), done here with the platform's own zone data.
export function wallClock(
  instant: Date,
  timeZone: string,
): { day: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: `${part("hour")}:${part("minute")}`,
  };
}

type Shift = PullOutput["shifts"][number];

const minutes = (wall: string) =>
  Number(wall.slice(0, 2)) * 60 + Number(wall.slice(3, 5));

type Offer =
  // A shift the server would admit a start on now.
  | { kind: "eligible"; shift: Shift }
  // Shifts today, none of them now: the next one's start, if any is left.
  | { kind: "later"; next: { shift: Shift; start: string } | null }
  | { kind: "none" };

// Under enforcement, what the clock offers at this minute of the company's day.
export function offerAt(shifts: readonly Shift[], day: string, minute: string): Offer {
  const today = shifts.filter((s) => s.workDate === day);
  if (today.length === 0) return { kind: "none" };
  const at = minutes(minute);
  const windows = today
    .map((shift) => ({ shift, start: shift.start, end: shift.end }))
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  const inside = windows.find((w) => minutes(w.start) <= at && at < minutes(w.end));
  if (inside !== undefined) return { kind: "eligible", shift: inside.shift };
  const next = windows.find((w) => minutes(w.start) > at);
  if (next === undefined) return { kind: "later", next: null };
  return minutes(next.start) - at <= EARLY_MINUTES
    ? { kind: "eligible", shift: next.shift }
    : { kind: "later", next: { shift: next.shift, start: next.start } };
}
