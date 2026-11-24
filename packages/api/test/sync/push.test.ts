// sync.push through the application's router (routers/sync.ts), against
// Postgres, in rolled-back owner transactions: each record's caller transaction is a savepoint
// of it. What a commit proves is sync/push-commit.test.ts's; the loop's stop rules are also
// proved here without a database, through pushRecords with a stand-in runner.
import {
  companies,
  jobAssignments,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { readWorkerEvents } from "../../src/labor/timeline";
import { deriveSessions } from "../../src/labor/work-date";
import {
  BUDGET_MS,
  pushRecords,
  reportRecordFailure,
  type PushResult,
  type RunRecord,
} from "../../src/sync/push";
import {
  appCallerIn,
  asTenant,
  boundIn,
  workDayIn,
  identity,
  ownerDb,
  recordingReporter,
  rejection,
  rolledBack,
  throwingReporter,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HERE = { lat: 41.824, lng: -71.4128, accuracyM: 8 };
const NY = "America/New_York";

function labor(
  workerId: string,
  jobId: string,
  o: Record<string, unknown> = {},
  id = uuidv7(),
) {
  return {
    id,
    kind: "labor_event",
    schemaVersion: 1,
    payload: {
      workerId,
      jobId,
      type: "started",
      clientTimestamp: new Date("2026-10-05T12:00:00Z"),
      location: HERE,
      timeSetByUser: false,
      capturedOffline: false,
      ...o,
    },
  };
}

// A working day with a bound worker `w`, the app role and tenant on.
async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const w = await boundIn(tx, d.companyId, "worker");
  await asTenant(tx, d.companyId);
  return { ...d, w };
}

const push = (tx: Tx, who: unknown, records: unknown[], deviceNow = new Date()) =>
  appCallerIn(tx, who).sync.push({ protocolVersion: 1, deviceNow, records });

async function asOwner<T>(tx: Tx, companyId: string, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, companyId);
  return result;
}

const summary = (results: PushResult[]) =>
  results.map((r) => (r.result === "rejected" ? `${r.result}:${r.code}` : r.result));

describe("sync.push — who may call", () => {
  it("answers UNAUTHORIZED without an identity, and to a deactivated caller, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      expect(await rejection(push(tx, null, [labor(d.w.id, d.J)]))).toMatchObject({
        code: "UNAUTHORIZED",
      });
      await asOwner(tx, d.companyId, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w.id)),
      );
      const bad = { id: uuidv7(), kind: "labor_event", schemaVersion: 1, payload: {} };
      // Not even a malformed record is answered to a caller with no account.
      expect(await rejection(push(tx, d.w.who, [bad, labor(d.w.id, d.J)]))).toMatchObject(
        {
          code: "UNAUTHORIZED",
        },
      );
      const events = await asOwner(tx, d.companyId, () =>
        tx
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.companyId, d.companyId)),
      );
      expect(events).toEqual([]);
    });
  });

  it("resolves the caller even when no record runs: invalid-only and unknown-version-first", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const invalid = {
        id: uuidv7(),
        kind: "labor_event",
        schemaVersion: 1,
        payload: {},
      };
      const future = { ...labor(d.w.id, d.J), schemaVersion: 2 };
      const nobody = identity(`sub-nobody-${uuidv7()}`, `nobody-${uuidv7()}@co.test`);
      // An active caller is answered: the malformed record, and nothing for the future one.
      expect(summary((await push(tx, d.w.who, [invalid])).results)).toEqual([
        "rejected:invalid_record",
      ]);
      expect((await push(tx, d.w.who, [future, labor(d.w.id, d.J)])).results).toEqual([]);
      // No account, or a deactivated one: UNAUTHORIZED, whatever the batch holds.
      for (const batch of [[invalid], [future, labor(d.w.id, d.J)], [invalid, future]]) {
        expect(await rejection(push(tx, nobody, batch))).toMatchObject({
          code: "UNAUTHORIZED",
        });
      }
      await asOwner(tx, d.companyId, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w.id)),
      );
      for (const batch of [[invalid], [future, labor(d.w.id, d.J)], [invalid, future]]) {
        expect(await rejection(push(tx, d.w.who, batch))).toMatchObject({
          code: "UNAUTHORIZED",
        });
      }
    });
  });

  it("refuses another protocol version, an empty batch and an oversized one (BAD_REQUEST)", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const call = (input: unknown) => appCallerIn(tx, d.w.who).sync.push(input as never);
      const records = [labor(d.w.id, d.J)];
      for (const input of [
        { protocolVersion: 2, deviceNow: new Date(), records },
        { protocolVersion: 1, deviceNow: new Date(), records: [] },
        {
          protocolVersion: 1,
          deviceNow: new Date(),
          records: Array(101).fill(records[0]),
        },
        { protocolVersion: 1, deviceNow: new Date(), records, companyId: d.companyId },
      ]) {
        expect(await rejection(call(input))).toMatchObject({ code: "BAD_REQUEST" });
      }
    });
  });
});

