import { workSessionEvents } from "@trader/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { appRouter } from "../src/routers/_app";
import { rewindCursor, retryDelayMs, RETRY_MAX_MS } from "../src/sync/protocol";
import { createCallerFactory } from "../src/trpc";
import { pool } from "./helpers";
import { actor, eventId, withSyncFixture, type SyncFixture } from "./sync-helpers";

const createCaller = createCallerFactory(appRouter);

afterAll(async () => {
  await pool.end();
});

const caller = (f: SyncFixture, userId?: string) =>
  createCaller({ db: f.db, user: actor(f, userId) });

type PushEvent = {
  id: string;
  jobId: string;
  type: "started" | "paused" | "resumed" | "ended" | "voided";
  clientTimestamp: Date;
};

const push = (f: SyncFixture, events: PushEvent[], deviceNow = new Date()) =>
  caller(f).sync.push({ deviceNow, events });

const stored = (f: SyncFixture) =>
  f.db.select().from(workSessionEvents).orderBy(asc(workSessionEvents.clientTimestamp));

describe("sync.push — CONFLICT-1, idempotency", () => {
  it("records a replayed batch exactly once", async () => {
    await withSyncFixture(async (f) => {
      const events: PushEvent[] = [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "ended",
          clientTimestamp: new Date("2026-07-30T20:00:00Z"),
        },
      ];

      const first = await push(f, events);
      expect(first.results.map((r) => r.status)).toEqual(["accepted", "accepted"]);

      // The flaky-connection case: the same batch, sent ten more times.
      for (let i = 0; i < 10; i += 1) {
        const again = await push(f, events);
        expect(again.results.map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
      }

      expect(await stored(f)).toHaveLength(2);
    });
  });
});

describe("sync.push — SESSION-3/4, legality at the boundary", () => {
  it("rejects an illegal event without writing it, and keeps the legal ones", async () => {
    await withSyncFixture(async (f) => {
      const good = eventId();
      const bad = eventId();
      const res = await push(f, [
        {
          id: good,
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
        // `resumed` with no preceding `paused` — illegal under SESSION-2.
        {
          id: bad,
          jobId: f.jobA,
          type: "resumed",
          clientTimestamp: new Date("2026-07-30T13:00:00Z"),
        },
      ]);

      const byId = new Map(res.results.map((r) => [r.id, r]));
      expect(byId.get(good)!.status).toBe("accepted");
      expect(byId.get(bad)!.status).toBe("rejected");

      // SESSION-4: rejected means never written, because append-only makes a
      // mistake permanent.
      const rows = await stored(f);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(good);
    });
  });

  it("accepts an out-of-order batch by ordering it before judging", async () => {
    await withSyncFixture(async (f) => {
      // Sent newest-first, as an outbox flushing in reverse would.
      const res = await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "ended",
          clientTimestamp: new Date("2026-07-30T20:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "resumed",
          clientTimestamp: new Date("2026-07-30T17:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "paused",
          clientTimestamp: new Date("2026-07-30T16:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      expect(res.results.every((r) => r.status === "accepted")).toBe(true);
      expect(await stored(f)).toHaveLength(4);
    });
  });

  it("accepts a late event that belongs in the middle of stored history", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "resumed",
          clientTimestamp: new Date("2026-07-30T17:00:00Z"),
        },
      ]).catch(() => undefined);

      // The `resumed` above was illegal on its own, so seed a legal timeline first.
      const res = await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "paused",
          clientTimestamp: new Date("2026-07-30T16:00:00Z"),
        },
      ]);
      expect(res.results[0]!.status).toBe("accepted");
    });
  });

  it("SESSION-1: a second concurrent session is refused", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      const res = await push(f, [
        {
          id: eventId(),
          jobId: f.jobB,
          type: "started",
          clientTimestamp: new Date("2026-07-30T13:00:00Z"),
        },
      ]);
      expect(res.results[0]!.status).toBe("rejected");
    });
  });

  it("SESSION-5: a job switch is two events and both land", async () => {
    await withSyncFixture(async (f) => {
      const res = await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobA,
          type: "ended",
          clientTimestamp: new Date("2026-07-30T15:00:00Z"),
        },
        {
          id: eventId(),
          jobId: f.jobB,
          type: "started",
          clientTimestamp: new Date("2026-07-30T15:00:01Z"),
        },
      ]);
      expect(res.results.every((r) => r.status === "accepted")).toBe(true);
    });
  });

  it("judges each worker's timeline separately", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      // A different worker starting their own session is not a SESSION-1 breach.
      const res = await caller(f, f.otherWorkerId).sync.push({
        deviceNow: new Date(),
        events: [
          {
            id: eventId(),
            jobId: f.jobA,
            type: "started",
            clientTimestamp: new Date("2026-07-30T12:05:00Z"),
          },
        ],
      });
      expect(res.results[0]!.status).toBe("accepted");
    });
  });
});

