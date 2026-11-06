// Stage 3 line 7: sync.push against real commits (ARCHITECTURE, sync.push). Rolled-back tests
// cannot show that a record commits on its own, that a failed one leaves nothing, or that two
// connections serialize; these do, in a database of their own (helpers.ts, disposableDb),
// migrated through the whole journal and dropped at the end with everything committed in it.
// Every call runs as trader_app over the real caller transaction, one per record.
import {
  approvals,
  crewMembers,
  dayCloseouts,
  jobs,
  materials,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../src/context";
import type { VerifiedIdentity } from "../src/identity";
import { lockCompanyFieldWrites } from "../src/labor/timeline";
import { appRouter } from "../src/router";
import { pushRecords, type RunRecord } from "../src/sync/push";
import { createCallerFactory, inCallerTransaction } from "../src/trpc";
import {
  boundIn,
  crewDayIn,
  disposableDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  waitForLockWait,
  type CrewDay,
  quietReporter,
} from "./helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app();
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const caller = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({ db: app, identity: who, reporter: quietReporter }),
  );

// A committed crew day with a bound worker `w` on the crew (crewDayIn's own workers are
// invitations: no identity to push with), and a second crew job J2.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const w = await boundIn(tx, d.companyId, "worker");
    await tx
      .insert(crewMembers)
      .values({ companyId: d.companyId, crewId: d.crewId, userId: w.id });
    const [j2] = await tx
      .insert(jobs)
      .values({
        companyId: d.companyId,
        customerId: d.customerId,
        name: "J2",
        crewId: d.crewId,
      })
      .returning({ id: jobs.id });
    return { ...d, w, J2: j2!.id };
  });
}

type World = Awaited<ReturnType<typeof world>>;

const HERE = { lat: 41.824, lng: -71.4128, accuracyM: 8 };

function labor(
  workerId: string,
  jobId: string,
  o: Record<string, unknown> = {},
  id = uuidv7(),
) {
  return {
    id,
    kind: "labor_event" as const,
    schemaVersion: 1,
    payload: {
      workerId,
      jobId,
      type: "started",
      clientTimestamp: new Date("2026-10-05T12:00:00Z"),
      attestationLevel: "biometric",
      location: HERE,
      timeSetByUser: false,
      capturedOffline: false,
      ...o,
    },
  };
}

function receipt(jobId: string, o: Record<string, unknown> = {}, id = uuidv7()) {
  return {
    id,
    kind: "material" as const,
    schemaVersion: 1,
    payload: {
      jobId,
      description: "Primer",
      quantity: "1",
      unit: "gal",
      loggedAt: new Date("2026-10-05T15:00:00Z"),
      capturedOffline: false,
      ...o,
    },
  };
}

const push = (who: VerifiedIdentity, records: unknown[]) =>
  caller(who).sync.push({ protocolVersion: 1, deviceNow: new Date(), records });

const eventIds = async (ids: string[]) =>
  (
    await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(inArray(workSessionEvents.id, ids))
  ).map((r) => r.id);

