// sync.push against real commits. Rolled-back tests
// cannot show that a record commits on its own, that a failed one leaves nothing, or that two
// connections serialize; these do, in a database of their own (helpers.ts, disposableDb),
// migrated through the whole journal and dropped at the end with everything committed in it.
// Every call runs as trader_app over the real caller transaction, one per record.
import { jobs, users, workSessionEvents } from "@trader/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDirectory } from "../../src/core/identity";
import { createContext } from "../../src/core/context";
import type { ErrorReporter } from "../../src/core/report";
import type { VerifiedIdentity } from "../../src/core/identity";
import { appRouter } from "../../src/router";
import { pushRecords, type RunRecord } from "../../src/sync/push";
import {
  createCallerFactory,
  inCallerTransaction,
  SYNC_TIMEOUTS,
} from "../../src/core/trpc";
import {
  boundIn,
  workDayIn,
  disposableDb,
  rolledBack,
  uuidv7,
  waitForLockWait,
  quietReporter,
  REQUEST_ID,
  recordingReporter,
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

const caller = (
  who: VerifiedIdentity,
  reporter: ErrorReporter = quietReporter,
  requestId = REQUEST_ID,
) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter,
      requestId,
    }),
  );

// A committed working day with a bound worker `w` (workDayIn's own workers are invitations:
// no identity to push with), and a third job J2.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await workDayIn(tx);
    const w = await boundIn(tx, d.companyId, "worker");
    const [j2] = await tx
      .insert(jobs)
      .values({ companyId: d.companyId, customerId: d.customerId, name: "J2" })
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
      location: HERE,
      timeSetByUser: false,
      capturedOffline: false,
      ...o,
    },
  };
}

const push = (
  who: VerifiedIdentity,
  records: unknown[],
  reporter?: ErrorReporter,
  requestId?: string,
) =>
  caller(who, reporter, requestId).sync.push({
    protocolVersion: 1,
    deviceNow: new Date(),
    records,
  });

const eventIds = async (ids: string[]) =>
  (
    await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(inArray(workSessionEvents.id, ids))
  ).map((r) => r.id);

describe("sync.push — commits, record by record", () => {
  it("keeps A committed when B throws, writes nothing of B, and leaves C out", async () => {
    const d = await world();
    const a = labor(d.userId, d.J, { capturedOffline: true });
    const b = labor(d.userId, d.J2, {
      capturedOffline: true,
      clientTimestamp: new Date("2026-10-05T13:00:00Z"),
    });
    const c = labor(d.userId, d.J, {
      type: "ended",
      clientTimestamp: new Date("2026-10-05T16:00:00Z"),
    });
    const { reporter, events } = recordingReporter();
    let running!: ReturnType<typeof push>;
    await D.owner.transaction(async (tx) => {
      // B's job, held: A commits, then B waits on this row before it reads any ledger.
      await tx.execute(sql`select 1 from jobs where id = ${d.J2} for no key update`);
      running = push(d.who, [a, b, c], reporter);
      await waitForLockWait(D.owner, '%from "jobs"%for share%', { n: 1 });
      // Meanwhile the caller's ledger stops replaying (an `ended` with no session), written
      // by the owner: validating anything for them throws, as a corrupt ledger must
      // (fold.ts).
      await tx.insert(workSessionEvents).values({
        id: uuidv7(),
        companyId: d.companyId,
        workerId: d.userId,
        jobId: d.J,
        type: "ended",
        clientTimestamp: new Date("2026-10-01T12:00:00Z"),
        serverTimestamp: new Date("2026-10-01T12:00:00Z"),
        clockSkewed: false,
        clockSkewMs: 0,
        schemaVersion: 1,
        timeSetByUser: false,
        capturedOffline: false,
        initiatorUserId: d.userId,
      });
    }); // the commit releases the job; B then loads the ledger and throws
    const answer = await running;
    expect(answer.results.map((r) => [r.id, r.result])).toEqual([[a.id, "accepted"]]);
    expect(await eventIds([a.id, b.id, c.id])).toEqual([a.id]);
    // B's failure is answered by omission, so it is reported here, once, naming nobody.
    expect(events).toMatchObject([{ source: "push_record", path: "sync.push" }]);
    expect(JSON.stringify(events)).not.toContain(d.userId);
    expect(JSON.stringify(events)).not.toContain(d.companyId);
    // A is committed with its flag; nothing of B or C is.
    const stored = await D.owner
      .select({ id: workSessionEvents.id, flags: workSessionEvents.flags })
      .from(workSessionEvents)
      .where(inArray(workSessionEvents.id, [a.id, b.id, c.id]));
    expect(stored).toEqual([{ id: a.id, flags: ["offline"] }]);
    // The report carries the request's id.
    expect(events[0]?.requestId).toBe(REQUEST_ID);
  });

  it("answers a resent batch after a dropped response with the original acknowledgements", async () => {
    const d = await world();
    const batch = [
      labor(d.w.id, d.J, { capturedOffline: true }),
      labor(d.w.id, d.J, {
        type: "ended",
        clientTimestamp: new Date("2026-10-05T16:00:00Z"),
      }),
    ];
    // Timed an hour ahead: refused, and refused again on the resend.
    const future = labor(d.w.id, d.J, {
      clientTimestamp: new Date(Date.now() + 3_600_000),
    });
    const sent = [...batch, future];
    const ledger = () =>
      D.owner
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.companyId, d.companyId))
        .orderBy(workSessionEvents.id);
    const first = await push(d.w.who, sent); // the response the device never saw
    const rows = await ledger();
    const again = await push(d.w.who, sent);
    expect(again.results).toEqual(
      first.results.map((r) =>
        r.result === "rejected" ? r : { ...r, result: "duplicate" },
      ),
    );
    expect(
      first.results.map((r) => (r.result === "rejected" ? r.code : r.result)),
    ).toEqual(["accepted", "accepted", "time_in_future"]);
    // The end claims an online capture in October, sent now: offline by its delay (M3), and
    // the resend answers from the stored row, never judging it again.
    expect(first.results[1]).toMatchObject({
      ack: { clockSkewed: false, flags: ["offline"] },
    });
    // The flags were written once, with the rows, and the resend moved neither.
    expect(new Map(rows.map((r) => [r.id, r.flags]))).toEqual(
      new Map([
        [batch[0]!.id, ["offline"]],
        [batch[1]!.id, ["offline"]],
      ]),
    );
    expect(await ledger()).toEqual(rows);
    expect(await eventIds(sent.map((r) => r.id))).toHaveLength(2);
  });
});

