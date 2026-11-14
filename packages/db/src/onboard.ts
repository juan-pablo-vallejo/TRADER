// Onboarding (TASKS, Release 0.1 R3): a real company, its invoice number counter and its
// first admin — the one person nobody exists to invite (PRD, Access). The owner runs it,
// against a deployed database, through run-onboard.ts; the seed is the development fixture
// and stays on the compose server. It runs as the owner for the seed's reasons (owner.ts).
// Unlike the seed it is not idempotent and takes no id: the company's id is the database's
// own, a second run is refused by the name, and both counters are stated, because a
// contractor's series continues from the numbers already issued on paper.
// It tells no identity provider and writes no audit row (ARCHITECTURE, 2026-11-12
// onboarding): the owner creates the admin's login at the provider with the same number,
// and the first sign-in binds it.
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "./client";
import { assertBypassingRole, type Executor } from "./owner";

const INT4_MAX = 2_147_483_647;
const text = (max: number) => z.string().trim().min(1).max(max);
const counter = z.coerce.number().int().min(1).max(INT4_MAX);

export const onboardingSchema = z.strictObject({
  companyName: text(200),
  // An IANA zone this runtime knows; work_date is derived in it (RULES).
  timezone: z
    .string()
    .refine((zone) => Intl.supportedValuesOf("timeZone").includes(zone), {
      message: "not an IANA time zone",
    }),
  nextInvoiceNumber: counter,
  nextCreditMemoNumber: counter,
  adminName: text(200),
  // The binding key, E.164, United States and Canada only: users_sign_in_phone_e164 (0037)
  // and the API's signInPhoneSchema hold the same pattern. Required, as roster.invite
  // requires it (ARCHITECTURE, 2026-11-12 a sign-in number on every new invitation). Never
  // normalised here: a number is typed as it will be matched.
  adminPhone: z.string().regex(/^\+1[2-9][0-9]{9}$/, "not a +1 E.164 number"),
  adminEmail: z.email().max(320).optional(),
});

export type Onboarding = z.input<typeof onboardingSchema>;

export type OnboardingResult = {
  currentUser: string;
  database: string;
  companyId: string;
  adminId: string;
};

// The variable names an input failed on, never its values: what the entry point prints.
export function onboardingFaults(input: unknown): string[] {
  const parsed = onboardingSchema.safeParse(input);
  if (parsed.success) return [];
  return [
    ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "input"))),
  ];
}

export async function onboard(
  executor: Executor,
  input: Onboarding,
): Promise<OnboardingResult> {
  const faults = onboardingFaults(input);
  if (faults.length > 0) {
    throw new Error(`refusing to onboard: invalid ${faults.join(", ")}`);
  }
  const company = onboardingSchema.parse(input);
  const currentUser = await assertBypassingRole(executor, "onboard");

  // Read before the first write, so a refusal has written nothing even outside a
  // transaction. A name is no key in the schema; here it is the only handle a second run has.
  const { rows: taken } = await executor.execute<{
    company: boolean;
    address: boolean;
  }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM companies
        WHERE lower(btrim(name)) = lower(${company.companyName})) AS "company",
      EXISTS (SELECT 1 FROM users
        WHERE sign_in_phone = ${company.adminPhone}
          OR lower(email) = lower(${company.adminEmail ?? null})) AS "address"
  `);
  if (taken[0]?.company === true) {
    throw new Error("refusing to onboard: a company of that name exists");
  }
  // A sign-in address is matched across every company and binds only when exactly one row
  // holds it (ARCHITECTURE, phone identity): a second holder would lock both people out.
  if (taken[0]?.address === true) {
    throw new Error(
      "refusing to onboard: the admin's number or email is already on a roster",
    );
  }

  const { rows: created } = await executor.execute<{ id: string; database: string }>(sql`
    INSERT INTO companies (name, timezone)
    VALUES (${company.companyName}, ${company.timezone})
    RETURNING id, current_database()::text AS database
  `);
  const row = created[0];
  if (row === undefined) throw new Error("onboard: the company insert returned no row");
  await executor.execute(sql`
    INSERT INTO invoice_counters (company_id, next_invoice_number, next_credit_memo_number)
    VALUES (${row.id}, ${company.nextInvoiceNumber}, ${company.nextCreditMemoNumber})
  `);
  const { rows: admins } = await executor.execute<{ id: string }>(sql`
    INSERT INTO users (company_id, email, sign_in_phone, name, role)
    VALUES (${row.id}, ${company.adminEmail ?? null}, ${company.adminPhone},
      ${company.adminName}, 'admin')
    RETURNING id
  `);
  const admin = admins[0];
  if (admin === undefined) throw new Error("onboard: the admin insert returned no row");
  return { currentUser, database: row.database, companyId: row.id, adminId: admin.id };
}

const DRY_RUN = Symbol("dry run");

// One transaction, rolled back unless `apply`: a dry run performs every statement, so it
// meets every constraint and refusal the real run would, and leaves nothing.
export async function runOnboarding(
  db: Db,
  input: Onboarding,
  options: { apply: boolean },
): Promise<OnboardingResult & { applied: boolean }> {
  let result: OnboardingResult | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await onboard(tx, input);
      if (!options.apply) throw DRY_RUN;
    });
  } catch (error) {
    if (error !== DRY_RUN) throw error;
  }
  if (result === undefined) throw new Error("onboard: the transaction returned nothing");
  return { ...result, applied: options.apply };
}
