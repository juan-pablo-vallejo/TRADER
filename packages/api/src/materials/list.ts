// material.list (PRD, Office review and job cost: the office enters what a logged material
// cost). The office's read of the company's receipts, newest first, with what each one cost
// or that nobody has said yet: the read material.setCost takes its ids from. Plain reads
// under RLS, no locks. A receipt is shown with its facts as logged and as they stand after
// its approved corrections, and with whether it counts (materials/approval.ts): pricing is
// open for any of them, and what a job cost is a later derivation's. No coordinates, rates,
// capture evidence or sums. Consumed by routers/material.ts.
import {
  approvals,
  companies,
  jobs,
  materialCorrections,
  materials,
  users,
} from "@trader/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readJob } from "../jobs/list";
import { receiptAccounting } from "./approval";
import { effectiveMaterial, type CorrectionState } from "./effective";

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
  const history = await tx
    .select({
      materialId: materialCorrections.materialId,
      id: materialCorrections.id,
      kind: materialCorrections.kind,
      description: materialCorrections.description,
      quantity: materialCorrections.quantity,
      unit: materialCorrections.unit,
      serverTimestamp: materialCorrections.serverTimestamp,
      decision: approvals.decision,
    })
    .from(materialCorrections)
    .leftJoin(approvals, eq(approvals.materialCorrectionId, materialCorrections.id))
    .where(inArray(materialCorrections.materialId, ids));
  const decided = await tx
    .select({ materialId: approvals.materialId, decision: approvals.decision })
    .from(approvals)
    .where(inArray(approvals.materialId, ids));
  const decisions = new Map(decided.map((a) => [a.materialId!, a.decision]));

  const items = page.map((m) => {
    const states: CorrectionState[] = history.filter((c) => c.materialId === m.id);
    const e = effectiveMaterial(m, states);
    return {
      id: m.id,
      job: { id: m.jobId, name: m.jobName },
      loggedBy: { id: m.loggedByUserId, name: m.loggedByName },
      loggedAt: m.loggedAt,
      original: { description: m.description, quantity: m.quantity, unit: m.unit },
      effective: {
        description: e.description,
        quantity: e.quantity,
        unit: e.unit,
        voided: e.voided,
      },
      accounting: receiptAccounting(decisions.get(m.id), e),
      cost: costOf(m),
    };
  });
  return { timezone: company.timezone, items, next };
}
