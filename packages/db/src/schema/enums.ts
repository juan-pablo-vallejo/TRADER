// Postgres enum types. A value is only ever added (`ALTER TYPE … ADD VALUE`, which drizzle-kit
// emits); removing or renaming one needs a type rebuild, a destructive diff invariant 8
// forbids. Choose members as permanent. Consumed by users.ts and jobs.ts.
import { pgEnum } from "drizzle-orm/pg-core";

// PRD, Target users. A new user starts as a worker; roles are a deliberate roster action.
export const userRole = pgEnum("user_role", ["admin", "foreman", "worker"]);
