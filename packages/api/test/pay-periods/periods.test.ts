// Stage 4, pay periods (V1-D03): payPeriod.list, open and update — the calendar the office
// keeps — through the application's router under the runtime role in rolled-back
// transactions. An open period can be rolled back like any row; the close has its own suites.
import { payPeriods } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  companyIn,
  outcome,
  ownerDb,
  rolledBack,
} from "../helpers";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

const api = (tx: Tx, who: unknown) => appCallerIn(tx, who).payPeriod;

const W1 = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const W2 = { startsOn: "2026-10-12", endsOn: "2026-10-18" };
const W3 = { startsOn: "2026-10-19", endsOn: "2026-10-25" };

// Back to the owner for fixtures and reads past RLS.
async function asOwner<T>(tx: Tx, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('app.company_id', '', true)`);
  const result = await body();
  await becomeApp(tx);
  return result;
}

// Closes a period as the owner: the close procedure's own tests are close.test.ts.
const closeAsOwner = (tx: Tx, periodId: string, adminId: string) =>
  asOwner(tx, () =>
    tx
      .update(payPeriods)
      .set({
        closedAt: new Date(),
        closedByUserId: adminId,
        unresolvedPendingSessions: 0,
        unresolvedOpenSessions: 0,
      })
      .where(eq(payPeriods.id, periodId)),
  );

async function opened(tx: Tx, who: unknown, bounds: typeof W1) {
  const answer = await api(tx, who).open(bounds);
  if (answer.result !== "opened") throw new Error(`not opened: ${answer.result}`);
  return answer.period;
}

describe("payPeriod.open", () => {
  it("is the office's alone", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      const worker = await boundIn(tx, c.companyId, "worker");
      const foreman = await boundIn(tx, c.companyId, "foreman");
      await becomeApp(tx);
      for (const who of [worker.who, foreman.who]) {
        expect(await outcome(api(tx, who).open(W1))).toBe("FORBIDDEN");
        expect(await outcome(api(tx, who).list())).toBe("FORBIDDEN");
        expect(
          await outcome(api(tx, who).update({ periodId: crypto.randomUUID(), ...W1 })),
        ).toBe("FORBIDDEN");
      }
      expect(await outcome(api(tx, null).open(W1))).toBe("UNAUTHORIZED");
      expect((await api(tx, c.who).list()).periods).toEqual([]);
    });
  });

  it("opens the first period anywhere and each later one the day after the latest", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      const first = await api(tx, c.who).open(W1);
      expect(first).toEqual({
        result: "opened",
        period: { id: expect.any(String), ...W1, closed: null },
      });
      // A gap, an overlap and an earlier week all name the one day a period may start.
      for (const bounds of [
        W3,
        { startsOn: "2026-10-11", endsOn: "2026-10-17" },
        { startsOn: "2026-09-28", endsOn: "2026-10-04" },
      ]) {
        expect(await api(tx, c.who).open(bounds), bounds.startsOn).toEqual({
          result: "rejected",
          code: "not_contiguous",
          expectedStartsOn: "2026-10-12",
        });
      }
      const second = await opened(tx, c.who, W2);
      const listed = await api(tx, c.who).list();
      // Newest first.
      expect(listed.periods.map((p) => p.id)).toEqual([
        second.id,
        first.result === "opened" ? first.period.id : "",
      ]);
      expect(listed.timezone).toBe("America/New_York");
      expect(listed.today).toBe(
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
          new Date(),
        ),
      );
    });
  });

  it("answers the same dates sent again with the period that stands", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      const period = await opened(tx, c.who, W1);
      expect(await api(tx, c.who).open(W1)).toEqual({ result: "exists", period });
      expect((await api(tx, c.who).list()).periods).toHaveLength(1);
    });
  });

  it("refuses a period longer than 31 days, a backward one and a year that is a slip", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      for (const bounds of [
        { startsOn: "2026-10-01", endsOn: "2026-11-01" },
        { startsOn: "2026-10-11", endsOn: "2026-10-05" },
        { startsOn: "0206-10-05", endsOn: "0206-10-11" },
      ]) {
        expect(await outcome(api(tx, c.who).open(bounds)), bounds.startsOn).toBe(
          "BAD_REQUEST",
        );
      }
      // Thirty-one days is a month, and a single day is a period.
      await opened(tx, c.who, { startsOn: "2026-10-01", endsOn: "2026-10-31" });
      await opened(tx, c.who, { startsOn: "2026-11-01", endsOn: "2026-11-01" });
    });
  });

  it("keeps each company's calendar to itself", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await companyIn(tx, "admin");
      const b = await companyIn(tx, "admin");
      await becomeApp(tx);
      const theirs = await opened(tx, b.who, W2);
      // A's first period is free of B's calendar.
      await opened(tx, a.who, W1);
      expect((await api(tx, a.who).list()).periods).toHaveLength(1);
      expect(await outcome(api(tx, a.who).update({ periodId: theirs.id, ...W2 }))).toBe(
        "FORBIDDEN",
      );
    });
  });

  it("takes the company's pay-period lock even when it then writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      // A period placed with triggers off, so the fixture itself takes no lock (0036's
      // placement trigger would): whatever is held afterwards is the procedure's own.
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(payPeriods).values({ companyId: c.companyId, ...W1 });
      await tx.execute(sql`set local session_replication_role = origin`);
      await becomeApp(tx);
      const held = async () =>
        (
          await tx.execute<{ n: number }>(sql`
            select count(*)::int as n from pg_locks
            where locktype = 'advisory' and pid = pg_backend_pid() and granted
              and ((classid::bigint << 32) | objid::bigint)
                = hashtextextended(${`pay-periods:${c.companyId}`}, 0)
          `)
        ).rows[0]!.n;
      expect(await held()).toBe(0);
      expect(await api(tx, c.who).open(W1)).toMatchObject({ result: "exists" });
      expect(await held()).toBe(1);
    });
  });
});

describe("payPeriod.update", () => {
  it("moves the first period's start and end while it is the latest and open", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      const period = await opened(tx, c.who, W1);
      const moved = { startsOn: "2026-10-04", endsOn: "2026-10-17" };
      expect(await api(tx, c.who).update({ periodId: period.id, ...moved })).toEqual({
        result: "updated",
        period: { ...period, ...moved },
      });
      expect(await api(tx, c.who).update({ periodId: period.id, ...moved })).toEqual({
        result: "unchanged",
        period: { ...period, ...moved },
      });
      expect((await api(tx, c.who).list()).periods).toEqual([{ ...period, ...moved }]);
    });
  });

  it("moves a later period's end and never its start", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      await opened(tx, c.who, W1);
      const second = await opened(tx, c.who, W2);
      expect(
        await api(tx, c.who).update({
          periodId: second.id,
          startsOn: "2026-10-13",
          endsOn: "2026-10-18",
        }),
      ).toEqual({
        result: "rejected",
        code: "not_contiguous",
        expectedStartsOn: "2026-10-12",
      });
      expect(
        await api(tx, c.who).update({
          periodId: second.id,
          startsOn: W2.startsOn,
          endsOn: "2026-10-25",
        }),
      ).toMatchObject({ result: "updated", period: { endsOn: "2026-10-25" } });
    });
  });

  it("refuses a period that is not the latest, and a closed one", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      await becomeApp(tx);
      const first = await opened(tx, c.who, W1);
      await opened(tx, c.who, W2);
      expect(await api(tx, c.who).update({ periodId: first.id, ...W1 })).toEqual({
        result: "rejected",
        code: "not_latest",
      });
      await closeAsOwner(tx, first.id, c.userId);
      const answer = await api(tx, c.who).update({
        periodId: first.id,
        startsOn: W1.startsOn,
        endsOn: "2026-10-10",
      });
      expect(answer).toMatchObject({
        result: "rejected",
        code: "closed",
        period: {
          id: first.id,
          ...W1,
          closed: {
            by: { id: c.userId, name: "Rolled" },
            unresolved: { pendingSessions: 0, openSessions: 0 },
          },
        },
      });
    });
  });
});
