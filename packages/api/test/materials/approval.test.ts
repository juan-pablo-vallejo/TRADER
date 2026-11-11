// Stage 3 line 8: whether a receipt counts toward job cost. Its own approval and its
// corrections' approvals are independent. Pure: no database.
import { describe, expect, it } from "vitest";

import { effectiveMaterial, type CorrectionState } from "../../src/materials/effective";
import { receiptAccounting } from "../../src/materials/approval";

const receipt = { description: "Eggshell, white", quantity: "2.000", unit: "gal" };
const correction = (o: Partial<CorrectionState>): CorrectionState => ({
  id: "c1",
  kind: "amend",
  description: "Satin",
  quantity: "3.000",
  unit: "gal",
  serverTimestamp: new Date(1000),
  decision: "approved",
  ...o,
});

describe("receiptAccounting", () => {
  it("withholds a pending receipt whose amend is approved; the facts are corrected", () => {
    const effective = effectiveMaterial(receipt, [correction({})]);
    expect(effective.quantity).toBe("3.000");
    expect(receiptAccounting(null, effective)).toBe("pending");
  });

  it("never counts a rejected receipt, an approved amend notwithstanding", () => {
    const effective = effectiveMaterial(receipt, [correction({})]);
    expect(effective.quantity).toBe("3.000");
    expect(receiptAccounting("rejected", effective)).toBe("rejected");
  });

  it("counts an approved receipt as logged when its amend is rejected", () => {
    const effective = effectiveMaterial(receipt, [correction({ decision: "rejected" })]);
    expect(effective.quantity).toBe("2.000");
    expect(receiptAccounting("approved", effective)).toBe("eligible");
  });

  it("takes an approved receipt with an approved void out of effect", () => {
    const effective = effectiveMaterial(receipt, [
      correction({ kind: "void", description: null, quantity: null, unit: null }),
    ]);
    expect(receiptAccounting("approved", effective)).toBe("voided");
  });

  it("counts a receipt with no approvals row, and is not withheld by a pending correction", () => {
    const effective = effectiveMaterial(receipt, [correction({ decision: null })]);
    expect(receiptAccounting(undefined, effective)).toBe("eligible");
  });
});