// No deferred check stands behind a pushed event: a flagged one commits with
// its flags and nothing else, an admin's own like anyone's.
describe("sync.push — a flagged event at commit", () => {
  it("commits an admin's flagged event with its flags", async () => {
    const d = await world();
    const admin = await D.owner.transaction((tx) => boundIn(tx, d.companyId, "admin"));
    const event = labor(admin.id, d.K, {
      capturedOffline: true,
      timeSetByUser: true,
      location: null,
    });
    const reasons = ["offline", "user_timed", "location"];
    const answer = await push(admin.who, [event]);
    expect(answer.results).toMatchObject([
      { id: event.id, result: "accepted", ack: { flags: reasons } },
    ]);
    expect(await eventIds([event.id])).toEqual([event.id]);
    const rows = await D.owner
      .select({ flags: workSessionEvents.flags })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.id, event.id));
    expect(rows).toEqual([{ flags: reasons }]);
    // The resend answers from what was stored.
    const again = await push(admin.who, [event]);
    expect(again.results).toMatchObject([
      { id: event.id, result: "duplicate", ack: { flags: reasons } },
    ]);
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
    const other = labor(d.w.id, d.J, {
      clientTimestamp: new Date("2026-10-05T12:05:00Z"),
    });
    const [a, b] = await race(d, [
      () => push(d.w.who, [own]),
      () => push(d.w.who, [other]),
    ]);
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
      outcome = push(who, [labor(invited!.id, d.J)]).then(
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
      return inCallerTransaction(app, who, body, SYNC_TIMEOUTS);
    };
  }

  it("holds no lock of a committed record while the next one runs", async () => {
    const d = await world();
    let running!: ReturnType<typeof push>;
    let seen: Record<string, unknown> = {};
    await D.owner.transaction(async (tx) => {
      // Record 3's job, held: record 3 waits on its row, before any lock of its own beyond it.
      await tx.execute(sql`select 1 from jobs where id = ${d.J2} for no key update`);
      // One push: w's hour on J, then their start on J2.
      running = push(d.w.who, [
        labor(d.w.id, d.J, { capturedOffline: true }),
        labor(d.w.id, d.J, {
          type: "ended",
          capturedOffline: true,
          clientTimestamp: new Date("2026-10-05T13:00:00Z"),
        }),
        labor(d.w.id, d.J2, {
          capturedOffline: true,
          clientTimestamp: new Date("2026-10-05T14:00:00Z"),
        }),
      ]);
      await waitForLockWait(D.owner, '%from "jobs"%for share%', { n: 1 });
      // Records 1 and 2 have committed: their worker locks are gone, and the rows it
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
      "accepted",
    ]);
  });

  it("returns what committed when the caller is deactivated between records", async () => {
    const d = await world();
    const first = labor(d.w.id, d.J);
    const second = labor(d.w.id, d.J, {
      type: "ended",
      clientTimestamp: new Date("2026-10-05T16:00:00Z"),
    });
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
    expect(await eventIds([second.id])).toEqual([]);
    // And from then on, nothing: not even its own acknowledged record.
    await expect(push(d.w.who, [first])).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("re-reads the caller under its row lock: a deactivation committed while it waited", async () => {
    const d = await world();
    const first = labor(d.w.id, d.J2);
    const second = labor(d.w.id, d.J, {
      clientTimestamp: new Date("2026-10-05T12:05:00Z"),
    });
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
