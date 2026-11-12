// Stage 4, pay periods (V1-D03): payPeriod.close and payPeriod.read through the application's
// router under the runtime role, in rolled-back transactions — a close is never committed
// here, and `sealNow` fires the deferred line seal a commit would. Fixtures are written by
// the owner; approvals, corrections, repairs and rates after a close go through their own
// procedures, as the office's will. The races are close-commit.test.ts.
import { approvals, payPeriodLines, payPeriods } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
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

// Four weeks, Monday to Sunday, all long past. New York is UTC−4 until 1 November.
const W1 = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const W2 = { startsOn: "2026-10-12", endsOn: "2026-10-18" };
const W3 = { startsOn: "2026-10-19", endsOn: "2026-10-25" };
const W4 = { startsOn: "2026-10-26", endsOn: "2026-11-01" };
const T = (day: string, hhmm: string) => `${day}T${hhmm}:00.000Z`;

const api = (tx: Tx, who: unknown) => appCallerIn(tx, who).payPeriod;

// Back to the owner for fixtures and reads past RLS.
async function asOwner<T>(tx: Tx, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('app.company_id', '', true)`);
  const result = await body();
  await becomeApp(tx);
  return result;
}

// Fires the deferred checks a commit would — the line seal among them — and defers them
// again: IMMEDIATE lasts to the transaction's end, and a later repair inserts an event before
// its approval (MEMORY).
async function seal(tx: Tx) {
  await tx.execute(sql`set constraints all immediate`);
  await tx.execute(sql`set constraints all deferred`);
}

// A crew day with two admins: `admin` closes and repairs, `admin2` decides the repairs.
async function office(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const admin2 = await boundIn(tx, d.companyId, "admin");
  return { d, admin, admin2 };
}

// A session on `day`, written by the owner; `pending` gives its start a waiting approval.
async function shift(
  tx: Tx,
  d: CrewDay,
  worker: string,
  day: string,
  from: string,
  to: string | null,
  opts: { pending?: boolean; job?: string } = {},
) {
  const job = opts.job ?? d.J;
  const started = await eventIn(tx, d, {
    worker,
    job,
    type: "started",
    client: T(day, from),
  });
  const ended =
    to === null
      ? null
      : await eventIn(tx, d, { worker, job, type: "ended", client: T(day, to) });
  if (opts.pending) await pendingApproval(tx, d.companyId, { eventId: started });
  return { started, ended };
}

async function opened(tx: Tx, who: unknown, bounds: typeof W1) {
  const answer = await api(tx, who).open(bounds);
  if (answer.result !== "opened") throw new Error(`not opened: ${answer.result}`);
  return answer.period.id;
}

const decide = async (tx: Tx, who: unknown, eventId: string) => {
  // As the owner: the transaction's tenant setting is whatever the last call left.
  const [row] = await asOwner(tx, () =>
    tx.select().from(approvals).where(eq(approvals.eventId, eventId)),
  );
  const answer = await appCallerIn(tx, who).approval.decide({
    approvalId: row!.id,
    decision: "approved",
  });
  expect(answer.result).toBe("decided");
};

const storedLines = (tx: Tx, periodId: string) =>
  asOwner(tx, () =>
    tx
      .select()
      .from(payPeriodLines)
      .where(eq(payPeriodLines.periodId, periodId))
      .orderBy(asc(payPeriodLines.workDate), asc(payPeriodLines.id)),
  );

// Everything a closed period is: its row, the lines its close stored, and what the read
// answers from them, as bytes.
async function frozen(tx: Tx, who: unknown, periodId: string) {
  const read = await api(tx, who).read({ periodId });
  const row = await asOwner(tx, () =>
    tx.select().from(payPeriods).where(eq(payPeriods.id, periodId)),
  );
  return JSON.stringify({
    row,
    lines: await storedLines(tx, periodId),
    period: read.period,
    approved: read.approved,
    adjustments: read.adjustments,
  });
}

const figures = (
  lines: { worker: { id: string }; workDate: string; hundredths: number }[],
) => lines.map((l) => `${l.workDate} ${l.worker.id} ${l.hundredths}`).sort();

describe("payPeriod.close and read", () => {
  it("are the office's alone, and of the caller's company alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const other = await office(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      await becomeApp(tx);
      const mine = await opened(tx, admin.who, W1);
      const theirs = await opened(tx, other.admin.who, W1);
      for (const who of [worker.who, d.who]) {
        expect(await outcome(api(tx, who).close({ periodId: mine }))).toBe("FORBIDDEN");
        expect(await outcome(api(tx, who).read({ periodId: mine }))).toBe("FORBIDDEN");
      }
      expect(await outcome(api(tx, null).close({ periodId: mine }))).toBe("UNAUTHORIZED");
      // Another company's period, and nobody's at all, are the same answer.
      for (const periodId of [theirs, crypto.randomUUID()]) {
        expect(await outcome(api(tx, admin.who).close({ periodId }))).toBe("FORBIDDEN");
        expect(await outcome(api(tx, admin.who).read({ periodId }))).toBe("FORBIDDEN");
      }
      expect((await api(tx, other.admin.who).list()).periods[0]!.closed).toBeNull();
    });
  });

  it("closes a period with nothing unresolved, storing its approved hours", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      // 4 h and 8 h on the Monday; 6.5 h on the next Monday, outside the period.
      await shift(tx, d, d.w1, "2026-10-05", "12:00", "16:00");
      await shift(tx, d, d.w2, "2026-10-05", "13:00", "21:00");
      await shift(tx, d, d.w1, "2026-10-12", "12:00", "18:30");
      await becomeApp(tx);
      const id = await opened(tx, admin.who, W1);

      const preview = await api(tx, admin.who).read({ periodId: id });
      expect(figures(preview.approved.cells)).toEqual(
        [`2026-10-05 ${d.w1} 400`, `2026-10-05 ${d.w2} 800`].sort(),
      );
      expect(preview.approved.total).toBe(1200);
      expect(preview.unresolved).toEqual({
        cells: [],
        pendingSessions: 0,
        openSessions: 0,
      });
      expect(await storedLines(tx, id)).toEqual([]);

      const answer = await api(tx, admin.who).close({ periodId: id });
      await seal(tx);
      expect(answer).toEqual({
        result: "closed",
        period: {
          id,
          ...W1,
          closed: {
            at: expect.any(Date),
            by: { id: admin.id, name: expect.any(String) },
            unresolved: { pendingSessions: 0, openSessions: 0 },
          },
        },
        lines: { own: 2, adjustments: 0 },
      });
      expect(
        (await storedLines(tx, id))
          .map((l) => `${l.workDate} ${l.workerId} ${l.jobId} ${l.hundredths}`)
          .sort(),
      ).toEqual(
        [`2026-10-05 ${d.w1} ${d.J} 400`, `2026-10-05 ${d.w2} ${d.J} 800`].sort(),
      );

      const read = await api(tx, admin.who).read({ periodId: id });
      expect(read.approved).toEqual(preview.approved);
      expect(read.approved.workers.map((w) => w.hundredths).sort()).toEqual([400, 800]);
      expect(read.adjustments).toEqual({ lines: [], total: 0, carriedBy: null });
    });
  });

  it("refuses a close with entries pending until they are acknowledged as they stand", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, "2026-10-05", "12:00", "16:00");
      await shift(tx, d, d.w2, "2026-10-05", "13:00", "21:00", { pending: true });
      await shift(tx, d, d.w2, "2026-10-06", "13:00", "21:00", { pending: true });
      // Waiting, but on a day outside the period: not this close's to acknowledge.
      await shift(tx, d, d.w1, "2026-10-12", "12:00", "16:00", { pending: true });
      await becomeApp(tx);
      const id = await opened(tx, admin.who, W1);
      const unresolved = { pendingSessions: 2, openSessions: 0 };

      expect((await api(tx, admin.who).read({ periodId: id })).unresolved).toMatchObject(
        unresolved,
      );
      expect(await api(tx, admin.who).close({ periodId: id })).toEqual({
        result: "rejected",
        code: "unacknowledged",
        unresolved,
      });
      for (const acknowledged of [
        { pendingSessions: 1, openSessions: 0 },
        { pendingSessions: 3, openSessions: 0 },
        { pendingSessions: 2, openSessions: 1 },
        { pendingSessions: 0, openSessions: 0 },
      ]) {
        expect(await api(tx, admin.who).close({ periodId: id, acknowledged })).toEqual({
          result: "rejected",
          code: "unresolved_changed",
          unresolved,
        });
      }
      // Nothing was written by any refusal.
      expect(await storedLines(tx, id)).toEqual([]);
      expect((await api(tx, admin.who).list()).periods[0]!.closed).toBeNull();

      const answer = await api(tx, admin.who).close({
        periodId: id,
        acknowledged: unresolved,
      });
      await seal(tx);
      expect(answer).toMatchObject({
        result: "closed",
        period: { closed: { unresolved } },
        lines: { own: 1, adjustments: 0 },
      });
      // The pending hours are in no line.
      expect((await storedLines(tx, id)).map((l) => [l.workerId, l.hundredths])).toEqual([
        [d.w1, 400],
      ]);
    });
  });

  it("counts a session still open as unresolved, and a rejected one as decided", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, "2026-10-05", "12:00", null);
      const refused = await shift(tx, d, d.w2, "2026-10-05", "13:00", "21:00", {
        pending: true,
      });
      await becomeApp(tx);
      const id = await opened(tx, admin.who, W1);
      const [row] = await asOwner(tx, () =>
        tx.select().from(approvals).where(eq(approvals.eventId, refused.started)),
      );
      await appCallerIn(tx, admin.who).approval.decide({
        approvalId: row!.id,
        decision: "rejected",
      });

      const read = await api(tx, admin.who).read({ periodId: id });
      expect(read.unresolved).toMatchObject({ pendingSessions: 0, openSessions: 1 });
      // Both are listed apart; only the open one stands in the way of a close.
      expect(
        read.unresolved.cells
          .map((c) => `${c.worker.id} ${c.rejectedSessions} ${c.openSessions}`)
          .sort(),
      ).toEqual([`${d.w1} 0 1`, `${d.w2} 1 0`].sort());
      expect(await api(tx, admin.who).close({ periodId: id })).toEqual({
        result: "rejected",
        code: "unacknowledged",
        unresolved: { pendingSessions: 0, openSessions: 1 },
      });
    });
  });

  it("refuses an acknowledgment of something when nothing is unresolved", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, "2026-10-05", "12:00", "16:00");
      await becomeApp(tx);
      const id = await opened(tx, admin.who, W1);
      expect(
        await api(tx, admin.who).close({
          periodId: id,
          acknowledged: { pendingSessions: 1, openSessions: 0 },
        }),
      ).toEqual({
        result: "rejected",
        code: "unresolved_changed",
        unresolved: { pendingSessions: 0, openSessions: 0 },
      });
      expect(
        await api(tx, admin.who).close({
          periodId: id,
          acknowledged: { pendingSessions: 0, openSessions: 0 },
        }),
      ).toMatchObject({ result: "closed" });
    });
  });

  it("closes in order, once, and never before the period's last day has passed", async () => {
    await rolledBack(owner, async (tx) => {
      const { admin } = await office(tx);
      await becomeApp(tx);
      const first = await opened(tx, admin.who, W1);
      const second = await opened(tx, admin.who, W2);
      expect(await api(tx, admin.who).close({ periodId: second })).toMatchObject({
        result: "rejected",
        code: "earlier_open",
        period: { id: first },
      });
      const closed = await api(tx, admin.who).close({ periodId: first });
      expect(closed.result).toBe("closed");
      // The same request again, or another admin's: the close that stands.
      expect(await api(tx, admin.who).close({ periodId: first })).toEqual({
        result: "rejected",
        code: "already_closed",
        period: closed.result === "closed" ? closed.period : null,
      });

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
      }).format(new Date());
      // The latest period stretched to end today: still being worked.
      await asOwner(tx, () =>
        tx
          .update(payPeriods)
          .set({ startsOn: today, endsOn: today })
          .where(eq(payPeriods.id, second)),
      );
      expect(await api(tx, admin.who).close({ periodId: second })).toEqual({
        result: "rejected",
        code: "not_ended",
        today,
      });
      const yesterday = new Date(`${today}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const ended = yesterday.toISOString().slice(0, 10);
      await asOwner(tx, () =>
        tx
          .update(payPeriods)
          .set({ startsOn: ended, endsOn: ended })
          .where(eq(payPeriods.id, second)),
      );
      expect(await api(tx, admin.who).close({ periodId: second })).toMatchObject({
        result: "closed",
      });
    });
  });

  it("exports nothing for hours on days before the first period", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      await shift(tx, d, d.w1, "2026-10-02", "12:00", "16:00");
      await shift(tx, d, d.w1, "2026-10-05", "12:00", "16:00");
      await becomeApp(tx);
      const first = await opened(tx, admin.who, W1);
      const second = await opened(tx, admin.who, W2);
      expect(await api(tx, admin.who).close({ periodId: first })).toMatchObject({
        lines: { own: 1, adjustments: 0 },
      });
      expect(await api(tx, admin.who).close({ periodId: second })).toMatchObject({
        lines: { own: 0, adjustments: 0 },
      });
      await seal(tx);
    });
  });

  it("previews adjustments only on the next period to close", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await office(tx);
      const late = await shift(tx, d, d.w2, "2026-10-05", "13:00", "21:00", {
        pending: true,
      });
      await becomeApp(tx);
      const first = await opened(tx, admin.who, W1);
      const second = await opened(tx, admin.who, W2);
      const third = await opened(tx, admin.who, W3);
      await api(tx, admin.who).close({
        periodId: first,
        acknowledged: { pendingSessions: 1, openSessions: 0 },
      });
      await decide(tx, admin.who, late.started);

      const next = await api(tx, admin.who).read({ periodId: second });
      expect(figures(next.adjustments.lines)).toEqual([`2026-10-05 ${d.w2} 800`]);
      expect(next.adjustments).toMatchObject({ total: 800, carriedBy: null });
      // Never in the period's own hours.
      expect(next.approved).toEqual({ cells: [], workers: [], total: 0 });

      const after = await api(tx, admin.who).read({ periodId: third });
      expect(after.adjustments).toMatchObject({
        lines: [],
        total: 0,
        carriedBy: { id: second },
      });
    });
  });
});

