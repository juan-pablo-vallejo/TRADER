// Stage 3 line 9: labor.repair through the application's router, under the runtime role in
// rolled-back transactions. Office repairs append, correct and void; a set is one timeline;
// every event gets its pending approval; a rejection writes nothing; nothing reads a decision.
// Concurrency and commits are labor/repair-commit.test.ts's.
import {
  approvals,
  auditLog,
  companies,
  dayCloseouts,
  dayCloseoutWorkers,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import { sessionApprovals } from "../../src/labor/approval";
import { readWorkerEvents } from "../../src/labor/timeline";
import {
  appCallerIn,
  asTenant,
  auditRow,
  auditRowsIn,
  boundIn,
  crewDayIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  type CrewDay,
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

const repair = (tx: Tx, who: unknown, workerId: string, operations: Op[]) =>
  appCallerIn(tx, who).labor.repair({ workerId, operations });

// Back to the owner, to write fixtures or look past RLS, then the runtime role again.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

// A crew day with two admins: `admin` repairs, `admin2` decides.
async function world(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const admin2 = await boundIn(tx, d.companyId, "admin");
  return { d, admin, admin2 };
}

const ev = (
  tx: Tx,
  d: CrewDay,
  worker: string,
  type: Positional,
  hhmm: string,
  job = d.J,
) => eventIn(tx, d, { worker, job, type, client: T(hhmm) });

// Every row a rejection must leave as it was, read as the owner.
async function counts(tx: Tx, d: CrewDay) {
  return asOwner(tx, d, async () => {
    const [e] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.companyId, d.companyId));
    const [a] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(approvals)
      .where(eq(approvals.companyId, d.companyId));
    const [u] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.companyId, d.companyId));
    return { events: e!.n, approvals: a!.n, audit: u!.n };
  });
}

// One accepted repair's audit row: the set's ids, kinds and targets, and nothing else.
const repaired = (
  d: CrewDay,
  actor: string,
  workerId: string,
  events: { id: string; kind: Op["kind"]; target_event_id: string | null }[],
) =>
  auditRow(d.companyId, actor, "work_session_events.repair", null, {
    after: { worker_id: workerId, events },
  });

async function rejectsWritingNothing(
  tx: Tx,
  d: CrewDay,
  call: () => Promise<unknown>,
  expected: Record<string, unknown>,
) {
  const before = await counts(tx, d);
  expect(await call()).toEqual({ result: "rejected", ...expected });
  expect(await counts(tx, d)).toEqual(before);
}

const approvalOf = async (tx: Tx, eventId: string) =>
  (await tx.select().from(approvals).where(eq(approvals.eventId, eventId)))[0];

const decide = async (
  tx: Tx,
  who: unknown,
  eventId: string,
  decision: "approved" | "rejected",
) =>
  appCallerIn(tx, who).approval.decide({
    approvalId: (await approvalOf(tx, eventId))!.id,
    decision,
  });

