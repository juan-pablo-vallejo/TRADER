// Postgres enum types. A value is only ever added (`ALTER TYPE … ADD VALUE`, which drizzle-kit
// emits); removing or renaming one needs a type rebuild, a destructive diff invariant 8
// forbids. Choose members as permanent. Consumed by users.ts, jobs.ts and
// work-session-events.ts.
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
// property of the fold. `voided` joins in Stage 2 line 4 together with the column naming the
// event it voids: a member and its referent travel together.
export const workSessionEventType = pgEnum("work_session_event_type", [
  "started",
  "paused",
  "resumed",
  "ended",
]);

// PRD, Labor: a clock action is confirmed with the device's biometrics; a failed or unavailable
// check records `none` and the event is still written. `device_credential` is the OS passcode
// fallback. Evidence for the office, never a precondition.
export const attestationLevel = pgEnum("attestation_level", [
  "biometric",
  "device_credential",
  "none",
]);
