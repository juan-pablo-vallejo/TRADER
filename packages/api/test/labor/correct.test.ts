// labor.correct through the application's router, under the runtime role in
// rolled-back transactions. Office corrections append, correct and void; a set is one timeline;
// every event is written with its flags and takes effect at once; a rejection writes nothing.
// Concurrency and commits are labor/correct-commit.test.ts's.
import { jobs, users, workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import { sessionAccounting } from "../../src/labor/accounting";
import { readWorkerEvents } from "../../src/labor/timeline";
import {
  appCallerIn,
  asTenant,
  boundIn,
  workDayIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  type WorkDay,
} from "../helpers";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

const HOUR = 3_600_000;
const T = (hhmm: string) => `2026-10-05T${hhmm}:00.000Z`;
const at = (hhmm: string) => new Date(T(hhmm));
type Positional = "started" | "paused" | "resumed" | "ended";

const append = (type: Positional, jobId: string, hhmm: string) => ({
  kind: "append" as const,
  id: uuidv7(),
  type,
  jobId,
  clientTimestamp: at(hhmm),
});
const correct = (
  root: string,
  type: Positional,
  jobId: string,
  hhmm: string,
  replaces = root,
) => ({
  kind: "correct" as const,
  id: uuidv7(),
  correctsEventId: root,
  replacesEventId: replaces,
  type,
  jobId,
  clientTimestamp: at(hhmm),
});
const voidOf = (root: string) => ({
  kind: "void" as const,
  id: uuidv7(),
  voidsEventId: root,
});

type Op =
  ReturnType<typeof append> | ReturnType<typeof correct> | ReturnType<typeof voidOf>;

const submit = (tx: Tx, who: unknown, workerId: string, operations: Op[]) =>
  appCallerIn(tx, who).labor.correct({ workerId, operations });

// Back to the owner, to write fixtures or look past RLS, then the runtime role again.
async function asOwner<T>(tx: Tx, d: WorkDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

// A working day with two admins.
async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const admin2 = await boundIn(tx, d.companyId, "admin");
  return { d, admin, admin2 };
}

const ev = (
  tx: Tx,
  d: WorkDay,
  worker: string,
  type: Positional,
  hhmm: string,
  job = d.J,
) => eventIn(tx, d, { worker, job, type, client: T(hhmm) });

// Every row a rejection must leave as it was, read as the owner.
async function counts(tx: Tx, d: WorkDay) {
  return asOwner(tx, d, async () => {
    const [e] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.companyId, d.companyId));
    return { events: e!.n };
  });
}

async function rejectsWritingNothing(
  tx: Tx,
  d: WorkDay,
  call: () => Promise<unknown>,
  expected: Record<string, unknown>,
) {
  const before = await counts(tx, d);
  expect(await call()).toEqual({ result: "rejected", ...expected });
  expect(await counts(tx, d)).toEqual(before);
}

// An entry's flags, as stored with it.
const flagsOf = async (tx: Tx, eventId: string) =>
  (
    await tx
      .select({ flags: workSessionEvents.flags })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.id, eventId))
  )[0]?.flags;

// The accounting of every session of one worker, from the stored ledger.
async function accounting(tx: Tx, worker: string) {
  return [...sessionAccounting(await readWorkerEvents(tx, worker)).byRoot.values()];
}

