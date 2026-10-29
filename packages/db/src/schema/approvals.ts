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
// (invariant 7). The admin decides (the role gate, and "nobody approves their own entries"
// against the event's initiator_user_id, are API rules); migration 0004 freezes the row once
// decided, so a wrong decision is undone by a correcting event, never by editing. A late
// correction after a period closes is a new event with its own row and the reason
// `corrected`; the closed period's rows are untouched.
export const approvals = pgTable(
  "approvals",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    eventId: uuid("event_id").notNull(),
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
    // Composite, so the event and the decider belong to the row's company (invariant 4).
    foreignKey({
      name: "approvals_company_id_event_id_fk",
      columns: [t.companyId, t.eventId],
      foreignColumns: [workSessionEvents.companyId, workSessionEvents.id],
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
    check(
      "approvals_decision_complete",
      sql`(${t.decision} IS NULL) = (${t.decidedAt} IS NULL) AND (${t.decision} IS NULL) = (${t.decidedByUserId} IS NULL)`,
    ),
  ],
);
