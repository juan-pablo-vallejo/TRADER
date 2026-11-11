// Stage 3 line 6: a material's effective facts, derived from the receipt and its approved
// corrections. Pure: no database.
import { describe, expect, it } from "vitest";

import { effectiveMaterial, type CorrectionState } from "../../src/materials/effective";

const receipt = { description: "Eggshell, white", quantity: "2.000", unit: "gal" };

let n = 0;
const at = (ms: number, o: Partial<CorrectionState> = {}): CorrectionState => ({
  id: `0000000${n++}`,
  kind: "amend",
  description: "Satin",
  quantity: "3.000",
  unit: "gal",
  serverTimestamp: new Date(ms),
  decision: "approved",
  ...o,
});

describe("effectiveMaterial", () => {
  it("is the receipt with no corrections", () => {
    expect(effectiveMaterial(receipt, [])).toEqual({
      ...receipt,
      voided: false,
      pendingId: null,
    });
  });

  it("applies the latest approved amend, in receipt order whatever the input order", () => {
    const early = at(1000, { quantity: "3.000" });
    const late = at(2000, { quantity: "4.000" });
    expect(effectiveMaterial(receipt, [late, early]).quantity).toBe("4.000");
  });

  it("breaks an equal stamp by id", () => {
    const a = at(1000, { id: "a", quantity: "3.000" });
    const b = at(1000, { id: "b", quantity: "4.000" });
    expect(effectiveMaterial(receipt, [b, a]).quantity).toBe("4.000");
  });

  it("ignores pending and rejected corrections, and reports the pending one", () => {
    const pending = at(2000, { id: "p", decision: null, quantity: "9.000" });
    const rejected = at(3000, { decision: "rejected", quantity: "8.000" });
    expect(effectiveMaterial(receipt, [pending, rejected])).toEqual({
      ...receipt,
      voided: false,
      pendingId: "p",
    });
  });

  it("keeps a void terminal: a later approved amend does not revive the receipt", () => {
    const amend = at(1000, { quantity: "3.000" });
    const voided = at(2000, {
      kind: "void",
      description: null,
      quantity: null,
      unit: null,
    });
    const after = at(3000, { quantity: "5.000" });
    expect(effectiveMaterial(receipt, [after, voided, amend])).toMatchObject({
      quantity: "3.000",
      voided: true,
    });
  });

  it("ignores a rejected void", () => {
    const voided = at(1000, {
      kind: "void",
      description: null,
      quantity: null,
      unit: null,
      decision: "rejected",
    });
    expect(effectiveMaterial(receipt, [voided]).voided).toBe(false);
  });
});