describe("labor.correct — who may correction", () => {
  it("admits an active admin only; anything else answers as a gate does", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await world(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await asTenant(tx, d.companyId);
      const ops = () => [append("started", d.J, "08:00")];
      expect(await outcome(submit(tx, null, d.w1, ops()))).toBe("UNAUTHORIZED");
      expect(await outcome(submit(tx, gone.who, d.w1, ops()))).toBe("UNAUTHORIZED");
      expect(await outcome(submit(tx, worker.who, d.w1, ops()))).toBe("FORBIDDEN");
      expect(await outcome(submit(tx, d.who, d.w1, ops()))).toBe("FORBIDDEN");
      expect(await counts(tx, d)).toEqual({ events: 0 });
    });
  });

  it("refuses a set repeating an id or naming one of its own", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await asTenant(tx, d.companyId);
      const start = append("started", d.J, "08:00");
      expect(await outcome(submit(tx, admin.who, d.w1, [start, start]))).toBe(
        "BAD_REQUEST",
      );
      expect(await outcome(submit(tx, admin.who, d.w1, [start, voidOf(start.id)]))).toBe(
        "BAD_REQUEST",
      );
      expect(await outcome(submit(tx, admin.who, d.w1, []))).toBe("BAD_REQUEST");
    });
  });

  it("is one FORBIDDEN for a worker or job that is missing or another tenant's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await workDayIn(tx);
      await asTenant(tx, d.companyId);
      const before = await counts(tx, d);
      for (const [worker, job] of [
        [other.w1, d.J],
        [uuidv7(), d.J],
        [d.w1, other.J],
        [d.w1, uuidv7()],
      ] as const) {
        const answer = await outcome(
          submit(tx, admin.who, worker, [append("started", job, "08:00")]),
        );
        expect(answer).toBe("FORBIDDEN");
      }
      expect(await counts(tx, d)).toEqual(before);
    });
  });

  it("names another worker's or tenant's event as missing, never revealing it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await workDayIn(tx);
      const theirs = await eventIn(tx, other, {
        worker: other.w1,
        job: other.J,
        type: "started",
        client: T("08:00"),
      });
      const w2Start = await ev(tx, d, d.w2, "started", "08:00");
      await ev(tx, d, d.w1, "started", "08:00");
      await asTenant(tx, d.companyId);
      for (const target of [theirs, w2Start, uuidv7()]) {
        const c = correct(target, "started", d.J, "09:00");
        await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [c]), {
          code: "target_missing",
          eventId: c.id,
        });
        const v = voidOf(target);
        await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [v]), {
          code: "target_missing",
          eventId: v.id,
        });
      }
    });
  });

  it("corrects a deactivated worker's labor on an archived job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1));
      await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      await asTenant(tx, d.companyId);
      const r = await submit(tx, admin.who, d.w1, [append("ended", d.J, "16:00")]);
      expect(r.result).toBe("accepted");
    });
  });
});

