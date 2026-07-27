import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Roles per SPEC §5. The boundary that matters: no role — including admin —
 * may mutate a submitted labor record. Corrections are new events.
 */
export const userRole = pgEnum("user_role", ["admin", "foreman", "worker"]);

/** SPEC §4: jobs are archived, never deleted. */
export const jobStatus = pgEnum("job_status", [
  "scheduled",
  "active",
  "closed",
  "archived",
]);

/**
 * The append-only labor event stream (SPEC §3). A worker's current session is a
 * derived fold over these, never a mutable row. `voided` is how a correction
 * retracts an earlier event without deleting it.
 */
export const workSessionEventType = pgEnum("work_session_event_type", [
  "started",
  "paused",
  "resumed",
  "ended",
  "voided",
]);

/** SPEC §4: v1 tracks invoices only; `paid` is set manually until Phase 5. */
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid", "void"]);
