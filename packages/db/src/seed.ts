// The seed: one company, its invoice number counter, and its first admin —
// the one user nobody exists to invite. A development and CI fixture with
// placeholder values, never a real company's onboarding. It runs as the owner: trader_app may
// insert neither companies nor invoice_counters, and FORCE denies every row to
// a role with no policy that does not bypass row-level security, so the seed refuses any such
// role, trader_app included, before its first write — the startup guard's inverse.
// Raw SQL because the admin's conflict target is the expression index on lower(email), which
// Drizzle's onConflict cannot name (it takes columns only); $onUpdate therefore never runs
// here, and the upsert sets updated_at itself. Idempotent: a re-run inserts nothing, never
// moves the counter, and only restores the admin's role.
import { sql } from "drizzle-orm";

import { assertBypassingRole, type Executor } from "./owner";

// What one bootstrap writes: the company, its counter and its first admin. The development
// seed below is the default; the demo fixture (api demo/) hands in its own, so the three raw
// statements have one home whichever company they bootstrap.
export type SeedCompany = {
  companyId: string;
  companyName: string;
  timezone: string;
  adminEmail: string;
  adminName: string;
};

// Placeholders, never a real company's details. The id is fixed because companies has no
// natural key and a re-run must find its row. America/New_York: D'Sierra's zone (RI/MA).
// The email is the invitation key (users.ts); identity_subject stays NULL until the first
// sign-in binds it.
export const SEED: SeedCompany = {
  companyId: "019a4a00-0000-7000-8000-000000000001",
  companyName: "Demo Painting Co.",
  timezone: "America/New_York",
  adminEmail: "admin@seed.test",
  adminName: "Admin",
};

type SeedResult = {
  currentUser: string;
  companies: number;
  invoiceCounters: number;
  users: number;
};

export async function seed(
  executor: Executor,
  company: SeedCompany = SEED,
): Promise<SeedResult> {
  const currentUser = await assertBypassingRole(executor, "seed");

  await executor.execute(sql`
    INSERT INTO companies (id, name, timezone)
    VALUES (${company.companyId}, ${company.companyName}, ${company.timezone})
    ON CONFLICT (id) DO NOTHING
  `);
  // Inserted once and never updated: a re-run must not rewind a series that has issued
  // numbers. The series starts at 1 until onboarding sets where the company's own series
  // continues, before the first issue.
  await executor.execute(sql`
    INSERT INTO invoice_counters (company_id, next_invoice_number)
    VALUES (${company.companyId}, 1)
    ON CONFLICT (company_id) DO NOTHING
  `);
  // The one statement allowed to write role on conflict: a request path never does.
  // The WHERE keeps a re-run on an intact admin a no-op, so updated_at stays put.
  await executor.execute(sql`
    INSERT INTO users (company_id, email, name, role)
    VALUES (${company.companyId}, ${company.adminEmail}, ${company.adminName}, 'admin')
    ON CONFLICT (company_id, lower(email)) DO UPDATE
      SET role = 'admin', updated_at = now()
      WHERE users.role <> 'admin'
  `);

  const { rows: counts } = await executor.execute<Omit<SeedResult, "currentUser">>(sql`
    SELECT
      (SELECT count(*) FROM companies WHERE id = ${company.companyId})::int AS "companies",
      (SELECT count(*) FROM invoice_counters WHERE company_id = ${company.companyId})::int
        AS "invoiceCounters",
      (SELECT count(*) FROM users WHERE company_id = ${company.companyId})::int AS "users"
  `);
  const count = counts[0];
  if (count === undefined) throw new Error("seed: the count query returned no row");
  return { currentUser, ...count };
}