// The A1 accounting of every session of one worker, from the stored ledger and decisions.
async function accounting(tx: Tx, worker: string) {
  const ledger = await readWorkerEvents(tx, worker);
  const rows = await tx
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

describe("labor.repair — who may repair", () => {
  it("admits an active admin only; anything else answers as a gate does", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await world(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await asTenant(tx, d.companyId);
      const ops = () => [append("started", d.J, "08:00")];
      expect(await outcome(repair(tx, null, d.w1, ops()))).toBe("UNAUTHORIZED");
      expect(await outcome(repair(tx, gone.who, d.w1, ops()))).toBe("UNAUTHORIZED");
      expect(await outcome(repair(tx, worker.who, d.w1, ops()))).toBe("FORBIDDEN");
      expect(await outcome(repair(tx, d.who, d.w1, ops()))).toBe("FORBIDDEN");
      expect(await counts(tx, d)).toEqual({ events: 0, approvals: 0, audit: 0 });
    });
  });

  it("audits an admin's repair of their own ledger as their own act", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await asTenant(tx, d.companyId);
      const start = append("started", d.J, "08:00");
      expect((await repair(tx, admin.who, admin.id, [start])).result).toBe("accepted");
      expect(await auditRowsIn(tx, d.companyId)).toEqual([
        repaired(d, admin.id, admin.id, [
          { id: start.id, kind: "append", target_event_id: null },
        ]),
      ]);
    });
  });

  it("refuses a set repeating an id or naming one of its own", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await asTenant(tx, d.companyId);
      const start = append("started", d.J, "08:00");
      expect(await outcome(repair(tx, admin.who, d.w1, [start, start]))).toBe(
        "BAD_REQUEST",
      );
      expect(await outcome(repair(tx, admin.who, d.w1, [start, voidOf(start.id)]))).toBe(
        "BAD_REQUEST",
      );
      expect(await outcome(repair(tx, admin.who, d.w1, []))).toBe("BAD_REQUEST");
    });
  });

  it("is one FORBIDDEN for a worker or job that is missing or another tenant's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await crewDayIn(tx);
      await asTenant(tx, d.companyId);
      const before = await counts(tx, d);
      for (const [worker, job] of [
        [other.w1, d.J],
        [uuidv7(), d.J],
        [d.w1, other.J],
        [d.w1, uuidv7()],
      ] as const) {
        const answer = await outcome(
          repair(tx, admin.who, worker, [append("started", job, "08:00")]),
        );
        expect(answer).toBe("FORBIDDEN");
      }
      expect(await counts(tx, d)).toEqual(before);
    });
  });

  it("names another worker's or tenant's event as missing, never revealing it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await crewDayIn(tx);
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
        await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [c]), {
          code: "target_missing",
          eventId: c.id,
        });
        const v = voidOf(target);
        await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [v]), {
          code: "target_missing",
          eventId: v.id,
        });
      }
    });
  });

  it("repairs a deactivated worker's labor on an archived job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1));
      await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      await asTenant(tx, d.companyId);
      const r = await repair(tx, admin.who, d.w1, [append("ended", d.J, "16:00")]);
      expect(r.result).toBe("accepted");
    });
  });
});

