// Stage 4, hours and cost aggregation (V1-D13): labor.hours, the office's read of the hours
// that count per worker, job and work date, through the application's router under the
// runtime role in rolled-back transactions. Fixtures are written by the owner; the replayed
// push goes through the push's own writer.
import { approvals, auditLog, companies, workSessionEvents } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import { pushLaborEvent, type LaborRecord } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import {
  appCallerIn,
  asTenant,
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

const DAY = "2026-10-05";
// 5 October in New York is UTC−4: 12:00Z is 08:00 there.
const T = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;
const WEEK = { from: "2026-10-05", to: "2026-10-11" };

type Filter = { from?: string; to?: string; workerId?: string; jobId?: string };
const hours = (tx: Tx, who: unknown, filter: Filter = {}) =>
  appCallerIn(tx, who).labor.hours({ ...WEEK, ...filter });

async function office(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  return { d, admin };
}

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

// Back to the owner for fixtures and reads past RLS.
async function asOwner<T>(tx: Tx, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('app.company_id', '', true)`);
  const result = await body();
  await becomeApp(tx);
  return result;
}

const figures = (answer: Awaited<ReturnType<typeof hours>>) =>
  answer.cells.map((c) => [c.worker.id, c.job.id, c.workDate, c.approvedHundredths]);

describe("labor.hours", () => {
  it("is the office's alone, and of the caller's company alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const other = await crewDayIn(tx);
      await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      await shift(tx, other, other.w1, T("12:00"), T("20:00"));
      const worker = await boundIn(tx, d.companyId, "worker");
      await becomeApp(tx);

      for (const who of [worker.who, d.who]) {
        expect(await outcome(hours(tx, who))).toBe("FORBIDDEN");
      }
      expect(await outcome(hours(tx, null))).toBe("UNAUTHORIZED");
      // Another company's person or job, and nobody's at all, are the same answer.
      for (const workerId of [other.w1, crypto.randomUUID()]) {
        expect(await outcome(hours(tx, admin.who, { workerId }))).toBe("FORBIDDEN");
      }
      for (const jobId of [other.J, crypto.randomUUID()]) {
        expect(await outcome(hours(tx, admin.who, { jobId }))).toBe("FORBIDDEN");
      }
      const mine = await hours(tx, admin.who);
      expect(figures(mine)).toEqual([[d.w1, d.J, DAY, 400]]);
      expect(JSON.stringify(mine)).not.toContain(other.w1);
      expect(mine.timezone).toBe("America/New_York");
    });
  });

  it("rounds three sessions of 20 min 10 s once, on their sum, and names who and where", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      for (const hhmm of ["12:00", "13:00", "14:00"]) {
        const start = new Date(T(hhmm));
        const end = new Date(start.getTime() + 20 * 60_000 + 10_000);
        await shift(tx, d, d.w1, start.toISOString(), end.toISOString());
      }
      await becomeApp(tx);
      expect((await hours(tx, admin.who)).cells).toEqual([
        {
          worker: { id: d.w1, name: "w1" },
          job: { id: d.J, name: "J" },
          workDate: DAY,
          approvedHundredths: 101,
          pendingHundredths: 0,
          pendingSessions: 0,
          rejectedSessions: 0,
          openSessions: 0,
        },
      ]);
    });
  });

  it("keeps the work dates in the range, both ends included, and refuses a long or backward one", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      for (const day of ["2026-10-04", "2026-10-05", "2026-10-11", "2026-10-12"]) {
        await shift(tx, d, d.w1, T("12:00", day), T("13:00", day));
      }
      await becomeApp(tx);
      expect(figures(await hours(tx, admin.who)).map((f) => f[2])).toEqual([
        "2026-10-05",
        "2026-10-11",
      ]);
      expect(
        figures(await hours(tx, admin.who, { from: "2026-10-04", to: "2026-11-03" })),
      ).toHaveLength(4);
      expect(
        await outcome(hours(tx, admin.who, { from: "2026-10-04", to: "2026-11-04" })),
      ).toBe("BAD_REQUEST");
      expect(
        await outcome(hours(tx, admin.who, { from: "2026-10-06", to: "2026-10-05" })),
      ).toBe("BAD_REQUEST");
    });
  });

  it("gives a session to the day it started in the company's zone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // 22:00 on the 5th to 02:00 on the 6th in New York; 11:00 to 15:00 on the 6th in Tokyo.
      await shift(tx, d, d.w1, T("02:00", "2026-10-06"), T("06:00", "2026-10-06"));
      // 16:00 on the 4th in New York; 05:00 on the 5th in Tokyo.
      await shift(tx, d, d.w2, T("20:00", "2026-10-04"), T("21:00", "2026-10-04"));
      await becomeApp(tx);
      expect(figures(await hours(tx, admin.who))).toEqual([
        [d.w1, d.J, "2026-10-05", 400],
      ]);
      // A one-day range still finds a session recorded on the next day, UTC.
      expect(figures(await hours(tx, admin.who, { from: DAY, to: DAY }))).toEqual([
        [d.w1, d.J, "2026-10-05", 400],
      ]);
      expect(
        figures(await hours(tx, admin.who, { from: "2026-10-06", to: "2026-10-06" })),
      ).toEqual([]);

      await asOwner(tx, () =>
        tx
          .update(companies)
          .set({ timezone: "Asia/Tokyo" })
          .where(eq(companies.id, d.companyId)),
      );
      const tokyo = await hours(tx, admin.who, { from: "2026-10-06", to: "2026-10-06" });
      expect(tokyo.timezone).toBe("Asia/Tokyo");
      expect(figures(tokyo)).toEqual([[d.w1, d.J, "2026-10-06", 400]]);
      // And one recorded on the day before, UTC.
      expect(figures(await hours(tx, admin.who, { from: DAY, to: DAY }))).toEqual([
        [d.w2, d.J, "2026-10-05", 100],
      ]);
    });
  });

  it("answers one cell per worker, job and day, narrowed by person or job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, T("12:00"), T("14:00"));
      await shift(tx, d, d.w1, T("14:30"), T("18:00"), d.K);
      await shift(tx, d, d.w2, T("12:00"), T("20:00"));
      await shift(tx, d, d.w2, T("12:00", "2026-10-06"), T("13:15", "2026-10-06"));
      await becomeApp(tx);

      // Within a day, by worker id, then job id.
      const byIds = (a: (string | number)[], b: (string | number)[]) =>
        (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0) || (a[1]! < b[1]! ? -1 : 1);
      const on5th = [
        [d.w1, d.J, DAY, 200],
        [d.w1, d.K, DAY, 350],
        [d.w2, d.J, DAY, 800],
      ].sort(byIds);
      expect(figures(await hours(tx, admin.who))).toEqual([
        ...on5th,
        [d.w2, d.J, "2026-10-06", 125],
      ]);

      expect(figures(await hours(tx, admin.who, { workerId: d.w1 }))).toEqual(
        on5th.filter((f) => f[0] === d.w1),
      );
      expect(figures(await hours(tx, admin.who, { jobId: d.K }))).toEqual([
        [d.w1, d.K, DAY, 350],
      ]);
      expect(figures(await hours(tx, admin.who, { workerId: d.w2, jobId: d.K }))).toEqual(
        [],
      );
    });
  });

  it("sums the cells per worker and for the whole answer, and rounds nothing again", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // w1: 2.00 h on J and 3.50 h on K on the 5th. w2: 8.00 h on the 5th and 1.25 h on the
      // 6th, then a session that waits, one that was rejected and one still open.
      await shift(tx, d, d.w1, T("12:00"), T("14:00"));
      await shift(tx, d, d.w1, T("14:30"), T("18:00"), d.K);
      await shift(tx, d, d.w2, T("12:00"), T("20:00"));
      await shift(tx, d, d.w2, T("12:00", "2026-10-06"), T("13:15", "2026-10-06"));
      const waits = await shift(
        tx,
        d,
        d.w2,
        T("14:00", "2026-10-06"),
        T("16:00", "2026-10-06"),
      );
      await pendingApproval(tx, d.companyId, { eventId: waits.started });
      const refused = await shift(
        tx,
        d,
        d.w2,
        T("12:00", "2026-10-07"),
        T("13:00", "2026-10-07"),
      );
      const refusal = await pendingApproval(tx, d.companyId, { eventId: refused.ended });
      await tx
        .update(approvals)
        .set({
          decision: "rejected",
          decidedAt: new Date(T("12:00")),
          decidedByUserId: admin.id,
        })
        .where(eq(approvals.id, refusal));
      await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: T("12:00", "2026-10-08"),
      });
      await becomeApp(tx);

      const all = await hours(tx, admin.who);
      const w1 = {
        approvedHundredths: 550,
        pendingHundredths: 0,
        pendingSessions: 0,
        rejectedSessions: 0,
        openSessions: 0,
      };
      const w2 = {
        approvedHundredths: 925,
        pendingHundredths: 200,
        pendingSessions: 1,
        rejectedSessions: 1,
        openSessions: 1,
      };
      // By name: w1 before w2.
      expect(all.workers).toEqual([
        { worker: { id: d.w1, name: "w1" }, ...w1 },
        { worker: { id: d.w2, name: "w2" }, ...w2 },
      ]);
      expect(all.totals).toEqual({
        approvedHundredths: 1475,
        pendingHundredths: 200,
        pendingSessions: 1,
        rejectedSessions: 1,
        openSessions: 1,
      });
      // Every sum is the sum of the cells answered with it, figure by figure.
      const keys = Object.keys(w1) as (keyof typeof w1)[];
      for (const answer of [
        all,
        await hours(tx, admin.who, { workerId: d.w2 }),
        await hours(tx, admin.who, { jobId: d.K }),
        await hours(tx, admin.who, { from: "2026-10-06", to: "2026-10-06" }),
      ]) {
        for (const key of keys) {
          const of = (cells: typeof answer.cells) =>
            cells.reduce((sum, c) => sum + c[key], 0);
          expect(answer.totals[key]).toBe(of(answer.cells));
          for (const w of answer.workers) {
            expect(w[key]).toBe(
              of(answer.cells.filter((c) => c.worker.id === w.worker.id)),
            );
          }
        }
        expect(answer.workers.map((w) => w.worker.id).sort()).toEqual(
          [...new Set(answer.cells.map((c) => c.worker.id))].sort(),
        );
      }
      // Narrowed with the cells: one person, one job.
      expect((await hours(tx, admin.who, { workerId: d.w2 })).totals).toEqual(w2);
      expect((await hours(tx, admin.who, { jobId: d.K })).workers).toEqual([
        { worker: { id: d.w1, name: "w1" }, ...w1, approvedHundredths: 350 },
      ]);
    });
  });

  it("totals a rounded cell as it stands, and answers zeros for a range with nothing in it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // Two days of 20 min 10 s: 0.34 h each (0.336…), 0.68 h together — where the two
      // days' milliseconds, summed and rounded once more, would be 0.67 h.
      for (const day of [DAY, "2026-10-06"]) {
        const start = new Date(T("12:00", day));
        const end = new Date(start.getTime() + 20 * 60_000 + 10_000);
        await shift(tx, d, d.w1, start.toISOString(), end.toISOString());
      }
      await becomeApp(tx);
      const answer = await hours(tx, admin.who);
      expect(answer.cells.map((c) => c.approvedHundredths)).toEqual([34, 34]);
      expect(answer.totals.approvedHundredths).toBe(68);
      expect(answer.workers[0]?.approvedHundredths).toBe(68);

      expect(
        await hours(tx, admin.who, { from: "2026-09-01", to: "2026-09-07" }),
      ).toEqual({
        timezone: "America/New_York",
        cells: [],
        workers: [],
        totals: {
          approvedHundredths: 0,
          pendingHundredths: 0,
          pendingSessions: 0,
          rejectedSessions: 0,
          openSessions: 0,
        },
      });
    });
  });

  it("moves a session from pending to approved when it is decided, and never counts a rejected one", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const a = await shift(tx, d, d.w1, T("12:00"), T("14:00"));
      const b = await shift(tx, d, d.w1, T("15:00"), T("16:00"));
      const waiting = await pendingApproval(tx, d.companyId, { eventId: a.started });
      const refused = await pendingApproval(tx, d.companyId, { eventId: b.ended });
      await becomeApp(tx);
      const cell = async () => (await hours(tx, admin.who)).cells[0];

      expect(await cell()).toMatchObject({
        approvedHundredths: 0,
        pendingHundredths: 300,
        pendingSessions: 2,
      });
      const decide = (id: string, decision: "approved" | "rejected") =>
        asOwner(tx, () =>
          tx
            .update(approvals)
            .set({ decision, decidedAt: new Date(T("12:00")), decidedByUserId: admin.id })
            .where(eq(approvals.id, id)),
        );
      await decide(waiting, "approved");
      expect(await cell()).toMatchObject({
        approvedHundredths: 200,
        pendingHundredths: 100,
        pendingSessions: 1,
        rejectedSessions: 0,
      });
      await decide(refused, "rejected");
      expect(await cell()).toMatchObject({
        approvedHundredths: 200,
        pendingHundredths: 0,
        pendingSessions: 0,
        rejectedSessions: 1,
      });
    });
  });

  it("counts an admin's own hours, which have no approval, and nothing of an open session", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, admin.id, T("12:00"), T("15:00"));
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: T("12:00"),
      });
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "paused",
        client: T("14:00"),
      });
      await becomeApp(tx);
      const cells = (await hours(tx, admin.who)).cells;
      expect(cells.find((c) => c.worker.id === admin.id)).toMatchObject({
        approvedHundredths: 300,
        openSessions: 0,
      });
      expect(cells.find((c) => c.worker.id === d.w1)).toMatchObject({
        approvedHundredths: 0,
        pendingHundredths: 0,
        openSessions: 1,
      });
    });
  });

  it("answers the same after a push is replayed", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const now = new Date();
      const skew = measureSkew(now, now);
      const pusher = {
        id: d.w1,
        companyId: d.companyId,
        role: "worker" as const,
        name: "w1",
        email: "w1@co.test",
        phone: null,
        signInPhone: null,
      };
      const record = (type: "started" | "ended", client: string): LaborRecord => ({
        id: uuidv7(),
        schemaVersion: 1,
        payload: {
          workerId: d.w1,
          jobId: d.J,
          type,
          clientTimestamp: new Date(client),
          attestationLevel: "biometric",
          location: { lat: 41.824, lng: -71.4128, accuracyM: 8 },
          timeSetByUser: false,
          capturedOffline: true,
        },
      });
      const records = [record("started", T("12:00")), record("ended", T("16:00"))];
      const push = async () => {
        await asTenant(tx, d.companyId);
        const results = [];
        for (const r of records) {
          results.push(
            (await tx.transaction((sp) => pushLaborEvent(sp, pusher, r, skew))).result,
          );
        }
        return results;
      };

      expect(await push()).toEqual(["accepted", "accepted"]);
      const first = await hours(tx, admin.who);
      expect(first.cells).toMatchObject([
        { approvedHundredths: 0, pendingHundredths: 400, pendingSessions: 1 },
      ]);
      expect(await push()).toEqual(["duplicate", "duplicate"]);
      expect(await hours(tx, admin.who)).toEqual(first);
    });
  });

  it("writes nothing and leaves every ledger row as it was", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const { started } = await shift(tx, d, d.w1, T("12:00"), T("12:20"));
      await pendingApproval(tx, d.companyId, { eventId: started });
      await shift(tx, d, d.w2, T("12:00"), T("12:20"));
      const state = async () => ({
        events: await tx
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.companyId, d.companyId))
          .orderBy(asc(workSessionEvents.id)),
        approvals: await tx
          .select()
          .from(approvals)
          .where(eq(approvals.companyId, d.companyId))
          .orderBy(asc(approvals.id)),
        audit: await tx
          .select()
          .from(auditLog)
          .where(eq(auditLog.companyId, d.companyId)),
      });
      const before = await state();
      await becomeApp(tx);
      await hours(tx, admin.who);
      const after = await asOwner(tx, state);
      expect(after).toEqual(before);
      expect([
        before.events.length,
        before.approvals.length,
        before.audit.length,
      ]).toEqual([4, 1, 0]);
    });
  });
});
