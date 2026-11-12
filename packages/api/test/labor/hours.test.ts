// Stage 4, hours and cost aggregation (V1-D13): durations summed in milliseconds per worker,
// job and work date, the day's sum rounded once, half-up to 0.01 h. Pure: no database.
import { describe, expect, it } from "vitest";

import { sessionApprovals, type Decision } from "../../src/labor/approval";
import type { LaborEvent } from "../../src/labor/fold";
import { dayHours, HUNDREDTH_HOUR_MS, roundHours } from "../../src/labor/hours";
import { at, builder, HOUR, JOB_A, JOB_B, MINUTE, WORKER } from "./events";

const ZONE = "America/New_York";
const decided = (...pairs: [LaborEvent, Decision][]) =>
  new Map(pairs.map(([e, d]) => [e.id, d]));
const cells = (ledger: LaborEvent[], decisions = new Map<string, Decision>()) =>
  dayHours(WORKER, sessionApprovals(ledger, decisions), ZONE);

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
      approvedMs: 3 * SPAN,
      approvedHundredths: 101,
    });
    expect(cell!.approvedHundredths).not.toBe(3 * roundHours(SPAN));
  });

  it("keeps two jobs on one day in two cells", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("12:00")),
      ev("ended", at("14:00")),
      ev("started", at("14:00"), { job: JOB_B }),
      ev("ended", at("17:30"), { job: JOB_B }),
    ];
    expect(cells(ledger).map((c) => [c.jobId, c.workDate, c.approvedHundredths])).toEqual(
      [
        [JOB_A, "2026-10-05", 200],
        [JOB_B, "2026-10-05", 350],
      ],
    );
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
    expect(cells(ledger).map((c) => [c.workDate, c.approvedHundredths])).toEqual([
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
    expect(cells(ledger)[0]).toMatchObject({ approvedMs: 8 * HOUR });
  });

  it("keeps a pending session apart, with what the fold measures", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const ledger = [
      start,
      ev("ended", at("14:00")),
      ev("started", at("15:00")),
      ev("ended", at("16:00")),
    ];
    expect(cells(ledger, decided([start, null]))).toEqual([
      {
        workerId: WORKER,
        jobId: JOB_A,
        workDate: "2026-10-05",
        approvedMs: HOUR,
        approvedHundredths: 100,
        pendingMs: 2 * HOUR,
        pendingHundredths: 200,
        pendingSessions: 1,
        rejectedSessions: 0,
        openSessions: 0,
      },
    ]);
    expect(cells(ledger, decided([start, "approved"]))[0]).toMatchObject({
      approvedHundredths: 300,
      pendingSessions: 0,
      pendingMs: 0,
    });
  });

  it("counts a rejected session and none of its time", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const ledger = [start, ev("ended", at("14:00"))];
    expect(cells(ledger, decided([start, "rejected"]))[0]).toMatchObject({
      approvedMs: 0,
      pendingMs: 0,
      rejectedSessions: 1,
    });
  });

  it("drops a voided session, counts one whose void was rejected, withholds a pending void", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const end = ev("ended", at("14:00"));
    const gone = ev("voided", at("15:00"), { voids: start.id });
    const ledger = [start, end, gone];
    expect(cells(ledger)).toEqual([]);
    expect(cells(ledger, decided([gone, "approved"]))).toEqual([]);
    expect(cells(ledger, decided([gone, "rejected"]))[0]).toMatchObject({
      approvedHundredths: 200,
    });
    expect(cells(ledger, decided([gone, null]))[0]).toMatchObject({
      approvedMs: 0,
      pendingSessions: 1,
    });
  });

  it("adds nothing for a session that counts but is still open", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("12:00")),
      ev("ended", at("13:00")),
      ev("started", at("14:00")),
      ev("paused", at("16:00")),
    ];
    expect(cells(ledger)[0]).toMatchObject({
      approvedMs: HOUR,
      approvedHundredths: 100,
      openSessions: 1,
      pendingMs: 0,
    });
  });

  it("counts a corrected event once, at the correction's time", () => {
    const ev = builder();
    const start = ev("started", at("12:00"));
    const end = ev("ended", at("14:00"));
    const fixed = ev("ended", at("15:00"), { corrects: end.id, server: at("18:00") });
    expect(cells([start, end, fixed])[0]).toMatchObject({ approvedHundredths: 300 });
    // The correction waits: the whole session does, and the original is not counted beside it.
    expect(cells([start, end, fixed], decided([fixed, null]))[0]).toMatchObject({
      approvedMs: 0,
      pendingSessions: 1,
      pendingHundredths: 300,
    });
  });
});
