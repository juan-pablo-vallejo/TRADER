// UUIDv7 as the phone mints it (src/ids.ts): the server takes only version 7 ids, orders
// some ties by them, and a job switch relies on two ids keeping the order they were made in.
import { describe, expect, it } from "vitest";

import { createMinter } from "../src/ids";

const bytes = (fill: number) => (n: number) => new Uint8Array(n).fill(fill);

describe("the minter", () => {
  it("mints version 7 ids that carry their millisecond", () => {
    const mint = createMinter(bytes(0xab));
    const id = mint(Date.UTC(2026, 10, 16));
    // Version 7, variant 10: the shape the server's `z.uuid({ version: "v7" })` takes.
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(Date.UTC(2026, 10, 16));
  });

  it("never goes backwards: within a millisecond, across them, and when the clock steps back", () => {
    const mint = createMinter(bytes(0));
    const ids = [mint(1000), mint(1000), mint(1000), mint(1001), mint(900), mint(900)];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps its order through more ids than one millisecond can count", () => {
    const mint = createMinter(bytes(0xff));
    const ids = Array.from({ length: 5000 }, () => mint(1000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(5000);
  });
});
