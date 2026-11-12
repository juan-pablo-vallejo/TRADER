// Stage 3 line 9: labor.repair against real commits, in a database of its own (helpers.ts,
// disposableDb). Rolled-back tests cannot show two connections serializing, a savepoint's
// rollback surviving a commit, or a deferred check firing at COMMIT; these do. A holder
// transaction takes a lock first; the calls are started against it, seen waiting in
// pg_stat_activity (waitForLockWait, no sleeps), and the holder then ends.
import { approvals, crewMembers, users, workSessionEvents } from "@trader/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext, type Tx } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { sessionApprovals } from "../../src/labor/approval";
import { replay } from "../../src/labor/fold";
import { lockCompanyFieldWrites, readWorkerEvents } from "../../src/labor/timeline";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/core/trpc";
import {
  boundIn,
  crewDayIn,
  disposableDb,
  eventIn,
  outcome,
  pendingApproval,
  rejection,
  sqlstateOf,
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

// Committed: a crew day, two admins, a bound crew worker `w`, and w's day on J, 08:00–16:00
// local (12:00–20:00 UTC), its end captured offline so it has a pending approval.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    const admin2 = await boundIn(tx, d.companyId, "admin");
    const w = await boundIn(tx, d.companyId, "worker");
    await tx
      .insert(crewMembers)
      .values({ companyId: d.companyId, crewId: d.crewId, userId: w.id });
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
    const startApproval = await pendingApproval(tx, d.companyId, { eventId: start });
    const endApproval = await pendingApproval(tx, d.companyId, { eventId: end });
    return { d, admin, admin2, w, start, end, startApproval, endApproval };
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
  const [a] = await D.owner
    .select({ n: sql<number>`count(*)::int` })
    .from(approvals)
    .where(eq(approvals.companyId, companyId));
  return { events: e!.n, approvals: a!.n };
}

const decide = (
  who: VerifiedIdentity,
  approvalId: string,
  decision: "approved" | "rejected",
) => caller(who).approval.decide({ approvalId, decision });

const approvalIdOf = async (eventId: string) =>
  (await D.owner.select().from(approvals).where(eq(approvals.eventId, eventId)))[0]!.id;

// The committed A1 accounting of w's sessions, read as the owner.
async function accounting(workerId: string) {
  const ledger = await D.owner.transaction((tx) => readWorkerEvents(tx, workerId));
  const rows = await D.owner
    .select({ eventId: approvals.eventId, decision: approvals.decision })
    .from(approvals)
    .where(
      inArray(
        approvals.eventId,
        ledger.map((e) => e.id),
      ),
    );
  const decisions = new Map(rows.map((r) => [r.eventId!, r.decision]));
  return [...sessionApprovals(ledger, decisions).byRoot.values()];
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
    expect(await counts(x.d.companyId)).toEqual({
      events: before.events + 2,
      approvals: before.approvals + 2,
    });
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

  it("fires 0026 at COMMIT for a correction written without its approval", async () => {
    const x = await world();
    const error = await rejection(
      D.owner.transaction(async (tx) => {
        await eventIn(tx, x.d, {
          worker: x.w.id,
          job: x.d.J,
          type: "ended",
          client: T("19:00"),
          corrects: x.end,
        });
      }),
    );
    expect(sqlstateOf(error) ?? (error as { code?: string }).code).toBe("23000");
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
  });

  // An open session from 21:00: the office appends its end at 22:00 while the phone pushes
  // one at 22:30. Both take the worker's lock, and the one queued first wins: the other
  // finds the session already ended — the push by the fold (no_open_session), the repair
  // by the following-event check (breaks_following_event). Either order is a valid
  // serialization, so each is pinned by queue position, as the closeout tests do.
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
            attestationLevel: "biometric",
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

describe("labor.repair — closeouts, committed", () => {
  const review = (x: Awaited<ReturnType<typeof world>>) =>
    caller(x.d.who).closeout.review({ jobId: x.d.J, workDate: "2026-10-05" });
  const submit = (x: Awaited<ReturnType<typeof world>>, fingerprint: string) =>
    caller(x.d.who).closeout.submit({
      id: uuidv7(),
      jobId: x.d.J,
      workDate: "2026-10-05",
      jobStatus: "open",
      note: null,
      clientTimestamp: new Date(),
      reviewFingerprint: fingerprint,
    });
  const holdFieldWrites = (companyId: string) =>
    hold(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
      await lockCompanyFieldWrites(tx, "exclusive");
    });

  it("waits behind a closeout queued first and is tagged after_closeout", async () => {
    const x = await world();
    const { fingerprint } = await review(x);
    const h = holdFieldWrites(x.d.companyId);
    await h.held;
    const closeout = submit(x, fingerprint);
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock(%", {
      waitEvent: "advisory",
    });
    const fix = repair(x.admin.who, x.w.id, [correct(x.end, "ended", x.d.J, "19:00")]);
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock_shared(%", {
      waitEvent: "advisory",
    });
    await h.release();
    expect((await closeout).result).toBe("accepted");
    expect(await fix).toMatchObject({
      result: "accepted",
      events: [{ reasons: ["corrected", "user_timed", "location", "after_closeout"] }],
    });
  });

  it("goes first when the closeout queues behind it; the stale review is refused", async () => {
    const x = await world();
    const { fingerprint } = await review(x);
    const h = holdWorker(x.w.id);
    await h.held;
    // The repair takes the field-write lock shared, then waits on the worker's lock.
    const fix = repair(x.admin.who, x.w.id, [correct(x.end, "ended", x.d.J, "19:00")]);
    await workerWaiters(1);
    const closeout = submit(x, fingerprint);
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock(%", {
      n: 2,
      waitEvent: "advisory",
    });
    await h.release();
    expect(await fix).toMatchObject({
      result: "accepted",
      events: [{ reasons: ["corrected", "user_timed", "location"] }],
    });
    expect(await closeout).toMatchObject({ result: "rejected", code: "review_stale" });
    // Reviewed again, the day closes with the repair in it.
    expect((await submit(x, (await review(x)).fingerprint)).result).toBe("accepted");
  });
});

