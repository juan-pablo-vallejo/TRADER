// An invoice's arithmetic (invoices/lines.ts): the amount of a line as the database's own
// check computes it, in integers.
import { describe, expect, it } from "vitest";

import { amountCents, hoursQuantity, MAX_CENTS, totals } from "../../src/invoices/lines";

describe("amountCents", () => {
  it("is quantity times price, rounded half-up to the cent", () => {
    expect(amountCents("8.000", 6500)).toBe(52000);
    expect(amountCents("2.500", 4599)).toBe(11498); // 11497.5
    expect(amountCents("0.333", 100)).toBe(33); // 33.3
    expect(amountCents("0.335", 100)).toBe(34); // 33.5
    expect(amountCents("0.005", 100)).toBe(1); // 0.5
    expect(amountCents("0.004", 100)).toBe(0);
    expect(amountCents("12.250", 0)).toBe(0);
  });

  it("never passes through a float: a figure a double cannot hold is exact", () => {
    // 1.005 × 1000 is 1004.9999999999999 in floating point.
    expect(amountCents("1.005", 1000)).toBe(1005);
    expect(amountCents("999999999.999", 1)).toBe(1000000000);
  });

  it("is null when the amount would not fit the column", () => {
    expect(amountCents("1.000", MAX_CENTS)).toBe(MAX_CENTS);
    expect(amountCents("1.001", MAX_CENTS)).toBeNull();
    expect(amountCents("999999999.999", 1000)).toBeNull();
  });
});

describe("totals", () => {
  it("adds the lines, then the tax, and rounds nothing again", () => {
    expect(totals([{ amountCents: 11498 }, { amountCents: 33 }], 807)).toEqual({
      subtotalCents: 11531,
      taxCents: 807,
      totalCents: 12338,
    });
    expect(totals([], 0)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });
});

describe("hoursQuantity", () => {
  it("writes hundredths of an hour as a quantity", () => {
    expect([1200, 850, 5, 10000].map(hoursQuantity)).toEqual([
      "12.00",
      "8.50",
      "0.05",
      "100.00",
    ]);
  });
});
