// The browser's id for an office closeout (src/app/closeout/uuidv7.ts): the shape the API's
// `z.uuid({ version: "v7" })` and the table's CHECK admit, carrying the time it was minted.
import { describe, expect, it } from "vitest";

import { uuidv7 } from "../src/app/closeout/uuidv7";

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("is a version 7, variant 10 UUID whose first 48 bits are the milliseconds given", () => {
    for (const ms of [0, 1, 1_762_930_000_123, 0xffff_ffff_ffff]) {
      const id = uuidv7(ms);
      expect(id).toMatch(V7);
      expect(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(ms);
    }
  });

  it("differs on every call, and sorts by time", () => {
    expect(uuidv7(5)).not.toBe(uuidv7(5));
    expect(uuidv7(1_762_930_000_000) < uuidv7(1_762_930_000_001)).toBe(true);
    expect(uuidv7()).toMatch(V7);
  });

  it("refuses a time outside 48 bits", () => {
    expect(() => uuidv7(-1)).toThrow();
    expect(() => uuidv7(2 ** 48)).toThrow();
    expect(() => uuidv7(1.5)).toThrow();
  });
});
