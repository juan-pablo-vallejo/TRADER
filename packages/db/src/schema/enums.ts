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

/**
 * SPEC §4. Retained for the draft/sent/void lifecycle; `paid` is the member Phase 4
 * stops writing, because status is derived from attached payments once invoices
 * settle online. See `invoices.ts`.
 */
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid", "void"]);
