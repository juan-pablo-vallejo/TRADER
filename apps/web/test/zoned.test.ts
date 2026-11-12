// The ledger's repair editors enter a time as the company's clock read it: the conversion to
// an instant and back, across both daylight-saving changes of America/New_York in 2026
// (March 8, clocks skip 02:00–03:00; November 1, clocks repeat 01:00–02:00).
import { describe, expect, it } from "vitest";

import { instantToWall, wallToInstant } from "../src/app/zoned";

const NY = "America/New_York";
const iso = (wall: string, zone = NY) => wallToInstant(wall, zone)?.toISOString() ?? null;

describe("wall time in a zone", () => {
  it("reads an instant as the zone's clock, to the minute", () => {
    expect(instantToWall(new Date("2026-07-01T13:30:59.999Z"), NY)).toBe(
      "2026-07-01T09:30",
    );
    expect(instantToWall(new Date("2026-01-15T04:05:00Z"), NY)).toBe("2026-01-14T23:05");
    expect(instantToWall(new Date("2026-01-15T00:05:00Z"), "UTC")).toBe(
      "2026-01-15T00:05",
    );
  });

  it("finds the instant of a wall time in summer and in winter", () => {
    expect(iso("2026-07-01T09:30")).toBe("2026-07-01T13:30:00.000Z");
    expect(iso("2026-01-15T09:30")).toBe("2026-01-15T14:30:00.000Z");
    expect(iso("2026-01-14T23:05")).toBe("2026-01-15T04:05:00.000Z");
    expect(iso("2026-07-01T09:30", "UTC")).toBe("2026-07-01T09:30:00.000Z");
  });

  it("refuses the hour a spring-forward change skips, and keeps the minutes around it", () => {
    expect(iso("2026-03-08T01:59")).toBe("2026-03-08T06:59:00.000Z");
    expect(iso("2026-03-08T02:00")).toBeNull();
    expect(iso("2026-03-08T02:30")).toBeNull();
    expect(iso("2026-03-08T03:00")).toBe("2026-03-08T07:00:00.000Z");
  });

  it("takes the earlier instant of the hour a fall-back change repeats", () => {
    expect(iso("2026-11-01T00:59")).toBe("2026-11-01T04:59:00.000Z");
    expect(iso("2026-11-01T01:30")).toBe("2026-11-01T05:30:00.000Z");
    expect(iso("2026-11-01T02:00")).toBe("2026-11-01T07:00:00.000Z");
  });

  it("refuses what is not a wall time or not a day", () => {
    expect(iso("")).toBeNull();
    expect(iso("2026-07-01")).toBeNull();
    expect(iso("2026-07-01T09:30:00")).toBeNull();
    expect(iso("2026-02-30T09:30")).toBeNull();
    expect(iso("2026-07-01T24:00")).toBeNull();
  });

  it("round-trips every quarter hour of both change days", () => {
    for (const day of ["2026-03-08", "2026-11-01"]) {
      const start = Date.parse(`${day}T00:00:00Z`);
      for (let q = 0; q < 24 * 4 * 2; q++) {
        const at = new Date(start + q * 900_000);
        const back = wallToInstant(instantToWall(at, NY), NY)!;
        // The repeated hour's second pass comes back as its first: one hour earlier.
        expect([0, 3_600_000]).toContain(at.getTime() - back.getTime());
        expect(instantToWall(back, NY)).toBe(instantToWall(at, NY));
      }
    }
  });
});