// The company's field-write lock, held by a transaction of its own on another connection until
// `release` — a closeout in flight, as far as every writer can tell.
async function holdFieldWrites(d: CrewDay, mode: "exclusive" | "shared") {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let ready!: () => void;
  const held = new Promise<void>((r) => (ready = r));
  const done = rolledBack(D.owner, async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${d.companyId}, true)`);
    await lockCompanyFieldWrites(tx, mode);
    ready();
    await released;
  });
  await held;
  return { release: async () => (release(), await done) };
}

describe("sync.push — commits, record by record", () => {
  it("keeps A committed when B throws, writes nothing of B, and leaves C out", async () => {
    const d = await world();
    // A ledger that fails replay for w1 (an `ended` with no session), written by the owner:
    // validating anything for w1 throws, as a corrupt ledger must (fold.ts).
    await D.owner.insert(workSessionEvents).values({
      id: uuidv7(),
      companyId: d.companyId,
      workerId: d.w1,
      jobId: d.J,
      type: "ended",
      clientTimestamp: new Date("2026-10-01T12:00:00Z"),
      serverTimestamp: new Date("2026-10-01T12:00:00Z"),
      clockSkewed: false,
      clockSkewMs: 0,
      attestationLevel: "none",
      schemaVersion: 1,
      timeSetByUser: false,
      capturedOffline: false,
      initiatorUserId: d.w1,
    });
    const a = labor(d.foremanId, d.J, { capturedOffline: true });
    const b = labor(d.w1, d.J, { capturedOffline: true });
    const c = labor(d.foremanId, d.J, {
      type: "ended",
      clientTimestamp: new Date("2026-10-05T16:00:00Z"),
    });
    const answer = await push(d.who, [a, b, c]);
    expect(answer.results.map((r) => [r.id, r.result])).toEqual([[a.id, "accepted"]]);
    expect(await eventIds([a.id, b.id, c.id])).toEqual([a.id]);
    const approvalRows = await D.owner
      .select({ eventId: approvals.eventId })
      .from(approvals)
      .where(inArray(approvals.eventId, [a.id, b.id, c.id]));
    expect(approvalRows).toEqual([{ eventId: a.id }]);
  });

  it("answers a resent batch after a dropped response with the original acknowledgements", async () => {
    const d = await world();
    const batch = [
      labor(d.w.id, d.J, { capturedOffline: true }),
      receipt(d.J, { capturedOffline: true }),
      labor(d.w.id, d.J, {
        type: "ended",
        clientTimestamp: new Date("2026-10-05T16:00:00Z"),
      }),
    ];
    const first = await push(d.w.who, batch); // the response the device never saw
    const before = await D.owner
      .select()
      .from(approvals)
      .where(eq(approvals.companyId, d.companyId));
    const again = await push(d.w.who, batch);
    expect(again.results).toEqual(
      first.results.map((r) => ({ ...r, result: "duplicate" })),
    );
    expect(first.results.map((r) => r.result)).toEqual([
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(
      await D.owner.select().from(approvals).where(eq(approvals.companyId, d.companyId)),
    ).toEqual(before);
    expect(await eventIds(batch.map((r) => r.id))).toHaveLength(2);
  });
});

describe("sync.push — concurrency on real locks", () => {
  // Holds w's worker lock on another connection until both pushes wait behind it.
  async function race(d: World, pushes: (() => ReturnType<typeof push>)[]) {
    let running!: Promise<Awaited<ReturnType<typeof push>>[]>;
    await rolledBack(D.owner, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${d.w.id}::uuid::text, 0))`,
      );
      running = Promise.all(pushes.map((p) => p()));
      await waitForLockWait(D.owner, "select pg_advisory_xact_lock(hashtextextended(%", {
        n: pushes.length,
        waitEvent: "advisory",
      });
    }); // rolling back releases the lock: both run, one after the other
    return running;
  }

  it("serializes two sources for one worker: the second sees the first's committed start", async () => {
    const d = await world();
    const own = labor(d.w.id, d.J);
    const crew = labor(d.w.id, d.J, {
      clientTimestamp: new Date("2026-10-05T12:05:00Z"),
    });
    const [a, b] = await race(d, [() => push(d.w.who, [own]), () => push(d.who, [crew])]);
    const results = [a!.results[0]!, b!.results[0]!];
    expect(results.map((r) => r.result).sort()).toEqual(["accepted", "rejected"]);
    expect(results.find((r) => r.result === "rejected")).toMatchObject({
      code: "session_already_open",
    });
    const ledger = await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.workerId, d.w.id));
    expect(ledger).toHaveLength(1);
  });

  it("answers the same record pushed twice at once: one accepted, one duplicate", async () => {
    const d = await world();
    const r = labor(d.w.id, d.J, { capturedOffline: true });
    const [a, b] = await race(d, [() => push(d.w.who, [r]), () => push(d.w.who, [r])]);
    const results = [a!.results[0]!, b!.results[0]!];
    expect(results.map((x) => x.result).sort()).toEqual(["accepted", "duplicate"]);
    expect(results[0]).toMatchObject({ ack: (results[1] as { ack: unknown }).ack });
    expect(await eventIds([r.id])).toEqual([r.id]);
  });

  it("linearizes with a closeout queued first: the late record is after_closeout", async () => {
    const d = await world();
    const review = await caller(d.who).closeout.review({
      jobId: d.J,
      workDate: "2026-10-05",
    });
    const holder = await holdFieldWrites(d, "exclusive");
    const closeoutId = uuidv7();
    const closeout = caller(d.who).closeout.submit({
      id: closeoutId,
      jobId: d.J,
      workDate: "2026-10-05",
      jobStatus: "open",
      note: null,
      clientTimestamp: new Date(),
      reviewFingerprint: review.fingerprint,
    });
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock(%", {
      n: 1,
      waitEvent: "advisory",
    });
    // The receipt first: its transaction begins before the closeout commits and waits on it.
    const lateReceipt = receipt(d.J);
    const lateEvent = labor(d.w.id, d.J);
    const late = push(d.w.who, [lateReceipt, lateEvent]);
    // The closeout already holds the job's row (it locks scope before the field-write lock):
    // the push waits there, behind it, and sees it committed.
    await waitForLockWait(D.owner, '%from "jobs"%for share%', { n: 1 });
    await holder.release();
    const closed = await closeout;
    expect(closed.result).toBe("accepted");
    const answer = await late;
    // Both records waited behind the closeout and are stamped after it, compared in the
    // database at full precision: the event by its receipt stamp; the receipt by one stamp read
    // after its locks, in created_at and updated_at alike, never the transaction's start.
    const { rows } = await D.owner.execute<Record<string, boolean>>(sql`
      select m.created_at = m.updated_at as receipt_stamps_equal,
        m.created_at > c.server_timestamp as receipt_after_closeout,
        e.server_timestamp > c.server_timestamp as event_after_closeout
      from materials m, work_session_events e, day_closeouts c
      where m.id = ${lateReceipt.id} and e.id = ${lateEvent.id} and c.id = ${closeoutId}
    `);
    expect(rows).toEqual([
      {
        receipt_stamps_equal: true,
        receipt_after_closeout: true,
        event_after_closeout: true,
      },
    ]);
    expect(answer.results.map((r) => r.result)).toEqual(["accepted", "accepted"]);
    expect(
      answer.results.map((r) =>
        r.result === "accepted" ? (r.ack as { reasons: string[] }).reasons : r,
      ),
    ).toEqual([["after_closeout"], ["after_closeout"]]);
  });

  it("linearizes with a push queued first: the closeout sees it and refuses", async () => {
    const d = await world();
    const review = await caller(d.who).closeout.review({
      jobId: d.J,
      workDate: "2026-10-05",
    });
    const holder = await holdFieldWrites(d, "exclusive");
    const early = push(d.w.who, [labor(d.w.id, d.J)]);
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock_shared(%", {
      n: 1,
      waitEvent: "advisory",
    });
    const closeout = caller(d.who).closeout.submit({
      id: uuidv7(),
      jobId: d.J,
      workDate: "2026-10-05",
      jobStatus: "open",
      note: null,
      clientTimestamp: new Date(),
      reviewFingerprint: review.fingerprint,
    });
    // The push holds the job's row FOR SHARE: the closeout queues on it, behind the push.
    await waitForLockWait(D.owner, '%from "jobs"%for no key update%', { n: 1 });
    await holder.release();
    expect((await early).results[0]).toMatchObject({
      result: "accepted",
      ack: { reasons: [] },
    });
    // Covered, never ignored: the open session it started refuses the closeout.
    expect(await closeout).toMatchObject({ result: "rejected", code: "sessions_open" });
  });
});

