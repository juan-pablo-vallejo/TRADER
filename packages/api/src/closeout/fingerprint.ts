// The review fingerprint: a deterministic, versioned digest of a job's day as the server derives
// it, returned by closeout.review and recomputed by closeout.submit under the closeout's locks.
// Equal values mean the state submitted is the state the review returned. It is an optimistic
// concurrency precondition, not a credential: unkeyed, so it proves neither that a review read
// was made nor that a person looked (confirmation is the field app's). Pure: no database, no
// clock. Consumed by review.ts and submit.ts.
//
// The canonical value is positional arrays only, so no object key order can change it, and
// every list is sorted here, never trusted to SQL or Map order. Any change to the tuple, the
// fold or workDate semantics is a new version; the golden vector in the tests pins the current
// one. v1 was issued over the fold that placed a clock-skewed event at its receipt; v2 is the
// same tuple over the fold at captured times (V1-D01). A v1 value is answered review_stale.
import { createHash } from "node:crypto";

import type { DayMaterial, DaySession } from "./day";

export const FINGERPRINT_VERSION = 2;

// Any well-formed version, so a fingerprint of another version is answered review_stale
// rather than refused as input (a thrown error is retried).
export const FINGERPRINT_PATTERN = /^v[1-9][0-9]{0,3}\.[0-9a-f]{64}$/;

export type ReviewState = {
  companyId: string;
  jobId: string;
  workDate: string;
  timeZone: string;
  // The job's status as read under the scope lock: a change by the office invalidates a
  // review, so a closeout never overwrites a status it did not see.
  jobStatus: string;
  sessions: readonly DaySession[];
  materials: readonly DayMaterial[];
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Deliberately absent: worker marks (they move with any event anywhere), events on other jobs
// or dates, material cost (the office's), approvals, names.
export function reviewFingerprint(state: ReviewState): string {
  const sessions = [...state.sessions]
    .sort(
      (a, b) =>
        compare(a.workerId, b.workerId) ||
        a.session.startedAt.getTime() - b.session.startedAt.getTime() ||
        compare(a.session.rootEventId, b.session.rootEventId),
    )
    .map(({ workerId, session: s }) => [
      workerId,
      s.rootEventId,
      s.startedSourceEventId,
      s.eventSourceIds,
      s.startedAt.getTime(),
      s.endedAt === null ? null : s.endedAt.getTime(),
      s.state,
      s.complete,
      s.voided,
      s.workedMs,
      s.breakMs,
    ]);
  const materials = [...state.materials]
    .sort((a, b) => compare(a.id, b.id))
    .map((m) => [
      m.id,
      m.loggedByUserId,
      m.description,
      // numeric(12,3) as Postgres prints it ("2.000"), never parsed into a float.
      m.quantity,
      m.unit,
      m.loggedAt.getTime(),
    ]);
  const canonical = JSON.stringify([
    "trader.closeout-review",
    FINGERPRINT_VERSION,
    state.companyId,
    state.jobId,
    state.workDate,
    state.timeZone,
    state.jobStatus,
    sessions,
    materials,
  ]);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `v${FINGERPRINT_VERSION}.${digest}`;
}