describe("after a close", () => {
  it("leaves the closed period byte-identical and carries each change once, signed", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, admin2 } = await office(tx);
      const kept = await shift(tx, d, d.w1, "2026-10-05", "12:00", "16:00");
      const late = await shift(tx, d, d.w2, "2026-10-05", "13:00", "21:00", {
        pending: true,
      });
      await becomeApp(tx);
      const first = await opened(tx, admin.who, W1);
      const second = await opened(tx, admin.who, W2);
      const third = await opened(tx, admin.who, W3);
      const fourth = await opened(tx, admin.who, W4);
      expect(
        await api(tx, admin.who).close({
          periodId: first,
          acknowledged: { pendingSessions: 1, openSessions: 0 },
        }),
      ).toMatchObject({ result: "closed", lines: { own: 1, adjustments: 0 } });
      await seal(tx);
      const before = await frozen(tx, admin.who, first);

      // A later approval: the 8 h that waited at the close.
      await decide(tx, admin.who, late.started);
      // A later correction that lowers hours: the 16:00 clock-out was 15:30.
      const corrected = uuidv7();
      const labor = appCallerIn(tx, admin.who).labor;
      expect(
        await labor.repair({
          workerId: d.w1,
          operations: [
            {
              kind: "correct",
              id: corrected,
              correctsEventId: kept.ended!,
              replacesEventId: kept.ended!,
              type: "ended",
              jobId: d.J,
              clientTimestamp: new Date(T("2026-10-05", "15:30")),
            },
          ],
        }),
      ).toMatchObject({ result: "accepted" });
      await decide(tx, admin2.who, corrected);
      // A later repair: two hours on the Tuesday that nobody recorded.
      const base = Date.now();
      const added = [uuidv7(base), uuidv7(base + 1)];
      expect(
        await labor.repair({
          workerId: d.w1,
          operations: [
            {
              kind: "append",
              id: added[0]!,
              type: "started",
              jobId: d.J,
              clientTimestamp: new Date(T("2026-10-06", "12:00")),
            },
            {
              kind: "append",
              id: added[1]!,
              type: "ended",
              jobId: d.J,
              clientTimestamp: new Date(T("2026-10-06", "14:00")),
            },
          ],
        }),
      ).toMatchObject({ result: "accepted" });
      for (const id of added) await decide(tx, admin2.who, id);
      // A pay rate dated inside the closed period: accepted, and nothing stored reads it.
      expect(
        await appCallerIn(tx, admin.who).roster.setPayRate({
          userId: d.w1,
          effectiveFrom: "2026-10-06",
          hourlyRateCents: 3000,
        }),
      ).toMatchObject({ result: "added" });

      expect(await frozen(tx, admin.who, first)).toBe(before);

      // Each of the three is one line of the next period to close.
      const expected = [
        `2026-10-05 ${d.w1} -50`,
        `2026-10-05 ${d.w2} 800`,
        `2026-10-06 ${d.w1} 200`,
      ].sort();
      const preview = await api(tx, admin.who).read({ periodId: second });
      expect(figures(preview.adjustments.lines)).toEqual(expected);
      expect(preview.adjustments.total).toBe(950);

      expect(await api(tx, admin.who).close({ periodId: second })).toMatchObject({
        result: "closed",
        lines: { own: 0, adjustments: 3 },
      });
      await seal(tx);
      const carried = await frozen(tx, admin.who, second);
      const read = await api(tx, admin.who).read({ periodId: second });
      expect(figures(read.adjustments.lines)).toEqual(expected);
      expect(read.adjustments.lines).toEqual(preview.adjustments.lines);

      // Two further closes add nothing, and move nothing already stored.
      for (const periodId of [third, fourth]) {
        expect(await api(tx, admin.who).close({ periodId })).toMatchObject({
          result: "closed",
          lines: { own: 0, adjustments: 0 },
        });
        await seal(tx);
        expect(await storedLines(tx, periodId)).toEqual([]);
      }
      expect(await frozen(tx, admin.who, first)).toBe(before);
      expect(await frozen(tx, admin.who, second)).toBe(carried);

      // What was exported for each worker and day, over every close, is what stands approved.
      const exported = await asOwner(tx, () =>
        tx.execute<{
          worker_id: string;
          work_date: string;
          total: number;
          n: number;
        }>(sql`
          select worker_id, work_date::text, sum(hundredths)::int as total, count(*)::int as n
          from pay_period_lines where company_id = ${d.companyId}
          group by worker_id, work_date
        `),
      );
      expect(
        exported.rows
          .map((r) => `${r.work_date} ${r.worker_id} ${r.total} in ${r.n}`)
          .sort(),
      ).toEqual(
        [
          `2026-10-05 ${d.w1} 350 in 2`,
          `2026-10-05 ${d.w2} 800 in 1`,
          `2026-10-06 ${d.w1} 200 in 1`,
        ].sort(),
      );
    });
  });
});