describe("labor.repair — decisions in flight, committed", () => {
  it("lets a decision on a source commit while a repair of it waits; the repair is valid", async () => {
    const x = await world();
    const h = holdWorker(x.w.id);
    await h.held;
    const fix = correct(x.end, "ended", x.d.J, "19:00");
    const repaired = repair(x.admin.who, x.w.id, [fix]);
    await workerWaiters(1);
    // approval.decide takes no worker lock: it completes while the repair is blocked.
    expect((await decide(x.admin2.who, x.endApproval, "rejected")).result).toBe(
      "decided",
    );
    expect((await decide(x.admin2.who, x.startApproval, "approved")).result).toBe(
      "decided",
    );
    await h.release();
    expect((await repaired).result).toBe("accepted");
    expect((await accounting(x.w.id))[0]).toMatchObject({ accounting: "pending" });
    expect(
      (await decide(x.admin2.who, await approvalIdOf(fix.id), "approved")).result,
    ).toBe("decided");
    expect((await accounting(x.w.id))[0]).toMatchObject({
      accounting: "eligible",
      eligibleWorkedMs: 7 * HOUR,
    });
    const [standing] = await D.owner
      .select()
      .from(approvals)
      .where(eq(approvals.id, x.endApproval));
    expect(standing!.decision).toBe("rejected");
  });

  it("commits a repair without waiting on a decision blocked at its approval row", async () => {
    const x = await world();
    const h = hold((tx) =>
      tx.execute(sql`select 1 from approvals where id = ${x.endApproval} for update`),
    );
    await h.held;
    const decision = decide(x.admin2.who, x.endApproval, "rejected");
    await waitForLockWait(D.owner, '%from "approvals"%for no key update%');
    const fix = correct(x.end, "ended", x.d.J, "19:00");
    expect((await repair(x.admin.who, x.w.id, [fix])).result).toBe("accepted");
    await h.release();
    expect((await decision).result).toBe("decided");
    await decide(x.admin2.who, x.startApproval, "approved");
    await decide(x.admin2.who, await approvalIdOf(fix.id), "approved");
    expect((await accounting(x.w.id))[0]).toMatchObject({
      accounting: "eligible",
      eligibleWorkedMs: 7 * HOUR,
    });
  });

  it("voids a session while its start is being approved; the void decides the hours", async () => {
    const x = await world();
    const h = hold((tx) =>
      tx.execute(sql`select 1 from approvals where id = ${x.startApproval} for update`),
    );
    await h.held;
    const approving = decide(x.admin2.who, x.startApproval, "approved");
    await waitForLockWait(D.owner, '%from "approvals"%for no key update%');
    const v = voidOf(x.start);
    expect((await repair(x.admin.who, x.w.id, [v])).result).toBe("accepted");
    await h.release();
    expect((await approving).result).toBe("decided");
    await decide(x.admin2.who, x.endApproval, "approved");
    expect((await accounting(x.w.id))[0]).toMatchObject({ accounting: "pending" });
    await decide(x.admin2.who, await approvalIdOf(v.id), "approved");
    expect((await accounting(x.w.id))[0]).toMatchObject({
      accounting: "voided",
      eligibleWorkedMs: 0,
    });
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
