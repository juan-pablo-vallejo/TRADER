// What a receipt's standing is derived from, read in one place: every correction of the
// receipts named, each with its decision, and each receipt's own decision. Plain reads under
// RLS, no locks; the derivation is effective.ts (facts) and approval.ts (whether it counts).
// Consumed by materials/list.ts and jobs/cost.ts.
import { approvals, materialCorrections } from "@trader/db/schema";
import { eq, inArray } from "drizzle-orm";

import type { Tx } from "../core/context";
import type { CorrectionState } from "./effective";

export type ReceiptStandings = {
  // A receipt's corrections, in no order: effectiveMaterial sorts them.
  correctionsOf: (materialId: string) => CorrectionState[];
  // undefined: no approvals row (approved by default); null: pending.
  decisionOf: (materialId: string) => "approved" | "rejected" | null | undefined;
};

export async function receiptStandings(
  tx: Tx,
  materialIds: readonly string[],
): Promise<ReceiptStandings> {
  if (materialIds.length === 0) {
    return { correctionsOf: () => [], decisionOf: () => undefined };
  }
  const ids = [...materialIds];
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

  const corrections = new Map<string, CorrectionState[]>();
  for (const c of history) {
    const list = corrections.get(c.materialId) ?? [];
    list.push(c);
    corrections.set(c.materialId, list);
  }
  const decisions = new Map(decided.map((a) => [a.materialId!, a.decision]));
  return {
    correctionsOf: (id) => corrections.get(id) ?? [],
    decisionOf: (id) => decisions.get(id),
  };
}
