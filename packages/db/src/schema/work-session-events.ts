import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { attestationLevel, workSessionEventType } from "./enums";
import { jobs } from "./jobs";
import { users } from "./users";

// The labor ledger (PRD, Labor): an append-only event log that hours and sessions are derived
// from, never stored. Migration 0002 adds the trigger that refuses UPDATE, DELETE and TRUNCATE
// for every role, the application's own connection included (invariant 1); corrections are
// new events. No updated_at (invariant 7) and no created_at: server_timestamp is that fact.
export const workSessionEvents = pgTable(
  "work_session_events",
  {
    // The device's UUIDv7 with no default (invariant 2): it is the idempotency key a push
    // upserts by, and a server default would turn a retry into a second row. Version 7 is
    // checked below because the id is the last ordering key and must be time-ordered.
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    workerId: uuid("worker_id").notNull(),
    jobId: uuid("job_id").notNull(),
    type: workSessionEventType("type").notNull(),
    // Device time is business time: recorded as the device reported it, never clamped, never
    // used to settle a dispute (PRD, Labor).
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    // Receipt. Milliseconds, because the device holds its copy as a JS timestamp and "snap to
    // server truth" must compare equal. now() is transaction time, so one push stamps its
    // whole batch identically and `id` breaks the tie.
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    // Skew is measured per push as |device_now − server_now| against the 5-minute tolerance
    // (ARCHITECTURE, Sync protocol; the constant lives in the API, Stage 3). The verdict is
    // stored so the ledger's order never moves if the tolerance does, and the signed
    // measurement is kept beside it because a ledger cannot be backfilled. bigint: integer
    // caps at ±24.8 days, and an event from a reset phone clock must still be written.
    clockSkewed: boolean("clock_skewed").notNull(),
    clockSkewMs: bigint("clock_skew_ms", { mode: "number" }).notNull(),
    // No default: the zod payload schema requires the field, so `none` is always written by
    // the device, never implied by the database.
    attestationLevel: attestationLevel("attestation_level").notNull(),
    // Foreground stamp at clock events (PRD, Jobs and location). A NULL pair is "missing",
    // which routes the entry to approval and never blocks it. Accuracy only with a fix, since
    // a platform may report a fix without one. Floats: physical position, no exact arithmetic.
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    locationAccuracyM: doublePrecision("location_accuracy_m"),
    // The shape the device wrote the event in. The push handler's upcasters (Stage 3) read it
    // from the wire and the row records it; membership is zod's, the database knows only ≥ 1.
    schemaVersion: smallint("schema_version").notNull(),
  },
  (t) => [
    unique("work_session_events_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so the worker and the job belong to the event's company (invariant 4).
    foreignKey({
      name: "work_session_events_company_id_worker_id_fk",
      columns: [t.companyId, t.workerId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "work_session_events_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    // The fold and the per-user snapshot (Stage 3); job cost to date (Stage 4). No company_id
    // index: row-level security on one tenant gains nothing from it.
    index("work_session_events_worker_id_client_timestamp_idx").on(
      t.workerId,
      t.clientTimestamp,
    ),
    index("work_session_events_job_id_client_timestamp_idx").on(
      t.jobId,
      t.clientTimestamp,
    ),
    check("work_session_events_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    check(
      "work_session_events_location_complete",
      sql`(${t.locationLat} IS NULL) = (${t.locationLng} IS NULL)`,
    ),
    check(
      "work_session_events_location_accuracy_with_fix",
      sql`${t.locationAccuracyM} IS NULL OR ${t.locationLat} IS NOT NULL`,
    ),
    check(
      "work_session_events_location_lat_range",
      sql`${t.locationLat} BETWEEN -90 AND 90`,
    ),
    check(
      "work_session_events_location_lng_range",
      sql`${t.locationLng} BETWEEN -180 AND 180`,
    ),
    check(
      "work_session_events_location_accuracy_m_nonnegative",
      sql`${t.locationAccuracyM} >= 0`,
    ),
    check("work_session_events_schema_version_positive", sql`${t.schemaVersion} >= 1`),
  ],
);
