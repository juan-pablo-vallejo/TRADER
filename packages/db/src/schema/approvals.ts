import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { approvalDecision, approvalReason } from "./enums";
import { materialCorrections } from "./material-corrections";
import { materials } from "./materials";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";
import { workSessionEvents } from "./work-session-events";

// The approval queue (PRD, Office approval). One row approves one event: every input to the
// rule — captured offline, corrected, user-timed, location-flagged, clock-skewed — is a fact
// of one event. The push handler (Stage 3) writes the row when the rule fires, tagged with
// every reason that applies; an event with no row is approved by default. A server-created
// row, so the id defaults.
//
// "Pending" is decision IS NULL — derived, so the decision enum has no pending member
// (invariant 7). An active admin decides (approval.decide; the role is the API's); migration
// 0004 freezes the row once decided, so a wrong decision is undone by a correcting event,
// never by editing. A late
// correction after a period closes is a new event with its own row and the reason
// `corrected`; the closed period's rows are untouched.
//
// A row has exactly one subject: an event, a material correction (Stage 3 line 6), which
// is always `corrected` and is written pending by material.correct in the correction's own
// transaction, or an original receipt, written pending by the push that records it. Migration
// 0020 fixes every row's subject and reasons (only the decision moves) and refuses a material
// correction's decision by its own submitter; 0022 does the same for a receipt's logger, and
// 0025 for an event's worker (never its initiator). All three subjects are written pending.
export const approvals = pgTable(
  "approvals",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    eventId: uuid("event_id"),
    materialCorrectionId: uuid("material_correction_id"),
    materialId: uuid("material_id"),
    reasons: approvalReason("reasons").array().notNull(),
    decision: approvalDecision("decision"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("approvals_company_id_id_unique").on(t.companyId, t.id),
    // One queue row per event.
    unique("approvals_company_id_event_id_unique").on(t.companyId, t.eventId),
    unique("approvals_company_id_material_correction_id_unique").on(
      t.companyId,
      t.materialCorrectionId,
    ),
    unique("approvals_company_id_material_id_unique").on(t.companyId, t.materialId),
    // Composite, so the event and the decider belong to the row's company (invariant 4).
    foreignKey({
      name: "approvals_company_id_event_id_fk",
      columns: [t.companyId, t.eventId],
      foreignColumns: [workSessionEvents.companyId, workSessionEvents.id],
    }),
    foreignKey({
      name: "approvals_company_id_material_correction_id_fk",
      columns: [t.companyId, t.materialCorrectionId],
      foreignColumns: [materialCorrections.companyId, materialCorrections.id],
    }),
    foreignKey({
      name: "approvals_company_id_material_id_fk",
      columns: [t.companyId, t.materialId],
      foreignColumns: [materials.companyId, materials.id],
    }),
    foreignKey({
      name: "approvals_company_id_decided_by_user_id_fk",
      columns: [t.companyId, t.decidedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // The queue, oldest first (Stage 3 line 5; Stage 4 line 4). The predicate names no enum
    // member on purpose: see enums.ts on ADD VALUE.
    index("approvals_queue_idx")
      .on(t.companyId, t.createdAt)
      .where(sql`${t.decision} IS NULL`),
    check("approvals_reasons_not_empty", sql`cardinality(${t.reasons}) >= 1`),
    // Every row, whatever its subject: array_position(…, NULL) finds a NULL element, which
    // `= ANY` would not (see approvals_material_corrected).
    check("approvals_reasons_no_null", sql`array_position(${t.reasons}, NULL) IS NULL`),
    // num_nonnulls is never NULL.
    check(
      "approvals_one_subject",
      sql`num_nonnulls(${t.eventId}, ${t.materialCorrectionId}, ${t.materialId}) = 1`,
    ),
    // NULL-safe: `= ANY` over an array holding NULL is NULL, not FALSE, and a CHECK passes on
    // NULL; array_position(…, NULL) finds a NULL element. `corrected` was created with the type
    // (0003), so naming it here is safe (see enums.ts on ADD VALUE).
    check(
      "approvals_material_corrected",
      sql`${t.materialCorrectionId} IS NULL OR (coalesce('corrected'::approval_reason = ANY (${t.reasons}), false) AND array_position(${t.reasons}, NULL) IS NULL)`,
    ),
    check(
      "approvals_decision_complete",
      sql`(${t.decision} IS NULL) = (${t.decidedAt} IS NULL) AND (${t.decision} IS NULL) = (${t.decidedByUserId} IS NULL)`,
    ),
  ],
);
