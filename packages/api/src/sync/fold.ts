import type { workSessionEvents } from "@trader/db";

/**
 * The fold: work sessions computed from the append-only event stream.
 *
 * There is no session row anywhere, by design (LOGIC.md SESSION preamble). A
 * session exists only as a fold over `work_session_events`, so the ledger and the
 * numbers can never disagree — DERIVE's whole premise.
 *
 * Everything here is a **pure function over events**. It reads no clock and
 * touches no database, which is what makes SESSION-3's rule testable: legality is
 * judged against the timeline with an incoming event inserted at its
 * `client_timestamp` position, never against whatever happened to arrive last.
 */

export type EventRow = typeof workSessionEvents.$inferSelect;

/** The subset the fold actually reads. Keeps tests from constructing whole rows. */
export type FoldEvent = Pick<
  EventRow,
  "id" | "workerId" | "jobId" | "type" | "clientTimestamp" | "serverTimestamp"
>;

export type EventType = FoldEvent["type"];

/**
 * LOGIC.md SESSION-2, as data rather than branching. `ended` and `voided` are
 * terminal and so appear as empty sets rather than being absent — an absent key
 * would be indistinguishable from a typo at the call site.
 */
const LEGAL_NEXT: Record<EventType, readonly EventType[]> = {
  started: ["paused", "ended", "voided"],
  paused: ["resumed", "ended", "voided"],
  resumed: ["paused", "ended", "voided"],
  ended: [],
  voided: [],
};

/** What may open a session when none is in progress (SESSION-2, first row). */
const OPENING: EventType = "started";

const TERMINAL: readonly EventType[] = ["ended", "voided"];

export const isTerminal = (t: EventType): boolean => TERMINAL.includes(t);

/**
 * Total order over events: `client_timestamp`, then `server_timestamp` as
 * tiebreaker (CONFLICT-2), then `id` so the sort is deterministic even when both
 * timestamps tie. Without that last key, two events written in the same
 * millisecond could fold differently on different runs — which in a payroll
 * ledger is the worst kind of bug, because it is not reproducible.
 */
