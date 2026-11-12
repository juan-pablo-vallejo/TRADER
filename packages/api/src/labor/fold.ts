// The session fold (ARCHITECTURE invariant 7): one worker's work sessions, computed from the
// append-only `work_session_events` ledger and never stored. Pure: no database, no clock. The
// state machine below is the only encoding of the transition rules; validation (validate.ts)
// and derivation (work-date.ts) both run through `replay`, so they cannot drift apart.
// Consumed by validate.ts, work-date.ts and, from Stage 3 on, sync, closeout and approvals.
import type { workSessionEvents } from "@trader/db/schema";

type Row = typeof workSessionEvents.$inferSelect;

// The columns the fold reads, and `clockSkewed`, which it does not: the flag is evidence that
// travels with the ledger rows (sync.pull shows it), never a rule here. Everything else on the
// row is evidence for the office.
export type LaborEvent = Pick<
  Row,
  | "id"
  | "workerId"
  | "jobId"
  | "type"
  | "clientTimestamp"
  | "serverTimestamp"
  | "clockSkewed"
  | "voidsEventId"
  | "correctsEventId"
>;

export type EventType = LaborEvent["type"];
type PositionalType = Exclude<EventType, "voided">;

// Every way a timeline can be illegal. A closed union, so a device maps each to a localized
// message and nothing human-readable crosses the wire.
export type ViolationCode =
  | "no_open_session"
  | "session_already_open"
  | "not_paused"
  | "already_paused"
  | "target_missing"
  | "target_is_correction"
  | "correction_of_void"
  | "correction_type_mismatch"
  | "correction_job_mismatch"
  | "void_target_not_started"
  | "already_voided";

export type Violation = {
  code: ViolationCode;
  // The row whose values are in effect where the timeline breaks: an event, or the winning
  // correction standing in for it. Never the root a correction replaced.
  sourceEventId: string;
  priorSourceEventId?: string;
};

// A replay of a ledger that should already be legal found it illegal. The ledger, not the
// incoming event, is at fault: an internal error that is retried and reported, never a
// permanent rejection of a device's event.
export class LedgerInconsistentError extends Error {
  constructor(readonly violation: Violation) {
    super(`labor ledger inconsistent: ${violation.code} at ${violation.sourceEventId}`);
  }
}

// One instant per event for ordering, intervals and work date: the time it was captured with,
// flagged or not (V1-D01; ARCHITECTURE, Sync protocol). A suspicious time is reviewed by a
// person through its approval, never replaced by the receipt.
export const effectiveAt = (e: LaborEvent): Date => e.clientTimestamp;

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The total order: effective time, then receipt, then id. The last key makes it total, so
// two runs over the same ledger can never fold differently.
export function compareEvents(a: LaborEvent, b: LaborEvent): number {
  return (
    effectiveAt(a).getTime() - effectiveAt(b).getTime() ||
    a.serverTimestamp.getTime() - b.serverTimestamp.getTime() ||
    compareIds(a.id, b.id)
  );
}

// Acceptance order: receipt, then id. Decides which correction of a root wins and which of
// two voids of one session counts. Receipt stamps rise per worker under the timeline lock
// (timeline.ts), so a later stamp was accepted later; batch-mates share a stamp and fall to id.
const compareAcceptance = (a: LaborEvent, b: LaborEvent) =>
  a.serverTimestamp.getTime() - b.serverTimestamp.getTime() || compareIds(a.id, b.id);

type State = "idle" | "working" | "paused";

// Positional types only. A void is a reference to a session, not a step in it.
const TRANSITIONS: Record<State, Partial<Record<PositionalType, State>>> = {
  idle: { started: "working" },
  working: { paused: "paused", ended: "idle" },
  paused: { resumed: "working", ended: "idle" },
};

// Why `type` is not in TRANSITIONS[state]; called only for an illegal pair.
function illegal(state: State, type: PositionalType): ViolationCode {
  if (type === "started") return "session_already_open";
  if (state === "idle") return "no_open_session";
  return type === "resumed" ? "not_paused" : "already_paused";
}

export type Session = {
  // The `started` row's id: stable across corrections, so it names the session.
  rootEventId: string;
  // The row supplying the start time and job: the root or its winning correction.
  startedSourceEventId: string;
  // From the effective `started` only; other events' job ids are provenance (decision D5).
  jobId: string;
  startedAt: Date;
  endedAt: Date | null;
  complete: boolean;
  state: "working" | "paused" | "ended";
  // Accounting-only (decision D4): hours are zero, the span stays on the timeline.
  voided: boolean;
  // Elapsed milliseconds of closed working and paused intervals. An open session counts
  // closed intervals only: no clock is read here, so accrual for display is the caller's.
  workedMs: number;
  breakMs: number;
  elapsedMs: number | null;
  eventSourceIds: string[];
};

export type Replay = {
  sessions: Session[];
  violation: Violation | null;
  // Every positional root → the source in effect (itself, or its winning correction).
  winners: Map<string, string>;
  // Every source placed on the timeline → its session's rootEventId.
  sessionOf: Map<string, string>;
};