describe("sync.push — envelopes", () => {
  it("answers a malformed addressable record invalid_record and runs its neighbours", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const bad = labor(d.w.id, d.J, { initiatorUserId: d.userId });
      const unknownKind = { ...labor(d.w.id, d.J), kind: "photo" };
      const extra = { ...labor(d.w.id, d.J), companyId: d.companyId };
      const answer = await push(tx, d.w.who, [
        labor(d.w.id, d.J),
        bad,
        unknownKind,
        extra,
        labor(d.w.id, d.J, {
          type: "paused",
          clientTimestamp: new Date("2026-10-05T13:00:00Z"),
          location: null,
        }),
      ]);
      expect(summary(answer.results)).toEqual([
        "accepted",
        "rejected:invalid_record",
        "rejected:invalid_record",
        "rejected:invalid_record",
        "accepted",
      ]);
      expect(answer.results[2]).toMatchObject({ id: unknownKind.id, kind: null });
      expect(answer.results[1]).toMatchObject({ id: bad.id, kind: "labor_event" });
    });
  });

  // A JS Date reaches years Postgres cannot store. Unbounded, such a record parses, throws
  // inside its transaction and is retried for ever, holding the outbox behind it.
  it("answers a time beyond year 9999 invalid_record instead of stalling the batch", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const beyond = labor(d.w.id, d.J, {
        clientTimestamp: new Date("+010000-01-01T00:00:00.000Z"),
      });
      const answer = await push(tx, d.w.who, [beyond, labor(d.w.id, d.J)]);
      expect(summary(answer.results)).toEqual(["rejected:invalid_record", "accepted"]);
    });
  });

  it("stops before a record with no id or a version it does not know: the rest are retried", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const first = labor(d.w.id, d.J);
      const future = { ...labor(d.w.id, d.J), schemaVersion: 2 };
      const noId = { ...labor(d.w.id, d.J), id: "not-a-uuid" };
      const behind = labor(d.w.id, d.J, {
        type: "paused",
        clientTimestamp: new Date("2026-10-05T13:00:00Z"),
        location: null,
      });
      for (const blocker of [future, noId]) {
        const answer = await push(tx, d.w.who, [first, blocker, behind]);
        expect(answer.results.map((r) => r.id)).toEqual([first.id]);
      }
    });
  });
});

