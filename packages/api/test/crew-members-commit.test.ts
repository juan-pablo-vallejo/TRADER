// TASKS:46: membership writes lock the crew row, race-tested against a real push
// (ARCHITECTURE, crew membership writers of 2026-11-05). In a disposable database (helpers.ts),
// because a push commits a labor event and two connections must see the same rows. Push first:
// a removal queued behind a push holding the crew row FOR SHARE commits only after the push
// ends, and the push's event stands under the membership it read. Removal first: the push queues
// on the crew row and reads the membership without the worker. The push waits on the worker
// lock under its 2 s lock_timeout (trpc.ts, SYNC_TIMEOUTS): the observation and the release
// happen inside it, as sync-push-commit.test.ts's race() does.
import { crewMembers, jobs, workSessionEvents } from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../src/context";
import type { VerifiedIdentity } from "../src/identity";
import { appRouter } from "../src/router";
import { createCallerFactory } from "../src/trpc";
import {
  boundIn,
  crewDayIn,
  disposableDb,
  quietReporter,
  rolledBack,
  uuidv7,
  waitForLockWait,
} from "./helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app({ max: 6 });
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const caller = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({ db: app, identity: who, reporter: quietReporter }),
  );

// A committed crew day with a bound worker `w` on the crew and a bound admin.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const w = await boundIn(tx, d.companyId, "worker");
    await tx
      .insert(crewMembers)
      .values({ companyId: d.companyId, crewId: d.crewId, userId: w.id });
    const admin = await boundIn(tx, d.companyId, "admin");
    return { ...d, w, admin };
  });
}

const started = (workerId: string, jobId: string) => ({
  id: uuidv7(),
  kind: "labor_event" as const,
  schemaVersion: 1,
  payload: {
    workerId,
    jobId,
    type: "started",
    clientTimestamp: new Date("2026-10-05T12:00:00Z"),
    attestationLevel: "biometric",
    location: { lat: 41.824, lng: -71.4128, accuracyM: 8 },
    timeSetByUser: false,
    capturedOffline: false,
  },
});

const push = (who: VerifiedIdentity, records: unknown[]) =>
  caller(who).sync.push({ protocolVersion: 1, deviceNow: new Date(), records });

const eventExists = async (id: string) =>
  (await D.owner.$count(workSessionEvents, eq(workSessionEvents.id, id))) === 1;

const isMember = async (crewId: string, userId: string) =>
  (await D.owner.$count(
    crewMembers,
    and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)),
  )) === 1;

// The worker's advisory lock, held on another connection: the push queues on it after taking
// the job and the crew FOR SHARE. `body` runs while the push waits, with the push's promise;
// rolling back releases the lock.
type Pushed = Promise<{ settled: true; result: string }>;

async function withPushWaiting(
  d: Awaited<ReturnType<typeof world>>,
  record: ReturnType<typeof started>,
  body: (pushed: Pushed) => Promise<void>,
): Promise<Awaited<Pushed>> {
  let pushed!: Pushed;
  await rolledBack(D.owner, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${d.w.id}::uuid::text, 0))`,
    );
    pushed = push(d.w.who, [record]).then((a) => ({
      settled: true as const,
      result: a.results[0]!.result,
    }));
    await waitForLockWait(D.owner, "select pg_advisory_xact_lock(hashtextextended(%", {
      n: 1,
      waitEvent: "advisory",
    });
    await body(pushed);
  });
  return pushed;
}

describe("crew.removeMember against a push in flight", () => {
  it("queues behind a push holding the crew row and commits only after it ends", async () => {
    const d = await world();
    const record = started(d.w.id, d.J);
    let removal!: Promise<{ answer: unknown; pushSettledFirst: boolean }>;
    const pushed = await withPushWaiting(d, record, async (inFlight) => {
      let pushSettled = false;
      void inFlight.then(() => (pushSettled = true));
      removal = caller(d.admin.who)
        .crew.removeMember({ crewId: d.crewId, userId: d.w.id })
        .then((answer) => ({ answer, pushSettledFirst: pushSettled }));
      // The invariant: the removal waits on the crew row. Were the lock dropped, it would
      // commit here, under the push.
      await Promise.race([
        waitForLockWait(D.owner, '%from "crews"%for no key update%'),
        removal.then(() => {
          throw new Error("the removal committed under the push");
        }),
      ]);
    });
    expect(pushed).toEqual({ settled: true, result: "accepted" });
    const { answer, pushSettledFirst } = await removal;
    expect(answer).toMatchObject({ result: "removed" });
    expect(pushSettledFirst).toBe(true);
    expect(await eventExists(record.id)).toBe(true);
    expect(await isMember(d.crewId, d.w.id)).toBe(false);
    const again = await push(d.w.who, [started(d.w.id, d.J)]);
    expect(again.results[0]).toMatchObject({ result: "rejected", code: "not_permitted" });
  });

  it("committed first makes the queued push read the membership without the worker", async () => {
    const d = await world();
    const record = started(d.w.id, d.J);
    let removal!: Promise<unknown>;
    let pushed!: ReturnType<typeof push>;
    await D.owner.transaction(async (tx) => {
      // The admin's row held: the removal takes the crew row, then queues at lockActiveSelf.
      await tx.execute(sql`select 1 from users where id = ${d.admin.id} for update`);
      removal = caller(d.admin.who).crew.removeMember({
        crewId: d.crewId,
        userId: d.w.id,
      });
      await waitForLockWait(D.owner, '%from "users"%for share%');
      // The push then queues on the crew row behind the removal.
      pushed = push(d.w.who, [record]);
      await waitForLockWait(D.owner, '%from "crews"%for share%');
    }); // the commit releases the admin's row: the removal commits, then the push reads
    expect(await removal).toMatchObject({ result: "removed" });
    expect((await pushed).results[0]).toMatchObject({
      result: "rejected",
      code: "not_permitted",
    });
    expect(await eventExists(record.id)).toBe(false);
    expect(await isMember(d.crewId, d.w.id)).toBe(false);
  });
});

describe("job.assign against a push in flight", () => {
  it("queues behind a push holding the job row and commits only after it ends", async () => {
    const d = await world();
    const record = started(d.w.id, d.J);
    let assignment!: Promise<{ answer: unknown; pushSettledFirst: boolean }>;
    const pushed = await withPushWaiting(d, record, async (inFlight) => {
      let pushSettled = false;
      void inFlight.then(() => (pushSettled = true));
      assignment = caller(d.admin.who)
        .job.assign({ jobId: d.J, crewId: null })
        .then((answer) => ({ answer, pushSettledFirst: pushSettled }));
      await Promise.race([
        waitForLockWait(D.owner, '%from "jobs"%for no key update%'),
        assignment.then(() => {
          throw new Error("the reassignment committed under the push");
        }),
      ]);
    });
    expect(pushed).toEqual({ settled: true, result: "accepted" });
    const { answer, pushSettledFirst } = await assignment;
    expect(answer).toMatchObject({ result: "updated", job: { crew: null } });
    expect(pushSettledFirst).toBe(true);
    expect(await eventExists(record.id)).toBe(true);
    expect(
      (
        await D.owner.select({ crewId: jobs.crewId }).from(jobs).where(eq(jobs.id, d.J))
      )[0],
    ).toEqual({ crewId: null });
    // Unstaffed now: the worker's next start on it has no crew to admit them.
    const again = await push(d.w.who, [started(d.w.id, d.J)]);
    expect(again.results[0]).toMatchObject({ result: "rejected", code: "not_permitted" });
  });
});
