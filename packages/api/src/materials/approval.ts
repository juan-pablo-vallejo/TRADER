// Whether an original receipt counts toward job cost (PRD, Office approval; ARCHITECTURE,
// approval accounting). Pure. The receipt's own approval and its corrections' approvals are
// independent: an approved correction changes the effective facts (effective.ts) but never
// authorizes the receipt, which counts only once approved or with no approvals row. A pending
// or rejected correction changes nothing, so it withholds nothing. An approved void takes the
// receipt out of effect whatever its own decision. Consumed by approvals/queue.ts,
// materials/list.ts and jobs/cost.ts.
import type { EffectiveMaterial } from "./effective";

export type ReceiptAccounting = "eligible" | "pending" | "rejected" | "voided";

export function receiptAccounting(
  // undefined: no approvals row (approved by default); null: pending.
  decision: "approved" | "rejected" | null | undefined,
  effective: Pick<EffectiveMaterial, "voided">,
): ReceiptAccounting {
  if (effective.voided) return "voided";
  if (decision === "rejected") return "rejected";
  if (decision === null) return "pending";
  return "eligible";
}
