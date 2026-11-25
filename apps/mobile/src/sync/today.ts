// What Today works out from the last pull, the entries still on this phone and the time.
// Pure, like clock.ts beside it: the screen draws what these answer and decides nothing.
// The server alone decides what counts; these say what to expect and what is waiting.
import {
  CLOCK_SKEW_TOLERANCE_MS,
  clockAfter,
  type LaborPayload,
  type PullOutput,
  wallClock,
} from "@trader/api/contract";

import type { ClockState } from "./clock";
import type { CycleResult } from "./engine";
import type { OutboxRecord } from "./types";

// The skew the server tolerates before it flags an entry.
const SKEW_MS = CLOCK_SKEW_TOLERANCE_MS;

type Mark = { id: string; at: number; type: LaborPayload["type"]; jobId: string };

// The marks the timer and the hours read: the pull's events (a voided one and one the office
// replaced left out), then this phone's records the pull does not show yet, a refused one
// left out. `trusted` is false for a record not answered yet: it moves the clock only as
// the server's rule would (clock.ts).
function marksOf(
  data: PullOutput,
  records: readonly OutboxRecord[],
): { pulled: Mark[]; local: (Mark & { trusted: boolean })[] } {
  const known = new Set(data.events.map((e) => e.id));
  const replaced = new Set(
    data.events.flatMap((e) => (e.correctsEventId === null ? [] : [e.correctsEventId])),
  );
  return {
    pulled: data.events
      .filter((e) => e.type !== "voided" && !replaced.has(e.id))
      .map((e) => ({
        id: e.id,
        at: e.clientTimestamp.getTime(),
        type: e.type as LaborPayload["type"],
        jobId: e.jobId,
      })),
    local: records
      .filter((r) => r.standing !== "rejected" && !known.has(r.id))
      .map((r) => ({
        id: r.id,
        at: r.payload.clientTimestamp.getTime(),
        type: r.payload.type,
        jobId: r.payload.jobId,
        trusted: r.standing === "settled",
      })),
  };
}

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
  const { pulled, local } = marksOf(data, records);
  const marks = [...pulled, ...local]
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

type Session = PullOutput["sessions"][number];

// The person's sessions as of `now`: those the pull shows closed, as the server folded them;
// then the one it shows open and any begun on this phone since, each worked out from the
// same marks as the timer and counted up to `now` while it runs. The server's fold holds
// an open session's closed intervals only, so its hours alone read about nothing beside a
// running timer. What is worked out here is what the phone expects; the next pull's hours
// are the server's word.
export function liveSessions(
  data: PullOutput,
  records: readonly OutboxRecord[],
  now: number,
): Session[] {
  const closed = data.sessions.filter((s) => s.endedAt !== null);
  const open = data.sessions.find((s) => s.endedAt === null);
  const zone = data.company.timezone;
  const { pulled, local } = marksOf(data, records);
  const from = open?.startedAt.getTime() ?? Number.POSITIVE_INFINITY;
  const marks = [
    // The open session's breaks: on the server's timeline nothing else follows its clock-in.
    ...pulled
      .filter((m) => m.at > from && (m.type === "paused" || m.type === "resumed"))
      .map((m) => ({ ...m, trusted: true })),
    ...local,
  ].sort((a, b) => a.at - b.at);

  type Running = Session & { mark: number };
  const out: Session[] = [...closed];
  let current: Running | null =
    open === undefined
      ? null
      : {
          ...open,
          state: "working",
          workedMs: 0,
          breakMs: 0,
          mark: open.startedAt.getTime(),
        };
  const settle = (s: Running, at: number) => {
    const span = Math.max(0, at - s.mark);
    if (s.state === "working") s.workedMs += span;
    else s.breakMs += span;
    s.mark = at;
  };
  const finish = (s: Running, endedAt: Date | null) => {
    const { mark: _mark, ...session } = s;
    out.push({
      ...session,
      endedAt,
      state: endedAt === null ? s.state : "ended",
      // The office took a voided session off the record: it counts nothing.
      workedMs: s.voided ? 0 : s.workedMs,
      breakMs: s.voided ? 0 : s.breakMs,
    });
  };

  for (const m of marks) {
    const step =
      current === null ? "idle" : current.state === "paused" ? "paused" : "working";
    if (!m.trusted && clockAfter(step, m.type) === undefined) continue;
    if (m.type === "started") {
      if (current !== null) {
        settle(current, m.at);
        finish(current, new Date(m.at));
      }
      current = {
        rootEventId: m.id,
        jobId: m.jobId,
        workDate: wallClock(new Date(m.at), zone).day,
        startedAt: new Date(m.at),
        endedAt: null,
        state: "working",
        workedMs: 0,
        breakMs: 0,
        voided: false,
        mark: m.at,
      };
    } else if (current !== null) {
      // A break stamped before its session began comes from a clock set back: the timer
      // leaves it out (sessionWorkedMs), and so do the hours.
      if (m.type !== "ended" && m.at <= current.startedAt.getTime()) continue;
      settle(current, m.at);
      if (m.type === "ended") {
        finish(current, new Date(m.at));
        current = null;
      } else if (m.type === "paused") current.state = "paused";
      else if (m.type === "resumed") current.state = "working";
    }
  }
  if (current !== null) {
    settle(current, Math.max(now, current.mark));
    finish(current, null);
  }
  return out;
}