describe("labor.repair — append, correct, void", () => {
  it("appends a forgotten clock-out as an office event, pending", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await asTenant(tx, d.companyId);
      const end = append("ended", d.J, "16:00");
      const r = await repair(tx, admin.who, d.w1, [end]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: end.id, reasons: ["user_timed", "location"] }],
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
        attestationLevel: "none",
        timeSetByUser: true,
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
        locationLat: null,
        schemaVersion: 1,
        correctsEventId: null,
        voidsEventId: null,
      });
      expect(row!.serverTimestamp).toEqual(
        r.result === "accepted" ? r.events[0]!.serverTimestamp : null,
      );
      expect(await approvalOf(tx, end.id)).toMatchObject({
        reasons: ["user_timed", "location"],
        decision: null,
      });
      expect(await accounting(tx, d.w1)).toEqual([
        {
          rootEventId: start,
          accounting: "pending",
          eligibleWorkedMs: 0,
          complete: true,
        },
      ]);
      await decide(tx, admin2.who, end.id, "approved");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "eligible",
        eligibleWorkedMs: 8 * HOUR,
      });
    });
  });

  it("corrects a clock-out; the correction is in effect", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "18:00");
      await asTenant(tx, d.companyId);
      const c = correct(end, "ended", d.J, "16:00");
      const r = await repair(tx, admin.who, d.w1, [c]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: c.id, reasons: ["corrected", "user_timed", "location"] }],
      });
      const ledger = await readWorkerEvents(tx, d.w1);
      const { structural } = sessionApprovals(ledger, new Map());
      expect(structural.winners.get(end)).toBe(c.id);
      expect(structural.sessions[0]!.workedMs).toBe(8 * HOUR);
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
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [c]), {
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
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [start]), {
        code: "breaks_following_event",
        eventId: start.id,
        conflictingEventId: later,
      });
      const end = append("ended", d.J, "12:00");
      expect((await repair(tx, admin.who, d.w1, [start, end])).result).toBe("accepted");
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
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [pause]), {
        code: "breaks_following_event",
        eventId: pause.id,
        conflictingEventId: laterPause,
      });
      const resume = append("resumed", d.J, "10:15");
      expect((await repair(tx, admin.who, d.w1, [pause, resume])).result).toBe(
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
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [c]), {
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
      expect((await repair(tx, admin.who, d.w1, [c])).result).toBe("accepted");
      const { structural } = sessionApprovals(
        await readWorkerEvents(tx, d.w1),
        new Map(),
      );
      expect(structural.sessions[0]!.jobId).toBe(d.K);
      // A pause, resume or end keeps its root's job.
      const end = (await readWorkerEvents(tx, d.w1)).find((e) => e.type === "ended")!;
      const wrong = correct(end.id, "ended", d.K, "15:00");
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [wrong]), {
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
      expect((await repair(tx, admin.who, d.w1, [fix])).result).toBe("accepted");
      const onEnd = voidOf(end);
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [onEnd]), {
        code: "void_target_not_started",
        eventId: onEnd.id,
      });
      const onCorrection = voidOf(fix.id);
      await rejectsWritingNothing(
        tx,
        d,
        () => repair(tx, admin.who, d.w1, [onCorrection]),
        { code: "target_is_correction", eventId: onCorrection.id },
      );
      const v = voidOf(start);
      const r = await repair(tx, admin.who, d.w1, [v]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ id: v.id, reasons: ["corrected"] }],
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
      });
      expect(row!.clientTimestamp).toEqual(row!.serverTimestamp);
      const again = voidOf(start);
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [again]), {
        code: "already_voided",
        eventId: again.id,
      });
      // Positional corrections stay legal after a void.
      const later = correct(end, "ended", d.J, "15:00");
      expect((await repair(tx, admin.who, d.w1, [later])).result).toBe("accepted");
      // One audit row per accepted repair, in order; the three rejections left none. A
      // void's row names its target and carries no job and no time.
      expect(await auditRowsIn(tx, d.companyId)).toEqual([
        repaired(d, admin.id, d.w1, [
          { id: fix.id, kind: "correct", target_event_id: start },
        ]),
        repaired(d, admin.id, d.w1, [{ id: v.id, kind: "void", target_event_id: start }]),
        repaired(d, admin.id, d.w1, [
          { id: later.id, kind: "correct", target_event_id: end },
        ]),
      ]);
    });
  });

  it("refuses a time after the repair's receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      await asTenant(tx, d.companyId);
      const end = {
        ...append("ended", d.J, "16:00"),
        clientTimestamp: new Date(Date.now() + HOUR),
      };
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [end]), {
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
      expect((await repair(tx, admin.who, d.w1, [first])).result).toBe("accepted");
      // Made from the view before the first correction.
      const stale = correct(end, "ended", d.J, "17:00");
      await rejectsWritingNothing(tx, d, () => repair(tx, admin2.who, d.w1, [stale]), {
        code: "repair_stale",
        eventId: stale.id,
        conflictingEventId: first.id,
      });
      const current = correct(end, "ended", d.J, "17:00", first.id);
      expect((await repair(tx, admin2.who, d.w1, [current])).result).toBe("accepted");
    });
  });
});

