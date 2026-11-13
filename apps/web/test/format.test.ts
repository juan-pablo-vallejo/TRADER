// Hours as the office reads them: the server's integer hundredths, printed by digits. The
// figure is never rounded or divided as a float on the way to the screen.
import { describe, expect, it } from "vitest";

import { hours, looksLikeSignInPhone, signedHours, signInPhone } from "../src/app/format";

describe("a sign-in number", () => {
  it("is shown as it is said, and anything else as it is", () => {
    expect(signInPhone("+14015550100")).toBe("(401) 555-0100");
    expect(signInPhone("+441632960100")).toBe("+441632960100");
    expect(signInPhone("401-555-0100")).toBe("401-555-0100");
  });

  it("is accepted as typed when it is ten digits, or eleven starting with 1", () => {
    for (const typed of [
      "4015550100",
      "(401) 555-0100",
      "401.555.0100",
      "1 401 555 0100",
      " +1 (401) 555-0100 ",
    ]) {
      expect(looksLikeSignInPhone(typed), typed).toBe(true);
    }
    for (const typed of [
      "555-0100",
      "(101) 555-0100",
      "2 401 555 0100",
      "+44 1632 960100",
      "+40 1234 5678",
      "401-555-01000",
      "",
    ]) {
      expect(looksLikeSignInPhone(typed), typed).toBe(false);
    }
  });
});

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
