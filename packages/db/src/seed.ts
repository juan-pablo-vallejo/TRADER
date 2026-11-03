// The seed (TASKS Stage 2): one company, its invoice number counter, and its first admin —
// the one user nobody exists to invite (PRD, Access). A development and CI fixture with
// placeholder values, never the pilot's onboarding. It runs as the owner: trader_app may
// insert neither companies nor invoice_counters (0013), and FORCE (0014) denies every row to
// a role with no policy that does not bypass row-level security, so the seed refuses any such
// role, trader_app included, before its first write — the startup guard's inverse.
// Raw SQL because the admin's conflict target is the expression index on lower(email), which
// Drizzle's onConflict cannot name (it takes columns only); $onUpdate therefore never runs
// here, and the upsert sets updated_at itself. Idempotent: a re-run inserts nothing, never
// moves the counter, and only restores the admin's role.
import { sql } from "drizzle-orm";

import type { Db } from "./client";

// A client or a transaction, as in guard.ts.
type Executor = Pick<Db, "execute">;

// Placeholders, never the partner's details. The id is fixed because companies has no
// natural key and a re-run must find its row. America/New_York: the pilot is in RI/MA (PRD).
// The email is the invitation key (users.ts); identity_subject stays NULL until the first
// sign-in binds it (Stage 3).
export const SEED = {
  companyId: "019a4a00-0000-7000-8000-000000000001",
  companyName: "Pilot Company",
  timezone: "America/New_York",
  adminEmail: "admin@jpteq.app",
  adminName: "Admin",
} as const;

export type SeedResult = {
  currentUser: string;
  companies: number;
  invoiceCounters: number;
  users: number;
};

export async function seed(executor: Executor): Promise<SeedResult> {
  const { rows: roles } = await executor.execute<{ me: string; bypasses: boolean }>(sql`
    SELECT rolname AS me, rolsuper OR rolbypassrls AS bypasses
    FROM pg_roles WHERE rolname = current_user
  `);
  const role = roles[0];
  if (role === undefined) {
    throw new Error("refusing to seed: current_user has no pg_roles row");
  }
  if (!role.bypasses) {
    throw new Error(
      `refusing to seed as ${role.me}: the role has neither rolsuper nor rolbypassrls`,
    );
  }

  await executor.execute(sql`
    INSERT INTO companies (id, name, timezone)
    VALUES (${SEED.companyId}, ${SEED.companyName}, ${SEED.timezone})
    ON CONFLICT (id) DO NOTHING
  `);
  // Inserted once and never updated: a re-run must not rewind a series that has issued
  // numbers. Both series start at 1 until onboarding sets where the partner's series
  // continues (Stage 8), before the first issue.
  await executor.execute(sql`
    INSERT INTO invoice_counters (company_id, next_invoice_number, next_credit_memo_number)
    VALUES (${SEED.companyId}, 1, 1)
    ON CONFLICT (company_id) DO NOTHING
  `);
  // The one statement allowed to write role on conflict (MEMORY): a request path never does.
  // The WHERE keeps a re-run on an intact admin a no-op, so updated_at stays put.
  await executor.execute(sql`
    INSERT INTO users (company_id, email, name, role)
    VALUES (${SEED.companyId}, ${SEED.adminEmail}, ${SEED.adminName}, 'admin')
    ON CONFLICT (company_id, lower(email)) DO UPDATE
      SET role = 'admin', updated_at = now()
      WHERE users.role <> 'admin'
  `);

  const { rows: counts } = await executor.execute<Omit<SeedResult, "currentUser">>(sql`
    SELECT
      (SELECT count(*) FROM companies WHERE id = ${SEED.companyId})::int AS "companies",
      (SELECT count(*) FROM invoice_counters WHERE company_id = ${SEED.companyId})::int
        AS "invoiceCounters",
      (SELECT count(*) FROM users WHERE company_id = ${SEED.companyId})::int AS "users"
  `);
  const count = counts[0];
  if (count === undefined) throw new Error("seed: the count query returned no row");
  return { currentUser: role.me, ...count };
}
