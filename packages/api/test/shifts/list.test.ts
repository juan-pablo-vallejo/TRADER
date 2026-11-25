// Dated shifts: shift.week, the office's read of a Monday-to-Sunday week
// as written. Rolled-back transactions throughout. The clock-in flag against a real push is
// authority.test.ts's.
import { shifts, jobs } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  workDayIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };

// Two companies' working days, a bound admin and two bound workers in the first, a bound worker
// in the second. `put` writes a plan as the owner, before the transaction becomes trader_app.
async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const other = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const ana = await boundIn(tx, day.companyId, "worker");
  const ben = await boundIn(tx, day.companyId, "worker");
  const stranger = await boundIn(tx, other.companyId, "worker");
  await tx
    .update(jobs)
    .set({ address: "12 Hope St, Providence" })
    .where(eq(jobs.id, day.J));
  const put = (
    companyId: string,
    userId: string,
    jobId: string,
    workDate: string,
    hours = HOURS,
  ) => tx.insert(shifts).values({ companyId, userId, jobId, workDate, ...hours });
  return { day, other, admin, ana, ben, stranger, put };
}

describe("shift.week", () => {
  it("returns the week's shifts in day, start and name order, times to the minute", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, ben, put } = await office(tx);
      const c = day.companyId;
      await put(c, ben.id, day.J, "2026-11-17");
      await put(c, ana.id, day.J, "2026-11-17", {
        expectedStart: "12:00",
        expectedEnd: "16:00",
      });
      await put(c, ana.id, day.K, "2026-11-17", {
        expectedStart: "06:30",
        expectedEnd: "11:45",
      });
      await put(c, ana.id, day.J, "2026-11-16");
      await becomeApp(tx);
      const rows = (
        await appCallerIn(tx, admin.who).shift.week({ weekStart: "2026-11-16" })
      ).shifts;
      expect(
        rows.map((r) => [
          r.workDate,
          r.expectedStart,
          r.expectedEnd,
          r.worker.id,
          r.job.name,
        ]),
      ).toEqual([
        ["2026-11-16", "07:00", "15:30", ana.id, "J"],
        ["2026-11-17", "06:30", "11:45", ana.id, "K"],
        ["2026-11-17", "07:00", "15:30", ben.id, "J"],
        ["2026-11-17", "12:00", "16:00", ana.id, "J"],
      ]);
      expect(rows[0]).toMatchObject({
        worker: { id: ana.id, active: true },
        job: { id: day.J, name: "J", status: "open" },
      });
    });
  });

  it("is the office's alone: a worker is FORBIDDEN", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, ana } = await office(tx);
      await becomeApp(tx);
      const week = { weekStart: "2026-11-16" };
      for (const who of [ana.who, day.who]) {
        expect(await outcome(appCallerIn(tx, who).shift.week(week))).toBe("FORBIDDEN");
      }
      expect(await outcome(appCallerIn(tx, null).shift.week(week))).toBe("UNAUTHORIZED");
    });
  });

  it("answers Monday to Sunday, every shift of the company's week and no other", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, admin, ana, ben, stranger, put } = await office(tx);
      const c = day.companyId;
      const row = async (
        userId: string,
        jobId: string,
        workDate: string,
        expectedStart: string,
        expectedEnd: string,
      ) =>
        (
          await put(c, userId, jobId, workDate, { expectedStart, expectedEnd }).returning(
            {
              id: shifts.id,
            },
          )
        )[0]!.id;
      const morning = await row(ana.id, day.J, "2026-11-16", "07:00", "15:30");
      const late = await row(ana.id, day.K, "2026-11-16", "12:00", "17:00");
      const sunday = await row(ben.id, day.J, "2026-11-22", "08:00", "12:00");
      // Outside the week on both sides, and another company's inside it.
      await row(ben.id, day.J, "2026-11-15", "08:00", "12:00");
      await row(ben.id, day.J, "2026-11-23", "08:00", "12:00");
      await put(other.companyId, stranger.id, other.J, "2026-11-16");
      // Two rows no validated writer would write, overlapping: read like any other.
      const loose = await row(ben.id, day.J, "2026-11-18", "07:00", "12:00");
      const looser = await row(ben.id, day.K, "2026-11-18", "10:00", "14:00");
      // Ana clocked in on the morning shift at 07:10 in New York.
      const eventId = await eventIn(tx, day, {
        worker: ana.id,
        job: day.J,
        type: "started",
        client: "2026-11-16T12:10:00Z",
      });
      await tx.execute(sql`
        update shifts set locked_at = now(), locked_by_event_id = ${eventId}
        where id = ${morning}
      `);
      await becomeApp(tx);
      const week = await appCallerIn(tx, admin.who).shift.week({
        weekStart: "2026-11-16",
      });
      expect(week.weekStart).toBe("2026-11-16");
      expect(week.timezone).toBe("America/New_York");
      expect(week.days).toEqual([
        "2026-11-16",
        "2026-11-17",
        "2026-11-18",
        "2026-11-19",
        "2026-11-20",
        "2026-11-21",
        "2026-11-22",
      ]);
      const seen = new Map(week.shifts.map((s) => [s.id, s]));
      expect([...seen.keys()].sort()).toEqual(
        [morning, late, sunday, loose, looser].sort(),
      );
      expect(seen.get(morning)).toMatchObject({
        locked: true,
        expectedStart: "07:00",
        expectedEnd: "15:30",
        worker: { id: ana.id },
        job: { id: day.J },
      });
      expect(seen.get(late)).toMatchObject({
        locked: false,
        expectedStart: "12:00",
        expectedEnd: "17:00",
      });
      expect(seen.get(sunday)).toMatchObject({
        copyId: null,
        locked: false,
        expectedStart: "08:00",
        expectedEnd: "12:00",
      });
    });
  });

  it("reads a shift on the day the clocks change at its written times, and the Sunday as the week's last", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, put } = await office(tx);
      // New York's clocks go back on Sunday 2026-11-01: 01:30 happens twice that night.
      await put(day.companyId, ana.id, day.J, "2026-11-01", {
        expectedStart: "01:30",
        expectedEnd: "03:00",
      });
      await put(day.companyId, ana.id, day.J, "2026-10-26");
      await becomeApp(tx);
      const week = await appCallerIn(tx, admin.who).shift.week({
        weekStart: "2026-10-26",
      });
      expect(week.days[6]).toBe("2026-11-01");
      expect(
        week.shifts.map((s) => [s.workDate, s.expectedStart, s.expectedEnd]),
      ).toEqual([
        ["2026-10-26", "07:00", "15:30"],
        ["2026-11-01", "01:30", "03:00"],
      ]);
    });
  });

  it("refuses a week that does not start on a Monday, and a malformed day", async () => {
    await rolledBack(owner, async (tx) => {
      const { admin } = await office(tx);
      await becomeApp(tx);
      const week = appCallerIn(tx, admin.who).shift.week;
      for (const weekStart of ["2026-11-15", "2026-11-17", "2026-11-22", "11/16/2026"]) {
        expect([weekStart, await outcome(week({ weekStart }))]).toEqual([
          weekStart,
          "BAD_REQUEST",
        ]);
      }
      expect((await week({ weekStart: "2026-11-16" })).shifts).toEqual([]);
    });
  });
});
