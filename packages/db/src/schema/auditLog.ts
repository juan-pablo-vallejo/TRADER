import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { companies } from "./companies";
import { users } from "./users";

/**
 * Append-only record of significant writes (SPEC §4): who, what, when.
 *
 * Distinct from work_session_events — that stream *is* the labor domain model,
 * whereas this is cross-cutting provenance for roster changes, pay-rate edits,
 * invoice status transitions and the like.
 *
 * `entityId` is intentionally not a foreign key: this table outlives the rows it
 * describes and spans every table, so a real reference would be impossible to
 * declare and would block legitimate deletes elsewhere.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** Nullable: some writes are made by the system, not a person. */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_company_at_idx").on(t.companyId, t.at),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);
