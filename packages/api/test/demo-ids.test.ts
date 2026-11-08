// TASKS:48: the demo's ids and clock arithmetic are deterministic and well formed.
import { describe, expect, it } from "vitest";

import {
  addDays,
  atZone,
  dateIn,
  defaultAnchor,
  seededRandom,
  uuidv7At,
} from "../src/demo/ids";

const NY = "America/New_York";

describe("demo ids", () => {
  it("gives the same ids for the same seed, different ones for another", () => {
    const ids = (seed: string) => {
      const r = seededRandom(seed);
      return [uuidv7At(1_700_000_000_000, r), uuidv7At(1_700_000_000_000, r)];
    };
    expect(ids("a")).toEqual(ids("a"));
    expect(ids("a")).not.toEqual(ids("b"));
    expect(new Set(ids("a")).size).toBe(2);
  });

  it("is a UUIDv7 carrying its millisecond", () => {
    const ms = Date.UTC(2026, 9, 5, 12, 0, 0);
    const id = uuidv7At(ms, seededRandom("x"));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(ms);
    expect(() => uuidv7At(-1, seededRandom("x"))).toThrow("out of range");
  });
});

describe("demo clock", () => {
  it("places a wall-clock time in the zone on both sides of a DST change", () => {
    expect(atZone("2026-07-06", "07:00", NY).toISOString()).toBe(
      "2026-07-06T11:00:00.000Z",
    );
    expect(atZone("2026-01-05", "07:00", NY).toISOString()).toBe(
      "2026-01-05T12:00:00.000Z",
    );
    // 2026-11-01 ends DST at 2 a.m.; 07:00 that day is EST.
    expect(atZone("2026-10-31", "07:00", NY).toISOString()).toBe(
      "2026-10-31T11:00:00.000Z",
    );
    expect(atZone("2026-11-01", "07:00", NY).toISOString()).toBe(
      "2026-11-01T12:00:00.000Z",
    );
    expect(dateIn(new Date("2026-11-02T03:30:00Z"), NY)).toBe("2026-11-01");
  });

  it("anchors on the Monday two weeks before today in the zone", () => {
    expect(defaultAnchor(new Date("2026-11-08T15:00:00Z"), NY)).toBe("2026-10-19");
    expect(defaultAnchor(new Date("2026-11-09T15:00:00Z"), NY)).toBe("2026-10-26");
    // Late Sunday evening in New York is still Sunday there, Monday in UTC.
    expect(defaultAnchor(new Date("2026-11-09T02:00:00Z"), NY)).toBe("2026-10-19");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