describe("labor.correct — append, correct, void", () => {
  it("appends a forgotten clock-out as an office event, counted at once", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await asTenant(tx, d.companyId);
      const end = append("ended", d.J, "16:00");
      const r = await submit(tx, admin.who, d.w1, [end]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: end.id, flags: ["corrected", "user_timed"] }],
      });
      const [row] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, end.id));
      expect(row).toMatchObject({
        workerId: d.w1,
        jobId: d.J,
        type: "ended",
        clientTimestamp: at("16:00"),
        initiatorUserId: admin.id,
        timeSetByUser: true,
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
        locationLat: null,
        schemaVersion: 1,
        correctsEventId: null,
        voidsEventId: null,
        flags: ["corrected", "user_timed"],
      });
      expect(row!.serverTimestamp).toEqual(
        r.result === "accepted" ? r.events[0]!.serverTimestamp : null,
      );
      expect(await accounting(tx, d.w1)).toEqual([
        {
          rootEventId: start,
          accounting: "eligible",
          eligibleWorkedMs: 8 * HOUR,
          complete: true,
        },
      ]);
    });
  });

  it("corrects a clock-out; the correction is in effect when written, and flagged", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "18:00");
      await asTenant(tx, d.companyId);
      const c = correct(end, "ended", d.J, "16:00");
      const r = await submit(tx, admin.who, d.w1, [c]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: c.id, flags: ["corrected", "user_timed"] }],
      });
      expect(await flagsOf(tx, c.id)).toEqual(["corrected", "user_timed"]);
      const ledger = await readWorkerEvents(tx, d.w1);
      const { structural } = sessionAccounting(ledger);
      expect(structural.winners.get(end)).toBe(c.id);
      expect(structural.sessions[0]!.workedMs).toBe(8 * HOUR);
      // Ten hours as recorded, eight from the moment the office wrote the correction.
      expect(await accounting(tx, d.w1)).toMatchObject([
        { accounting: "eligible", eligibleWorkedMs: 8 * HOUR, complete: true },
      ]);
    });
  });

  it("rejects a correction that breaks the event after it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const pause = await ev(tx, d, d.w1, "paused", "12:00");
      const resume = await ev(tx, d, d.w1, "resumed", "12:30");
      await ev(tx, d, d.w1, "ended", "16:00");
      await asTenant(tx, d.companyId);
      const c = correct(pause, "paused", d.J, "13:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [c]), {
        code: "breaks_following_event",
        eventId: c.id,
        conflictingEventId: resume,
      });
    });
  });

  it("lands a missed session before a later one only as a set", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const later = await ev(tx, d, d.w1, "started", "13:00");
      await ev(tx, d, d.w1, "ended", "17:00");
      await asTenant(tx, d.companyId);
      const start = append("started", d.J, "08:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [start]), {
        code: "breaks_following_event",
        eventId: start.id,
        conflictingEventId: later,
      });
      const end = append("ended", d.J, "12:00");
      expect((await submit(tx, admin.who, d.w1, [start, end])).result).toBe("accepted");
      expect(await accounting(tx, d.w1)).toHaveLength(2);
    });
  });

  it("lands a missed pause before a later pause only as a set", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const laterPause = await ev(tx, d, d.w1, "paused", "14:00");
      await ev(tx, d, d.w1, "resumed", "14:30");
      await ev(tx, d, d.w1, "ended", "17:00");
      await asTenant(tx, d.companyId);
      const pause = append("paused", d.J, "10:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [pause]), {
        code: "breaks_following_event",
        eventId: pause.id,
        conflictingEventId: laterPause,
      });
      const resume = append("resumed", d.J, "10:15");
      expect((await submit(tx, admin.who, d.w1, [pause, resume])).result).toBe(
        "accepted",
      );
    });
  });

  it("rejects moving a start into the session before it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const first = await ev(tx, d, d.w1, "started", "08:00");
      await ev(tx, d, d.w1, "ended", "12:00");
      const second = await ev(tx, d, d.w1, "started", "13:00");
      await ev(tx, d, d.w1, "ended", "17:00");
      await asTenant(tx, d.companyId);
      const c = correct(second, "started", d.J, "11:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [c]), {
        code: "session_already_open",
        eventId: c.id,
        conflictingEventId: first,
      });
    });
  });

  it("re-attributes a session by correcting its start's job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await ev(tx, d, d.w1, "ended", "16:00");
      await asTenant(tx, d.companyId);
      const c = correct(start, "started", d.K, "08:00");
      expect((await submit(tx, admin.who, d.w1, [c])).result).toBe("accepted");
      const { structural } = sessionAccounting(await readWorkerEvents(tx, d.w1));
      expect(structural.sessions[0]!.jobId).toBe(d.K);
      // A pause, resume or end keeps its root's job.
      const end = (await readWorkerEvents(tx, d.w1)).find((e) => e.type === "ended")!;
      const wrong = correct(end.id, "ended", d.K, "15:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [wrong]), {
        code: "correction_job_mismatch",
        eventId: wrong.id,
      });
    });
  });

  it("voids a session once, naming its root start", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "16:00");
      await asTenant(tx, d.companyId);
      const fix = correct(start, "started", d.J, "08:30");
      expect((await submit(tx, admin.who, d.w1, [fix])).result).toBe("accepted");
      expect(await accounting(tx, d.w1)).toMatchObject([
        { accounting: "eligible", eligibleWorkedMs: 7.5 * HOUR },
      ]);
      const onEnd = voidOf(end);
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [onEnd]), {
        code: "void_target_not_started",
        eventId: onEnd.id,
      });
      const onCorrection = voidOf(fix.id);
      await rejectsWritingNothing(
        tx,
        d,
        () => submit(tx, admin.who, d.w1, [onCorrection]),
        { code: "target_is_correction", eventId: onCorrection.id },
      );
      const v = voidOf(start);
      const r = await submit(tx, admin.who, d.w1, [v]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: v.id, flags: ["corrected"] }],
      });
      const [row] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, v.id));
      expect(row).toMatchObject({
        type: "voided",
        voidsEventId: start,
        jobId: d.J,
        timeSetByUser: false,
        flags: ["corrected"],
      });
      expect(row!.clientTimestamp).toEqual(row!.serverTimestamp);
      // The void takes effect as it is written.
      expect(await accounting(tx, d.w1)).toMatchObject([
        { rootEventId: start, accounting: "voided", eligibleWorkedMs: 0 },
      ]);
      const again = voidOf(start);
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [again]), {
        code: "already_voided",
        eventId: again.id,
      });
      // Positional corrections stay legal after a void.
      const later = correct(end, "ended", d.J, "15:00");
      expect((await submit(tx, admin.who, d.w1, [later])).result).toBe("accepted");
    });
  });

  // H1: a voided session that is still open keeps its worker clocked in on the server, so
  // every later clock-in is refused. The void of an open session comes with its end.
  it("refuses a void that leaves its session open, and voids one ended in the same set", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await ev(tx, d, d.w1, "paused", "10:00");
      await asTenant(tx, d.companyId);
      const lone = voidOf(start);
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [lone]), {
        code: "void_leaves_session_open",
        eventId: lone.id,
      });
      const end = append("ended", d.J, "10:30");
      const v = voidOf(start);
      expect(await submit(tx, admin.who, d.w1, [end, v])).toMatchObject({
        result: "accepted",
      });
      expect(await accounting(tx, d.w1)).toMatchObject([
        { rootEventId: start, accounting: "voided", eligibleWorkedMs: 0 },
      ]);
      // Nothing is left open: the worker clocks in again.
      const next = append("started", d.J, "11:00");
      expect((await submit(tx, admin.who, d.w1, [next])).result).toBe("accepted");
    });
  });

  it("refuses a time after the correction's receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      await asTenant(tx, d.companyId);
      const end = {
        ...append("ended", d.J, "16:00"),
        clientTimestamp: new Date(Date.now() + HOUR),
      };
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, [end]), {
        code: "time_in_future",
        eventId: end.id,
      });
    });
  });

  it("refuses a correction of a source no longer in effect", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "18:00");
      await asTenant(tx, d.companyId);
      const first = correct(end, "ended", d.J, "16:00");
      expect((await submit(tx, admin.who, d.w1, [first])).result).toBe("accepted");
      // Made from the view before the first correction.
      const stale = correct(end, "ended", d.J, "17:00");
      await rejectsWritingNothing(tx, d, () => submit(tx, admin2.who, d.w1, [stale]), {
        code: "correction_stale",
        eventId: stale.id,
        conflictingEventId: first.id,
      });
      const current = correct(end, "ended", d.J, "17:00", first.id);
      expect((await submit(tx, admin2.who, d.w1, [current])).result).toBe("accepted");
    });
  });

  it("accepts a correction at exactly its source's time and job, leaving the source as it was", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await ev(tx, d, d.w1, "ended", "16:00");
      await asTenant(tx, d.companyId);
      const [startRow] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start));
      const before = await counts(tx, d);

      const same = correct(start, "started", d.J, "08:00");
      expect(await submit(tx, admin.who, d.w1, [same])).toMatchObject({
        result: "accepted",
        events: [{ id: same.id, flags: ["corrected", "user_timed"] }],
      });
      expect(await counts(tx, d)).toEqual({ events: before.events + 1 });
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "eligible",
        eligibleWorkedMs: 8 * HOUR,
      });
      const [after] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start));
      expect(after).toEqual(startRow);
    });
  });
});

