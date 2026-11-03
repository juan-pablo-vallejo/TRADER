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

// Who did what, when (TASKS: audit log wiring is after V1; ARCHITECTURE decisions). One row
// per significant office write, written by API code in the same transaction as the write it
// records, so a rolled-back action leaves no trace and a committed one always has one — never
// by a generic row-change trigger, which could not know the actor and would log every ORM
// updated_at touch. The phone never writes here: its facts are events, materials and photos.
// The table lands now; its writers and the office viewer are after-V1 wiring, so V1 ships it
// empty. Append-only by migration 0012 (0002's guard on a second table): no updated_at.
//
// action is entity_table || '.' || verb (crew_members.remove, pay_rates.update,
// invoices.void): text under two checks, not an enum, so a new writer adds no migration.
// before and after are the audited row as it was and as it became, jsonb because they mirror
// every table's own shape and hold no domain fact of their own; NULL on create and on delete
// respectively, never both. An action with no audited row has before NULL and after = the
// action's parameters. Because action's prefix must equal entity_table, a company-level action
// is entity_table 'companies', entity_id NULL, action 'companies.<verb>'. entity_id has no
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
