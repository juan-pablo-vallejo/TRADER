// labor.repair against real commits, in a database of its own (helpers.ts,
// disposableDb). Rolled-back tests cannot show two connections serializing, a savepoint's
// rollback surviving a commit, or a repair holding at a true COMMIT; these do. A holder
// transaction takes a lock first; the calls are started against it, seen waiting in
// pg_stat_activity (waitForLockWait, no sleeps), and the holder then ends.
import { users, workSessionEvents } from "@trader/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDirectory } from "../../src/core/identity";
import { createContext, type Tx } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { sessionAccounting } from "../../src/labor/accounting";
import { replay } from "../../src/labor/fold";
import { readWorkerEvents } from "../../src/labor/timeline";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/core/trpc";
import {
  boundIn,
  workDayIn,
  disposableDb,
  eventIn,
  outcome,
  uuidv7,
  waitForLockWait,
  quietReporter,
  REQUEST_ID,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app();
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const HOUR = 3_600_000;
const T = (hhmm: string) => `2026-10-05T${hhmm}:00.000Z`;
type Positional = "started" | "paused" | "resumed" | "ended";

const caller = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  );

type Op =
  | { kind: "append"; id: string; type: Positional; jobId: string; clientTimestamp: Date }
  | {
      kind: "correct";
      id: string;
      correctsEventId: string;
      replacesEventId: string;
      type: Positional;
      jobId: string;
      clientTimestamp: Date;
    }
  | { kind: "void"; id: string; voidsEventId: string };

const append = (type: Positional, jobId: string, hhmm: string): Op => ({
  kind: "append",
  id: uuidv7(),
  type,
  jobId,
  clientTimestamp: new Date(T(hhmm)),
});
const correct = (root: string, type: Positional, jobId: string, hhmm: string): Op => ({
  kind: "correct",
  id: uuidv7(),
  correctsEventId: root,
  replacesEventId: root,
  type,
  jobId,
  clientTimestamp: new Date(T(hhmm)),
});
const voidOf = (root: string): Op => ({ kind: "void", id: uuidv7(), voidsEventId: root });

const repair = (who: VerifiedIdentity, workerId: string, operations: Op[]) =>
  caller(who).labor.repair({ workerId, operations });

// Committed: a working day, two admins, a bound worker `w`, and w's day on J, 08:00–16:00
// local (12:00–20:00 UTC).
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await workDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    const admin2 = await boundIn(tx, d.companyId, "admin");
    const w = await boundIn(tx, d.companyId, "worker");
    const start = await eventIn(tx, d, {
      worker: w.id,
      job: d.J,
      type: "started",
      client: T("12:00"),
    });
    const end = await eventIn(tx, d, {
      worker: w.id,
      job: d.J,
      type: "ended",
      client: T("20:00"),
    });
    return { d, admin, admin2, w, start, end };
  });
}

// Runs `body` in an owner transaction that stays open until `release`; it then commits, or
// rolls back when `commit` is false.
function hold(body: (tx: Tx) => Promise<unknown>, commit = false) {
  let release: () => void = () => {};
  const released = new Promise<void>((r) => (release = r));
  let ready: () => void = () => {};
  const held = new Promise<void>((r) => (ready = r));
  const done = D.owner
    .transaction(async (tx) => {
      await body(tx);
      ready();
      await released;
      if (!commit) tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.message.includes("Rollback"))) throw error;
    });
  return { held, release: async () => (release(), await done) };
}

