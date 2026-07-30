import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { attestationLevel, workSessionEventType } from "./enums";
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
    /**
     * When it reached the server. CONFLICT-2 tiebreaker, and the key the sync
     * pull cursor pages on (CONFLICT-4a).
     *
     * **Millisecond precision, deliberately.** Postgres defaults to microseconds,
     * but a JavaScript `Date` cannot represent them — the driver truncates, so a
     * cursor built from a value read back through JS lands fractionally *behind*
     * the row it came from. Every subsequent `server_timestamp > cursor` is then
     * true for rows already delivered, and pagination silently never advances.
     * Matching the column to the precision every client can actually hold is what
     * makes the keyset sound; the alternative is arithmetic at every comparison,
     * in a protocol whose rules say it must stay one readable handler.
     */
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true, precision: 3 })
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
    /**
     * How strongly this event is attributed to a person present when it was taken
     * (logic.md ATTEST-3). Defaults to `none` so a client that does not yet send
     * the field records the honest answer rather than an optimistic one — and so
     * the column can be NOT NULL over rows written before attestation shipped.
     */
    attestationLevel: attestationLevel("attestation_level").notNull().default("none"),
    /**
     * Correction reason, voided-event reference, and — per CONFLICT-4 — the skew
     * flag when the submitting device's clock was beyond tolerance.
     */
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
