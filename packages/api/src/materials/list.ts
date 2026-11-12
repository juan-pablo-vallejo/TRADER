// material.list (PRD, Office review and job cost: the office enters what a logged material
// cost). The office's read of the company's receipts, newest first, with what each one cost
// or that nobody has said yet: the read material.setCost takes its ids from. Plain reads
// under RLS, no locks. A receipt is shown with its facts as logged and as they stand after
// its approved corrections, and with whether it counts (materials/approval.ts): pricing is
// open for any of them, and what a job cost is a later derivation's. No coordinates, rates,
// capture evidence or sums. Consumed by routers/material.ts.
import { companies, jobs, materials, users } from "@trader/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readJob } from "../jobs/list";
import { receiptAccounting } from "./approval";
import { effectiveMaterial } from "./effective";
import { receiptStandings } from "./standing";

// The cursor is the last item's id: its logged_at is read back in SQL at full precision (a
// Date would truncate microseconds and repeat rows sharing a timestamp).
export const listInput = z.strictObject({
  jobId: z.uuid().optional(),
  // `unpriced`: only receipts nobody has priced, the office's work list.
  show: z.enum(["unpriced", "all"]).default("unpriced"),
  after: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

// A receipt's total as stored: integer minor units with their currency (invariant 3).
export const storedCost = z.strictObject({
  cents: z.number().int(),
  currency: z.string(),
});

export type StoredCost = z.infer<typeof storedCost>;

// Both columns or neither (materials_cost_complete).
export const costOf = (row: {
  costCents: number | null;
  currency: string | null;
}): StoredCost | null =>
  row.costCents === null || row.currency === null
    ? null
    : { cents: row.costCents, currency: row.currency };

const facts = z.strictObject({
  description: z.string(),
  quantity: z.string(),
  unit: z.string(),
});

export const listOutput = z.strictObject({
  // `companies.timezone`: the zone the office reads `loggedAt` in.
  timezone: z.string(),
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      job: z.strictObject({ id: z.uuid(), name: z.string() }),
      loggedBy: z.strictObject({ id: z.uuid(), name: z.string() }),
      // Stored provenance: an admin entered it in the office, and `loggedBy` is that admin;
      // its `loggedAt` is then noon of the date they named, not a time anyone recorded.
      enteredByOffice: z.boolean(),
      loggedAt: z.date(),
      original: facts,
      effective: facts.extend({ voided: z.boolean() }),
      accounting: z.enum(["eligible", "pending", "rejected", "voided"]),
      cost: storedCost.nullable(),
    }),
  ),
  next: z.uuid().nullable(),
});

export type ListOutput = z.infer<typeof listOutput>;

export async function listMaterials(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof listInput>,
): Promise<ListOutput> {
  // A job that is not visible (another tenant's, under RLS) is the one FORBIDDEN.
  if (input.jobId !== undefined && (await readJob(tx, input.jobId)) === undefined) {
    throw forbidden();
  }
  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");

  // 1. The page: (logged_at, id) descending, before the cursor's row. An invisible cursor
  // (another tenant's id) compares NULL and yields an empty page, saying nothing about it.
  const after =
    input.after === undefined
      ? undefined
      : sql`(${materials.loggedAt}, ${materials.id}) < (
          (select m.logged_at from materials m where m.id = ${input.after}), ${input.after}::uuid
        )`;
  const rows = await tx
    .select({
      id: materials.id,
      jobId: materials.jobId,
      jobName: jobs.name,
      loggedByUserId: materials.loggedByUserId,
      loggedByName: users.name,
      enteredByOffice: materials.enteredByOffice,
      loggedAt: materials.loggedAt,
      description: materials.description,
      quantity: materials.quantity,
      unit: materials.unit,
      costCents: materials.costCents,
      currency: materials.currency,
    })
    .from(materials)
    .innerJoin(jobs, eq(jobs.id, materials.jobId))
    .innerJoin(users, eq(users.id, materials.loggedByUserId))
    .where(
      and(
        input.jobId === undefined ? undefined : eq(materials.jobId, input.jobId),
        input.show === "unpriced" ? isNull(materials.costCents) : undefined,
        after,
      ),
    )
    .orderBy(desc(materials.loggedAt), desc(materials.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const next = rows.length > input.limit ? page.at(-1)!.id : null;
  const ids = page.map((m) => m.id);
  if (ids.length === 0) return { timezone: company.timezone, items: [], next };

  // 2. Every correction of the page's receipts, for their effective facts, and each
  // receipt's own decision.
  const standings = await receiptStandings(tx, ids);

  const items = page.map((m) => {
    const e = effectiveMaterial(m, standings.correctionsOf(m.id));
    return {
      id: m.id,
      job: { id: m.jobId, name: m.jobName },
      loggedBy: { id: m.loggedByUserId, name: m.loggedByName },
      enteredByOffice: m.enteredByOffice,
      loggedAt: m.loggedAt,
      original: { description: m.description, quantity: m.quantity, unit: m.unit },
      effective: {
        description: e.description,
        quantity: e.quantity,
        unit: e.unit,
        voided: e.voided,
      },
      accounting: receiptAccounting(standings.decisionOf(m.id), e),
      cost: costOf(m),
    };
  });
  return { timezone: company.timezone, items, next };
}