export function compareEvents(a: FoldEvent, b: FoldEvent): number {
  const byClient = a.clientTimestamp.getTime() - b.clientTimestamp.getTime();
  if (byClient !== 0) return byClient;
  const byServer = a.serverTimestamp.getTime() - b.serverTimestamp.getTime();
  if (byServer !== 0) return byServer;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export const orderEvents = <T extends FoldEvent>(events: readonly T[]): T[] =>
  [...events].sort(compareEvents);

export type Session = {
  /** The `started` event's id. Sessions have no id of their own — they are a fold. */
  startedEventId: string;
  jobId: string;
  startedAt: Date;
  /** Absent while the session is still open (DERIVE-5). */
  endedAt: Date | null;
  voided: boolean;
  /** Sum of worked intervals, excluding paused spans (DERIVE-3). Zero if voided. */
  workedMs: number;
  events: FoldEvent[];
};

/**
 * Folds one worker's events into sessions, in timeline order.
 *
 * Callers must pass **one worker's** events. Mixing workers would silently
 * violate SESSION-1, since the "at most one open session" invariant is per worker.
 */
export function foldSessions(events: readonly FoldEvent[]): Session[] {
  const ordered = orderEvents(events);
  const sessions: Session[] = [];

  let current: Session | null = null;
  // When the last worked interval opened. Null while paused — which is exactly
  // how DERIVE-3 excludes paused spans: no open interval, nothing accumulates.
  let intervalStart: Date | null = null;

  const closeInterval = (at: Date) => {
    if (current && intervalStart) {
      current.workedMs += at.getTime() - intervalStart.getTime();
      intervalStart = null;
    }
  };

  for (const event of ordered) {
    switch (event.type) {
      case "started":
        current = {
          startedEventId: event.id,
          jobId: event.jobId,
          startedAt: event.clientTimestamp,
          endedAt: null,
          voided: false,
          workedMs: 0,
          events: [event],
        };
        intervalStart = event.clientTimestamp;
        sessions.push(current);
        break;

      case "paused":
        if (!current) break;
        current.events.push(event);
        closeInterval(event.clientTimestamp);
        break;

      case "resumed":
        if (!current) break;
        current.events.push(event);
        // Guard against a duplicate `resumed`: reopening an already-open interval
        // would discard the accumulated start and undercount the session.
        intervalStart ??= event.clientTimestamp;
        break;

      case "ended":
        if (!current) break;
        current.events.push(event);
        closeInterval(event.clientTimestamp);
        current.endedAt = event.clientTimestamp;
        current = null;
        break;

      case "voided":
        if (!current) break;
        current.events.push(event);
        // DERIVE-4: a voided session contributes zero, whatever its events would
        // otherwise fold to. Set rather than accumulated, so no later arithmetic
        // can reintroduce time.
        current.voided = true;
        current.workedMs = 0;
        current.endedAt = event.clientTimestamp;
        intervalStart = null;
        current = null;
        break;
    }
  }

  return sessions;
}

/** The open session, if any. SESSION-1 guarantees there is at most one. */
export function openSession(events: readonly FoldEvent[]): Session | null {
  const sessions = foldSessions(events);
  const last = sessions[sessions.length - 1];
  return last && last.endedAt === null ? last : null;
}

export type Legality =
  { ok: true } | { ok: false; reason: string; conflictingEventId?: string };

/**
 * SESSION-3: is `candidate` legal, judged against the timeline **with it inserted
 * at its own `client_timestamp` position**?
 *
 * This is the rule that makes out-of-order sync work. A `resumed` that reaches the
 * server before its own `paused` is legal and must not be rejected, so legality
 * can never be evaluated against "the latest state we happen to have".
 *
 * Note what is checked: the state immediately *before* the candidate's position,
 * and — because inserting into the middle of history also changes what follows —
 * that the event which used to come next is still legal after it.
 */
export function checkLegality(
  existing: readonly FoldEvent[],
  candidate: FoldEvent,
): Legality {
  // An id already present is not an illegality — CONFLICT-1 makes a repeat a
  // successful no-op. The caller distinguishes the two; here it is simply legal.
  if (existing.some((e) => e.id === candidate.id)) return { ok: true };

  const ordered = orderEvents(existing);
  const at = ordered.findIndex((e) => compareEvents(e, candidate) > 0);
  const index = at === -1 ? ordered.length : at;

  const before = ordered.slice(0, index);
  const after = ordered.slice(index);

  const stateBefore = currentTypeAfter(before);
  const legal = stateBefore === null ? [OPENING] : LEGAL_NEXT[stateBefore.type];

  if (!legal.includes(candidate.type)) {
    return {
      ok: false,
      reason:
        stateBefore === null
          ? `Cannot ${candidate.type} with no open session; expected ${OPENING}.`
          : `Cannot ${candidate.type} after ${stateBefore.type}.`,
      ...(stateBefore ? { conflictingEventId: stateBefore.id } : {}),
    };
  }

  // Inserting in the middle rewrites the future. A `started` slipped in before an
  // existing open session would breach SESSION-1, and an `ended` before another
  // `ended` would orphan the second — neither is visible from `stateBefore` alone.
  const nextEvent = after[0];
  if (nextEvent) {
    const legalAfterCandidate = isTerminal(candidate.type)
      ? [OPENING]
      : LEGAL_NEXT[candidate.type];
    if (!legalAfterCandidate.includes(nextEvent.type)) {
      return {
        ok: false,
        reason: `Inserting ${candidate.type} here would leave the following ${nextEvent.type} illegal.`,
        conflictingEventId: nextEvent.id,
      };
    }
  }

  return { ok: true };
}

/**
 * The session-defining event in effect at the end of `ordered`, or null when no
 * session is open. Terminal events close the session and yield null.
 */
function currentTypeAfter(ordered: readonly FoldEvent[]): FoldEvent | null {
  let state: FoldEvent | null = null;
  for (const e of ordered) {
    if (e.type === OPENING) state = e;
    else if (isTerminal(e.type)) state = null;
    else if (state) state = e;
  }
  return state;
}
