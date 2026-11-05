import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { dayCloseoutMaterials } from "./day-closeouts";
import { materialCorrectionKind } from "./enums";
import { users } from "./users";

// A correcting entry for a closed-out material (PRD, Day closeout: a submitted closeout is
// locked; later changes are correcting entries that go through approval). The receipt itself
// stays as logged — migration 0018 freezes it — and this row names it. Append-only, like the
// ledger: migration 0020 refuses UPDATE, DELETE and TRUNCATE for every role and requires the
// row's approval at commit. Every correction names the original receipt, never another
// correction, so a chain cannot exist. A correction counts only once approved; the effective
// receipt is derived (API materials/effective.ts), never stored. Consumed by the API's
// material.correct (Stage 3).
export const materialCorrections = pgTable(
  "material_corrections",
  {
    // The device's UUIDv7, no default (invariant 2): the correction's idempotency key.
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    materialId: uuid("material_id").notNull(),
    kind: materialCorrectionKind("kind").notNull(),
    // An amend's full replacement of the receipt's facts, all three together; NULL on a void.
    // Never the job, the date, the buyer or the cost: those are not corrected here.
    description: text("description"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }),
    unit: text("unit"),
    // Why, for the approver.
    note: text("note"),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    // Device time of the tap: evidence, never used to decide anything.
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    // Written explicitly by the API under the material's row lock, rising per material: the
    // order corrections of one receipt take effect in.
    serverTimestamp: timestamp("server_timestamp", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
  (t) => [
    // The target of approvals' (company_id, material_correction_id) foreign key.
    unique("material_corrections_company_id_id_unique").on(t.companyId, t.id),
    // Through the closeout membership, not materials: only a material a committed closeout
    // covers can be corrected, in the same company (invariant 4). Membership is sealed and
    // the receipt frozen, so the day as submitted is the receipt as logged.
    foreignKey({
      name: "material_corrections_company_id_material_id_fk",
      columns: [t.companyId, t.materialId],
      foreignColumns: [dayCloseoutMaterials.companyId, dayCloseoutMaterials.materialId],
    }),
    foreignKey({
      name: "material_corrections_company_id_submitted_by_user_id_fk",
      columns: [t.companyId, t.submittedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // A material's corrections in effect order (material.correct; job cost, Stage 4).
    index("material_corrections_material_id_server_timestamp_idx").on(
      t.materialId,
      t.serverTimestamp,
    ),
    check("material_corrections_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    // Every branch states IS [NOT] NULL, so no NULL can make it pass: FALSE AND NULL is FALSE.
    check(
      "material_corrections_shape",
      sql`(${t.kind} = 'amend' AND ${t.description} IS NOT NULL AND ${t.quantity} IS NOT NULL
        AND ${t.unit} IS NOT NULL AND btrim(${t.description}) <> '' AND ${t.quantity} > 0
        AND btrim(${t.unit}) <> '')
      OR (${t.kind} = 'void' AND ${t.description} IS NULL AND ${t.quantity} IS NULL
        AND ${t.unit} IS NULL)`,
    ),
    check(
      "material_corrections_note_shape",
      sql`${t.note} IS NULL OR (btrim(${t.note}) <> '' AND char_length(${t.note}) <= 2000)`,
    ),
  ],
);
