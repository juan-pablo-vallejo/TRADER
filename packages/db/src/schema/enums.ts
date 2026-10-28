// Postgres enum types. A value is only ever added (`ALTER TYPE … ADD VALUE`, which drizzle-kit
// emits); removing or renaming one needs a type rebuild, a destructive diff invariant 8
// forbids. Choose members as permanent. Consumed by users.ts and jobs.ts.
import { pgEnum } from "drizzle-orm/pg-core";

// PRD, Target users. A new user starts as a worker; roles are a deliberate roster action.
export const userRole = pgEnum("user_role", ["admin", "foreman", "worker"]);

// PRD, Day closeout: the foreman "sets job status"; no states are named there. `open` is the
// default from creation through the last day of work; `complete` ends field work and lets
// invoicing start; `archived` hides a job from lists while labor history keeps referencing it.
// Not `scheduled` (scheduling is a non-goal) and not `active` (that is "has labor events",
// a derived fact).
export const jobStatus = pgEnum("job_status", ["open", "complete", "archived"]);