describe("sync.push — the day as the field sends it", () => {
  it("measures skew once per push and keeps a skewed event at its captured time", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const ahead = new Date(Date.now() + 600_000);
      const answer = await push(tx, d.w.who, [labor(d.w.id, d.J)], ahead);
      expect(answer.clockSkewMs).toBeGreaterThan(599_000);
      expect(answer.clockSkewMs).toBeLessThan(601_000);
      // An October entry sent in November is also a backlog: offline (M3).
      expect(answer.results[0]).toMatchObject({
        ack: { clockSkewed: true, flags: ["offline", "clock_skewed"] },
      });
      const [session] = deriveSessions(
        await asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id)),
        NY,
      );
      // Effective instant is the device's 12:00, flagged; never the receipt.
      expect(session!.startedAt).toEqual(new Date("2026-10-05T12:00:00Z"));
    });
  });

  it("rejects an end whose start has not arrived; the start still lands", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const end = labor(d.w.id, d.J, {
        type: "ended",
        clientTimestamp: new Date("2026-10-05T16:00:00Z"),
      });
      expect(summary((await push(tx, d.w.who, [end])).results)).toEqual([
        "rejected:no_open_session",
      ]);
      expect(summary((await push(tx, d.w.who, [labor(d.w.id, d.J)])).results)).toEqual([
        "accepted",
      ]);
    });
  });

  it("carries a two-day backlog: offline throughout, each day at its captured times", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const day = (date: string) => [
        labor(d.w.id, d.J, {
          clientTimestamp: new Date(`${date}T12:00:00Z`),
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "paused",
          clientTimestamp: new Date(`${date}T15:00:00Z`),
          location: null,
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "resumed",
          clientTimestamp: new Date(`${date}T15:30:00Z`),
          location: null,
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "ended",
          clientTimestamp: new Date(`${date}T20:00:00Z`),
          capturedOffline: true,
        }),
      ];
      const answer = await push(tx, d.w.who, [
        ...day("2026-10-05"),
        ...day("2026-10-06"),
      ]);
      const reasons = answer.results.map((r) =>
        r.result === "accepted" ? (r.ack as { flags: string[] }).flags : r,
      );
      expect(reasons).toEqual(Array(8).fill(["offline"]));

      // Delivered late, kept where it was captured: each day's session at its own
      // times, in order, and nothing flagged for a delay alone.
      expect(
        answer.results.every(
          (r) =>
            r.result === "accepted" &&
            (r.ack as { clockSkewed: boolean }).clockSkewed === false,
        ),
      ).toBe(true);
      const sessions = deriveSessions(
        await asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id)),
        NY,
      );
      expect(
        sessions.map((s) => [
          s.workDate,
          s.startedAt.toISOString(),
          s.endedAt?.toISOString(),
          s.workedMs,
          s.breakMs,
        ]),
      ).toEqual(
        ["2026-10-05", "2026-10-06"].map((date) => [
          date,
          `${date}T12:00:00.000Z`,
          `${date}T20:00:00.000Z`,
          7.5 * 3_600_000,
          0.5 * 3_600_000,
        ]),
      );

      // Another worker's own hour on a past day, sent now as if captured online then: a push
      // that late is an offline capture (M3), so it is flagged offline and not clock_skewed.
      const claimed = await push(tx, d.who, [
        labor(d.userId, d.J),
        labor(d.userId, d.J, {
          type: "ended",
          clientTimestamp: new Date("2026-10-05T13:00:00Z"),
        }),
      ]);
      expect(
        claimed.results.map((r) =>
          r.result === "accepted" ? (r.ack as { flags: string[] }).flags : r,
        ),
      ).toEqual(Array(2).fill(["offline"]));
    });
  });

  it("refuses a future event and goes on; the office enters its hours (labor.repair)", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await asOwner(tx, d.companyId, () =>
        boundIn(tx, d.companyId, "admin"),
      );
      const future = labor(d.w.id, d.J, {
        clientTimestamp: new Date(Date.now() + 3_600_000),
      });
      const answer = await push(tx, d.w.who, [
        future,
        labor(d.w.id, d.J, { type: "ended" }),
      ]);
      // An ordinary per-record rejection: the record behind it still runs, and is judged on
      // a ledger the refused start never reached.
      expect(answer.results[0]).toEqual({
        id: future.id,
        kind: "labor_event",
        result: "rejected",
        code: "time_in_future",
      });
      expect(summary(answer.results)).toEqual([
        "rejected:time_in_future",
        "rejected:no_open_session",
      ]);
      const ledger = () => asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id));
      expect(await ledger()).toEqual([]);

      // The phone keeps the record; the office recovers the hours as its own events.
      const start = new Date(Date.now() - 8 * 3_600_000);
      const end = new Date(Date.now() - 3_600_000);
      const repaired = await appCallerIn(tx, admin.who).labor.repair({
        workerId: d.w.id,
        operations: [
          {
            kind: "append",
            id: uuidv7(),
            type: "started",
            jobId: d.J,
            clientTimestamp: start,
          },
          {
            kind: "append",
            id: uuidv7(),
            type: "ended",
            jobId: d.J,
            clientTimestamp: end,
          },
        ],
      });
      expect(repaired.result).toBe("accepted");
      const events = await ledger();
      expect(events.map((e) => e.id)).not.toContain(future.id);
      expect(deriveSessions(events, NY)).toMatchObject([
        { startedAt: start, endedAt: end, workedMs: 7 * 3_600_000, complete: true },
      ]);
    });
  });

  it("takes a backlog from a slow clock at its captured times, every event flagged", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // The phone runs ten minutes slow; its day was captured offline on that clock.
      const deviceNow = new Date(Date.now() - 600_000);
      const t = (minutesBefore: number) =>
        new Date(deviceNow.getTime() - minutesBefore * 60_000);
      const offline = { capturedOffline: true };
      const batch = [
        labor(d.w.id, d.J, { clientTimestamp: t(480), ...offline }),
        labor(d.w.id, d.J, {
          type: "paused",
          clientTimestamp: t(240),
          location: null,
          ...offline,
        }),
        labor(d.w.id, d.J, {
          type: "resumed",
          clientTimestamp: t(210),
          location: null,
          ...offline,
        }),
        labor(d.w.id, d.J, { type: "ended", clientTimestamp: t(0), ...offline }),
      ];
      const answer = await push(tx, d.w.who, batch, deviceNow);
      expect(answer.clockSkewMs).toBeLessThan(-599_000);
      expect(answer.results).toMatchObject(
        batch.map((r) => ({
          id: r.id,
          result: "accepted",
          ack: { clockSkewed: true, flags: ["offline", "clock_skewed"] },
        })),
      );
      expect(
        deriveSessions(
          await asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id)),
          NY,
        ),
      ).toMatchObject([
        {
          startedAt: t(480),
          endedAt: t(0),
          workedMs: 450 * 60_000,
          breakMs: 30 * 60_000,
          complete: true,
        },
      ]);
    });
  });

  it("refuses what a fast clock dates in the future and keeps the rest of its batch", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // Ten minutes fast: the start, two device-hours ago, is in the past; the end, captured
      // this instant on that clock, is ten minutes ahead of its receipt.
      const deviceNow = new Date(Date.now() + 600_000);
      const start = labor(d.w.id, d.J, {
        clientTimestamp: new Date(deviceNow.getTime() - 2 * 3_600_000),
        capturedOffline: true,
      });
      const end = labor(d.w.id, d.J, { type: "ended", clientTimestamp: deviceNow });
      const answer = await push(tx, d.w.who, [start, end], deviceNow);
      expect(summary(answer.results)).toEqual(["accepted", "rejected:time_in_future"]);
      expect(answer.results[0]).toMatchObject({
        ack: { clockSkewed: true, flags: ["offline", "clock_skewed"] },
      });
      // The session stays open at its captured start until the office ends it.
      expect(
        deriveSessions(
          await asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id)),
          NY,
        ),
      ).toMatchObject([{ startedAt: start.payload.clientTimestamp, complete: false }]);
    });
  });
});

