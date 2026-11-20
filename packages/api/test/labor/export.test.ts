// labor.export: payroll hours for any range of work dates as a CSV file, through the
// application's router under the runtime role in rolled-back transactions. The figures are
// labor.hours' own cells; this file holds the rounding, the rows and the flags column.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import type { Tx } from "../../src/core/context";
import { PAYROLL_COLUMNS, payrollCsv } from "../../src/labor/export";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  workDayIn,
  type WorkDay,
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
const at = (hhmm: string, plusMs = 0, day = DAY) =>
  new Date(Date.parse(`${day}T${hhmm}:00.000Z`) + plusMs).toISOString();

async function session(
  tx: Tx,
  d: WorkDay,
  worker: string,
  job: string,
  start: string,
  end: string,
  flags: ("offline" | "location")[] = [],
) {
  await eventIn(tx, d, { worker, job, type: "started", client: start, flags });
  await eventIn(tx, d, { worker, job, type: "ended", client: end, flags });
}

const rowsOf = (csv: string) =>
  csv
    .split("\r\n")
    .filter((line) => line !== "")
    .map((line) => line.split(","));

describe("labor.export", () => {
  it("rounds the day's total per job once, half-up to the hundredth", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      // On J: three sessions of 20 min 10 s. Each alone is 0.34 h (1.02 if rounded apart);
      // their sum, 60 min 30 s, is 1.0083 h: 1.01.
      for (const hhmm of ["12:00", "13:00", "14:00"]) {
        await session(tx, d, d.w1, d.J, at(hhmm), at(hhmm, 20 * 60_000 + 10_000));
      }
      // On K: exactly half a hundredth over an hour, 60 min 18 s, rounds up to 1.01;
      // w2's 60 min 17.999 s stays 1.00.
      await session(tx, d, d.w1, d.K, at("16:00"), at("16:00", 3_600_000 + 18_000));
      await session(tx, d, d.w2, d.K, at("16:00"), at("16:00", 3_600_000 + 17_999));
      await becomeApp(tx);
      const file = await appCallerIn(tx, admin.who).labor.export({ from: DAY, to: DAY });
      expect(file.filename).toBe(`payroll-hours-${DAY}-to-${DAY}.csv`);
      expect(rowsOf(file.csv)).toEqual([
        [...PAYROLL_COLUMNS],
        ["w1", d.w1, DAY, "J", d.J, "1.01", ""],
        ["w1", d.w1, DAY, "K", d.K, "1.01", ""],
        ["w2", d.w2, DAY, "K", d.K, "1.00", ""],
      ]);
      // The total is the sum of the rounded rows, never rounded again.
      expect(file.hundredths).toBe(302);
    });
  });

  it("carries each row's flags, and leaves out a day with nothing ended", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await session(tx, d, d.w1, d.J, at("12:00"), at("20:00"), ["offline", "location"]);
      // Still on the clock the next day: no hours yet, so no row.
      await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: at("12:00", 0, "2026-10-06"),
      });
      await becomeApp(tx);
      const file = await appCallerIn(tx, admin.who).labor.export({
        from: DAY,
        to: "2026-10-06",
      });
      expect(rowsOf(file.csv).slice(1)).toEqual([
        ["w1", d.w1, DAY, "J", d.J, "8.00", "offline location"],
      ]);
    });
  });

  it("adds up to what the Hours screen shows for the same range, figure by figure", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      // A week with awkward seconds on two jobs, a flagged day and a session left open.
      const odd = 20 * 60_000 + 10_000;
      await session(tx, d, d.w1, d.J, at("12:00"), at("12:00", 7 * 3_600_000 + odd));
      await session(tx, d, d.w1, d.K, at("20:30"), at("20:30", odd));
      await session(
        tx,
        d,
        d.w1,
        d.J,
        at("12:00", 0, "2026-10-06"),
        at("19:59", 0, "2026-10-06"),
        ["offline"],
      );
      await session(
        tx,
        d,
        d.w2,
        d.K,
        at("12:00", 0, "2026-10-07"),
        at("12:00", 5 * odd, "2026-10-07"),
        ["location"],
      );
      await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: at("12:00", 0, "2026-10-08"),
      });
      await becomeApp(tx);
      const range = { from: DAY, to: "2026-10-11" };
      const office = appCallerIn(tx, admin.who).labor;
      const file = await office.export(range);
      const screen = await office.hours(range);

      // The file's rows, read back as a spreadsheet would, in hundredths.
      const rows = rowsOf(file.csv)
        .slice(1)
        .map((r) => ({
          worker: r[1]!,
          day: r[2]!,
          hundredths: Math.round(Number(r[5]) * 100),
        }));
      const sum = (of: typeof rows) => of.reduce((n, r) => n + r.hundredths, 0);

      // The total above the table, the total the dialog states, and the file's own rows.
      expect(sum(rows)).toBe(screen.totals.hundredths);
      expect(file.hundredths).toBe(screen.totals.hundredths);
      // Each person's week total.
      for (const w of screen.workers) {
        expect(sum(rows.filter((r) => r.worker === w.worker.id))).toBe(w.hundredths);
        // Each cell of their row.
        for (const day of w.days) {
          expect(
            sum(rows.filter((r) => r.worker === w.worker.id && r.day === day.workDate)),
          ).toBe(day.hundredths);
        }
      }
      // The row that closes the table.
      for (const day of screen.days) {
        expect(sum(rows.filter((r) => r.day === day.workDate))).toBe(day.hundredths);
      }
      // What the dialog says the range still holds: four flagged entries (two sessions of
      // two), and the one session with no clock-out, which is in no row.
      expect(file.flaggedEntries).toBe(4);
      expect(file.openSessions).toBe(1);
      expect(file.flaggedEntries).toBe(screen.totals.flaggedEntries);
      expect(file.openSessions).toBe(screen.totals.openSessions);
      expect(rows.some((r) => r.day === "2026-10-08")).toBe(false);
    });
  });

  it("takes any range that runs forward, and refuses a backward one", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await session(tx, d, d.w1, d.J, at("12:00"), at("13:00"));
      await becomeApp(tx);
      const caller = appCallerIn(tx, admin.who);
      // A whole year: far past the 31 days labor.hours reads at once.
      const year = await caller.labor.export({ from: "2026-01-01", to: "2026-12-31" });
      expect(rowsOf(year.csv)).toHaveLength(2);
      expect(year.hundredths).toBe(100);
      const before = await caller.labor.export({ from: "2026-01-01", to: "2026-10-04" });
      expect(rowsOf(before.csv)).toEqual([[...PAYROLL_COLUMNS]]);
      expect(
        await outcome(caller.labor.export({ from: "2026-10-06", to: "2026-10-05" })),
      ).toBe("BAD_REQUEST");
    });
  });

  it("is the office's alone", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await workDayIn(tx);
      await becomeApp(tx);
      expect(
        await outcome(appCallerIn(tx, d.who).labor.export({ from: DAY, to: DAY })),
      ).toBe("FORBIDDEN");
    });
  });
});

describe("payrollCsv", () => {
  it("orders by employee, date and job, and guards a name a spreadsheet would run", () => {
    const cell = (worker: string, job: string, workDate: string, hundredths: number) => ({
      worker: { id: `id-${worker}`, name: worker },
      job: { id: `id-${job}`, name: job },
      workDate,
      hundredths,
      openSessions: 0,
      flaggedEntries: 0,
      flags: [],
    });
    const csv = payrollCsv([
      cell("Tom", "Porch", "2026-10-06", 800),
      cell("ana", "=SUM(A1)", "2026-10-06", 450),
      cell("ana", "Kitchen, east", "2026-10-05", 825),
    ]);
    expect(csv).toBe(
      "employee,employee_id,work_date,job,job_id,hours,flags\r\n" +
        'ana,id-ana,2026-10-05,"Kitchen, east","id-Kitchen, east",8.25,\r\n' +
        "ana,id-ana,2026-10-06,'=SUM(A1),id-=SUM(A1),4.50,\r\n" +
        "Tom,id-Tom,2026-10-06,Porch,id-Porch,8.00,\r\n",
    );
  });
});