// The hours worked on one day of the company's calendar, the running clock counted.
export function workedOn(
  data: PullOutput,
  records: readonly OutboxRecord[],
  day: string,
  now: number,
): number {
  return liveSessions(data, records, now)
    .filter((s) => s.workDate === day && !s.voided)
    .reduce((sum, s) => sum + s.workedMs, 0);
}

// A length of time as a timer shows it, to the second: `0:07:05`, `12:30:00`.
export function timer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

// The timer as a screen reader says it: whole hours and minutes, the seconds left out.
export function spokenTimer(ms: number): { hours: number; minutes: number } {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
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
  // Entries not sent yet, and entries the server refused (listed in the sheet, answered or
  // not).
  unsent: number;
  refused: number;
  // Why sending is held, when it is: said in the sheet the chip opens.
  held: "sign_in" | "paused" | "update" | "read_only" | "offline" | null;
  wrongClock: boolean;
};

// Whether a refused entry has been answered: an entry for the same day of the company's
// calendar, made after it, was accepted, a later one of this phone's or one the pull shows
// (the office's correction among them). "Made after" is read from the ids, which are
// time-ordered by their making: when the server took an entry says nothing of that, since a
// day captured offline arrives at once. Until then the chip
// stays on Needs attention; after, the refusal is still listed in the sheet.
function corrected(
  refusal: OutboxRecord,
  data: PullOutput | null,
  records: readonly OutboxRecord[],
): boolean {
  const zone = data?.company.timezone ?? "UTC";
  const day = wallClock(refusal.payload.clientTimestamp, zone).day;
  const sameDay = (at: Date) => wallClock(at, zone).day === day;
  return (
    records.some(
      (r) =>
        r.standing === "settled" &&
        r.id > refusal.id &&
        sameDay(r.payload.clientTimestamp),
    ) || (data?.events ?? []).some((e) => e.id > refusal.id && sameDay(e.clientTimestamp))
  );
}

export function waiting(input: {
  // The last pull's, or null before the first.
  data: PullOutput | null;
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
  const refusals = records.filter((r) => r.standing === "rejected");
  const rejected = refusals.length;
  const unanswered = refusals.filter((r) => !corrected(r, input.data, records)).length;
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
    unanswered > 0 ||
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

// How many entries a cycle just heard refused: what is felt and said at once (provider.tsx).
// Only the cycle that read the refusal counts it; a refused record is never sent again, so
// no later cycle counts it twice.
export const newlyRefused = (result: CycleResult): number =>
  result.outcome === "synced" ? result.rejected : 0;

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

// Why Today has nothing to show: no pull has ever reached this phone. The session refused
// first, since signing in again is then the only way; then what the last cycle met. A
// connection is asked for only when the server was not reached. Null before the first
// cycle ends: still loading.
export type NothingLoaded = "sign_in" | "update" | "paused" | "offline" | "failed";
export function nothingLoaded(
  last: CycleResult | null,
  refused: boolean,
): NothingLoaded | null {
  if (refused) return "sign_in";
  if (last === null) return null;
  if (last.outcome === "unreachable") return "offline";
  if (last.outcome === "held") return last.state === "paused" ? "paused" : "update";
  return "failed";
}

// What is said as the chip turns to Needs attention: what the person must do. A refusal is
// said by the cycle that heard it (newlyRefused), so it is not said twice here.
export type AttentionNews = "sign_in" | "paused" | "update" | "wrong_clock";
export function attentionNews(where: Waiting): AttentionNews | null {
  if (where.state !== "attention") return null;
  if (where.held === "sign_in" || where.held === "paused" || where.held === "update") {
    return where.held;
  }
  return where.wrongClock ? "wrong_clock" : null;
}
