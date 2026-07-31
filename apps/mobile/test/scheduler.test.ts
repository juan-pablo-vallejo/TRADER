import { describe, expect, it } from "vitest";

import { createScheduler, MIN_SYNC_INTERVAL_MS } from "../src/db/scheduler";

/** A run that resolves when the test says so, to hold a cycle open. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createScheduler — CONFLICT-6 triggers", () => {
  it("runs a cycle for the first request", async () => {
    const ran: string[] = [];
    const s = createScheduler(async (r) => void ran.push(r));
    expect(await s.request("foreground")).toBe("ran");
    expect(ran).toEqual(["foreground"]);
  });

  /**
   * The case this exists for. Regaining signal usually also foregrounds the app,
   * so reconnect and foreground arrive within the same second — three concurrent
   * cycles would push the same rows three times.
   */
  it("coalesces requests that arrive mid-cycle into a single follow-up", async () => {
    const gate = deferred();
    const ran: string[] = [];
    const s = createScheduler(async (r) => {
      ran.push(r);
      if (ran.length === 1) await gate.promise;
    });

    const first = s.request("reconnect");
    // Both land while the first cycle is still in flight.
    expect(await s.request("foreground")).toBe("coalesced");
    expect(await s.request("timer")).toBe("coalesced");

    gate.resolve();
    await first;

    // One follow-up, not two — and it carries the most recent reason.
    expect(ran).toEqual(["reconnect", "timer"]);
  });

  it("never runs two cycles at once", async () => {
    const gate = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;
    const s = createScheduler(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (concurrent === 1 && maxConcurrent === 1) await gate.promise;
      concurrent -= 1;
    });

    const first = s.request("timer");
    await s.request("manual");
    gate.resolve();
    await first;

    expect(maxConcurrent).toBe(1);
  });

  it("throttles automatic triggers that fire too soon after a cycle", async () => {
    let clock = 1_000_000;
    const ran: string[] = [];
    const s = createScheduler(async (r) => void ran.push(r), { now: () => clock });

    expect(await s.request("timer")).toBe("ran");
    clock += 1000;
    expect(await s.request("timer")).toBe("throttled");
    clock += MIN_SYNC_INTERVAL_MS;
    expect(await s.request("timer")).toBe("ran");
    expect(ran).toHaveLength(2);
  });

  /**
   * A worker who taps Sync is usually watching to see their day leave the phone.
   * Refusing them because a timer fired twenty seconds ago would be the app
   * overruling the person holding it.
   */
  it("never throttles a manual request", async () => {
    let clock = 1_000_000;
    const ran: string[] = [];
    const s = createScheduler(async (r) => void ran.push(r), { now: () => clock });

    await s.request("timer");
    clock += 1;
    expect(await s.request("manual")).toBe("ran");
    expect(ran).toEqual(["timer", "manual"]);
  });

  it("measures the throttle from when a cycle finished, not when it started", async () => {
    let clock = 1_000_000;
    const s = createScheduler(
      async () => {
        clock += MIN_SYNC_INTERVAL_MS * 2; // a slow cycle
      },
      { now: () => clock },
    );

    await s.request("timer");
    // Time advanced past the interval *during* the cycle. Stamping at the start
    // would permit another immediately, defeating the throttle on a slow link.
    expect(await s.request("timer")).toBe("throttled");
  });

  it("releases the lock when a cycle throws, rather than wedging forever", async () => {
    let first = true;
    const s = createScheduler(async () => {
      if (first) {
        first = false;
        throw new Error("no signal");
      }
    });

    await expect(s.request("manual")).rejects.toThrow("no signal");
    expect(s.isRunning()).toBe(false);
    // A failed cycle must not stop the next one — that would strand the outbox.
    expect(await s.request("manual")).toBe("ran");
  });
});
