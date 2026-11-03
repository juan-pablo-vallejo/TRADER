import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobs } from "./jobs";
import { materials } from "./materials";
import { createdAt, updatedAt } from "./shared";
import { users } from "./users";

// A photo attaches to the job (PRD, Materials and photos); a receipt photo also names its
// material, and that is the only difference: "receipt" is material_id IS NOT NULL, derived
// (invariant 7). The phone creates the row — device UUIDv7, no default (invariant 2) — and
// the record syncs before the bytes do. This table holds what the object is (key, type,
// size, digest) and whether it has arrived; how bytes move is Stage 3 and 5, and the store
// is named in ARCHITECTURE decisions, not here.
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    jobId: uuid("job_id").notNull(),
    materialId: uuid("material_id"),
    takenByUserId: uuid("taken_by_user_id").notNull(),
    // Device time, recorded as reported.
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    // Where the object lives, provider-neutral text. The server assigns it at push from
    // company_id and id (Stage 3); the device never names a key. Unique because object keys
    // are global in any store.
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    // integer: 2 GiB per object, and a phone photo is megabytes.
    byteSize: integer("byte_size").notNull(),
    // Lower-case hex, 64 characters: drizzle-orm 0.45 has no bytea column builder, and hex
    // is what the device computes and the store echoes back.
    sha256: text("sha256").notNull(),
    // Set by the server once the bytes are confirmed in the store; "uploaded" is derived
    // from it (PRD: upload state is visible). NULL until then.
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("photos_company_id_id_unique").on(t.companyId, t.id),
    unique("photos_object_key_unique").on(t.objectKey),
    // Composite, so the job and the photographer belong to the row's company (invariant 4),
    // and — through materials' (company_id, job_id, id) unique — a receipt photo is on its
    // material's job. A NULL material_id leaves that reference unchecked (MATCH SIMPLE).
    foreignKey({
      name: "photos_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    foreignKey({
      name: "photos_company_id_job_id_material_id_fk",
      columns: [t.companyId, t.jobId, t.materialId],
      foreignColumns: [materials.companyId, materials.jobId, materials.id],
    }),
    foreignKey({
      name: "photos_company_id_taken_by_user_id_fk",
      columns: [t.companyId, t.takenByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // A job's photos (Stage 4, Stage 5); a material's receipt; the per-user pull snapshot
    // (Stage 3). No index on uploaded_at until a reader exists.
    index("photos_job_id_taken_at_idx").on(t.jobId, t.takenAt),
    index("photos_material_id_idx").on(t.materialId),
    index("photos_taken_by_user_id_idx").on(t.takenByUserId),
    check("photos_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    check("photos_object_key_not_blank", sql`btrim(${t.objectKey}) <> ''`),
    check("photos_content_type_image", sql`${t.contentType} ~ '^image/[a-z0-9.+-]+$'`),
    check("photos_byte_size_positive", sql`${t.byteSize} > 0`),
    check("photos_sha256_hex", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);
