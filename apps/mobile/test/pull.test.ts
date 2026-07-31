import { PULL_OVERLAP_MS, type PullCursor } from "@trader/api/sync";
import { describe, expect, it } from "vitest";

import {
  lastCursorOf,
  MAX_PAGES_PER_CYCLE,
  pullEvents,
  type PullDeps,
  type PulledEvent,
} from "../src/db/pull";

const T0 = 1_800_000_000_000;

function ev(n: number): PulledEvent {
  return {
    id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
    workerId: "worker-1",
    jobId: "job-1",
    type: "started",
    clientTimestamp: new Date(T0 + n * 1000),
    serverTimestamp: new Date(T0 + n * 1000),
    attestationLevel: "none",
    deviceLat: null,
    deviceLng: null,
    deviceAccuracyM: null,
    payload: null,
  };
}

/** Records what the loop asked for and what it committed. */
function harness(pages: { events: PulledEvent[]; nextCursor: PullCursor | null }[]) {
  const requested: (PullCursor | null)[] = [];
  const committed: { count: number; cursor: PullCursor | null }[] = [];
  let stored: PullCursor | null = null;

  const deps: PullDeps = {
    readCursor: () => stored,
    persist: (events, cursor) => {
      committed.push({ count: events.length, cursor });
      if (cursor) stored = cursor;
    },
  };

  let call = 0;
  const pull = async (input: { cursor: PullCursor | null; limit: number }) => {
    requested.push(input.cursor);
    // Past the scripted pages, behave like a caught-up server.
    return pages[call++] ?? { events: [], nextCursor: null };
  };

  return { deps, pull, requested, committed, setStored: (c: PullCursor) => (stored = c) };
}

describe("pullEvents — CONFLICT-8, cursor walking", () => {
  it("paginates to the end and stops", async () => {
    const h = harness([
      {
        events: [ev(1), ev(2)],
        nextCursor: { serverTimestamp: new Date(T0 + 2000), id: ev(2).id },
      },
      { events: [ev(3)], nextCursor: null },
    ]);

    const out = await pullEvents(h.pull, 2, h.deps);
    expect(out).toEqual({ received: 3, pages: 2, reachedEnd: true });
  });

  it("starts from null on a device that has never pulled", async () => {
    const h = harness([{ events: [], nextCursor: null }]);
    await pullEvents(h.pull, 2, h.deps);
    expect(h.requested[0]).toBeNull();
  });

  /**
   * The rule the whole cursor design rests on. Rewinding inside the page loop is
   * the non-termination bug CONFLICT-8 exists to prevent, so the overlap must be
   * applied to the *first* request of a cycle and to no other.
   */
  it("rewinds exactly once, at the start of the cycle", async () => {
    const h = harness([
      {
        events: [ev(5)],
        nextCursor: { serverTimestamp: new Date(T0 + 5000), id: ev(5).id },
      },
      { events: [ev(6)], nextCursor: null },
    ]);
    h.setStored({ serverTimestamp: new Date(T0 + 4000), id: ev(4).id });

    await pullEvents(h.pull, 1, h.deps);

    // First request is rewound by the overlap window...
    expect(h.requested[0]!.serverTimestamp.getTime()).toBe(T0 + 4000 - PULL_OVERLAP_MS);
    // ...and the second is the server's own nextCursor, untouched.
    expect(h.requested[1]!.serverTimestamp.getTime()).toBe(T0 + 5000);
  });

  it("advances the cursor on a short final page, so it is not re-read forever", async () => {
    const h = harness([{ events: [ev(1), ev(2)], nextCursor: null }]);
    await pullEvents(h.pull, 200, h.deps);

    // The server said "no more", but the page still carried rows — the cursor has
    // to move to their last keyset or every future cycle redelivers them.
    expect(h.committed).toHaveLength(1);
    expect(h.committed[0]!.cursor?.id).toBe(ev(2).id);
  });

  it("commits nothing to move to when a page is genuinely empty", async () => {
    const h = harness([{ events: [], nextCursor: null }]);
    await pullEvents(h.pull, 200, h.deps);
    expect(h.committed[0]).toEqual({ count: 0, cursor: null });
  });

  /**
   * Termination is guaranteed by the strict keyset, so this cap is a bound on how
   * long one cycle may hold the device — not a correctness mechanism. It is tested
   * because a server that always returns a cursor would otherwise loop forever.
   */
  it("stops at the page cap without claiming it reached the end", async () => {
    const endless = Array.from({ length: MAX_PAGES_PER_CYCLE + 5 }, (_, i) => ({
      events: [ev(i + 1)],
      nextCursor: { serverTimestamp: new Date(T0 + (i + 1) * 1000), id: ev(i + 1).id },
    }));
    const h = harness(endless);

    const out = await pullEvents(h.pull, 1, h.deps);
    expect(out.pages).toBe(MAX_PAGES_PER_CYCLE);
    expect(out.reachedEnd).toBe(false);
    // The cursor advanced, so the next cycle resumes rather than restarting.
    expect(h.requested).toHaveLength(MAX_PAGES_PER_CYCLE);
  });

  it("persists each page as it arrives, not once at the end", async () => {
    const h = harness([
      {
        events: [ev(1)],
        nextCursor: { serverTimestamp: new Date(T0 + 1000), id: ev(1).id },
      },
      { events: [ev(2)], nextCursor: null },
    ]);
    await pullEvents(h.pull, 1, h.deps);
    // Two commits, not one: a cycle interrupted after page one must keep page one.
    expect(h.committed.map((c) => c.count)).toEqual([1, 1]);
  });
});

describe("lastCursorOf", () => {
  it("is the last row's keyset", () => {
    expect(lastCursorOf([ev(1), ev(2)])?.id).toBe(ev(2).id);
  });

  it("is null for no rows", () => {
    expect(lastCursorOf([])).toBeNull();
  });
});
