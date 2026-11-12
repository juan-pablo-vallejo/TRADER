// Stage 4, hours and cost aggregation (V1-D13): job cost to date. Money is integer cents with
// a currency; a labor line is rounded half-up to the cent and a total is the sum of lines.
import { describe, expect, it } from "vitest";

import { byCurrency, lineCents } from "../../src/jobs/cost";

describe("lineCents", () => {
  it("multiplies hundredths of an hour by an hourly rate, half-up to the cent", () => {
    expect(lineCents(800, 2800)).toBe(22400);
    // 0.01 h at $28.50 is 28.5 cents; at $28.49, 28.49 cents; at $28.51, 28.51.
    expect(lineCents(1, 2850)).toBe(29);
    expect(lineCents(1, 2849)).toBe(28);
    expect(lineCents(1, 2851)).toBe(29);
    expect(lineCents(101, 2575)).toBe(2601);
    expect(lineCents(0, 2800)).toBe(0);
    expect(lineCents(800, 0)).toBe(0);
  });

  it("answers a whole number of cents, and refuses what it cannot compute exactly", () => {
    for (const [h, r] of [
      [333, 3333],
      [1, 1],
      [2399, 2147483647],
    ] as const) {
      expect(Number.isInteger(lineCents(h, r))).toBe(true);
    }
    for (const [h, r] of [
      [1.5, 2800],
      [800, 28.5],
      [-1, 2800],
      [800, -1],
      [2 ** 40, 2 ** 20],
      [Number.NaN, 1],
    ] as const) {
      expect(() => lineCents(h, r)).toThrow();
    }
  });
});

describe("byCurrency", () => {
  it("adds within a currency and never across two", () => {
    expect(
      byCurrency([
        { currency: "USD", cents: 22400 },
        { currency: "CAD", cents: 100 },
        { currency: "USD", cents: 29 },
      ]),
    ).toEqual([
      { currency: "CAD", cents: 100 },
      { currency: "USD", cents: 22429 },
    ]);
    expect(byCurrency([])).toEqual([]);
  });

  it("refuses a fraction of a cent", () => {
    expect(() => byCurrency([{ currency: "USD", cents: 0.5 }])).toThrow();
  });
});
