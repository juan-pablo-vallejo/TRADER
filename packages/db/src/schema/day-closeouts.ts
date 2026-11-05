import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobStatus } from "./enums";
import { jobs } from "./jobs";
import { materials } from "./materials";
import { users } from "./users";

// The day closeout (PRD, Day closeout): a foreman's submission for one job and one work date,
// locked once submitted. Append-only, like the labor ledger: migration 0017 refuses UPDATE,
// DELETE and TRUNCATE for every role, and seals the membership below at commit. No hours are
// stored (invariant 7): what was reviewed is reproduced from the ledger through the worker
// marks. Consumed by the API's closeout.submit (Stage 3).
export const dayCloseouts = pgTable(
  "day_closeouts",
  {
    // The device's UUIDv7, no default (invariant 2): the submission's idempotency key.
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    jobId: uuid("job_id").notNull(),
    // The business key the foreman chose, not a value derived from an event: each event's
    // work_date stays derived by the fold.
    workDate: date("work_date", { mode: "string" }).notNull(),
    // companies.timezone as read under lock at submission. The company's zone can change
    // later; this is the zone the reviewed sessions were assigned to dates in.
    timezone: text("timezone").notNull(),
    // The status the foreman set. Never `archived`: hiding a job is the office's.
    jobStatus: jobStatus("job_status").notNull(),
    // Whether submission wrote it to jobs.status (not when the job is archived or a closeout
    // for a later date exists). A fact fixed at insert, so a retry answers the same.
    jobStatusApplied: boolean("job_status_applied").notNull(),
    note: text("note"),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    // Device time of the tap: evidence, never used to decide anything.
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    // Written explicitly by the API after its locks, so it follows everything it reviewed.
    serverTimestamp: timestamp("server_timestamp", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    // The seal (0017): at every commit, the membership rows number exactly these.
    workerMarkCount: integer("worker_mark_count").notNull(),
    materialCount: integer("material_count").notNull(),
  },
  (t) => [
    unique("day_closeouts_company_id_id_unique").on(t.companyId, t.id),
    // One closeout per job and work date.
    unique("day_closeouts_company_id_job_id_work_date_unique").on(
      t.companyId,
      t.jobId,
      t.workDate,
    ),
    // The target of day_closeout_materials' (company_id, job_id, closeout_id) foreign key,
    // which keeps a member material on its closeout's job.
    unique("day_closeouts_company_id_job_id_id_unique").on(t.companyId, t.jobId, t.id),
    // Composite, so the job and the submitter belong to the row's company (invariant 4).
    foreignKey({
      name: "day_closeouts_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    foreignKey({
      name: "day_closeouts_company_id_submitted_by_user_id_fk",
      columns: [t.companyId, t.submittedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    check("day_closeouts_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    check("day_closeouts_timezone_not_blank", sql`btrim(${t.timezone}) <> ''`),
    // `archived` was created with the type (0000), so naming it in a CHECK is safe.
    check("day_closeouts_job_status_not_archived", sql`${t.jobStatus} <> 'archived'`),
    check(
      "day_closeouts_note_shape",
      sql`${t.note} IS NULL OR (btrim(${t.note}) <> '' AND char_length(${t.note}) <= 2000)`,
    ),
    check("day_closeouts_worker_mark_count_nonnegative", sql`${t.workerMarkCount} >= 0`),
    check("day_closeouts_material_count_nonnegative", sql`${t.materialCount} >= 0`),
  ],
);

// One row per worker with a session on the closeout's job and date: the newest receipt stamp
// of that worker's ledger at submission. Receipt stamps rise per worker (ARCHITECTURE row
// 185), so the worker's events stamped at or before it, folded in the closeout's zone, are
// exactly what was reviewed, forever.
export const dayCloseoutWorkers = pgTable(
  "day_closeout_workers",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    closeoutId: uuid("closeout_id").notNull(),
    workerId: uuid("worker_id").notNull(),
    ledgerThrough: timestamp("ledger_through", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
  (t) => [
    primaryKey({
      name: "day_closeout_workers_pkey",
      columns: [t.closeoutId, t.workerId],
    }),
    foreignKey({
      name: "day_closeout_workers_company_id_closeout_id_fk",
      columns: [t.companyId, t.closeoutId],
      foreignColumns: [dayCloseouts.companyId, dayCloseouts.id],
    }),
    foreignKey({
      name: "day_closeout_workers_company_id_worker_id_fk",
      columns: [t.companyId, t.workerId],
      foreignColumns: [users.companyId, users.id],
    }),
    // A worker's closed-out days (Stage 4 reconciliation).
    index("day_closeout_workers_worker_id_idx").on(t.workerId),
  ],
);

// The materials the closeout covered. 0018 freezes a member's facts (cost stays fillable).
export const dayCloseoutMaterials = pgTable(
  "day_closeout_materials",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    closeoutId: uuid("closeout_id").notNull(),
    jobId: uuid("job_id").notNull(),
    materialId: uuid("material_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "day_closeout_materials_pkey",
      columns: [t.closeoutId, t.materialId],
    }),
    // A material has one job and one date, so at most one closeout; also the freeze lookup.
    unique("day_closeout_materials_company_id_material_id_unique").on(
      t.companyId,
      t.materialId,
    ),
    // Both through job_id, so the material is on the closeout's job; the second also makes
    // the material's job immutable while it is a member.
    foreignKey({
      name: "day_closeout_materials_company_id_job_id_closeout_id_fk",
      columns: [t.companyId, t.jobId, t.closeoutId],
      foreignColumns: [dayCloseouts.companyId, dayCloseouts.jobId, dayCloseouts.id],
    }),
    foreignKey({
      name: "day_closeout_materials_company_id_job_id_material_id_fk",
      columns: [t.companyId, t.jobId, t.materialId],
      foreignColumns: [materials.companyId, materials.jobId, materials.id],
    }),
  ],
);
