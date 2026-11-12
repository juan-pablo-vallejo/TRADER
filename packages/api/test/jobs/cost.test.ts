// Stage 4, hours and cost aggregation (V1-D13): job cost to date. Money is integer cents with
// a currency; a labor line is rounded half-up to the cent and a total is the sum of lines.
// The arithmetic is pure; job.cost runs through the application's router under the runtime
// role in rolled-back transactions, on fixtures the owner writes.
import {
  approvals,
  auditLog,
  materials,
  payRates,
  workSessionEvents,
} from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import { byCurrency, lineCents } from "../../src/jobs/cost";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  correctionIn,
  crewDayIn,
  eventIn,
  lateReceiptIn,
  materialIn,
  outcome,
  ownerDb,
  pendingApproval,
  rolledBack,
  type CrewDay,
} from "../helpers";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

describe("lineCents", () => {
  it("multiplies hundredths of an hour by an hourly rate, half-up to the cent", () => {
    expect(lineCents(800, 2800)).toBe(22400);
    // 0.01 h at $28.50 is 28.5 cents; at $28.49, 28.49 cents; at $28.51, 28.51.
    expect(lineCents(1, 2850)).toBe(29);
    expect(lineCents(1, 2849)).toBe(28);
    expect(lineCents(1, 2851)).toBe(29);
    expect(lineCents(101, 2575)).toBe(2601);
    expect(lineCents(0, 2800)).toBe(0);
    expect(lineCents(800, 0)).toBe(0);
  });

  it("answers a whole number of cents, and refuses what it cannot compute exactly", () => {
    for (const [h, r] of [
      [333, 3333],
      [1, 1],
      [2399, 2147483647],
    ] as const) {
      expect(Number.isInteger(lineCents(h, r))).toBe(true);
    }
    for (const [h, r] of [
      [1.5, 2800],
      [800, 28.5],
      [-1, 2800],
      [800, -1],
      [2 ** 40, 2 ** 20],
      [Number.NaN, 1],
    ] as const) {
      expect(() => lineCents(h, r)).toThrow();
    }
  });
});

describe("byCurrency", () => {
  it("adds within a currency and never across two", () => {
    expect(
      byCurrency([
        { currency: "USD", cents: 22400 },
        { currency: "CAD", cents: 100 },
        { currency: "USD", cents: 29 },
      ]),
    ).toEqual([
      { currency: "CAD", cents: 100 },
      { currency: "USD", cents: 22429 },
    ]);
    expect(byCurrency([])).toEqual([]);
  });

  it("refuses a fraction of a cent", () => {
    expect(() => byCurrency([{ currency: "USD", cents: 0.5 }])).toThrow();
  });
});

const DAY = "2026-10-05";
// 5 October in New York is UTC−4: 12:00Z is 08:00 there.
const T = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;
const usd = (cents: number) => ({ currency: "USD", cents });

const cost = (tx: Tx, who: unknown, jobId: string) =>
  appCallerIn(tx, who).job.cost({ jobId });

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

const rate = (
  tx: Tx,
  d: CrewDay,
  userId: string,
  effectiveFrom: string,
  hourlyRateCents: number,
  currency = "USD",
) =>
  tx
    .insert(payRates)
    .values({ companyId: d.companyId, userId, effectiveFrom, hourlyRateCents, currency });

const price = (tx: Tx, id: string, costCents: number, currency = "USD") =>
  tx.update(materials).set({ costCents, currency }).where(eq(materials.id, id));

const decide = (
  tx: Tx,
  approvalId: string,
  by: string,
  decision: "approved" | "rejected",
) =>
  tx
    .update(approvals)
    .set({ decision, decidedAt: new Date(T("12:00")), decidedByUserId: by })
    .where(eq(approvals.id, approvalId));

// Every number anywhere in an answer.
function numbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(numbers);
}

