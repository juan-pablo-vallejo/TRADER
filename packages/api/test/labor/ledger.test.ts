// Stage 4: labor.ledger, the office's read of one worker's sessions and the events behind
// them, through the application's router under the runtime role in rolled-back transactions.
// Fixtures are written by the owner; the one repair here goes through labor.repair itself, to
// show the read hands it the ids it needs.
import {
  approvals,
  auditLog,
  dayCloseouts,
  jobs,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  crewDayIn,
  eventIn,
  outcome,
  ownerDb,
  pendingApproval,
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
const DAY = "2026-10-05";
// 5 October in New York is UTC−4: 12:00Z is 08:00 there.
const T = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;
const WEEK = { from: "2026-10-05", to: "2026-10-11" };

const ledger = (
  tx: Tx,
  who: unknown,
  workerId: string,
  range: { from: string; to: string } = WEEK,
) => appCallerIn(tx, who).labor.ledger({ workerId, ...range });

async function office(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  return { d, admin };
}

// A started-and-ended session of `worker` on `job`.
async function shift(
  tx: Tx,
  d: CrewDay,
  worker: string,
  start: string,
  end: string,
  job = d.J,
) {
  const started = await eventIn(tx, d, { worker, job, type: "started", client: start });
  const ended = await eventIn(tx, d, { worker, job, type: "ended", client: end });
  return { started, ended };
}

async function decide(
  tx: Tx,
  approvalId: string,
  by: string,
  decision: "approved" | "rejected",
) {
  await tx
    .update(approvals)
    .set({ decision, decidedAt: new Date("2026-10-06T12:00:00Z"), decidedByUserId: by })
    .where(eq(approvals.id, approvalId));
}

async function closeoutIn(tx: Tx, d: CrewDay, jobId: string, workDate: string) {
  const at = new Date(`${workDate}T22:00:00.000Z`);
  await tx.insert(dayCloseouts).values({
    id: uuidv7(),
    companyId: d.companyId,
    jobId,
    workDate,
    timezone: "America/New_York",
    jobStatus: "open",
    jobStatusApplied: true,
    note: null,
    submittedByUserId: d.foremanId,
    clientTimestamp: at,
    serverTimestamp: at,
    workerMarkCount: 0,
    materialCount: 0,
  });
}

describe("labor.ledger", () => {
  it("is the office's alone, and of the caller's company alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const other = await crewDayIn(tx);
      await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      await shift(tx, other, other.w1, T("12:00"), T("16:00"));
      const worker = await boundIn(tx, d.companyId, "worker");
      await becomeApp(tx);

      for (const who of [worker.who, d.who]) {
        expect(await outcome(ledger(tx, who, d.w1))).toBe("FORBIDDEN");
      }
      expect(await outcome(ledger(tx, null, d.w1))).toBe("UNAUTHORIZED");
      // Another company's person and nobody at all are the same answer.
      for (const id of [other.w1, crypto.randomUUID()]) {
        expect([id, await outcome(ledger(tx, admin.who, id))]).toEqual([id, "FORBIDDEN"]);
      }
      const mine = await ledger(tx, admin.who, d.w1);
      expect(mine.sessions).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toContain(other.w1);
    });
  });

  it("reads a recorded day: raw events, the fold's session, approved by default", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const { started, ended } = await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      await becomeApp(tx);
      const r = await ledger(tx, admin.who, d.w1);
      expect(r.worker).toEqual({ id: d.w1, name: "w1", role: "worker", active: true });
      expect(r.timezone).toBe("America/New_York");
      expect(r.openSession).toBeNull();
      expect(r.sessions).toEqual([
        {
          rootEventId: started,
          workDate: DAY,
          job: { id: d.J, name: "J", status: "open" },
          startedAt: new Date(T("12:00")),
          endedAt: new Date(T("16:00")),
          state: "ended",
          complete: true,
          structuralWorkedMs: 4 * HOUR,
          breakMs: 0,
          accounting: "eligible",
          eligibleWorkedMs: 4 * HOUR,
          corrected: false,
          closedOut: false,
          events: [started, ended].map((id, i) => ({
            id,
            type: i === 0 ? "started" : "ended",
            job: { id: d.J, name: "J" },
            clientTimestamp: new Date(T(i === 0 ? "12:00" : "16:00")),
            serverTimestamp: new Date(T(i === 0 ? "12:00" : "16:00")),
            initiator: { id: d.w1, name: "w1" },
            clockSkewed: false,
            clockSkewMs: 0,
            timeSetByUser: false,
            capturedOffline: false,
            attestationLevel: "none",
            hasLocation: false,
            correctsEventId: null,
            voidsEventId: null,
            effect: "in_effect",
            approval: null,
          })),
        },
      ]);
      // No coordinates, cost or rate cross.
      expect(JSON.stringify(r)).not.toMatch(/locationLat|location_lat|cost|rate/i);
    });
  });

  it("keeps the sessions whose work date is in the range, both ends included", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // A night shift is wholly its first day; a start at 03:30Z is the evening before.
      const sunday = await shift(
        tx,
        d,
        d.w1,
        T("12:00", "2026-10-04"),
        T("13:00", "2026-10-04"),
      );
      const first = await shift(
        tx,
        d,
        d.w1,
        T("03:30", "2026-10-05"),
        T("03:45", "2026-10-05"),
      );
      const monday = await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      const night = await shift(
        tx,
        d,
        d.w1,
        T("02:00", "2026-10-12"),
        T("06:00", "2026-10-12"),
      );
      const after = await shift(
        tx,
        d,
        d.w1,
        T("12:00", "2026-10-12"),
        T("13:00", "2026-10-12"),
      );
      await becomeApp(tx);

      const week = await ledger(tx, admin.who, d.w1);
      expect(week.sessions.map((s) => [s.rootEventId, s.workDate])).toEqual([
        [monday.started, "2026-10-05"],
        [night.started, "2026-10-11"],
      ]);
      const sundayOnly = await ledger(tx, admin.who, d.w1, {
        from: "2026-10-04",
        to: "2026-10-04",
      });
      expect(sundayOnly.sessions.map((s) => s.rootEventId)).toEqual([
        sunday.started,
        first.started,
      ]);
      const next = await ledger(tx, admin.who, d.w1, {
        from: "2026-10-12",
        to: "2026-10-12",
      });
      expect(next.sessions.map((s) => s.rootEventId)).toEqual([after.started]);

      for (const bad of [
        { from: "2026-10-11", to: "2026-10-05" },
        { from: "2026-10-01", to: "2026-11-01" },
        { from: "2026-10-05", to: "10/11/2026" },
      ]) {
        expect([bad, await outcome(ledger(tx, admin.who, d.w1, bad))]).toEqual([
          bad,
          "BAD_REQUEST",
        ]);
      }
      // 31 days is the bound, not past it.
      expect(
        (await ledger(tx, admin.who, d.w1, { from: "2026-10-01", to: "2026-10-31" }))
          .sessions,
      ).toHaveLength(5);
    });
  });

  it("orders events by recorded time, then receipt, then id, the same on every read", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const started = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: T("12:00"),
      });
      // A pause and a resume at one recorded instant: the receipt orders them.
      const paused = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "paused",
        client: T("13:00"),
        server: T("13:00"),
      });
      const resumed = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "resumed",
        client: T("13:00"),
        server: T("13:01"),
      });
      const ended = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "ended",
        client: T("16:00"),
      });
      // Two corrections of the end at one recorded instant, the first received holding the
      // larger id: receipt decides before the id does.
      const correction = async (idMs: string, server: string) => {
        const id = uuidv7(new Date(idMs).getTime());
        await tx.insert(workSessionEvents).values({
          id,
          companyId: d.companyId,
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: new Date(T("17:00")),
          serverTimestamp: new Date(server),
          clockSkewed: false,
          clockSkewMs: 0,
          attestationLevel: "none",
          schemaVersion: 1,
          timeSetByUser: true,
          capturedOffline: false,
          initiatorUserId: admin.id,
          correctsEventId: ended,
        });
        return id;
      };
      const firstReceived = await correction(T("21:00"), T("18:00"));
      const secondReceived = await correction(T("20:00"), T("19:00"));
      // And two received together, written larger id first: the id decides last.
      const largerId = await correction(T("23:00"), T("22:00"));
      const smallerId = await correction(T("22:30"), T("22:00"));
      await becomeApp(tx);
      const a = await ledger(tx, admin.who, d.w1);
      const b = await ledger(tx, admin.who, d.w1);
      expect(a.sessions[0]!.events.map((e) => e.id)).toEqual([
        started,
        paused,
        resumed,
        ended,
        firstReceived,
        secondReceived,
        smallerId,
        largerId,
      ]);
      expect(b).toEqual(a);
    });
  });

  it("shows each approval as stored and the session's accounting by the authorized precedence", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const pending = await shift(tx, d, d.w1, T("12:00"), T("13:00"));
      const approved = await shift(tx, d, d.w1, T("14:00"), T("15:00"));
      const rejected = await shift(tx, d, d.w1, T("16:00"), T("17:00"));
      const p = await pendingApproval(tx, d.companyId, { eventId: pending.started }, [
        "offline",
        "location",
      ]);
      const a = await pendingApproval(tx, d.companyId, { eventId: approved.started });
      const r = await pendingApproval(tx, d.companyId, { eventId: rejected.ended }, [
        "clock_skewed",
      ]);
      await decide(tx, a, admin.id, "approved");
      await decide(tx, r, admin.id, "rejected");
      await becomeApp(tx);

      const { sessions } = await ledger(tx, admin.who, d.w1);
      expect(sessions.map((s) => [s.accounting, s.eligibleWorkedMs])).toEqual([
        ["pending", 0],
        ["eligible", HOUR],
        ["rejected", 0],
      ]);
      // The structure never depends on a decision.
      expect(sessions.map((s) => s.structuralWorkedMs)).toEqual([HOUR, HOUR, HOUR]);
      expect(sessions[0]!.events[0]!.approval).toEqual({
        id: p,
        reasons: ["offline", "location"],
        decision: "pending",
        decidedAt: null,
        decidedBy: null,
      });
      expect(sessions[0]!.events[1]!.approval).toBeNull();
      expect(sessions[1]!.events[0]!.approval).toMatchObject({
        id: a,
        decision: "approved",
        decidedAt: new Date("2026-10-06T12:00:00Z"),
        decidedBy: { id: admin.id },
      });
      expect(sessions[2]!.events[1]!.approval).toMatchObject({
        id: r,
        reasons: ["clock_skewed"],
        decision: "rejected",
      });
    });
  });

  it("keeps a corrected event beside its correction, and hands labor.repair its ids", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const { started, ended } = await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      await becomeApp(tx);

      const before = (await ledger(tx, admin.who, d.w1)).sessions[0]!;
      const end = before.events.find((e) => e.type === "ended")!;
      expect([end.id, end.effect, before.corrected]).toEqual([ended, "in_effect", false]);

      // The first correction, from what the read shows: the root, and its source in effect.
      const fix = uuidv7();
      const first = await appCallerIn(tx, admin.who).labor.repair({
        workerId: d.w1,
        operations: [
          {
            kind: "correct",
            id: fix,
            correctsEventId: end.correctsEventId ?? end.id,
            replacesEventId: end.id,
            type: "ended",
            jobId: d.J,
            clientTimestamp: new Date(T("17:00")),
          },
        ],
      });
      expect(first.result).toBe("accepted");

      const once = (await ledger(tx, admin.who, d.w1)).sessions[0]!;
      expect(once.events.map((e) => [e.id, e.effect])).toEqual([
        [started, "in_effect"],
        [ended, "superseded"],
        [fix, "in_effect"],
      ]);
      expect(once).toMatchObject({
        rootEventId: started,
        endedAt: new Date(T("17:00")),
        structuralWorkedMs: 5 * HOUR,
        corrected: true,
        accounting: "pending",
        eligibleWorkedMs: 0,
      });
      const correction = once.events[2]!;
      expect(correction).toMatchObject({
        correctsEventId: ended,
        initiator: { id: admin.id },
        timeSetByUser: true,
        approval: { decision: "pending" },
      });
      expect(correction.approval!.reasons).toContain("corrected");

      // A second correction names the same root and replaces the first.
      const again = uuidv7();
      const second = await appCallerIn(tx, admin.who).labor.repair({
        workerId: d.w1,
        operations: [
          {
            kind: "correct",
            id: again,
            correctsEventId: correction.correctsEventId!,
            replacesEventId: correction.id,
            type: "ended",
            jobId: d.J,
            clientTimestamp: new Date(T("16:30")),
          },
        ],
      });
      expect(second.result).toBe("accepted");
      const twice = (await ledger(tx, admin.who, d.w1)).sessions[0]!;
      expect(twice.events.map((e) => [e.id, e.effect])).toEqual([
        [started, "in_effect"],
        [ended, "superseded"],
        [again, "in_effect"],
        [fix, "superseded"],
      ]);
      expect(twice.endedAt).toEqual(new Date(T("16:30")));
    });
  });

  it("shows a void under its session, counted by its decision", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const kept = await shift(tx, d, d.w1, T("12:00"), T("13:00"));
      const gone = await shift(tx, d, d.w1, T("14:00"), T("15:00"));
      const waiting = await shift(tx, d, d.w1, T("16:00"), T("17:00"));
      const voidOf = async (root: string, hhmm: string) =>
        eventIn(tx, d, {
          worker: d.w1,
          job: d.J,
          type: "voided",
          client: T(hhmm, "2026-10-06"),
          voids: root,
          initiator: admin.id,
        });
      const v1 = await voidOf(kept.started, "12:00");
      const v2 = await voidOf(gone.started, "12:01");
      const v3 = await voidOf(waiting.started, "12:02");
      const a1 = await pendingApproval(tx, d.companyId, { eventId: v1 }, ["corrected"]);
      const a2 = await pendingApproval(tx, d.companyId, { eventId: v2 }, ["corrected"]);
      await pendingApproval(tx, d.companyId, { eventId: v3 }, ["corrected"]);
      await decide(tx, a1, admin.id, "rejected");
      await decide(tx, a2, admin.id, "approved");
      await becomeApp(tx);

      const { sessions } = await ledger(tx, admin.who, d.w1);
      // A void is recorded the day after and still read with the session it names.
      expect(sessions.map((s) => s.events.at(-1))).toMatchObject([
        { id: v1, type: "voided", effect: "void", voidsEventId: kept.started },
        { id: v2, type: "voided", effect: "void", voidsEventId: gone.started },
        { id: v3, type: "voided", effect: "void", voidsEventId: waiting.started },
      ]);
      // A rejected void is disregarded; an approved one zeroes; a pending one waits.
      expect(sessions.map((s) => [s.accounting, s.eligibleWorkedMs])).toEqual([
        ["eligible", HOUR],
        ["voided", 0],
        ["pending", 0],
      ]);
    });
  });

  it("reads an open session, and points at one the range does not hold", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, T("12:00"), T("13:00"));
      const open = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: T("14:00"),
      });
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "paused",
        client: T("15:00"),
      });
      await becomeApp(tx);

      const inRange = await ledger(tx, admin.who, d.w1);
      expect(inRange.openSession).toEqual({ rootEventId: open, workDate: DAY });
      expect(inRange.sessions[1]).toMatchObject({
        rootEventId: open,
        endedAt: null,
        state: "paused",
        complete: false,
        structuralWorkedMs: HOUR,
      });
      const later = await ledger(tx, admin.who, d.w1, {
        from: "2026-10-20",
        to: "2026-10-26",
      });
      expect(later.sessions).toEqual([]);
      expect(later.openSession).toEqual({ rootEventId: open, workDate: DAY });
    });
  });

  it("marks a session on a closed-out day, by job and day", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, T("12:00"), T("13:00"));
      await shift(tx, d, d.w1, T("14:00"), T("15:00"), d.K);
      await shift(tx, d, d.w1, T("12:00", "2026-10-06"), T("13:00", "2026-10-06"));
      await closeoutIn(tx, d, d.J, DAY);
      await becomeApp(tx);
      const { sessions } = await ledger(tx, admin.who, d.w1);
      expect(sessions.map((s) => [s.job.name, s.workDate, s.closedOut])).toEqual([
        ["J", "2026-10-05", true],
        ["K", "2026-10-05", false],
        ["J", "2026-10-06", false],
      ]);
    });
  });

  it("reads an archived job, a deactivated worker and the admin's own ledger", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const gone = await boundIn(tx, d.companyId, "worker", { deactivated: true });
      await shift(tx, d, gone.id, T("12:00"), T("13:00"));
      await shift(tx, d, admin.id, T("12:00"), T("13:00"));
      await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      await becomeApp(tx);

      const theirs = await ledger(tx, admin.who, gone.id);
      expect(theirs.worker).toMatchObject({ id: gone.id, active: false });
      expect(theirs.sessions.map((s) => s.job.status)).toEqual(["archived"]);
      const own = await ledger(tx, admin.who, admin.id);
      expect(own.worker).toMatchObject({ id: admin.id, role: "admin" });
      expect(own.sessions).toHaveLength(1);
    });
  });

  it("writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const { started } = await shift(tx, d, d.w1, T("12:00"), T("13:00"));
      await pendingApproval(tx, d.companyId, { eventId: started });
      const counts = async () => {
        const n = async (
          table: typeof workSessionEvents | typeof approvals | typeof auditLog,
        ) =>
          (
            await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(table)
              .where(eq(table.companyId, d.companyId))
          )[0]!.n;
        return [await n(workSessionEvents), await n(approvals), await n(auditLog)];
      };
      const before = await counts();
      await becomeApp(tx);
      await ledger(tx, admin.who, d.w1);
      await tx.execute(sql`reset role`);
      await tx.execute(sql`select set_config('app.company_id', '', true)`);
      expect(await counts()).toEqual(before);
      expect(before).toEqual([2, 1, 0]);
    });
  });
});