describe("sync.push — bounded waits", () => {
  it("gives up on a lock held past its timeout: the record is left out, nothing written", async () => {
    const d = await world();
    const r = labor(d.w.id, d.J);
    let outcome!: Promise<string | undefined>;
    await rolledBack(D.owner, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${d.w.id}::uuid::text, 0))`,
      );
      outcome = push(d.w.who, [r]).then(
        () => "answered",
        (e: { code?: string }) => e.code,
      );
      // Held for 3 s: past the 2 s lock_timeout, inside the 4 s statement_timeout, so only the
      // lock timeout can be what gives up.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    });
    expect(await outcome).toBe("INTERNAL_SERVER_ERROR");
    expect(await eventIds([r.id])).toEqual([]);
  }, 15_000);
});

describe("sync.push — bounded waits before resolution", () => {
  it("gives up on a first sign-in's bind blocked on its users row, binding nothing", async () => {
    const d = await world();
    const tag = uuidv7();
    const email = `invite-${tag}@co.test`;
    const [invited] = await D.owner
      .insert(users)
      .values({ companyId: d.companyId, email, name: "Invited" })
      .returning({ id: users.id });
    const who = { subject: `sub-${tag}`, email, emailVerified: true as const };
    let outcome!: Promise<string | undefined>;
    await rolledBack(D.owner, async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${invited!.id} for update`);
      outcome = push(who, [receipt(d.J)]).then(
        () => "answered",
        (e: { code?: string }) => e.code,
      );
      // Past the 2 s lock_timeout, inside the 4 s statement_timeout: only a lock timeout set
      // before resolution can be what gives up.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    });
    expect(await outcome).toBe("INTERNAL_SERVER_ERROR");
    const [row] = await D.owner
      .select({ subject: users.identitySubject })
      .from(users)
      .where(eq(users.id, invited!.id));
    expect(row).toEqual({ subject: null });
  }, 15_000);
});

