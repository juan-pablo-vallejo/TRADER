import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, deactivatedAt, id, updatedAt } from "./shared";
import { users } from "./users";

// A crew groups workers under a foreman (PRD, Jobs and location). Relational so a worker's crew
// can change without rewriting anything: membership is a row, not a column on the worker.
export const crews = pgTable(
  "crews",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    // PRD: a crew has a foreman. The foreman is also a crew_members row, and holds the foreman
    // role; both are cross-row facts no constraint can state, so the API enforces them at crew
    // creation and foreman change (Stage 3). The pull snapshot reads crew_members only.
    foremanUserId: uuid("foreman_user_id").notNull(),
    deactivatedAt,
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("crews_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so the foreman is a user of the same company (invariant 4).
    foreignKey({
      name: "crews_company_id_foreman_user_id_fk",
      columns: [t.companyId, t.foremanUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // The foreman's own jobs (Stage 3).
    index("crews_foreman_user_id_idx").on(t.foremanUserId),
    check("crews_name_not_blank", sql`btrim(${t.name}) <> ''`),
  ],
);

// Membership, many-to-many. A row is added or removed, never edited: no id, no updated_at, and
// removal is DELETE — the labor fold is by worker and job, so no history is lost, and the
// audit log (line 6) records the roster action. company_id is carried for RLS (line 7).
export const crewMembers = pgTable(
  "crew_members",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    crewId: uuid("crew_id").notNull(),
    userId: uuid("user_id").notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ name: "crew_members_pkey", columns: [t.crewId, t.userId] }),
    foreignKey({
      name: "crew_members_company_id_crew_id_fk",
      columns: [t.companyId, t.crewId],
      foreignColumns: [crews.companyId, crews.id],
    }),
    foreignKey({
      name: "crew_members_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    // A worker's jobs are the jobs of their crews: the Stage 5 pull snapshot starts here. The
    // primary key covers crew_id.
    index("crew_members_user_id_idx").on(t.userId),
  ],
);