describe("pushRecords — the loop, without a database", () => {
  const records = (n: number) =>
    Array.from({ length: n }, () => ({
      id: uuidv7(),
      kind: "labor_event",
      schemaVersion: 1,
      payload: {
        workerId: uuidv7(),
        jobId: uuidv7(),
        type: "started",
        clientTimestamp: new Date(),
        location: null,
        timeSetByUser: false,
        capturedOffline: false,
      },
    }));
  // A runner that answers each record without running it, failing where told.
  function fakeRun(fail: Record<number, Error> = {}): RunRecord {
    let n = 0;
    return async () => {
      const i = n++;
      if (fail[i] !== undefined) throw fail[i];
      return {
        id: uuidv7(),
        kind: "labor_event",
        result: "rejected",
        code: `r_${i}`,
      } as never;
    };
  }
  const input = (rs: unknown[]) => ({
    protocolVersion: 1 as const,
    deviceNow: new Date(),
    records: rs,
  });

  it("stops at the first thrown record, rethrowing only when nothing ran", async () => {
    const boom = new Error("transient");
    const out = await pushRecords(input(records(4)), fakeRun({ 2: boom }));
    expect(out.results.map((r) => (r.result === "rejected" ? r.code : r.result))).toEqual(
      ["r_0", "r_1"],
    );
    await expect(pushRecords(input(records(2)), fakeRun({ 0: boom }))).rejects.toBe(boom);
  });

  it("takes a thrown FORBIDDEN for a throw, not an answer; UNAUTHORIZED stops, or throws first", async () => {
    // No record's path throws FORBIDDEN: a refusal is returned as `not_permitted`.
    const forbidden = new TRPCError({ code: "FORBIDDEN" });
    const unauthorized = new TRPCError({ code: "UNAUTHORIZED" });
    await expect(pushRecords(input(records(3)), fakeRun({ 0: forbidden }))).rejects.toBe(
      forbidden,
    );
    const stopped = await pushRecords(input(records(3)), fakeRun({ 1: forbidden }));
    expect(
      stopped.results.map((r) => (r.result === "rejected" ? r.code : r.result)),
    ).toEqual(["r_0"]);
    const partial = await pushRecords(input(records(3)), fakeRun({ 1: unauthorized }));
    expect(partial.results).toHaveLength(1);
    await expect(
      pushRecords(input(records(2)), fakeRun({ 0: unauthorized })),
    ).rejects.toBe(unauthorized);
  });

  it("opens one caller transaction, with no record, when nothing ran", async () => {
    let calls = 0;
    const run: RunRecord = async (body) => {
      calls++;
      return body(undefined as never, undefined as never);
    };
    const invalid = { id: uuidv7(), kind: "labor_event", schemaVersion: 1, payload: {} };
    const out = await pushRecords(input([invalid, invalid]), run);
    expect(calls).toBe(1);
    expect(out.results).toHaveLength(2);
    const unauthorized = new TRPCError({ code: "UNAUTHORIZED" });
    await expect(
      pushRecords(input([invalid]), async () => {
        throw unauthorized;
      }),
    ).rejects.toBe(unauthorized);
  });

  it("starts no record after the budget; what is left is retried", async () => {
    let now = 0;
    const clock = () => now;
    let n = 0;
    const run: RunRecord = async () => {
      now += BUDGET_MS / 2 + 1;
      return {
        id: uuidv7(),
        kind: "labor_event",
        result: "rejected",
        code: `r_${n++}`,
      } as never;
    };
    const out = await pushRecords(input(records(5)), run, clock);
    expect(out.results).toHaveLength(2);
  });

  // What the loop swallows reaches the reporter; nothing else changes.
  const codes = (out: { results: PushResult[] }) =>
    out.results.map((r) => (r.result === "rejected" ? r.code : r.result));
  const recorded = () => {
    const { reporter, events } = recordingReporter();
    return { onFailure: reportRecordFailure(reporter), events };
  };

  it("reports a record that throws after one committed; the answer is unchanged", async () => {
    const boom = new Error("transient");
    const { onFailure, events } = recorded();
    const plain = await pushRecords(input(records(4)), fakeRun({ 1: boom }));
    const reported = await pushRecords(
      input(records(4)),
      fakeRun({ 1: boom }),
      Date.now,
      onFailure,
    );
    expect(codes(reported)).toEqual(codes(plain));
    expect(reported.results).toHaveLength(1);
    expect(events).toMatchObject([
      {
        source: "push_record",
        path: "sync.push",
        type: "mutation",
        errorNames: ["Error"],
      },
    ]);
    // Nothing ran: the throw is the call's, answered by the handler, not reported here.
    await expect(
      pushRecords(input(records(2)), fakeRun({ 0: boom }), Date.now, onFailure),
    ).rejects.toBe(boom);
    expect(events).toHaveLength(1);
  });

  it("reports no mid-batch UNAUTHORIZED", async () => {
    const { onFailure, events } = recorded();
    const unauthorized = new TRPCError({ code: "UNAUTHORIZED" });
    const partial = await pushRecords(
      input(records(3)),
      fakeRun({ 2: unauthorized }),
      Date.now,
      onFailure,
    );
    expect(partial.results).toHaveLength(2);
    expect(events).toEqual([]);
  });

  it("keeps the injected clock third: its budget and the reporter work together", async () => {
    let now = 0;
    let reads = 0;
    const clock = () => {
      reads++;
      return now;
    };
    const advancing = (fail: Record<number, Error>): RunRecord => {
      const inner = fakeRun(fail);
      return async (body) => {
        now += BUDGET_MS / 2 + 1;
        return inner(body);
      };
    };
    const quiet = recorded();
    const budgeted = await pushRecords(
      input(records(5)),
      advancing({}),
      clock,
      quiet.onFailure,
    );
    expect(budgeted.results).toHaveLength(2);
    expect(reads).toBeGreaterThan(1);
    expect(quiet.events).toEqual([]);
    now = 0;
    const loud = recorded();
    const failed = await pushRecords(
      input(records(5)),
      advancing({ 1: new Error("transient") }),
      clock,
      loud.onFailure,
    );
    expect(failed.results).toHaveLength(1);
    expect(loud.events).toHaveLength(1);
  });

  it("answers the same when the reporter throws", async () => {
    const boom = new Error("transient");
    const plain = await pushRecords(input(records(3)), fakeRun({ 1: boom }));
    const broken = await pushRecords(
      input(records(3)),
      fakeRun({ 1: boom }),
      Date.now,
      reportRecordFailure(throwingReporter),
    );
    expect(codes(broken)).toEqual(codes(plain));
    expect(codes(broken)).toEqual(["r_0"]);
  });
});

