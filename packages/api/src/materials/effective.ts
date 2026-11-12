// A material's effective facts: the receipt as logged, with its approved corrections applied
// (PRD, Office approval: a corrected entry counts once approved). Derived, never stored
// (invariant 7). Pure: no database, no clock. Approved corrections apply in receipt order —
// server_timestamp, then id — so the winner never depends on the order decisions were made in.
// The last approved amend replaces description, quantity and unit together; an approved void
// takes the receipt out of effect for good, whatever comes after it. Pending and rejected
// corrections, and a correction with no approval at all, change nothing. Cost is not a
// corrected fact: it stays the receipt's own. Consumed by correct.ts, list.ts and
// jobs/cost.ts.

export type MaterialFacts = {
  description: string;
  // numeric(12,3) as Postgres prints it ("2.000"), never parsed into a float.
  quantity: string;
  unit: string;
};

export type CorrectionState = {
  id: string;
  kind: "amend" | "void";
  description: string | null;
  quantity: string | null;
  unit: string | null;
  serverTimestamp: Date;
  // NULL is pending; a correction without an approvals row is pending too.
  decision: "approved" | "rejected" | null;
};

export type EffectiveMaterial = MaterialFacts & {
  voided: boolean;
  // The undecided correction, if any: at most one at a time (correct.ts).
  pendingId: string | null;
};

const inEffectOrder = (a: CorrectionState, b: CorrectionState) =>
  a.serverTimestamp.getTime() - b.serverTimestamp.getTime() ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function effectiveMaterial(
  original: MaterialFacts,
  corrections: readonly CorrectionState[],
): EffectiveMaterial {
  let facts: MaterialFacts = {
    description: original.description,
    quantity: original.quantity,
    unit: original.unit,
  };
  let voided = false;
  let pendingId: string | null = null;
  for (const c of [...corrections].sort(inEffectOrder)) {
    if (c.decision === null) pendingId ??= c.id;
    if (c.decision !== "approved") continue;
    if (c.kind === "void") {
      voided = true;
    } else if (!voided) {
      if (c.description === null || c.quantity === null || c.unit === null) {
        throw new Error("an amend carries all three facts (material_corrections_shape)");
      }
      facts = { description: c.description, quantity: c.quantity, unit: c.unit };
    }
  }
  return { ...facts, voided, pendingId };
}