// The worker's own advisory lock, as loadWorkerTimeline takes it.
const holdWorker = (workerId: string) =>
  hold((tx) =>
    tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${workerId}::uuid::text, 0))`,
    ),
  );
const workerWaiters = (n: number) =>
  waitForLockWait(D.owner, "select pg_advisory_xact_lock(hashtextextended%", {
    n,
    waitEvent: "advisory",
  });

async function counts(companyId: string) {
  const [e] = await D.owner
    .select({ n: sql<number>`count(*)::int` })
    .from(workSessionEvents)
    .where(eq(workSessionEvents.companyId, companyId));
  return { events: e!.n };
}

// The committed accounting of a worker's sessions, read as the owner.
async function accounting(workerId: string) {
  const ledger = await D.owner.transaction((tx) => readWorkerEvents(tx, workerId));
  return [...sessionAccounting(ledger).byRoot.values()];
}

describe("labor.repair — retries and ids, committed", () => {
  it("answers two identical concurrent calls accepted and duplicate, one set stored", async () => {
    const x = await world();
    const ops = [
      correct(x.end, "ended", x.d.J, "19:00"),
      append("started", x.d.J, "21:00"),
    ];
    const before = await counts(x.d.companyId);
    const h = holdWorker(x.w.id);
    await h.held;
    const a = repair(x.admin.who, x.w.id, ops);
    const b = repair(x.admin.who, x.w.id, ops);
    await workerWaiters(2);
    await h.release();
    const results = await Promise.all([a, b]);
    expect(results.map((r) => r.result).sort()).toEqual(["accepted", "duplicate"]);
    const [first, second] = results;
    expect((second as { events: unknown }).events).toEqual(
      (first as { events: unknown }).events,
    );
    expect(await counts(x.d.companyId)).toEqual({ events: before.events + 2 });
  });

  it("answers an id another tenant holds with id_conflict and commits nothing", async () => {
    const x = await world();
    const other = await world();
    const fresh = append("started", x.d.J, "21:00");
    const colliding: Op = { ...append("ended", x.d.J, "22:00"), id: other.start };
    const before = await counts(x.d.companyId);
    const theirs = await counts(other.d.companyId);
    expect(await repair(x.admin.who, x.w.id, [fresh, colliding])).toEqual({
      result: "rejected",
      code: "id_conflict",
      conflictingEventId: other.start,
    });
    expect(await counts(x.d.companyId)).toEqual(before);
    expect(await counts(other.d.companyId)).toEqual(theirs);
    expect(
      await D.owner
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, fresh.id)),
    ).toEqual([]);
    expect(
      (
        await D.owner
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.id, other.start))
      )[0]!.companyId,
    ).toBe(other.d.companyId);
  });

  // No deferred check stands behind a repair: what it wrote is committed
  // with its flags and is in effect, for a worker's ledger and for the caller's own.
  it("commits a correction with its flags, in effect at once, on anyone's ledger", async () => {
    const x = await world();
    const theirs = correct(x.end, "ended", x.d.J, "19:00");
    expect((await repair(x.admin.who, x.w.id, [theirs])).result).toBe("accepted");
    expect(await accounting(x.w.id)).toMatchObject([
      { accounting: "eligible", eligibleWorkedMs: 7 * HOUR },
    ]);

    const start = append("started", x.d.J, "12:00");
    const end = append("ended", x.d.J, "20:00");
    expect((await repair(x.admin.who, x.admin.id, [start, end])).result).toBe("accepted");
    const fix = correct(end.id, "ended", x.d.J, "19:00");
    expect((await repair(x.admin.who, x.admin.id, [fix])).result).toBe("accepted");
    expect(await accounting(x.admin.id)).toMatchObject([
      { accounting: "eligible", eligibleWorkedMs: 7 * HOUR },
    ]);

    const stored = await D.owner
      .select({ id: workSessionEvents.id, flags: workSessionEvents.flags })
      .from(workSessionEvents)
      .where(inArray(workSessionEvents.id, [theirs.id, start.id, end.id, fix.id]));
    expect(new Map(stored.map((r) => [r.id, r.flags]))).toEqual(
      new Map([
        [theirs.id, ["corrected", "user_timed", "location"]],
        [start.id, ["user_timed", "location"]],
        [end.id, ["user_timed", "location"]],
        [fix.id, ["corrected", "user_timed", "location"]],
      ]),
    );
  });
});

describe("labor.repair — concurrent repairs, committed", () => {
  it("serializes two admins correcting one root: the second is repair_stale", async () => {
    const x = await world();
    const h = holdWorker(x.w.id);
    await h.held;
    const a = correct(x.end, "ended", x.d.J, "19:00");
    const b = correct(x.end, "ended", x.d.J, "18:00");
    const ra = repair(x.admin.who, x.w.id, [a]);
    const rb = repair(x.admin2.who, x.w.id, [b]);
    await workerWaiters(2);
    await h.release();
    const results = await Promise.all([ra, rb]);
    const won = results.findIndex((r) => r.result === "accepted");
    expect(won).toBeGreaterThanOrEqual(0);
    const winner = [a, b][won]!;
    expect(results[1 - won]).toEqual({
      result: "rejected",
      code: "repair_stale",
      eventId: [a, b][1 - won]!.id,
      conflictingEventId: winner.id,
    });
    const corrections = await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.correctsEventId, x.end));
    expect(corrections).toEqual([{ id: winner.id }]);
  });

  it("serializes two voids of one session: the second is already_voided", async () => {
    const x = await world();
    const h = holdWorker(x.w.id);
    await h.held;
    const a = voidOf(x.start);
    const b = voidOf(x.start);
    const ra = repair(x.admin.who, x.w.id, [a]);
    const rb = repair(x.admin2.who, x.w.id, [b]);
    await workerWaiters(2);
    await h.release();
    const results = await Promise.all([ra, rb]);
    expect(results.map((r) => r.result).sort()).toEqual(["accepted", "rejected"]);
    expect(results.find((r) => r.result === "rejected")).toMatchObject({
      code: "already_voided",
    });
    const voids = await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.voidsEventId, x.start));
    expect(voids).toHaveLength(1);
    // Committed, the void is in effect: nothing of the session counts.
    expect(await accounting(x.w.id)).toMatchObject([
      { accounting: "voided", eligibleWorkedMs: 0 },
    ]);
  });

  // An open session from 21:00: the office appends its end at 22:00 while the phone pushes
  // one at 22:30. Both take the worker's lock, and the one queued first wins: the other
  // finds the session already ended — the push by the fold (no_open_session), the repair
  // by the following-event check (breaks_following_event). Either order is a valid
  // serialization, so each is pinned by queue position.
  const openSession = async () => {
    const x = await world();
    await D.owner.transaction((tx) =>
      eventIn(tx, x.d, {
        worker: x.w.id,
        job: x.d.J,
        type: "started",
        client: T("21:00"),
      }),
    );
    return x;
  };
  const officeEnd = (x: Awaited<ReturnType<typeof world>>) =>
    repair(x.admin.who, x.w.id, [append("ended", x.d.J, "22:00")]);
  const deviceEnd = (x: Awaited<ReturnType<typeof world>>) =>
    caller(x.w.who).sync.push({
      protocolVersion: 1,
      deviceNow: new Date(),
      records: [
        {
          id: uuidv7(),
          kind: "labor_event",
          schemaVersion: 1,
          payload: {
            workerId: x.w.id,
            jobId: x.d.J,
            type: "ended",
            clientTimestamp: new Date(T("22:30")),
            location: null,
            timeSetByUser: false,
            capturedOffline: false,
          },
        },
      ],
    });
  const violationOf = async (workerId: string) =>
    replay(await D.owner.transaction((tx) => readWorkerEvents(tx, workerId))).violation;

  it("serializes a repair queued ahead of a device push: the push has no open session", async () => {
    const x = await openSession();
    const h = holdWorker(x.w.id);
    await h.held;
    const office = officeEnd(x);
    await workerWaiters(1);
    const device = deviceEnd(x);
    await workerWaiters(2);
    await h.release();
    expect((await office).result).toBe("accepted");
    expect((await device).results[0]).toMatchObject({
      result: "rejected",
      code: "no_open_session",
    });
    expect(await violationOf(x.w.id)).toBeNull();
  });

  it("serializes a device push queued ahead of a repair: the repair breaks the pushed end", async () => {
    const x = await openSession();
    const h = holdWorker(x.w.id);
    await h.held;
    const device = deviceEnd(x);
    await workerWaiters(1);
    const office = officeEnd(x);
    await workerWaiters(2);
    await h.release();
    expect((await device).results[0]).toMatchObject({ result: "accepted" });
    expect(await office).toMatchObject({
      result: "rejected",
      code: "breaks_following_event",
    });
    expect(await violationOf(x.w.id)).toBeNull();
  });
});

describe("labor.repair — the caller under lock, committed", () => {
  for (const [change, expected] of [
    [{ role: "worker" as const }, "FORBIDDEN"],
    [{ deactivatedAt: new Date() }, "UNAUTHORIZED"],
  ] as const) {
    it(`refuses an admin changed while the repair waited (${expected}), writing nothing`, async () => {
      const x = await world();
      const before = await counts(x.d.companyId);
      const h = hold(
        (tx) => tx.update(users).set(change).where(eq(users.id, x.admin.id)),
        true,
      );
      await h.held;
      const call = outcome(
        repair(x.admin.who, x.w.id, [append("started", x.d.J, "21:00")]),
      );
      await waitForLockWait(D.owner, '%from "users"%for share%');
      await h.release();
      expect(await call).toBe(expected);
      expect(await counts(x.d.companyId)).toEqual(before);
    });
  }
});
