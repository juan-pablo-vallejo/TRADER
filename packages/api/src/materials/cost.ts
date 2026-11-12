// material.setCost (PRD, Office review and job cost: the office enters what a logged material
// cost; Materials and photos: logging never waits on cost). An admin states a receipt's total,
// replaces it, or takes it back to "not priced" with `cost: null`. The one write to a receipt
// after it is logged, and the only columns it names are `cost_cents` and `currency`: a
// closed-out member and an after-closeout receipt are frozen but for those two (migrations
// 0018 and 0024), so the same statement serves an open receipt and a frozen one. Cost is the
// office's fact — not in a closeout's review or fingerprint, not a corrected fact, not an
// approval subject — so nothing here reads or writes an approval, a correction or a closeout,
// and a receipt of any standing (pending, rejected, voided) is priced like another: whether it
// counts is derived where job cost is.
//
// Locks, in the global order (ARCHITECTURE, Concurrency): the caller re-read as an active
// admin, the company's field-write lock shared as every material writer takes it, then the
// receipt's row, which serializes two admins on one receipt (the later write stands) and this
// with material.correct. Setting the cost it already has answers `unchanged` and writes
// nothing, so a resend is harmless. A receipt that is missing or another tenant's is the one
// FORBIDDEN. No audit row: the audited set is closed (V1-D20). Consumed by
// routers/material.ts.
import { materials } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import { costOf, storedCost } from "./list";

export const setCostInput = z.strictObject({
  materialId: z.uuid(),
  // The receipt total in integer minor units (RULES); the column is integer. The currency is
  // stated by the caller, never supplied here: no `_cents` column implies one (materials.ts).
  cost: z
    .strictObject({
      cents: z.number().int().min(0).max(2147483647),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .nullable(),
});

export type SetCostInput = z.infer<typeof setCostInput>;

// `cost` is the receipt's cost as it now stands, whichever the result.
export const setCostOutput = z.strictObject({
  result: z.enum(["saved", "unchanged"]),
  cost: storedCost.nullable(),
});

export type SetCostResult = z.infer<typeof setCostOutput>;

const costColumns = { costCents: materials.costCents, currency: materials.currency };

export async function setMaterialCost(
  tx: Tx,
  user: AppUser,
  input: SetCostInput,
): Promise<SetCostResult> {
  await assertReadCommitted(tx, "material.setCost");
  await lockActiveSelf(tx, user, "admin");
  await lockCompanyFieldWrites(tx, "shared");

  const [held] = await tx
    .select(costColumns)
    .from(materials)
    .where(eq(materials.id, input.materialId))
    .for("no key update");
  if (held === undefined) throw forbidden();

  const standing = costOf(held);
  const wanted = input.cost;
  if (standing?.cents === wanted?.cents && standing?.currency === wanted?.currency) {
    return { result: "unchanged", cost: standing };
  }

  // Exactly the two columns the freeze leaves open; `updated_at` follows through the ORM.
  const [written] = await tx
    .update(materials)
    .set({ costCents: wanted?.cents ?? null, currency: wanted?.currency ?? null })
    .where(eq(materials.id, input.materialId))
    .returning(costColumns);
  if (written === undefined) throw new Error("the locked receipt was not updated");
  return { result: "saved", cost: costOf(written) };
}
