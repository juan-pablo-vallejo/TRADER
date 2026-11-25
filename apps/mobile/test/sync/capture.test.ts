// A tap as the provider writes it (src/sync/capture.ts): to the store and nowhere else, and
// a write the store throws on is said, reported and leaves nothing behind.
import type { PullOutput } from "@trader/api/contract";
import superjson from "superjson";
import { describe, expect, it } from "vitest";

import { createMinter } from "../../src/ids";
import { capture } from "../../src/sync/capture";
import { SNAPSHOT_KEY, SNAPSHOT_SHAPE } from "../../src/sync/engine";
import { memoryStore } from "../memory-store";

const ME = "01900000-0000-7000-8000-000000000001";
const JOB = "01900000-0000-7000-8000-00000000000a";
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

const data: PullOutput = {
  serverNow: new Date(T0),
  me: { id: ME, role: "worker", name: "Luis" },
  company: { name: "Co", timezone: "America/New_York", phone: null },
  scheduleEnforced: false,
  locationStamps: false,
  shifts: [],
  jobs: [],
  sessions: [],
  events: [],
};

async function setUp() {
  const store = memoryStore();
  await store.write(
    SNAPSHOT_KEY,
    superjson.stringify({ shape: SNAPSHOT_SHAPE, pulledAt: T0, data }),
  );
  const reported: unknown[] = [];
  const deps = {
    now: () => T0,
    mint: createMinter((n) => new Uint8Array(n).fill(7)),
    location: () => null,
    report: (error: unknown) => reported.push(error),
  };
  return { store, reported, deps };
}

describe("a tap", () => {
  it("is saved to the phone's store", async () => {
    const { store, reported, deps } = await setUp();
    const done = await capture(store, { action: "start", jobId: JOB }, deps);
    expect(done).toBe("saved");
    expect(store.rows.map((r) => r.payload.type)).toEqual(["started"]);
    expect(reported).toEqual([]);
  });

  it("that makes no sense from where the clock stands writes nothing and says nothing", async () => {
    const { store, deps } = await setUp();
    expect(await capture(store, { action: "end" }, deps)).toBe("none");
    expect(store.rows).toEqual([]);
  });

  it("whose write the store throws on is not saved, is reported, and leaves no record", async () => {
    const { store, reported, deps } = await setUp();
    const broken = new Error("disk full");
    store.append = () => Promise.reject(broken);
    expect(await capture(store, { action: "start", jobId: JOB }, deps)).toBe("failed");
    expect(reported).toEqual([broken]);
    expect(store.rows).toEqual([]);
  });
});