describe("sync.push — transaction boundaries", () => {
  // The real runner with a barrier before the second record's transaction opens.
  function barrierRun(who: VerifiedIdentity, between: () => Promise<void>): RunRecord {
    let n = 0;
    return async (body) => {
      if (n++ === 1) await between();
      return inCallerTransaction(app, who, body);
    };
  }

  it("holds no lock of a committed record while the next one runs", async () => {
    const d = await world();
    let running!: ReturnType<typeof push>;
    let seen: Record<string, unknown> = {};
    await D.owner.transaction(async (tx) => {
      // Record 2's job, held: record 2 waits on its row, before any lock of its own beyond it.
      await tx.execute(sql`select 1 from jobs where id = ${d.J2} for no key update`);
      running = push(d.w.who, [labor(d.w.id, d.J), receipt(d.J2)]);
      await waitForLockWait(D.owner, '%from "jobs"%for share%', { n: 1 });
      // Record 1 has committed: its worker and field-write locks are gone, and the rows it
      // held FOR SHARE are free (row locks live in the tuples; NOWAIT finds them).
      const { rows } = await D.owner.execute<{ n: number }>(sql`
        select count(*)::int as n from pg_locks
        where locktype = 'advisory'
          and database = (select oid from pg_database where datname = current_database())
      `);
      const rowsFree = await D.owner.transaction(async (other) => {
        await other.execute(sql`select 1 from jobs where id = ${d.J} for update nowait`);
        await other.execute(
          sql`select 1 from users where id = ${d.w.id} for update nowait`,
        );
        return "free";
      });
      seen = { advisory: rows[0]?.n, rows: rowsFree };
    });
    expect(seen).toEqual({ advisory: 0, rows: "free" });
    expect((await running).results.map((r) => r.result)).toEqual([
      "accepted",
      "accepted",
    ]);
  });

  it("returns what committed when the caller is deactivated between records", async () => {
    const d = await world();
    const first = labor(d.w.id, d.J);
    const second = receipt(d.J);
    const run = barrierRun(d.w.who, async () => {
      await D.owner
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, d.w.id));
    });
    const answer = await pushRecords(
      { protocolVersion: 1, deviceNow: new Date(), records: [first, second] },
      run,
    );
    expect(answer.results.map((r) => r.id)).toEqual([first.id]);
    expect(
      await D.owner.select().from(materials).where(eq(materials.id, second.id)),
    ).toEqual([]);
    // And from then on, nothing: not even its own acknowledged record.
    await expect(push(d.w.who, [first])).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("re-reads the caller under its row lock: a deactivation committed while it waited", async () => {
    const d = await world();
    const first = receipt(d.J2);
    const second = labor(d.w.id, d.J);
    let running!: ReturnType<typeof push>;
    await D.owner.transaction(async (tx) => {
      // Record 2's job, held so record 2 resolves (active) and then waits on it.
      await tx.execute(sql`select 1 from jobs where id = ${d.J} for no key update`);
      running = push(d.w.who, [first, second]);
      await waitForLockWait(D.owner, '%from "jobs"%for share%', { n: 1 });
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, d.w.id));
    }); // the commit releases the job; record 2 then reads the caller's row under its lock
    const answer = await running;
    expect(answer.results.map((r) => r.id)).toEqual([first.id]);
    expect(await eventIds([second.id])).toEqual([]);
  });
});