describe("job.cost", () => {
  it("is the office's alone, and of the caller's company alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const other = await crewDayIn(tx);
      await rate(tx, d, d.w1, "2025-01-01", 2800);
      await rate(tx, other, other.w1, "2025-01-01", 9900);
      await shift(tx, d, d.w1, T("12:00"), T("20:00"));
      await shift(tx, other, other.w1, T("12:00"), T("20:00"));
      await price(tx, await materialIn(tx, other, other.J, T("13:00")), 55555);
      const worker = await boundIn(tx, d.companyId, "worker");
      await becomeApp(tx);

      for (const who of [worker.who, d.who]) {
        expect(await outcome(cost(tx, who, d.J))).toBe("FORBIDDEN");
      }
      expect(await outcome(cost(tx, null, d.J))).toBe("UNAUTHORIZED");
      // Another company's job and no job at all are the same answer.
      for (const jobId of [other.J, crypto.randomUUID()]) {
        expect(await outcome(cost(tx, admin.who, jobId))).toBe("FORBIDDEN");
      }
      const mine = await cost(tx, admin.who, d.J);
      expect(mine.job).toEqual({ id: d.J, name: "J", status: "open" });
      expect(mine.timezone).toBe("America/New_York");
      expect(mine.total).toEqual([usd(22400)]);
      expect(JSON.stringify(mine)).not.toContain(other.w1);
    });
  });

  it("prices each day's rounded hours at the rate in force that day, a line at a time", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await rate(tx, d, d.w1, "2025-01-01", 2800);
      await rate(tx, d, d.w1, "2026-10-06", 3000);
      await rate(tx, d, d.w2, "2025-01-01", 2850);
      await shift(tx, d, d.w1, T("12:00"), T("20:00"));
      await shift(tx, d, d.w1, T("12:00", "2026-10-06"), T("16:00", "2026-10-06"));
      // Three sessions of 20 min 10 s: 1.01 h, not 1.02; at $28.50, 2878.5 cents.
      for (const hhmm of ["12:00", "13:00", "14:00"]) {
        const start = new Date(T(hhmm));
        const end = new Date(start.getTime() + 20 * 60_000 + 10_000);
        await shift(tx, d, d.w2, start.toISOString(), end.toISOString());
      }
      // Another job's hours are another job's cost.
      await shift(tx, d, d.w2, T("16:00"), T("18:00"), d.K);
      await becomeApp(tx);

      const answer = await cost(tx, admin.who, d.J);
      const line = (workerId: string, workDate: string) =>
        answer.labor.lines.find(
          (l) => l.worker.id === workerId && l.workDate === workDate,
        );
      expect(answer.labor.lines).toHaveLength(3);
      expect(answer.labor.lines.map((l) => l.workDate)).toEqual([DAY, DAY, "2026-10-06"]);
      expect(line(d.w1, DAY)).toEqual({
        worker: { id: d.w1, name: "w1" },
        workDate: DAY,
        hundredths: 800,
        rate: { hourlyRateCents: 2800, currency: "USD" },
        cents: 22400,
      });
      expect(line(d.w1, "2026-10-06")).toMatchObject({
        hundredths: 400,
        rate: { hourlyRateCents: 3000 },
        cents: 12000,
      });
      expect(line(d.w2, DAY)).toMatchObject({ hundredths: 101, cents: 2879 });
      expect(answer.labor).toMatchObject({
        approvedHundredths: 1301,
        totals: [usd(22400 + 12000 + 2879)],
        unrated: { hundredths: 0, lines: 0 },
      });
      expect(answer.total).toEqual([usd(37279)]);
      expect((await cost(tx, admin.who, d.K)).total).toEqual([usd(5700)]);
    });
  });

  it("keeps hours with no rate in force apart, in no total", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // w1's first rate starts the day after the work; w2 has none at all.
      await rate(tx, d, d.w1, "2026-10-06", 3000);
      await shift(tx, d, d.w1, T("12:00"), T("20:00"));
      await shift(tx, d, d.w2, T("12:00"), T("16:00"));
      await becomeApp(tx);
      const answer = await cost(tx, admin.who, d.J);
      expect(
        answer.labor.lines.map((l) => [l.hundredths, l.rate, l.cents]).sort(),
      ).toEqual([
        [400, null, null],
        [800, null, null],
      ]);
      expect(answer.labor).toMatchObject({
        approvedHundredths: 1200,
        totals: [],
        unrated: { hundredths: 1200, lines: 2 },
      });
      expect(answer.total).toEqual([]);
    });
  });

  it("keeps pending, rejected and open labor apart, and counts an admin's own", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      for (const who of [d.w1, d.w2, admin.id, d.foremanId]) {
        await rate(tx, d, who, "2025-01-01", 3000);
      }
      const waits = await shift(tx, d, d.w1, T("12:00"), T("14:00"));
      const waiting = await pendingApproval(tx, d.companyId, { eventId: waits.ended });
      const refused = await shift(tx, d, d.w2, T("12:00"), T("20:00"));
      await decide(
        tx,
        await pendingApproval(tx, d.companyId, { eventId: refused.started }),
        admin.id,
        "rejected",
      );
      await shift(tx, d, admin.id, T("12:00"), T("13:00"));
      await eventIn(tx, d, {
        worker: d.foremanId,
        job: d.J,
        type: "started",
        client: T("12:00"),
      });
      await eventIn(tx, d, {
        worker: d.foremanId,
        job: d.J,
        type: "paused",
        client: T("15:00"),
      });
      await becomeApp(tx);

      const before = await cost(tx, admin.who, d.J);
      expect(before.labor.lines).toMatchObject([
        { worker: { id: admin.id }, hundredths: 100, cents: 3000 },
      ]);
      expect(before.labor).toMatchObject({
        approvedHundredths: 100,
        totals: [usd(3000)],
        pending: {
          hundredths: 200,
          sessions: 1,
          totals: [usd(6000)],
          unratedHundredths: 0,
        },
        rejectedSessions: 1,
        openSessions: 1,
      });
      expect(before.total).toEqual([usd(3000)]);

      await tx.execute(sql`reset role`);
      await tx.execute(sql`select set_config('app.company_id', '', true)`);
      await decide(tx, waiting, admin.id, "approved");
      await becomeApp(tx);
      const after = await cost(tx, admin.who, d.J);
      expect(after.labor).toMatchObject({
        approvedHundredths: 300,
        totals: [usd(9000)],
        pending: { hundredths: 0, sessions: 0, totals: [] },
      });
    });
  });

  it("follows a session a correction moved onto the job, and counts it once", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await rate(tx, d, d.w1, "2025-01-01", 3000);
      const { started } = await shift(tx, d, d.w1, T("12:00"), T("16:00"));
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.K,
        type: "started",
        client: T("12:00"),
        server: T("22:00"),
        corrects: started,
        initiator: admin.id,
      });
      await becomeApp(tx);
      expect((await cost(tx, admin.who, d.K)).labor).toMatchObject({
        approvedHundredths: 400,
        totals: [usd(12000)],
      });
      expect((await cost(tx, admin.who, d.J)).labor).toMatchObject({
        lines: [],
        approvedHundredths: 0,
        totals: [],
      });
    });
  });

  it("counts a priced receipt that counts, and keeps the rest apart", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await price(tx, await materialIn(tx, d, d.J, T("13:00")), 38990);
      // Free is priced: zero is a cost, not a missing one.
      await price(tx, await materialIn(tx, d, d.J, T("13:01")), 0);
      await materialIn(tx, d, d.J, T("13:02"));
      // On another job.
      await price(tx, await materialIn(tx, d, d.K, T("13:03")), 99999);
      // Waiting: one priced, one not, and one the office entered on a closed day.
      await price(tx, (await lateReceiptIn(tx, d)).materialId, 1500);
      await lateReceiptIn(tx, d);
      const entered = await materialIn(tx, d, d.J, T("16:00"), admin.id, true);
      await price(tx, entered, 4590);
      await pendingApproval(tx, d.companyId, { materialId: entered }, ["after_closeout"]);
      // Rejected, priced all the same.
      const refused = await lateReceiptIn(tx, d);
      await decide(tx, refused.approvalId, admin.id, "rejected");
      await price(tx, refused.materialId, 7000);
      // Approved, with an amend still waiting: counted as it stands.
      const amended = await lateReceiptIn(tx, d);
      await decide(tx, amended.approvalId, admin.id, "approved");
      await correctionIn(tx, d, amended.materialId, d.foremanId);
      await price(tx, amended.materialId, 1010);
      // Approved, then voided by an approved correction.
      const gone = await lateReceiptIn(tx, d);
      await decide(tx, gone.approvalId, admin.id, "approved");
      const voided = await correctionIn(tx, d, gone.materialId, d.foremanId, "void");
      await decide(tx, voided.approvalId, admin.id, "approved");
      await price(tx, gone.materialId, 8000);
      await becomeApp(tx);

      const answer = await cost(tx, admin.who, d.J);
      expect(answer.materials).toEqual({
        totals: [usd(38990 + 0 + 1010)],
        receipts: 3,
        unpriced: 1,
        pending: { totals: [usd(1500 + 4590)], receipts: 3, unpriced: 1 },
        rejected: 1,
        voided: 1,
      });
      expect(answer.total).toEqual([usd(40000)]);
    });
  });

  it("adds labor and materials within a currency, never across two, all in whole cents", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await rate(tx, d, d.w1, "2025-01-01", 2850);
      await rate(tx, d, d.w2, "2025-01-01", 3333, "CAD");
      await shift(tx, d, d.w1, T("12:00"), T("12:20"));
      await shift(tx, d, d.w2, T("12:00"), T("15:20"));
      await price(tx, await materialIn(tx, d, d.J, T("13:00")), 17196);
      await price(tx, await materialIn(tx, d, d.J, T("13:01")), 501, "CAD");
      await price(tx, await materialIn(tx, d, d.J, T("13:02")), 9000, "EUR");
      await becomeApp(tx);

      const answer = await cost(tx, admin.who, d.J);
      // 0.33 h at $28.50 is 940.5 cents; 3.33 h at CAD 33.33 is 11098.89.
      expect(answer.labor.totals).toEqual([
        { currency: "CAD", cents: 11099 },
        { currency: "USD", cents: 941 },
      ]);
      expect(answer.total).toEqual([
        { currency: "CAD", cents: 11600 },
        { currency: "EUR", cents: 9000 },
        { currency: "USD", cents: 18137 },
      ]);
      const all = numbers(answer);
      expect(all.length).toBeGreaterThan(10);
      expect(all.every(Number.isInteger)).toBe(true);
    });
  });

  it("answers an empty job, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await rate(tx, d, d.w1, "2025-01-01", 2800);
      const { started } = await shift(tx, d, d.w1, T("12:00"), T("12:20"));
      await pendingApproval(tx, d.companyId, { eventId: started });
      await price(tx, await materialIn(tx, d, d.J, T("13:00")), 100);
      const state = async () => ({
        events: await tx
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.companyId, d.companyId))
          .orderBy(asc(workSessionEvents.id)),
        approvals: await tx
          .select()
          .from(approvals)
          .where(eq(approvals.companyId, d.companyId)),
        materials: await tx
          .select()
          .from(materials)
          .where(eq(materials.companyId, d.companyId)),
        rates: await tx
          .select()
          .from(payRates)
          .where(eq(payRates.companyId, d.companyId)),
        audit: await tx
          .select()
          .from(auditLog)
          .where(eq(auditLog.companyId, d.companyId)),
      });
      const before = await state();
      await becomeApp(tx);
      await cost(tx, admin.who, d.J);
      expect(await cost(tx, admin.who, d.K)).toMatchObject({
        labor: { lines: [], approvedHundredths: 0, totals: [], openSessions: 0 },
        materials: { totals: [], receipts: 0, unpriced: 0 },
        total: [],
      });
      await tx.execute(sql`reset role`);
      await tx.execute(sql`select set_config('app.company_id', '', true)`);
      expect(await state()).toEqual(before);
      expect([
        before.events.length,
        before.materials.length,
        before.audit.length,
      ]).toEqual([2, 1, 0]);
    });
  });
});
