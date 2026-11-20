// Hours aggregation: durations summed in milliseconds per worker,
// job and work date, the day's sum rounded once, half-up to 0.01 h. Pure: no database.
import { describe, expect, it } from "vitest";

import { sessionAccounting } from "../../src/labor/accounting";
import type { LaborEvent } from "../../src/labor/fold";
import { dayHours, HUNDREDTH_HOUR_MS, roundHours } from "../../src/labor/hours";
import type { EntryFlag } from "../../src/sync/reasons";
import { at, builder, HOUR, JOB_A, JOB_B, MINUTE, WORKER } from "./events";

const ZONE = "America/New_York";
const flagged = (...pairs: [LaborEvent, EntryFlag[]][]) =>
  new Map(pairs.map(([e, f]) => [e.id, f]));
const cells = (ledger: LaborEvent[], flags = new Map<string, EntryFlag[]>()) =>
  dayHours(WORKER, sessionAccounting(ledger), ZONE, (id) => flags.get(id) ?? []);

describe("roundHours", () => {
  it("rounds a half-way value up and anything under it down", () => {
    expect(roundHours(0)).toBe(0);
    expect(roundHours(HUNDREDTH_HOUR_MS / 2 - 1)).toBe(0);
    expect(roundHours(HUNDREDTH_HOUR_MS / 2)).toBe(1);
    expect(roundHours(HUNDREDTH_HOUR_MS + HUNDREDTH_HOUR_MS / 2 - 1)).toBe(1);
    expect(roundHours(HUNDREDTH_HOUR_MS + HUNDREDTH_HOUR_MS / 2)).toBe(2);
    expect(roundHours(8 * HOUR)).toBe(800);
  });

  it("refuses anything that is not a whole, non-negative number of milliseconds", () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => roundHours(bad)).toThrow();
    }
  });
});

describe("dayHours", () => {
  // 20 min 10 s is 33.61 hundredths: alone it rounds to 34.
  const SPAN = 20 * MINUTE + 10_000;

  function threeSessions() {
    const ev = builder();
    const ledger: LaborEvent[] = [];
    for (const hhmm of ["12:00", "13:00", "14:00"]) {
      const start = at(hhmm);
      ledger.push(ev("started", start), ev("ended", new Date(start.getTime() + SPAN)));
    }
    return ledger;
  }

  it("rounds three sessions of 20 min 10 s once, on their sum", () => {
    expect(roundHours(SPAN)).toBe(34);
    const [cell, ...rest] = cells(threeSessions());
    expect(rest).toEqual([]);
    expect(cell).toMatchObject({
      workerId: WORKER,
      jobId: JOB_A,
      workDate: "2026-10-05",
      workedMs: 3 * SPAN,
      hundredths: 101,
    });
    expect(cell!.hundredths).not.toBe(3 * roundHours(SPAN));
  });

  it("keeps two jobs on one day in two cells", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("12:00")),
      ev("ended", at("14:00")),
      ev("started", at("14:00"), { job: JOB_B }),
      ev("ended", at("17:30"), { job: JOB_B }),
    ];
    expect(cells(ledger).map((c) => [c.jobId, c.workDate, c.hundredths])).toEqual([
      [JOB_A, "2026-10-05", 200],
      [JOB_B, "2026-10-05", 350],
    ]);
  });

  it("gives an overnight session wholly to the day it started, in the company's zone", () => {
    const ev = builder();
    // 22:00 to 02:00 in New York: 02:00Z to 06:00Z on the 6th, UTC.
    const ledger = [
      ev("started", at("02:00", "2026-10-06")),
      ev("ended", at("06:00", "2026-10-06")),
      // 21:00 on the 6th in New York.
      ev("started", at("01:00", "2026-10-07")),
      ev("ended", at("02:00", "2026-10-07")),
    ];
    expect(cells(ledger).map((c) => [c.workDate, c.hundredths])).toEqual([
      ["2026-10-05", 400],
      ["2026-10-06", 100],
    ]);
  });

  it("leaves a break out of the hours", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("12:00")),
      ev("paused", at("16:00")),
      ev("resumed", at("16:30")),
      ev("ended", at("20:30")),
    ];
    expect(cells(ledger)[0]).toMatchObject({ workedMs: 8 * HOUR });
  });

  it("drops a voided session the moment its void is written", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const end = ev("ended", at("14:00"));
    expect(cells([start, end])[0]).toMatchObject({ hundredths: 200 });
    const gone = ev("voided", at("15:00"), { voids: start.id });
    expect(cells([start, end, gone])).toEqual([]);
  });

  it("counts a flagged session whole, and carries its entries' flags in the enum's order", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const end = ev("ended", at("14:00"));
    const later = ev("started", at("15:00"));
    const ledger = [start, end, later, ev("ended", at("16:00"))];
    expect(
      cells(
        ledger,
        flagged(
          [start, ["unscheduled", "offline"]],
          [end, ["offline", "user_timed"]],
          [later, ["location"]],
        ),
      ),
    ).toEqual([
      {
        workerId: WORKER,
        jobId: JOB_A,
        workDate: "2026-10-05",
        workedMs: 3 * HOUR,
        hundredths: 300,
        openSessions: 0,
        // Three entries carry a flag; the fourth carries none. Each is counted once,
        // however many flags it holds.
        flaggedEntries: 3,
        flags: ["offline", "user_timed", "location", "unscheduled"],
      },
    ]);
    expect(cells(ledger)[0]).toMatchObject({
      hundredths: 300,
      flaggedEntries: 0,
      flags: [],
    });
  });

  it("adds nothing for a session that is still open", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("12:00")),
      ev("ended", at("13:00")),
      ev("started", at("14:00")),
      ev("paused", at("16:00")),
    ];
    expect(cells(ledger)[0]).toMatchObject({
      workedMs: HOUR,
      hundredths: 100,
      openSessions: 1,
    });
  });

  it("counts a corrected event once, at the correction's time", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const end = ev("ended", at("14:00"));
    const fixed = ev("ended", at("15:00"), { corrects: end.id, server: at("18:00") });
    // The correction counts as written; the entry it replaced lends neither time nor flags.
    expect(
      cells([start, end, fixed], flagged([end, ["offline"]], [fixed, ["corrected"]]))[0],
    ).toMatchObject({ workedMs: 3 * HOUR, hundredths: 300, flags: ["corrected"] });
  });
});
