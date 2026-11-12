// Hours as the office reads them: the server's integer hundredths, printed by digits. The
// figure is never rounded or divided as a float on the way to the screen.
import { describe, expect, it } from "vitest";

import { hours, signedHours } from "../src/app/format";

describe("hours from hundredths", () => {
  it("prints two decimals by integer arithmetic", () => {
    expect([0, 5, 50, 100, 650, 7200, 123456].map(hours)).toEqual([
      "0.00",
      "0.05",
      "0.50",
      "1.00",
      "6.50",
      "72.00",
      "1234.56",
    ]);
  });

  it("keeps the sign of a figure below zero", () => {
    expect([-5, -850].map(hours)).toEqual(["-0.05", "-8.50"]);
  });
});

describe("signed hours", () => {
  it("always writes the sign of an adjustment, and none on zero", () => {
    expect([650, 5, -50, -800, 0].map(signedHours)).toEqual([
      "+6.50",
      "+0.05",
      "-0.50",
      "-8.00",
      "0.00",
    ]);
  });
});
