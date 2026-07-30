import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { workSessionEventType } from "./enums";
import { jobs } from "./jobs";
import { users } from "./users";

/**
 * The append-only labor core (SPEC §3, §4).
 *
 * Never updated, never deleted — enforced by a database trigger, not convention.
 * See migrations/0001_append_only_guard.sql. This is the invariant payroll trust
 * rests on: SPEC §5 states that no role, *including admin*, may mutate a
 * submitted labor record. Corrections are new events referencing the original
 * through `payload`; there is deliberately no corrections table.
 *
 * A worker's "current session" is a fold over these rows, never a stored row.
 * `work_date` is likewise derived server-side from `client_timestamp` in the
 * company's timezone — never a column, never user-editable.
 */
export const workSessionEvents = pgTable(
  "work_session_events",
  {
    /**
     * Client-generated UUIDv7, NOT server-generated. This is what makes the sync
     * protocol idempotent: a device offline for two days can flush the same batch
     * ten times and the server upserts by this id, recording each event once.
     * No `$defaultFn` — the value must come from the device that observed the
     * event, so an accidental server-side default would mask a client bug.
     */
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    type: workSessionEventType("type").notNull(),
    /** When it happened on the device. Authoritative for conflict ordering. */
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    /** When it reached the server. Tiebreaker and sanity bound only. */
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The worker, or an admin issuing a correction. */
    initiatorUserId: uuid("initiator_user_id")
      .notNull()
      .references(() => users.id),
    /**
     * Where the worker's device was when the event was recorded — distinct from
     * `jobs.lat/lng`, which is where the work is.
     *
     * **Nullable by design, and never blocking.** SPEC §3's governing scenario is
     * a foreman in a basement with no signal, and GPS is typically unavailable in
     * exactly that basement. Location is captured on a short best-effort timeout;
     * if no fix arrives, these stay null and the event is written anyway. A
     * clock-in that waited on GPS would break the product's founding promise.
     *
     * Float, not numeric: this is physical position, and no arithmetic depends on
     * exactness.
     */
    deviceLat: doublePrecision("device_lat"),
    deviceLng: doublePrecision("device_lng"),
    /** Reported accuracy radius in metres, so a poor fix can be told from a good one. */
    deviceAccuracyM: doublePrecision("device_accuracy_m"),
    /** Correction reason, voided-event reference, and similar metadata. */
    payload: jsonb("payload"),
    /**
     * No `updated_at`: these rows cannot be updated. Including one would imply a
     * mutability the trigger forbids.
     */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** The fold: one worker's events in device-time order. */
    index("wse_worker_time_idx").on(t.workerId, t.clientTimestamp),
    /** Job costing: all labor against one job. */
    index("wse_job_time_idx").on(t.jobId, t.clientTimestamp),
    index("wse_company_idx").on(t.companyId),
  ],
);