// Who starts where, through the router: the five answers
// a start gets by the company's schedule switch, and the one a record for somebody else
// gets. The rules' edges are sync/schedule.test.ts's and sync/labor.test.ts's.
describe("sync.push — a start, by the schedule switch", () => {
  type Day = Awaited<ReturnType<typeof world>>;
  // A Monday in the past, in New York's winter (UTC-5); the shift is 07:00 to 15:30.
  const DAY = "2026-11-09";
  const at = (wall: string) => new Date(`${DAY}T${wall}:00-05:00`);
  // Captured offline at a fixed instant, or online a second ago: an online capture that old
  // would be flagged `clock_skewed` besides.
  const offline = (workerId: string, jobId: string, o: Record<string, unknown> = {}) =>
    labor(workerId, jobId, { clientTimestamp: at("07:10"), capturedOffline: true, ...o });
  const online = (workerId: string, jobId: string) =>
    labor(workerId, jobId, { clientTimestamp: new Date(Date.now() - 1000) });

  const enforce = (tx: Tx, d: Day) =>
    asOwner(tx, d.companyId, () =>
      tx
        .update(companies)
        .set({ scheduleEnforced: true })
        .where(eq(companies.id, d.companyId)),
    );
  const shiftFor = (tx: Tx, d: Day, userId: string, jobId: string) =>
    asOwner(
      tx,
      d.companyId,
      async () =>
        (
          await tx
            .insert(jobAssignments)
            .values({
              companyId: d.companyId,
              userId,
              jobId,
              workDate: DAY,
              expectedStart: "07:00",
              expectedEnd: "15:30",
            })
            .returning({ id: jobAssignments.id })
        )[0]!.id,
    );
  const lockOf = (tx: Tx, d: Day, shiftId: string) =>
    asOwner(
      tx,
      d.companyId,
      async () =>
        (
          await tx
            .select({ by: jobAssignments.lockedByEventId })
            .from(jobAssignments)
            .where(eq(jobAssignments.id, shiftId))
        )[0]!.by,
    );
  const eventCount = (tx: Tx, d: Day) =>
    asOwner(tx, d.companyId, () =>
      tx.$count(workSessionEvents, eq(workSessionEvents.companyId, d.companyId)),
    );
  // One record's answer: its result and flags, or its code when refused.
  const one = async (tx: Tx, who: unknown, record: unknown) => {
    const [r] = (await push(tx, who, [record])).results;
    if (r === undefined) throw new Error("the record was left out");
    return r.result === "rejected" ? r.code : { result: r.result, reasons: r.ack.flags };
  };

  const stampOf = (tx: Tx, d: Day, id: string) =>
    asOwner(
      tx,
      d.companyId,
      async () =>
        (
          await tx
            .select({
              lat: workSessionEvents.locationLat,
              lng: workSessionEvents.locationLng,
              accuracyM: workSessionEvents.locationAccuracyM,
              flags: workSessionEvents.flags,
            })
            .from(workSessionEvents)
            .where(eq(workSessionEvents.id, id))
        )[0],
    );

  it("stamps off for the company: stored with no location though one was sent, never flagged for it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await asOwner(tx, d.companyId, () =>
        tx
          .update(companies)
          .set({ locationStamps: false })
          .where(eq(companies.id, d.companyId)),
      );
      const sent = offline(d.w.id, d.J);
      expect(sent.payload.location).not.toBeNull();
      expect(await one(tx, d.w.who, sent)).toEqual({
        result: "accepted",
        reasons: ["offline"],
      });
      expect(await stampOf(tx, d, sent.id)).toEqual({
        lat: null,
        lng: null,
        accuracyM: null,
        flags: ["offline"],
      });
      // The same record again, location and all, is the same event: a duplicate, not a
      // conflict, even once the switch is back on.
      expect(await one(tx, d.w.who, sent)).toEqual({
        result: "duplicate",
        reasons: ["offline"],
      });
      await asOwner(tx, d.companyId, () =>
        tx
          .update(companies)
          .set({ locationStamps: true })
          .where(eq(companies.id, d.companyId)),
      );
      expect(await one(tx, d.w.who, sent)).toEqual({
        result: "duplicate",
        reasons: ["offline"],
      });
      // None sent: no flag either, where on it would be one.
      const end = offline(d.w.id, d.J, {
        type: "ended",
        clientTimestamp: at("09:00"),
        location: null,
      });
      expect(await one(tx, d.w.who, end)).toEqual({
        result: "accepted",
        reasons: ["offline", "location"],
      });
    });
  });

  it("a person's own setting wins over the company's, both ways", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const person = (value: boolean | null) =>
        asOwner(tx, d.companyId, () =>
          tx.update(users).set({ locationStamps: value }).where(eq(users.id, d.w.id)),
        );
      const company = (value: boolean) =>
        asOwner(tx, d.companyId, () =>
          tx
            .update(companies)
            .set({ locationStamps: value })
            .where(eq(companies.id, d.companyId)),
        );
      // Off for the person, on for the company: nothing kept, nothing flagged.
      await person(false);
      const start = offline(d.w.id, d.J, { location: null });
      expect(await one(tx, d.w.who, start)).toEqual({
        result: "accepted",
        reasons: ["offline"],
      });
      // On for the person, off for the company: kept, and a missing one is flagged.
      await company(false);
      await person(true);
      const end = offline(d.w.id, d.J, { type: "ended", clientTimestamp: at("09:00") });
      expect(await one(tx, d.w.who, end)).toEqual({
        result: "accepted",
        reasons: ["offline"],
      });
      expect(await stampOf(tx, d, end.id)).toMatchObject({
        lat: end.payload.location!.lat,
      });
      const again = offline(d.w.id, d.J, {
        clientTimestamp: at("10:00"),
        location: null,
      });
      expect(await one(tx, d.w.who, again)).toEqual({
        result: "accepted",
        reasons: ["offline", "location"],
      });
    });
  });

  it("switch on, a shift of the worker's own admits it: accepted, and the shift is locked", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const shiftId = await shiftFor(tx, d, d.w.id, d.J);
      await enforce(tx, d);
      // Fifteen minutes before the shift is the earliest it admits.
      const start = offline(d.w.id, d.J, { clientTimestamp: at("06:45") });
      expect(await one(tx, d.w.who, start)).toEqual({
        result: "accepted",
        reasons: ["offline"],
      });
      expect(await lockOf(tx, d, shiftId)).toBe(start.id);
      expect(await eventCount(tx, d)).toBe(1);
    });
  });

  it("switch on, no shift admits it, captured online: rejected not_scheduled, nothing written", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // A shift of theirs, on another day and another job.
      const shiftId = await shiftFor(tx, d, d.w.id, d.K);
      await enforce(tx, d);
      expect(await one(tx, d.w.who, online(d.w.id, d.J))).toBe("not_scheduled");
      expect(await one(tx, d.w.who, online(d.w.id, d.K))).toBe("not_scheduled");
      expect(await lockOf(tx, d, shiftId)).toBeNull();
      expect(await eventCount(tx, d)).toBe(0);
    });
  });

  it("switch off: a worker starts on any job that is not archived, with no shift", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      expect(await one(tx, d.w.who, online(d.w.id, d.K))).toEqual({
        result: "accepted",
        reasons: [],
      });
      // Another worker, on the other job; and neither on a job once it is archived.
      const other = await asOwner(tx, d.companyId, () =>
        boundIn(tx, d.companyId, "worker"),
      );
      expect(await one(tx, other.who, online(other.id, d.J))).toEqual({
        result: "accepted",
        reasons: [],
      });
      const third = await asOwner(tx, d.companyId, async () => {
        await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
        return boundIn(tx, d.companyId, "worker");
      });
      expect(await one(tx, third.who, online(third.id, d.J))).toBe("not_permitted");
      expect(await eventCount(tx, d)).toBe(2);
    });
  });

  it("switch on, no shift admits it, captured offline: accepted and flagged unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // The office moved the day to K after the phone last heard from it.
      const shiftId = await shiftFor(tx, d, d.w.id, d.K);
      await enforce(tx, d);
      expect(await one(tx, d.w.who, offline(d.w.id, d.J, { location: null }))).toEqual({
        result: "accepted",
        reasons: ["offline", "location", "unscheduled"],
      });
      expect(await lockOf(tx, d, shiftId)).toBeNull();
      expect(await eventCount(tx, d)).toBe(1);
    });
  });

  it("switch on, an admin with no shift: accepted online or offline, flagged unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const [a, b] = await asOwner(tx, d.companyId, async () => [
        await boundIn(tx, d.companyId, "admin"),
        await boundIn(tx, d.companyId, "admin"),
      ]);
      await enforce(tx, d);
      expect(await one(tx, a!.who, online(a!.id, d.J))).toEqual({
        result: "accepted",
        reasons: ["unscheduled"],
      });
      expect(await one(tx, b!.who, offline(b!.id, d.K))).toEqual({
        result: "accepted",
        reasons: ["offline", "unscheduled"],
      });
      expect(await eventCount(tx, d)).toBe(2);
    });
  });

  it("switch on, an admin with a shift that admits it: accepted, locked, not unscheduled", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await asOwner(tx, d.companyId, () =>
        boundIn(tx, d.companyId, "admin"),
      );
      const shiftId = await shiftFor(tx, d, admin.id, d.J);
      await enforce(tx, d);
      const start = offline(admin.id, d.J);
      expect(await one(tx, admin.who, start)).toEqual({
        result: "accepted",
        reasons: ["offline"],
      });
      expect(await lockOf(tx, d, shiftId)).toBe(start.id);
    });
  });

  it("a record naming another person as its worker: rejected not_permitted, nothing written", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await asOwner(tx, d.companyId, () =>
        boundIn(tx, d.companyId, "admin"),
      );
      // With the switch off, then on with a shift of that person's own that would admit it.
      for (const who of [d.who, admin.who]) {
        expect(await one(tx, who, offline(d.w.id, d.J))).toBe("not_permitted");
      }
      const shiftId = await shiftFor(tx, d, d.w.id, d.J);
      await enforce(tx, d);
      for (const who of [d.who, admin.who]) {
        expect(await one(tx, who, offline(d.w.id, d.J))).toBe("not_permitted");
        expect(await one(tx, who, online(d.w.id, d.J))).toBe("not_permitted");
      }
      expect(await lockOf(tx, d, shiftId)).toBeNull();
      expect(await eventCount(tx, d)).toBe(0);
    });
  });
});
