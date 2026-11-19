// Postgres enum types. After the first production release a value is only ever added
// (`ALTER TYPE ... ADD VALUE`, which drizzle-kit emits); removing or renaming one needs a type
// rebuild. A label added that way is unusable in a CHECK, DEFAULT or index predicate of the
// migration run that adds it (55P04); plpgsql may name it. Consumed by users.ts, jobs.ts and
// work-session-events.ts.
import { pgEnum } from "drizzle-orm/pg-core";

// A new user starts as a worker; making an admin is a deliberate act.
export const userRole = pgEnum("user_role", ["admin", "worker"]);

// `open` is the default from creation through the last day of work; `complete` ends field
// work and lets invoicing start; `archived` hides a job from lists while labor history keeps
// referencing it.
export const jobStatus = pgEnum("job_status", ["open", "complete", "archived"]);

// Clock in and out, pause and resume. A job switch is `ended` on the old job then `started`
// on the new one, two events that sync independently, so "one open session" stays a property
// of the fold. `voided` is an appended event that nullifies a whole session; it names that
// session's `started` event in `voids_event_id`, a tie held by a trigger.
export const workSessionEventType = pgEnum("work_session_event_type", [
  "started",
  "paused",
  "resumed",
  "ended",
  "voided",
]);

// Why the office may want to look at an entry, every flag that applies; an entry counts
// whatever it holds. `offline` is captured_offline, the device's evidence at capture;
// `corrected` is an entry the office wrote (a correction, a void, hours it added); `user_timed` is time_set_by_user; `location`
// is a missing or out-of-radius stamp; `clock_skewed` is the push's verdict on the device
// clock or on an event's time against its receipt; `unscheduled` is a clock-in the weekly
// schedule did not allow when it arrived (api sync/schedule.ts).
export const entryFlag = pgEnum("entry_flag", [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
  "unscheduled",
]);