type Entry = { root: LaborEvent; source: LaborEvent };

// Folds one worker's events. Stops at the first violation, reporting it with the sessions
// folded up to it. Reference rules are checked first, in acceptance order, then the state
// machine runs over the effective timeline: each root replaced by its winning correction.
export function replay(events: readonly LaborEvent[]): Replay {
  const workers = new Set(events.map((e) => e.workerId));
  if (workers.size > 1) throw new Error("replay folds one worker's events at a time");

  const byId = new Map(events.map((e) => [e.id, e]));
  const corrections = new Map<string, LaborEvent[]>();
  const voidedRoots = new Set<string>();
  const empty = (violation: Violation): Replay => ({
    sessions: [],
    violation,
    winners: new Map(),
    sessionOf: new Map(),
  });

  for (const e of [...events].sort(compareAcceptance)) {
    const targetId = e.type === "voided" ? e.voidsEventId : e.correctsEventId;
    if (targetId === null) continue;
    const at = (code: ViolationCode) => empty({ code, sourceEventId: e.id });
    const target = byId.get(targetId);
    if (target === undefined) return at("target_missing");
    if (target.correctsEventId !== null) return at("target_is_correction");
    if (e.type === "voided") {
      if (target.type !== "started") return at("void_target_not_started");
      if (voidedRoots.has(target.id)) return at("already_voided");
      voidedRoots.add(target.id);
      continue;
    }
    if (target.type === "voided") return at("correction_of_void");
    if (target.type !== e.type) return at("correction_type_mismatch");
    // A correction of a pause, resume or end keeps its root's job as provenance; only a
    // corrected start re-attributes the session (decision D5).
    if (e.type !== "started" && e.jobId !== target.jobId) {
      return at("correction_job_mismatch");
    }
    const list = corrections.get(target.id) ?? [];
    list.push(e);
    corrections.set(target.id, list);
  }

  const winners = new Map<string, string>();
  const entries: Entry[] = [];
  for (const root of events) {
    if (root.type === "voided" || root.correctsEventId !== null) continue;
    const candidates = corrections.get(root.id) ?? [];
    const source = candidates.reduce(
      (best, c) => (compareAcceptance(c, best) > 0 ? c : best),
      candidates[0] ?? root,
    );
    winners.set(root.id, source.id);
    entries.push({ root, source });
  }
  entries.sort((a, b) => compareEvents(a.source, b.source));

  const sessions: Session[] = [];
  const sessionOf = new Map<string, string>();
  let state: State = "idle";
  let current: Session | null = null;
  let mark = 0; // when the current working or paused interval opened
  let prior: string | undefined;

  for (const { root, source } of entries) {
    const type = root.type as PositionalType;
    const next: State | undefined = TRANSITIONS[state][type];
    if (next === undefined) {
      return {
        sessions,
        winners,
        sessionOf,
        violation: {
          code: illegal(state, type),
          sourceEventId: source.id,
          ...(prior === undefined ? {} : { priorSourceEventId: prior }),
        },
      };
    }
    const t = effectiveAt(source).getTime();
    if (type === "started") {
      current = {
        rootEventId: root.id,
        startedSourceEventId: source.id,
        jobId: source.jobId,
        startedAt: effectiveAt(source),
        endedAt: null,
        complete: false,
        state: "working",
        voided: voidedRoots.has(root.id),
        workedMs: 0,
        breakMs: 0,
        elapsedMs: null,
        eventSourceIds: [],
      };
      sessions.push(current);
    } else if (current !== null) {
      // Sorted, so t ≥ mark: no interval is ever negative.
      if (state === "working") current.workedMs += t - mark;
      else current.breakMs += t - mark;
      if (type === "ended") {
        current.endedAt = effectiveAt(source);
        current.complete = true;
        current.elapsedMs = t - current.startedAt.getTime();
      }
    }
    if (current === null) throw new Error("unreachable: a legal non-start has a session");
    current.eventSourceIds.push(source.id);
    current.state = next === "idle" ? "ended" : next;
    sessionOf.set(source.id, current.rootEventId);
    mark = t;
    prior = source.id;
    state = next;
    if (next === "idle") current = null;
  }

  for (const s of sessions) {
    if (s.voided) {
      s.workedMs = 0;
      s.breakMs = 0;
    }
  }
  return { sessions, violation: null, winners, sessionOf };
}

// The sessions of a ledger that must already be legal; anything else is an internal error.
export function foldSessions(events: readonly LaborEvent[]): Session[] {
  const { sessions, violation } = replay(events);
  if (violation !== null) throw new LedgerInconsistentError(violation);
  return sessions;
}

// The open session, if any. At most one by construction: a start is illegal while one is open.
export function openSession(events: readonly LaborEvent[]): Session | null {
  const last = foldSessions(events).at(-1);
  return last !== undefined && !last.complete ? last : null;
}