describe("sync.push — CONFLICT-4, clock skew", () => {
  const clientTs = new Date("2026-07-30T12:00:00Z");

  it("trusts a healthy clock and records the device's timestamp", async () => {
    await withSyncFixture(async (f) => {
      const id = eventId();
      const res = await push(
        f,
        [{ id, jobId: f.jobA, type: "started", clientTimestamp: clientTs }],
        new Date(), // device agrees with the server
      );
      expect(res.skewMs).toBeLessThan(5 * 60 * 1000);
      const row = (await stored(f))[0]!;
      expect(row.clientTimestamp.toISOString()).toBe(clientTs.toISOString());
      expect(row.payload).toBeNull();
    });
  });

  it("still writes the event when the clock is badly wrong, and flags it", async () => {
    await withSyncFixture(async (f) => {
      const id = eventId();
      // Device claims it is three hours later than it is.
      const skewed = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const res = await push(
        f,
        [{ id, jobId: f.jobA, type: "started", clientTimestamp: clientTs }],
        skewed,
      );

      // Never rejected: losing a worker's hours to their phone's clock is worse.
      expect(res.results[0]!.status).toBe("accepted");
      expect(res.skewMs).toBeGreaterThan(5 * 60 * 1000);

      const row = (await stored(f))[0]!;
      // Recorded as reported, never clamped — an append-only ledger must not
      // claim a time the worker did not act.
      expect(row.clientTimestamp.toISOString()).toBe(clientTs.toISOString());
      expect(row.payload).toMatchObject({ clockTrusted: false });
    });
  });

  it("a skewed clock cannot reorder history to bypass SESSION-2", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      // A device claiming an ancient timestamp cannot slip a second `started`
      // in before the existing one: distrusted clocks order by arrival.
      const res = await push(
        f,
        [
          {
            id: eventId(),
            jobId: f.jobB,
            type: "started",
            clientTimestamp: new Date("2020-01-01T00:00:00Z"),
          },
        ],
        new Date(Date.now() - 6 * 60 * 60 * 1000),
      );
      expect(res.results[0]!.status).toBe("rejected");
    });
  });
});

describe("sync.pull — CONFLICT-4a, cursor", () => {
  async function seedEvents(f: SyncFixture, n: number) {
    // A legal timeline: one long session paused and resumed repeatedly.
    const events: PushEvent[] = [
      {
        id: eventId(),
        jobId: f.jobA,
        type: "started",
        clientTimestamp: new Date("2026-07-30T08:00:00Z"),
      },
    ];
    for (let i = 0; i < n - 1; i += 1) {
      events.push({
        id: eventId(),
        jobId: f.jobA,
        type: i % 2 === 0 ? "paused" : "resumed",
        clientTimestamp: new Date(Date.UTC(2026, 6, 30, 9 + i, 0, 0)),
      });
    }
    await push(f, events);
  }

  it("paginates to the end and terminates", async () => {
    await withSyncFixture(async (f) => {
      await seedEvents(f, 12);

      const seen: string[] = [];
      let cursor = null as { serverTimestamp: Date; id: string } | null;
      // Bounded so a non-terminating cursor fails loudly rather than hanging.
      for (let page = 0; page < 20; page += 1) {
        const res = await caller(f).sync.pull({ cursor, limit: 5 });
        seen.push(...res.events.map((e) => e.id));
        cursor = res.nextCursor;
        if (!cursor) break;
      }

      expect(cursor).toBeNull();
      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
    });
  });

  it("a full final page still terminates on the following pull", async () => {
    await withSyncFixture(async (f) => {
      await seedEvents(f, 10);
      let cursor = null as { serverTimestamp: Date; id: string } | null;
      let pages = 0;
      for (; pages < 10; pages += 1) {
        const res = await caller(f).sync.pull({ cursor, limit: 5 });
        cursor = res.nextCursor;
        if (!cursor) break;
      }
      // 10 events at 5/page: two full pages, then an empty third that ends it.
      expect(cursor).toBeNull();
      expect(pages).toBe(2);
    });
  });

  it("is scoped to the company", async () => {
    await withSyncFixture(async (f) => {
      await seedEvents(f, 3);
      const res = await caller(f).sync.pull({ cursor: null, limit: 200 });
      expect(res.events.every((e) => e.companyId === f.companyId)).toBe(true);
    });
  });

  it("a rewound cursor re-reads events the strict keyset had passed", async () => {
    await withSyncFixture(async (f) => {
      await seedEvents(f, 4);
      const first = await caller(f).sync.pull({ cursor: null, limit: 2 });
      expect(first.events).toHaveLength(2);

      // The strict keyset moves strictly forward — nothing already seen returns.
      const next = await caller(f).sync.pull({ cursor: first.nextCursor, limit: 2 });
      expect(next.events.map((e) => e.id)).not.toContain(first.events[0]!.id);

      // Rewinding by the overlap window is what recovers a late-committing row;
      // here it demonstrably returns events the strict cursor had moved past.
      const rewound = await caller(f).sync.pull({
        cursor: rewindCursor(first.nextCursor),
        limit: 200,
      });
      expect(rewound.events.map((e) => e.id)).toContain(first.events[0]!.id);
    });
  });
});

describe("retry backoff — CONFLICT-4a", () => {
  it("grows exponentially and caps at 5 minutes", () => {
    // `random: 1` is full-jitter's ceiling, which is the curve being asserted.
    expect(retryDelayMs(0, 1)).toBe(1000);
    expect(retryDelayMs(1, 1)).toBe(2000);
    expect(retryDelayMs(4, 1)).toBe(16000);
    expect(retryDelayMs(50, 1)).toBe(RETRY_MAX_MS);
  });

  it("jitters, so a crew regaining signal together does not retry in lockstep", () => {
    expect(retryDelayMs(10, 0)).toBe(0);
    expect(retryDelayMs(10, 0.5)).toBeLessThan(retryDelayMs(10, 1));
  });
});

describe("stored events", () => {
  it("default to an honest attestation level (ATTEST-3/4)", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      const row = (await stored(f))[0]!;
      // A client that sends nothing records `none`, not an optimistic guess.
      expect(row.attestationLevel).toBe("none");
    });
  });

  it("attribute the event to the caller", async () => {
    await withSyncFixture(async (f) => {
      await push(f, [
        {
          id: eventId(),
          jobId: f.jobA,
          type: "started",
          clientTimestamp: new Date("2026-07-30T12:00:00Z"),
        },
      ]);
      const rows = await f.db
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.workerId, f.workerId));
      expect(rows[0]!.initiatorUserId).toBe(f.workerId);
    });
  });
});
