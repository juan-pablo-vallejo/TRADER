// The approval facts sync.push computes (sync/reasons.ts). Pure: no database.
import { describe, expect, it } from "vitest";

import {
  CLOCK_SKEW_TOLERANCE_MS,
  haversineMeters,
  laborReasons,
  locationFlagged,
  measureSkew,
  receiptReasons,
} from "../src/sync/reasons";

const SERVER = new Date("2026-11-05T15:00:00.000Z");
const at = (ms: number) => new Date(SERVER.getTime() + ms);

// One job in Providence with a 200 m radius; points due north of it.
const JOB = { lat: 41.824, lng: -71.4128, radiusM: 200 };
const north = (m: number) => ({ lat: JOB.lat + m / 111_195, lng: JOB.lng });

const plain = {
  type: "started" as "started" | "paused" | "resumed" | "ended" | "voided",
  corrected: false,
  capturedOffline: false,
  timeSetByUser: false,
  stamp: north(0),
  job: JOB,
  clockSkewed: false,
  afterCloseout: false,
};

describe("measureSkew", () => {
  it("is device minus server, signed, and skewed strictly beyond five minutes", () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(300_000);
    expect(measureSkew(at(300_000), SERVER)).toEqual({
      clockSkewMs: 300_000,
      clockSkewed: false,
    });
    expect(measureSkew(at(-300_000), SERVER)).toEqual({
      clockSkewMs: -300_000,
      clockSkewed: false,
    });
    expect(measureSkew(at(300_001), SERVER)).toEqual({
      clockSkewMs: 300_001,
      clockSkewed: true,
    });
    expect(measureSkew(at(-600_000), SERVER)).toEqual({
      clockSkewMs: -600_000,
      clockSkewed: true,
    });
  });
});

describe("location", () => {
  it("measures great-circle metres", () => {
    expect(haversineMeters(JOB, north(1000))).toBeCloseTo(1000, 0);
    // Providence to Boston, about 66 km.
    expect(haversineMeters(JOB, { lat: 42.3601, lng: -71.0589 }) / 1000).toBeCloseTo(
      66,
      0,
    );
  });

  it("flags a missing stamp or one beyond the radius, at clock-in and clock-out only", () => {
    expect(locationFlagged("started", north(199), JOB)).toBe(false);
    expect(locationFlagged("started", north(201), JOB)).toBe(true);
    expect(locationFlagged("ended", null, JOB)).toBe(true);
    expect(locationFlagged("ended", north(5000), JOB)).toBe(true);
    for (const type of ["paused", "resumed"] as const) {
      expect(locationFlagged(type, null, JOB)).toBe(false);
      expect(locationFlagged(type, north(5000), JOB)).toBe(false);
    }
    // A job with no place flags only a missing stamp.
    expect(locationFlagged("started", north(5000), null)).toBe(false);
    expect(locationFlagged("started", null, null)).toBe(true);
  });
});

describe("laborReasons and receiptReasons", () => {
  it("is empty for an online, stamped, unskewed, on-time entry", () => {
    expect(laborReasons(plain)).toEqual([]);
    expect(
      receiptReasons({
        capturedOffline: false,
        clockSkewed: false,
        afterCloseout: false,
      }),
    ).toEqual([]);
  });

  it("names each fact once, in the enum's order", () => {
    expect(laborReasons({ ...plain, capturedOffline: true })).toEqual(["offline"]);
    expect(laborReasons({ ...plain, timeSetByUser: true })).toEqual(["user_timed"]);
    expect(laborReasons({ ...plain, stamp: null })).toEqual(["location"]);
    expect(laborReasons({ ...plain, clockSkewed: true })).toEqual(["clock_skewed"]);
    expect(laborReasons({ ...plain, afterCloseout: true })).toEqual(["after_closeout"]);
    expect(
      laborReasons({
        ...plain,
        afterCloseout: true,
        stamp: null,
        capturedOffline: true,
        clockSkewed: true,
        timeSetByUser: true,
      }),
    ).toEqual(["offline", "user_timed", "location", "clock_skewed", "after_closeout"]);
    expect(laborReasons({ ...plain, corrected: true })).toEqual(["corrected"]);
    expect(
      receiptReasons({ capturedOffline: true, clockSkewed: true, afterCloseout: true }),
    ).toEqual(["offline", "clock_skewed", "after_closeout"]);
  });

  it("tags an office repair corrected, and never flags a void's missing stamp", () => {
    // labor.repair's office events: user-timed, unstamped.
    const office = { ...plain, timeSetByUser: true, stamp: null };
    expect(laborReasons({ ...office, corrected: true })).toEqual([
      "corrected",
      "user_timed",
      "location",
    ]);
    expect(laborReasons({ ...office, type: "paused" })).toEqual(["user_timed"]);
    expect(
      laborReasons({ ...office, type: "voided", corrected: true, timeSetByUser: false }),
    ).toEqual(["corrected"]);
    expect(
      laborReasons({
        ...office,
        type: "voided",
        corrected: true,
        timeSetByUser: false,
        afterCloseout: true,
      }),
    ).toEqual(["corrected", "after_closeout"]);
  });

  it("takes offline from capture evidence alone, never from a delay", () => {
    // Nothing about delivery is an input: an offline capture is `offline` however soon it
    // arrives, and an online one is not however late (the push tests deliver both).
    expect(laborReasons({ ...plain, capturedOffline: true })).toContain("offline");
    expect(laborReasons({ ...plain, capturedOffline: false })).not.toContain("offline");
  });
});