describe("labor.repair — approvals and accounting", () => {
  it("recovers a rejected start by correcting it at exactly its time and job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      await ev(tx, d, d.w1, "ended", "16:00");
      await tx.insert(approvals).values({
        companyId: d.companyId,
        eventId: start,
        reasons: ["offline"],
      });
      await asTenant(tx, d.companyId);
      await decide(tx, admin2.who, start, "rejected");
      const rejectedRow = await approvalOf(tx, start);
      const [startRow] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start));
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "rejected",
        eligibleWorkedMs: 0,
      });
      const before = await counts(tx, d);

      const same = correct(start, "started", d.J, "08:00");
      expect(await repair(tx, admin.who, d.w1, [same])).toMatchObject({
        result: "accepted",
        events: [{ id: same.id, reasons: ["corrected", "user_timed", "location"] }],
      });
      expect(await counts(tx, d)).toEqual({
        events: before.events + 1,
        approvals: before.approvals + 1,
        audit: before.audit + 1,
      });
      expect((await accounting(tx, d.w1))[0]).toMatchObject({ accounting: "pending" });

      await decide(tx, admin2.who, same.id, "approved");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "eligible",
        eligibleWorkedMs: 8 * HOUR,
      });
      // The rejection stands, moot; the source is untouched.
      expect(await approvalOf(tx, start)).toEqual(rejectedRow);
      const [after] = await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.id, start));
      expect(after).toEqual(startRow);
    });
  });

  it("recovers a rejected end with a different time", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "16:00");
      await tx
        .insert(approvals)
        .values({ companyId: d.companyId, eventId: end, reasons: ["offline"] });
      await asTenant(tx, d.companyId);
      await decide(tx, admin2.who, end, "rejected");
      const c = correct(end, "ended", d.J, "15:00");
      expect((await repair(tx, admin.who, d.w1, [c])).result).toBe("accepted");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({ accounting: "pending" });
      await decide(tx, admin2.who, c.id, "approved");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "eligible",
        eligibleWorkedMs: 7 * HOUR,
      });
    });
  });

  it("keeps a rejected void in history: corrections still land, a second void does not", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      const start = await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "16:00");
      await asTenant(tx, d.companyId);
      const v = voidOf(start);
      expect((await repair(tx, admin.who, d.w1, [v])).result).toBe("accepted");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({ accounting: "pending" });
      await decide(tx, admin2.who, v.id, "rejected");
      expect((await accounting(tx, d.w1))[0]).toMatchObject({
        accounting: "eligible",
        eligibleWorkedMs: 8 * HOUR,
      });
      const c = correct(end, "ended", d.J, "15:00");
      expect((await repair(tx, admin.who, d.w1, [c])).result).toBe("accepted");
      const again = voidOf(start);
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, [again]), {
        code: "already_voided",
        eventId: again.id,
      });
    });
  });

  it("lets the repairing admin decide, never the worker", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const start = await eventIn(tx, d, {
        worker: worker.id,
        job: d.J,
        type: "started",
        client: T("08:00"),
      });
      await asTenant(tx, d.companyId);
      const end = append("ended", d.J, "16:00");
      expect((await repair(tx, admin.who, worker.id, [end])).result).toBe("accepted");
      expect(start).toBeDefined();
      // The worker is no admin, so decide's gate answers first; the database refuses too (0025).
      expect(await outcome(decide(tx, worker.who, end.id, "approved"))).toBe("FORBIDDEN");
      expect(await decide(tx, admin.who, end.id, "approved")).toMatchObject({
        result: "decided",
      });
      // The repair and its decision are both audited, each as the admin's (ARCHITECTURE).
      expect(
        (await auditRowsIn(tx, d.companyId)).map((r) => [r.action, r.actorUserId]),
      ).toEqual([
        ["work_session_events.repair", admin.id],
        ["approvals.decide", admin.id],
      ]);
    });
  });
});

describe("labor.repair — retries and ids", () => {
  it("answers a retry as the first call, ignoring the unstored precondition", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await world(tx);
      await ev(tx, d, d.w1, "started", "08:00");
      const end = await ev(tx, d, d.w1, "ended", "18:00");
      await asTenant(tx, d.companyId);
      const ops = [correct(end, "ended", d.J, "16:00"), append("started", d.J, "19:00")];
      const first = await repair(tx, admin.who, d.w1, ops);
      expect(first.result).toBe("accepted");
      // One row for the set of two, in input order; every retry below adds none (counts).
      expect(await auditRowsIn(tx, d.companyId)).toEqual([
        repaired(d, admin.id, d.w1, [
          { id: ops[0]!.id, kind: "correct", target_event_id: end },
          { id: ops[1]!.id, kind: "append", target_event_id: null },
        ]),
      ]);
      const before = await counts(tx, d);
      const events = first.result === "accepted" ? first.events : [];
      expect(await repair(tx, admin.who, d.w1, ops)).toEqual({
        result: "duplicate",
        events,
      });
      // replacesEventId is a precondition, never stored: a retry naming another still matches.
      const renamed = [{ ...ops[0]!, replacesEventId: uuidv7() }, ops[1]!];
      expect(await repair(tx, admin.who, d.w1, renamed)).toEqual({
        result: "duplicate",
        events,
      });
      expect(await counts(tx, d)).toEqual(before);

      // A changed time, another admin, or part of the set alongside a new id: a conflict.
      const moved = [{ ...ops[0]!, clientTimestamp: at("16:30") }, ops[1]!];
      await rejectsWritingNothing(tx, d, () => repair(tx, admin.who, d.w1, moved), {
        code: "id_conflict",
        conflictingEventId: ops[0]!.id,
      });
      await rejectsWritingNothing(tx, d, () => repair(tx, admin2.who, d.w1, ops), {
        code: "id_conflict",
        conflictingEventId: ops[0]!.id,
      });
      await rejectsWritingNothing(
        tx,
        d,
        () => repair(tx, admin.who, d.w1, [ops[1]!, append("ended", d.J, "20:00")]),
        { code: "id_conflict", conflictingEventId: ops[1]!.id },
      );
    });
  });

  it("answers an id another tenant holds with id_conflict, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await world(tx);
      const other = await crewDayIn(tx);
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
        () => repair(tx, admin.who, d.w1, [fresh, colliding]),
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
      const first = await repair(tx, admin.who, d.w1, ops);
      const again = await repair(tx, admin.who, d.w1, ops);
      for (const r of [first, again]) {
        expect(r.result === "rejected" ? [] : r.events.map((e) => e.id)).toEqual(
          ops.map((o) => o.id),
        );
      }
      expect(again).toEqual({ ...first, result: "duplicate" });
    });
  });
});

