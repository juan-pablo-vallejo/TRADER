// Two-sided transition validation (ARCHITECTURE, Sync protocol): an incoming event is legal
// only if the whole timeline, with it inserted at its own position, stays legal: what came
// before and what comes after. Pure; the caller supplies the worker's locked timeline and
// stamps from loadWorkerTimeline (timeline.ts). Consumed by sync.push (Stage 3) and every later
// writer of labor events. Only a `rejected` verdict is permanent; anything thrown here is an
// internal error the device retries, never a rejection.
import {
  replay,
  LedgerInconsistentError,
  type LaborEvent,
  type ViolationCode,
} from "./fold";

export type RejectionCode =
  | ViolationCode
  // The candidate is legal where it lands, but an event already accepted no longer is.
  | "breaks_following_event"
  // A correction that would not be the effective one: accepting it would change nothing.
  | "correction_superseded"
  // A correction that would carry its event into another session.
  | "correction_moves_session"
  // A pause, resume or end naming a job other than its session's.
  | "job_id_mismatch";

export type Verdict =
  | { verdict: "accepted" }
  | { verdict: "rejected"; code: RejectionCode; conflictingEventId?: string };

export type ValidationContext = {
  workerId: string;
  // The newest receipt stamp committed for the worker when its lock was taken, or null.
  baselineStamp: Date | null;
  // The stamp this transaction writes on every event it accepts for the worker.
  receivedAt: Date;
};

const rejected = (code: RejectionCode, conflictingEventId?: string): Verdict => ({
  verdict: "rejected",
  code,
  ...(conflictingEventId === undefined ? {} : { conflictingEventId }),
});

// `existing` is the locked timeline plus anything this transaction already accepted for the
// worker. Duplicates are the caller's: an id already present is a programmer error here.
export function validateEvent(
  ctx: ValidationContext,
  existing: readonly LaborEvent[],
  candidate: LaborEvent,
): Verdict {
  assertPreconditions(ctx, existing, candidate);

  const before = replay(existing);
  if (before.violation !== null) throw new LedgerInconsistentError(before.violation);

  const after = replay([...existing, candidate]);
  const v = after.violation;
  if (v !== null) {
    return v.sourceEventId === candidate.id
      ? rejected(v.code, v.priorSourceEventId)
      : rejected("breaks_following_event", v.sourceEventId);
  }

  const root = candidate.correctsEventId;
  if (root !== null) {
    // A legal replay does not mean the candidate is in effect: a batch-mate with the same
    // stamp and a higher id beats it (decision D3).
    const winner = after.winners.get(root);
    if (winner !== candidate.id) return rejected("correction_superseded", winner);
    if (candidate.type !== "started") {
      // Judged against the version in effect before this correction, so it is decidable
      // without the root's original position (which later events may have made illegal).
      const was = before.sessionOf.get(before.winners.get(root) ?? root);
      const now = after.sessionOf.get(candidate.id);
      if (was !== now) return rejected("correction_moves_session", was);
    }
  } else if (candidate.type !== "started" && candidate.type !== "voided") {
    // Only an ordinary event is held to its session's job, and only now: a later start
    // correction re-attributes the session and never re-judges it (decision D5).
    const session = after.sessions.find(
      (s) => s.rootEventId === after.sessionOf.get(candidate.id),
    );
    if (session !== undefined && session.jobId !== candidate.jobId) {
      return rejected("job_id_mismatch", session.startedSourceEventId);
    }
  }

  return { verdict: "accepted" };
}

// Violations of these are bugs in the caller, not illegal events: they throw.
function assertPreconditions(
  ctx: ValidationContext,
  existing: readonly LaborEvent[],
  candidate: LaborEvent,
) {
  const received = ctx.receivedAt.getTime();
  const baseline = ctx.baselineStamp?.getTime() ?? null;
  if (baseline !== null && received <= baseline) {
    throw new Error("receivedAt must be later than the worker's baseline stamp");
  }
  if (candidate.workerId !== ctx.workerId)
    throw new Error("candidate is another worker's");
  if (candidate.serverTimestamp.getTime() !== received) {
    throw new Error("candidate must carry this transaction's receivedAt");
  }
  for (const e of existing) {
    if (e.workerId !== ctx.workerId)
      throw new Error("timeline holds another worker's event");
    if (e.id === candidate.id)
      throw new Error("candidate id already recorded: a duplicate");
    // Freshness against the locked baseline, not the growing batch: batch-mates accepted in
    // this transaction share receivedAt and are allowed.
    const stamp = e.serverTimestamp.getTime();
    if (stamp !== received && (baseline === null || stamp > baseline)) {
      throw new Error("timeline event stamped after the locked baseline");
    }
  }
}
