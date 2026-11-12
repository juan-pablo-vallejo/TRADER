import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, id } from "./shared";
import { users } from "./users";

// Who did what, when (ARCHITECTURE, Office authority: audit trail; V1-D20). One row per
// audited office write, written by API code in the same transaction as the write it records,
// so a rolled-back action leaves no trace and a committed one always has one — never by a
// generic row-change trigger, which could not know the actor and would log every ORM
// updated_at touch. The phone never writes here: its facts are events, materials and photos.
// V1 writes it for invitations, role changes, deactivation and reactivation, pay rates, labor
// repairs and approval decisions, and for nothing else; the one writer is the API's
// core/audit.ts, and there is no office viewer. Append-only by migration 0012 (0002's guard
// on a second table): no updated_at.
//
// action is entity_table || '.' || verb (users.set_role, pay_rates.add, approvals.decide):
// text under two checks, not an enum, so a new writer adds no migration. before and after are
// the columns the action changed, as they were and as they became — never a snapshot of the
// row, and never a column the action left alone — jsonb because they mirror every table's own
// shape and hold no domain fact of their own; before is NULL on a create, and never both are.
// An action with no single audited row has entity_id NULL, before NULL and after = the ids it
// wrote. Because action's prefix must equal entity_table, a company-level action is
// entity_table 'companies', entity_id NULL, action 'companies.<verb>'. entity_id has no
// foreign key: it spans every table and outlives its row.
export const auditLog = pgTable(
  "audit_log",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    // NULL is the system: a cron job, JIT provisioning.
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityTable: text("entity_table").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt,
  },
  (t) => [
    unique("audit_log_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so the actor is a user of the row's company (invariant 4).
    foreignKey({
      name: "audit_log_company_id_actor_user_id_fk",
      columns: [t.companyId, t.actorUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    check("audit_log_action_format", sql`${t.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
    check(
      "audit_log_action_prefix",
      sql`split_part(${t.action}, '.', 1) = ${t.entityTable}`,
    ),
    check(
      "audit_log_snapshot_present",
      sql`${t.before} IS NOT NULL OR ${t.after} IS NOT NULL`,
    ),
    // The office timeline, and one row's history; both tenant-scoped (line 7).
    index("audit_log_company_id_created_at_idx").on(t.companyId, t.createdAt),
    index("audit_log_company_id_entity_table_entity_id_idx").on(
      t.companyId,
      t.entityTable,
      t.entityId,
    ),
  ],
);
