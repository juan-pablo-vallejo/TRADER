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
import { entryFlag, entryType } from "./enums";
import { jobs } from "./jobs";
import { users } from "./users";

// The labor ledger: an append-only event log that hours and sessions are derived
// from, never stored. The baseline migration adds the trigger that refuses UPDATE, DELETE and
// TRUNCATE for every role, the application's own connection included (invariant 1);
// corrections are new events. No updated_at and no created_at: server_timestamp is that fact.
export const entries = pgTable(
  "entries",
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
    type: entryType("type").notNull(),
    // Device time is business time: recorded as the device reported it, never clamped, and the
    // instant the fold places the event at, flagged or not (invariant 3).
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    // Receipt. Milliseconds, because the device holds its copy as a JS timestamp and "snap to
    // server truth" must compare equal. now() is transaction time, so one push stamps its
    // whole batch identically and `id` breaks the tie.
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    // Evidence behind the `clock_skewed` flag, never a rule of the fold. `clock_skewed` is true
    // when the push's |device_now − server_now| exceeded the 5-minute tolerance, or when the
    // event claimed an online capture more than the tolerance before its receipt
    // (the constant and both tests live in the API, sync/flags.ts). The verdict
    // is stored so it never moves if the tolerance does. `clock_skew_ms` is the per-push
    // reading alone, signed, kept because a ledger cannot be backfilled; the receipt
    // comparison's evidence is the row's own two timestamps. bigint: integer caps at ±24.8
    // days, and an event from a reset phone clock must still be written.
    clockSkewed: boolean("clock_skewed").notNull(),
    clockSkewMs: bigint("clock_skew_ms", { mode: "number" }).notNull(),
    // Foreground stamp at clock events. A NULL pair is "missing",
    // which flags the entry and never blocks it. Accuracy only with a fix, since
    // a platform may report a fix without one. Floats: physical position, no exact arithmetic.
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    locationAccuracyM: doublePrecision("location_accuracy_m"),
    // The shape the device wrote the event in. The push handler's upcasters read it
    // from the wire and the row records it; membership is zod's, the database knows only ≥ 1.
    schemaVersion: smallint("schema_version").notNull(),
    // Corrections are new events that reference the original. A `voided` event
    // names the `started` event of the session it nullifies; the fold gives that session zero
    // duration. Set exactly when type is `voided`, a rule a trigger holds.
    voidsEventId: uuid("voids_event_id"),
    // The single event this one replaces: a corrected clock-out is a new `ended` event naming
    // the old one, and the fold reads the newest accepted correction. Never set on a void.
    // Corrections and voids are the office's (labor.correct), flagged `corrected`.
    correctsEventId: uuid("corrects_event_id"),
    // The recorded time was set by the user rather than taken from the moment of capture:
    // the `user_timed` flag. NOT NULL with no default: the zod payload requires it.
    timeSetByUser: boolean("time_set_by_user").notNull(),
    // The `offline` flag's evidence: the device's own,
    // recorded at capture — no confirmed reach of the API, an unknown state counting as offline.
    // Not receipt lag: a capture offline may arrive seconds later, and a capture online may sit
    // in the outbox for hours.
    capturedOffline: boolean("captured_offline").notNull(),
    // Who recorded the event: the worker, or the admin writing a correcting entry. worker_id
    // stays whose labor it is.
    initiatorUserId: uuid("initiator_user_id").notNull(),
    // Why the office should look at this entry, every reason that applies, judged once when
    // the entry is received and written with it: the row is append-only, so they never move.
    // An entry counts toward hours whatever it holds.
    flags: entryFlag("flags")
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    unique("entries_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so the worker, the job, the initiator and every referenced event belong to
    // this event's company (invariant 5).
    foreignKey({
      name: "entries_company_id_worker_id_fk",
      columns: [t.companyId, t.workerId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "entries_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    foreignKey({
      name: "entries_company_id_initiator_user_id_fk",
      columns: [t.companyId, t.initiatorUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "entries_company_id_voids_event_id_fk",
      columns: [t.companyId, t.voidsEventId],
      foreignColumns: [t.companyId, t.id],
    }),
    foreignKey({
      name: "entries_company_id_corrects_event_id_fk",
      columns: [t.companyId, t.correctsEventId],
      foreignColumns: [t.companyId, t.id],
    }),
    // The fold and the per-user snapshot; a job's hours. No company_id
    // index: row-level security on one tenant gains nothing from it. No index on the two event
    // references: the fold loads a worker's window and resolves them in memory, and nothing is
    // ever deleted, so the foreign keys' reverse lookups never run.
    index("entries_worker_id_client_timestamp_idx").on(t.workerId, t.clientTimestamp),
    index("entries_job_id_client_timestamp_idx").on(t.jobId, t.clientTimestamp),
    check("entries_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    check(
      "entries_location_complete",
      sql`(${t.locationLat} IS NULL) = (${t.locationLng} IS NULL)`,
    ),
    check(
      "entries_location_accuracy_with_fix",
      sql`${t.locationAccuracyM} IS NULL OR ${t.locationLat} IS NOT NULL`,
    ),
    check("entries_location_lat_range", sql`${t.locationLat} BETWEEN -90 AND 90`),
    check("entries_location_lng_range", sql`${t.locationLng} BETWEEN -180 AND 180`),
    check("entries_location_accuracy_m_nonnegative", sql`${t.locationAccuracyM} >= 0`),
    check("entries_schema_version_positive", sql`${t.schemaVersion} >= 1`),
    // An event can reference neither itself as voided nor as corrected. Plain checks: they name
    // no enum member, so they are safe in the transaction that adds one.
    check("entries_voids_not_self", sql`${t.voidsEventId} <> ${t.id}`),
    check("entries_corrects_not_self", sql`${t.correctsEventId} <> ${t.id}`),
  ],
);