// An admin's correction of their own ledger is an office entry like any other: flagged the same,
// and in effect when written.
describe("labor.correct — the caller's own ledger", () => {
  it("flags a correction of the caller's own ledger like anyone's; it counts at once", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await asTenant(tx, d.companyId);
      const start = append("started", d.J, "08:00");
      const end = append("ended", d.J, "16:00");
      const first = await submit(tx, admin.who, admin.id, [start, end]);
      expect(first).toMatchObject({
        result: "accepted",
        events: [
          { id: start.id, flags: ["corrected", "user_timed"] },
          { id: end.id, flags: ["corrected", "user_timed"] },
        ],
      });
      const [row] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start.id));
      expect(row).toMatchObject({
        workerId: admin.id,
        initiatorUserId: admin.id,
        timeSetByUser: true,
        capturedOffline: false,
        locationLat: null,
        flags: ["corrected", "user_timed"],
      });
      expect(await accounting(tx, admin.id)).toMatchObject([
        { accounting: "eligible", eligibleWorkedMs: 8 * HOUR },
      ]);
      // A retry answers as the first call did.
      expect(await submit(tx, admin.who, admin.id, [start, end])).toEqual({
        result: "duplicate",
        events: first.result === "accepted" ? first.events : [],
      });

      // A correction is in effect at once, and a void voids at once.
      const fix = correct(end.id, "ended", d.J, "15:00");
      expect(await submit(tx, admin.who, admin.id, [fix])).toMatchObject({
        result: "accepted",
        events: [{ id: fix.id, flags: ["corrected", "user_timed"] }],
      });
      expect(await accounting(tx, admin.id)).toMatchObject([
        { accounting: "eligible", eligibleWorkedMs: 7 * HOUR },
      ]);
      const v = voidOf(start.id);
      expect(await submit(tx, admin.who, admin.id, [v])).toMatchObject({
        result: "accepted",
        events: [{ id: v.id, flags: ["corrected"] }],
      });
      expect(await accounting(tx, admin.id)).toMatchObject([
        { accounting: "voided", eligibleWorkedMs: 0 },
      ]);
      expect(await counts(tx, d)).toEqual({ events: 4 });
    });
  });
});

