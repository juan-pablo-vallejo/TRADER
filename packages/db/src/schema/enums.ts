// Postgres enum types. A value is only ever added (`ALTER TYPE … ADD VALUE`, which drizzle-kit
// emits); removing or renaming one needs a type rebuild, a destructive diff invariant 8
// forbids. Choose members as permanent. Consumed by users.ts, jobs.ts,
// work-session-events.ts and approvals.ts.
import { pgEnum } from "drizzle-orm/pg-core";

// PRD, Target users. A new user starts as a worker; roles are a deliberate roster action.
export const userRole = pgEnum("user_role", ["admin", "foreman", "worker"]);

// PRD, Day closeout: the foreman "sets job status"; no states are named there. `open` is the
// default from creation through the last day of work; `complete` ends field work and lets
// invoicing start; `archived` hides a job from lists while labor history keeps referencing it.
// Not `scheduled` (scheduling is a non-goal) and not `active` (that is "has labor events",
// a derived fact).
export const jobStatus = pgEnum("job_status", ["open", "complete", "archived"]);

// PRD, Labor: clock in/out and pause/resume. A job switch is `ended` on the old job then
// `started` on the new one, two events that sync independently, so "one open session" stays a
// property of the fold. `voided` is an appended event that nullifies a whole session; it names
// that session's `started` event in `voids_event_id`, and the tie between the member and the
// column is a trigger, not a CHECK: the member arrived by `ALTER TYPE … ADD VALUE`, and Postgres
// refuses to use such a label inside the transaction that added it, which on a fresh database
// is the one replaying every migration. Last in the list, so the migration was a plain ADD VALUE.
export const workSessionEventType = pgEnum("work_session_event_type", [
  "started",
  "paused",
  "resumed",
  "ended",
  "voided",
]);

// PRD, Labor: a clock action is confirmed with the device's biometrics; a failed or unavailable
// check records `none` and the event is still written. `device_credential` is the OS passcode
// fallback. Evidence for the office, never a precondition.
export const attestationLevel = pgEnum("attestation_level", [
  "biometric",
  "device_credential",
  "none",
]);

// PRD, Office approval: why an entry is in the queue, every reason that applies. `offline` is
// receipt lag (no column: server_timestamp − client_timestamp); `corrected` is a
// corrects_event_id or a void; `user_timed` is time_set_by_user; `location` is a missing or
// out-of-radius stamp; `clock_skewed` is the push verdict (ARCHITECTURE, Sync protocol).
export const approvalReason = pgEnum("approval_reason", [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
]);

// The office's answer. No `pending`: that is a NULL decision, derived (invariant 7). A
// rejected event never counts; the office issues a correcting event instead.
export const approvalDecision = pgEnum("approval_decision", ["approved", "rejected"]);
