// The number a person types on the sign-in screen, as the one the roster holds.
import { describe, expect, it } from "vitest";

import { signInPhone } from "../src/phone";

describe("signInPhone", () => {
  it("reads the ways people type a number", () => {
    for (const typed of [
      "4015550123",
      "401 555 0123",
      "(401) 555-0123",
      "401.555.0123",
      "1 401 555 0123",
      "+1 (401) 555-0123",
    ]) {
      expect([typed, signInPhone(typed)]).toEqual([typed, "+14015550123"]);
    }
  });

  it("refuses what is not a North American number", () => {
    for (const typed of [
      "",
      "555 0123",
      "401555012",
      "40155501234",
      "+44 20 7946 0958",
      "0015550123",
      "401 155 0123",
      "4O1 555 0123",
      "+1 401 555 0123 x2",
    ]) {
      expect([typed, signInPhone(typed)]).toEqual([typed, null]);
    }
  });
});