describe("sync.push — a closeout id another tenant holds", () => {
  const DAY = "2026-10-05";

  // A's closeout of J on DAY under `id`, reviewed now, as the field app sends it.
  async function closeoutRecord(d: World, id = uuidv7()) {
    const review = await caller(d.who).closeout.review({ jobId: d.J, workDate: DAY });
    return {
      id,
      kind: "closeout" as const,
      schemaVersion: 1,
      payload: {
        jobId: d.J,
        workDate: DAY,
        jobStatus: "open",
        note: null,
        clientTimestamp: new Date("2026-10-05T21:00:00Z"),
        reviewFingerprint: review.fingerprint,
      },
    };
  }

  // An empty closeout row of d's J on DAY, as the owner writes it.
  const closeoutRow = (d: World, id: string) => ({
    id,
    companyId: d.companyId,
    jobId: d.J,
    workDate: DAY,
    timezone: "America/New_York",
    jobStatus: "open" as const,
    jobStatusApplied: false,
    submittedByUserId: d.foremanId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 0,
    materialCount: 0,
  });

  // `row` inserted on another connection and held uncommitted until the test ends it, committed
  // or rolled back: another writer of that key, in flight.
  async function holdCloseout(row: ReturnType<typeof closeoutRow>) {
    const ROLLBACK = Symbol("rollback");
    let finish!: (commit: boolean) => void;
    const decided = new Promise<boolean>((r) => (finish = r));
    let ready!: () => void;
    const held = new Promise<void>((r) => (ready = r));
    const done = D.owner
      .transaction(async (tx) => {
        await tx.insert(dayCloseouts).values(row);
        ready();
        if (!(await decided)) throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
    await Promise.race([held, done]);
    return { end: async (commit: boolean) => (finish(commit), await done) };
  }

  const closeoutsOf = async (d: World) =>
    (
      await D.owner
        .select({ id: dayCloseouts.id })
        .from(dayCloseouts)
        .where(eq(dayCloseouts.companyId, d.companyId))
    ).map((r) => r.id);

  const waitOnInsert = () =>
    waitForLockWait(D.owner, 'insert into "day_closeouts"%', {
      waitEvent: "transactionid",
    });

  it("answers it id_conflict on every resend after a dropped response, and goes on", async () => {
    const theirs = await world();
    const held = await closeoutRecord(theirs);
    const accepted = await push(theirs.who, [held]);
    expect(accepted.results).toMatchObject([{ result: "accepted" }]);

    const d = await world();
    const batch = [
      await closeoutRecord(d, held.id),
      labor(d.w.id, d.J, { clientTimestamp: new Date("2026-10-06T12:00:00Z") }),
    ];
    const first = await push(d.who, batch); // the response the device never saw
    expect(first.results).toEqual([
      { id: held.id, kind: "closeout", result: "rejected", code: "id_conflict" },
      expect.objectContaining({ id: batch[1]!.id, result: "accepted" }),
    ]);
    const again = await push(d.who, batch);
    expect(again.results).toEqual([
      first.results[0],
      { ...first.results[1], result: "duplicate" },
    ]);
    expect(await closeoutsOf(d)).toEqual([]);
    // Their own resend is still their acknowledgement.
    expect((await push(theirs.who, [held])).results).toEqual([
      { ...accepted.results[0], result: "duplicate" },
    ]);
  });

  it("waits on their uncommitted insert: id_conflict once it commits", async () => {
    const theirs = await world();
    const d = await world();
    const r = await closeoutRecord(d);
    const holder = await holdCloseout(closeoutRow(theirs, r.id));
    const running = push(d.who, [r]);
    await waitOnInsert();
    await holder.end(true);
    expect((await running).results).toEqual([
      { id: r.id, kind: "closeout", result: "rejected", code: "id_conflict" },
    ]);
    expect(await closeoutsOf(d)).toEqual([]);
  });

  it("waits on their uncommitted insert: accepted once it rolls back", async () => {
    const theirs = await world();
    const d = await world();
    const r = await closeoutRecord(d);
    const holder = await holdCloseout(closeoutRow(theirs, r.id));
    const running = push(d.who, [r]);
    await waitOnInsert();
    await holder.end(false);
    expect((await running).results).toMatchObject([{ id: r.id, result: "accepted" }]);
    expect(await closeoutsOf(d)).toEqual([r.id]);
  });

  it("leaves it out when the wait passes the lock timeout, writing nothing; the resend lands", async () => {
    const theirs = await world();
    const d = await world();
    const before = labor(d.w.id, d.J, {
      clientTimestamp: new Date("2026-10-06T12:00:00Z"),
    });
    const r = await closeoutRecord(d);
    const holder = await holdCloseout(closeoutRow(theirs, r.id));
    // Held past the 2 s lock_timeout: a transient failure, retried, never a rejection.
    const answer = await push(d.who, [before, r]);
    expect(answer.results.map((x) => [x.id, x.result])).toEqual([
      [before.id, "accepted"],
    ]);
    expect(await closeoutsOf(d)).toEqual([]);
    await holder.end(false);
    expect((await push(d.who, [before, r])).results.map((x) => x.result)).toEqual([
      "duplicate",
      "accepted",
    ]);
  }, 15_000);

  it("throws a natural-key conflict met at the insert; the retry is already_submitted", async () => {
    const d = await world();
    const r = await closeoutRecord(d);
    // A writer that skipped the job's lock: its row for the same job and day, under another id,
    // commits after this submission's own already_submitted check.
    const rival = uuidv7();
    const holder = await holdCloseout(closeoutRow(d, rival));
    const submit = () =>
      caller(d.who).closeout.submit({ id: r.id, ...r.payload } as never);
    const running = rejection(submit());
    await waitOnInsert();
    await holder.end(true);
    expect(sqlstateOf(await running)).toBe("23505");
    expect(await submit()).toEqual({
      result: "rejected",
      code: "already_submitted",
      conflictingId: rival,
    });
    expect(await closeoutsOf(d)).toEqual([rival]);
  });
});
