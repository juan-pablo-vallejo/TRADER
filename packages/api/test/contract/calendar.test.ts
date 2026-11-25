import { describe, expect, it } from "vitest";
import {
  addDays,
  dayIn,
  daysBetween,
  instantAt,
  instantNear,
  instantToWall,
  isDay,
  minuteIn,
  mondayOf,
  wallClock,
  wallToInstant,
  weekdayOf,
} from "../../src/contract/calendar";

// Property tests as plain loops: every day of several years, and every minute around both of
// a zone's clock changes, so a rule that only holds on an ordinary day fails here.
const ZONES = ["America/New_York", "America/Los_Angeles", "Europe/Madrid", "UTC"];
const everyDay = (from: string, to: string) => {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
};
const DAYS = everyDay("2023-01-01", "2028-12-31");

describe("calendar days", () => {
  it("steps one day at a time with no gap and no repeat, across leap years", () => {
    expect(DAYS).toHaveLength(2192);
    for (const [i, day] of DAYS.entries()) {
      expect(isDay(day)).toBe(true);
      expect(daysBetween(DAYS[0]!, day)).toBe(i);
      expect(addDays(addDays(day, 40), -40)).toBe(day);
      expect(weekdayOf(addDays(day, 1))).toBe((weekdayOf(day) + 1) % 7);
    }
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("puts every day in the week of the Monday on or before it", () => {
    for (const day of DAYS) {
      const monday = mondayOf(day);
      expect(weekdayOf(monday)).toBe(1);
      expect(daysBetween(monday, day)).toBeGreaterThanOrEqual(0);
      expect(daysBetween(monday, day)).toBeLessThan(7);
    }
  });

  it("refuses what has the shape of a day and is none", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "2025-02-29", "2026-1-01", "", "x"])
      expect(isDay(bad)).toBe(false);
  });
});

describe("a zone's wall clock", () => {
  it("reads noon of every day as that day, in every zone", () => {
    for (const zone of ZONES)
      for (const day of DAYS) {
        const at = instantAt(day, "12:00", zone);
        expect(at).not.toBeNull();
        expect(dayIn(at!, zone)).toBe(day);
        expect(minuteIn(at!, zone)).toBe("12:00");
      }
  });

  it("turns every minute of a change day there and back, or says it never happened", () => {
    for (const zone of ZONES)
      for (const day of ["2026-03-08", "2026-11-01", "2026-03-29", "2026-10-25"]) {
        let skipped = 0;
        for (let m = 0; m < 24 * 60; m++) {
          const minute = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          const at = instantAt(day, minute, zone);
          if (at === null) {
            skipped++;
            const near = instantNear(day, minute, zone);
            expect(wallClock(near, zone).day).toBe(day);
            expect(minuteIn(near, zone) > minute).toBe(true);
            continue;
          }
          expect(wallClock(at, zone)).toEqual({ day, minute });
          expect(instantNear(day, minute, zone)).toEqual(at);
          // The earlier of two: an hour before it, the clock did not read this minute.
          expect(instantToWall(new Date(at.getTime() - 3_600_000), zone)).not.toBe(
            `${day}T${minute}`,
          );
        }
        expect(skipped === 0 || skipped === 60).toBe(true);
      }
  });

  it("says a skipped minute and a malformed wall time never happened", () => {
    expect(wallToInstant("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(wallToInstant("2026-02-30T08:00", "America/New_York")).toBeNull();
    expect(wallToInstant("2026-03-08 08:00", "America/New_York")).toBeNull();
    expect(wallToInstant("2026-03-08T24:00", "America/New_York")).toBeNull();
    expect(instantNear("2026-03-08", "02:30", "America/New_York").toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
    expect(wallToInstant("2026-11-01T01:30", "America/New_York")?.toISOString()).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });
});
