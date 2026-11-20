// What Today works out from the last pull, the entries still on this phone and the time.
// Pure, like clock.ts beside it: the screen draws what these answer and decides nothing.
// The server alone decides what counts; these say what to expect and what is waiting.
import type { LaborPayload, PullOutput } from "@trader/api/contract";

import type { ClockState } from "./clock";
import type { CycleResult } from "./engine";
import type { OutboxRecord } from "./types";

// The server tolerates five minutes of skew before it flags an entry.
export const SKEW_MS = 5 * 60_000;

// Time worked in the session the clock is in, breaks left out: from its clock-in, through
// every break start and end the phone knows of, to `now`. The pull's events first, then
// the records it does not show yet, in the order they happened. An entry the office
// replaced is read in its corrected form only on the next pull's own hours (Week): this is
// a running timer, and it never claims to be payroll.
export function sessionWorkedMs(
  data: PullOutput,
  records: readonly OutboxRecord[],
  clock: ClockState,
  now: number,
): number {
  if (clock.status === "off") return 0;
  const from = clock.since.getTime();
  const known = new Set(data.events.map((e) => e.id));
  const replaced = new Set(
    data.events.flatMap((e) => (e.correctsEventId === null ? [] : [e.correctsEventId])),
  );
  const marks: { at: number; type: LaborPayload["type"] }[] = [
    ...data.events
      .filter((e) => e.type !== "voided" && !replaced.has(e.id))
      .map((e) => ({
        at: e.clientTimestamp.getTime(),
        type: e.type as LaborPayload["type"],
      })),
    ...records
      .filter((r) => r.standing !== "rejected" && !known.has(r.id))
      .map((r) => ({ at: r.payload.clientTimestamp.getTime(), type: r.payload.type })),
  ]
    .filter((m) => m.at > from && (m.type === "paused" || m.type === "resumed"))
    .sort((a, b) => a.at - b.at);

  let worked = 0;
  let workingSince: number | null = from;
  for (const mark of marks) {
    if (mark.type === "paused" && workingSince !== null) {
      worked += mark.at - workingSince;
      workingSince = null;
    } else if (mark.type === "resumed" && workingSince === null) {
      workingSince = mark.at;
    }
  }
  if (workingSince !== null) worked += now - workingSince;
  return Math.max(0, worked);
}

// A length of time as a timer shows it, to the second: `0:07:05`, `12:30:00`.
export function timer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

// Whether the session the clock is in began on an earlier day of the company's calendar:
// somebody forgot to clock out. `sinceDay` and `today` are `YYYY-MM-DD`, so text order is
// date order.
export const fromEarlierDay = (sinceDay: string, today: string): boolean =>
  sinceDay < today;

// Where this phone's entries stand, in the chip's four words.
export type ChipState = "sent" | "saved" | "sending" | "attention";

export type Waiting = {
  state: ChipState;
  // Entries not sent yet, and entries the server refused.
  unsent: number;
  refused: number;
  // Why sending is held, when it is: said in the sheet the chip opens.
  held: "sign_in" | "paused" | "update" | "read_only" | "offline" | null;
  wrongClock: boolean;
};

export function waiting(input: {
  records: readonly OutboxRecord[];
  last: CycleResult | null;
  syncing: boolean;
  // The server would not take this session.
  refused: boolean;
}): Waiting {
  const { records, last } = input;
  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;
  const rejected = records.filter((r) => r.standing === "rejected").length;
  const held: Waiting["held"] = input.refused
    ? "sign_in"
    : last?.outcome === "held"
      ? last.state === "paused"
        ? "paused"
        : "update"
      : last?.outcome === "unreachable"
        ? "offline"
        : last?.outcome === "synced" && last.state === "read_only" && unsent > 0
          ? "read_only"
          : null;
  const wrongClock =
    last?.outcome === "synced" &&
    last.clockSkewMs !== null &&
    Math.abs(last.clockSkewMs) > SKEW_MS;
  // Something a person must do, or must know went wrong: attention. No connection is not
  // that: the entries are safe on the phone, which is what "Saved on phone" says.
  const attention =
    rejected > 0 ||
    wrongClock ||
    held === "sign_in" ||
    held === "paused" ||
    held === "update";
  const state: ChipState = attention
    ? "attention"
    : unsent === 0
      ? "sent"
      : input.syncing && held === null
        ? "sending"
        : "saved";
  return { state, unsent, refused: rejected, held, wrongClock };
}

// Whether a tap is stamped with a location at all: the pull's own word for this person
// (their setting, else the company's). Off, the app neither asks for a location nor sends
// one. Before the first pull nothing is known, and nothing is asked.
export const stampsOn = (data: PullOutput | null): boolean =>
  data !== null && data.locationStamps;

// A link that opens the phone's own maps on an address: Apple Maps on an iPhone, the
// `geo:` handler (Google Maps, usually) on Android. The address is the query, as typed by
// the office; no coordinates are sent, since the phone is never told a job's.
export function mapsLink(address: string, platform: "ios" | "android" | string): string {
  const q = encodeURIComponent(address);
  return platform === "ios" ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
}

// A link that dials: the first run of a number as the office typed it, its digits and a
// leading plus kept and the spaces, dots, dashes and brackets dropped. What follows that
// run (an extension, a name) is not dialed. Null when nothing dialable is there.
export function telLink(phone: string | null): string | null {
  if (phone === null) return null;
  const run = /\+?[\d\s().-]*\d/.exec(phone)?.[0] ?? "";
  const digits = run.replace(/[^\d+]/g, "");
  return /\d{3,}/.test(digits) ? `tel:${digits}` : null;
}
