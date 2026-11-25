// How the phone writes a time of day and a day: as the office does, in both languages.
import { describe, expect, it } from "vitest";

import { dayName, timeOfDay, wallTime } from "../src/format";

// Intl writes a no-break space before "PM" and inside "p. m."; compared as plain spaces.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("a time of day and a day on the phone", () => {
  const at = new Date(Date.UTC(2026, 10, 16, 19, 30));

  it("reads a time of day on a 12-hour clock in both languages", () => {
    expect(plain(timeOfDay(at, "America/New_York", "en"))).toBe("2:30 PM");
    expect(plain(timeOfDay(at, "America/New_York", "es"))).toBe("2:30 p. m.");
    expect(plain(wallTime("07:00", "es"))).toBe("7:00 a. m.");
  });

  it("reads a day worked as the office does", () => {
    expect(dayName("2026-11-16", "en")).toBe("Mon, Nov 16");
  });
});