describe("labor.correct — retries and ids", () => {
  it("answers a retry as the first call, ignoring the unstored precondition", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "18:00");
      await asTenant(tx, d.companyId);
      const ops = [correct(end, "ended", d.J, "16:00"), append("started", d.J, "19:00")];
      const first = await submit(tx, admin.who, d.w1, ops);
      expect(first.result).toBe("accepted");
      const before = await counts(tx, d);
      const events = first.result === "accepted" ? first.events : [];
      expect(await submit(tx, admin.who, d.w1, ops)).toEqual({
        result: "duplicate",
        events,
      });
      // replacesEventId is a precondition, never stored: a retry naming another still matches.
      const renamed = [{ ...ops[0]!, replacesEventId: uuidv7() }, ops[1]!];
      expect(await submit(tx, admin.who, d.w1, renamed)).toEqual({
        result: "duplicate",
        events,
      });
      expect(await counts(tx, d)).toEqual(before);

      // A changed time, another admin, or part of the set alongside a new id: a conflict.
      const moved = [{ ...ops[0]!, clientTimestamp: at("16:30") }, ops[1]!];
      await rejectsWritingNothing(tx, d, () => submit(tx, admin.who, d.w1, moved), {
        code: "id_conflict",
        conflictingEventId: ops[0]!.id,
      });
      await rejectsWritingNothing(tx, d, () => submit(tx, admin2.who, d.w1, ops), {
        code: "id_conflict",
        conflictingEventId: ops[0]!.id,
      });
      await rejectsWritingNothing(
        tx,
        d,
        () => submit(tx, admin.who, d.w1, [ops[1]!, append("ended", d.J, "20:00")]),
        { code: "id_conflict", conflictingEventId: ops[1]!.id },
      );
    });
  });

  it("answers an id another tenant holds with id_conflict, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await workDayIn(tx);
      const held = await eventIn(tx, other, {
        worker: other.w1,
        job: other.J,
        type: "started",
        client: T("06:00"),
      });
      await asTenant(tx, d.companyId);
      const fresh = append("started", d.J, "08:00");
      const colliding = { ...append("ended", d.J, "16:00"), id: held };
      await rejectsWritingNothing(
        tx,
        d,
        () => submit(tx, admin.who, d.w1, [fresh, colliding]),
        { code: "id_conflict", conflictingEventId: held },
      );
      expect(
        await tx
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.id, fresh.id)),
      ).toEqual([]);
    });
  });

  it("acknowledges in input order", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await asTenant(tx, d.companyId);
      const now = Date.now();
      // Ids descending against the input order.
      const ops = [
        { ...append("started", d.J, "08:00"), id: uuidv7(now + 3) },
        { ...append("paused", d.J, "10:00"), id: uuidv7(now + 2) },
        { ...append("resumed", d.J, "10:15"), id: uuidv7(now + 1) },
        { ...append("ended", d.J, "16:00"), id: uuidv7(now) },
      ];
      const first = await submit(tx, admin.who, d.w1, ops);
      const again = await submit(tx, admin.who, d.w1, ops);
      for (const r of [first, again]) {
        expect(r.result === "rejected" ? [] : r.events.map((e) => e.id)).toEqual(
          ops.map((o) => o.id),
        );
      }
      expect(again).toEqual({ ...first, result: "duplicate" });
    });
  });
});