describe("labor.repair — closed days", () => {
  // A closed day on J, 5 October in New York: w1 08:00–12:00 local, submitted by the foreman.
  async function closedDay(tx: Tx) {
    const w = await world(tx);
    const { d } = w;
    const start = await eventIn(tx, d, {
      worker: d.w1,
      job: d.J,
      type: "started",
      client: "2026-10-05T12:00:00Z",
    });
    const end = await eventIn(tx, d, {
      worker: d.w1,
      job: d.J,
      type: "ended",
      client: "2026-10-05T16:00:00Z",
    });
    await asTenant(tx, d.companyId);
    const values = { jobId: d.J, workDate: "2026-10-05" };
    const { fingerprint } = await appCallerIn(tx, d.who).closeout.review(values);
    const submitted = await appCallerIn(tx, d.who).closeout.submit({
      ...values,
      id: uuidv7(),
      jobStatus: "open",
      note: null,
      clientTimestamp: new Date("2026-10-05T21:00:00Z"),
      reviewFingerprint: fingerprint,
    });
    expect(submitted.result).toBe("accepted");
    const snapshot = () =>
      asOwner(tx, d, async () => ({
        closeouts: await tx
          .select()
          .from(dayCloseouts)
          .where(eq(dayCloseouts.jobId, d.J)),
        marks: await tx
          .select()
          .from(dayCloseoutWorkers)
          .where(eq(dayCloseoutWorkers.companyId, d.companyId)),
      }));
    return { ...w, start, end, snapshot };
  }

  it("tags a correction of a closed day after_closeout and leaves the closeout as it was", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, end, snapshot } = await closedDay(tx);
      const before = await snapshot();
      const c = correct(end, "ended", d.J, "15:00");
      const r = await repair(tx, admin.who, d.w1, [c]);
      expect(r).toMatchObject({
        result: "accepted",
        events: [{ reasons: ["corrected", "user_timed", "location", "after_closeout"] }],
      });
      expect(await snapshot()).toEqual(before);
      const stamp = r.result === "accepted" ? r.events[0]!.serverTimestamp : new Date(0);
      for (const mark of before.marks) {
        expect(stamp.getTime()).toBeGreaterThan(mark.ledgerThrough.getTime());
      }
    });
  });

  it("judges the closed day in the closeout's stored zone, not the company's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, end } = await closedDay(tx);
      // UTC+14: the session's start would fall on 6 October in the company's new zone.
      await asOwner(tx, d, () =>
        tx
          .update(companies)
          .set({ timezone: "Pacific/Kiritimati" })
          .where(eq(companies.id, d.companyId)),
      );
      const c = correct(end, "ended", d.J, "15:00");
      expect(await repair(tx, admin.who, d.w1, [c])).toMatchObject({
        events: [{ reasons: ["corrected", "user_timed", "location", "after_closeout"] }],
      });
    });
  });

  it("judges a re-attributed session on its new job's day; the old day stays sealed", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, start, snapshot } = await closedDay(tx);
      const before = await snapshot();
      const c = {
        ...correct(start, "started", d.K, "12:00"),
        clientTimestamp: new Date("2026-10-05T12:00:00Z"),
      };
      expect(await repair(tx, admin.who, d.w1, [c])).toMatchObject({
        result: "accepted",
        events: [{ reasons: ["corrected", "user_timed", "location"] }],
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  it("voids a closed day's session after_closeout", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, start } = await closedDay(tx);
      const v = voidOf(start);
      expect(await repair(tx, admin.who, d.w1, [v])).toMatchObject({
        events: [{ reasons: ["corrected", "after_closeout"] }],
      });
    });
  });
});
