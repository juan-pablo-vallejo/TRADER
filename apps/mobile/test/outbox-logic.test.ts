import { describe, expect, it } from "vitest";

import {
  applyPushResult,
  applyTransportFailure,
  isDue,
  isStaleSyncing,
  reclaimStale,
  STALE_SYNCING_MS,
  summarize,
} from "../src/db/outbox-logic";

const NOW = 1_800_000_000_000;

describe("applyPushResult — CONFLICT-1", () => {
  it("treats `duplicate` as delivered, not as an error", () => {
    // The flaky-connection case: the push landed, the response did not. The
    // server has the event. Retrying forever against a server that already holds
    // it would burn battery and show the worker a spinner that means nothing.
    const t = applyPushResult({ id: "e1", status: "duplicate" }, 3);
    expect(t.syncState).toBe("synced");
    expect(t.rejected).toBe(false);
    expect(t.nextAttemptAt).toBeNull();
  });

  it("marks accepted as synced and clears any earlier error", () => {
    const t = applyPushResult({ id: "e1", status: "accepted" }, 2);
    expect(t.syncState).toBe("synced");
    expect(t.lastError).toBeNull();
  });

  /**
   * SESSION-4 rejects at the boundary and never writes, and the timeline that
   * made the event illegal is append-only — so no future retry can succeed.
   * Retrying is not merely wasteful; it tells the worker their hours are on the
   * way when they never will be.
   */
  it("stops retrying a rejected event, permanently", () => {
    const t = applyPushResult(
      { id: "e1", status: "rejected", reason: "Cannot resumed after started." },
      1,
    );
    expect(t.rejected).toBe(true);
    expect(t.nextAttemptAt).toBeNull();
    expect(t.lastError).toBe("Cannot resumed after started.");
    expect(isDue({ ...t }, NOW + 10_000_000)).toBe(false);
  });
});

describe("applyTransportFailure", () => {
  it("schedules a retry and does not mark the event rejected", () => {
    const t = applyTransportFailure(0, "Network request failed", NOW, 1);
    expect(t.rejected).toBe(false);
    expect(t.attempts).toBe(1);
    expect(t.nextAttemptAt).toBeGreaterThan(NOW);
  });

  it("backs off further with each attempt", () => {
    const first = applyTransportFailure(0, "x", NOW, 1).nextAttemptAt!;
    const fifth = applyTransportFailure(4, "x", NOW, 1).nextAttemptAt!;
    expect(fifth - NOW).toBeGreaterThan(first - NOW);
  });
});

describe("isDue — what the next flush picks up", () => {
  const base = { rejected: false, nextAttemptAt: null };

  it("includes pending rows", () => {
    expect(isDue({ ...base, syncState: "pending" }, NOW)).toBe(true);
  });

  it("excludes synced rows", () => {
    expect(isDue({ ...base, syncState: "synced" }, NOW)).toBe(false);
  });

  it("excludes rows already in flight", () => {
    expect(isDue({ ...base, syncState: "syncing" }, NOW)).toBe(false);
  });

  it("holds a failed row until its backoff expires", () => {
    const row = { ...base, syncState: "failed" as const, nextAttemptAt: NOW + 5000 };
    expect(isDue(row, NOW)).toBe(false);
    expect(isDue(row, NOW + 5000)).toBe(true);
  });

  it("never picks up a rejected row, however long it waits", () => {
    const row = { syncState: "failed" as const, rejected: true, nextAttemptAt: null };
    expect(isDue(row, NOW + 1_000_000_000)).toBe(false);
  });
});

describe("isStaleSyncing — a flush killed mid-request", () => {
  /**
   * An app backgrounded in a pocket and reaped by the OS is the normal case, not
   * an exception. Rows left in `syncing` with no request behind them would never
   * sync again, and a worker's day would silently never arrive.
   */
  it("reclaims a row stuck in syncing past the deadline", () => {
    const row = { syncState: "syncing" as const, syncingSince: NOW };
    expect(isStaleSyncing(row, NOW + STALE_SYNCING_MS + 1)).toBe(true);
    expect(isStaleSyncing(row, NOW + 1000)).toBe(false);
  });

  it("reclaims a syncing row with no recorded start at all", () => {
    expect(isStaleSyncing({ syncState: "syncing", syncingSince: null }, NOW)).toBe(true);
  });

  it("leaves rows that are not syncing alone", () => {
    expect(isStaleSyncing({ syncState: "pending", syncingSince: null }, NOW)).toBe(false);
  });

  it("reclaiming returns the row to the queue without losing its attempt count", () => {
    const t = reclaimStale(3);
    expect(t.syncState).toBe("pending");
    expect(t.attempts).toBe(3);
    expect(t.rejected).toBe(false);
    // Due immediately: the previous attempt never reached the server, so there
    // is no backoff to serve.
    expect(isDue({ ...t }, NOW)).toBe(true);
  });

  it("does not reclaim a rejected row that happens to be stale", () => {
    // `rejected` is terminal (CONFLICT-10); reclamation must not resurrect it.
    const t = reclaimStale(1);
    expect(isDue({ ...t, rejected: true }, NOW)).toBe(false);
  });
});

describe("summarize — CONFLICT-6, honest status", () => {
  it("separates not-yet-sent from will-never-send", () => {
    const s = summarize([
      { syncState: "pending", rejected: false },
      { syncState: "failed", rejected: false },
      { syncState: "failed", rejected: true },
      { syncState: "synced", rejected: false },
    ]);
    // A rejected row must never be counted as merely `failed`: one will retry
    // and the other never will, and the worker needs to act differently.
    expect(s).toEqual({ pending: 1, failed: 1, rejected: 1, synced: 1 });
  });

  it("counts a syncing row as pending rather than delivered", () => {
    const s = summarize([{ syncState: "syncing", rejected: false }]);
    expect(s.synced).toBe(0);
    expect(s.pending).toBe(1);
  });
});
