// The close's subtraction (pay-periods/lines.ts), without a database: what each close would
// store, close after close, as the approved figures move underneath it.
import { describe, expect, it } from "vitest";

import {
  closeLines,
  unresolvedIn,
  type Approved,
  type Line,
  type Range,
} from "../../src/pay-periods/lines";

const W = "018f0000-0000-7000-8000-000000000001";
const V = "018f0000-0000-7000-8000-000000000002";
const J = "018f0000-0000-7000-8000-00000000000a";
const K = "018f0000-0000-7000-8000-00000000000b";

const P1: Range = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const P2: Range = { startsOn: "2026-10-12", endsOn: "2026-10-18" };
const P3: Range = { startsOn: "2026-10-19", endsOn: "2026-10-25" };
const P4: Range = { startsOn: "2026-10-26", endsOn: "2026-11-01" };

const cell = (
  workDate: string,
  approvedHundredths: number,
  workerId = W,
  jobId = J,
): Approved => ({ workerId, jobId, workDate, approvedHundredths });

const line = (workDate: string, hundredths: number, workerId = W, jobId = J): Line => ({
  workerId,
  jobId,
  workDate,
  hundredths,
});

// Closes periods in order against the figures standing at each close, storing every line as
// the database would, and answers what each close wrote.
function closing() {
  const stored: Line[] = [];
  const closed: Range[] = [];
  return (period: Range, cells: Approved[]) => {
    const written = closeLines(cells, stored, period, closed);
    stored.push(...written.own, ...written.adjustments);
    closed.push(period);
    return written;
  };
}

describe("closeLines", () => {
  it("stores the approved cells on the period's dates as its own hours", () => {
    const close = closing();
    expect(
      close(P1, [
        cell("2026-10-05", 800),
        cell("2026-10-11", 650, V, K),
        cell("2026-10-12", 400),
      ]),
    ).toEqual({
      own: [line("2026-10-05", 800), line("2026-10-11", 650, V, K)],
      adjustments: [],
    });
  });

  it("stores no line for a cell with nothing approved", () => {
    expect(closing()(P1, [cell("2026-10-05", 0)])).toEqual({ own: [], adjustments: [] });
  });

  it("carries hours approved after the close as one positive adjustment", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    // Wednesday's hours were pending at the close and approved after it.
    const late = [cell("2026-10-05", 800), cell("2026-10-07", 650)];
    expect(close(P2, [...late, cell("2026-10-12", 800)])).toEqual({
      own: [line("2026-10-12", 800)],
      adjustments: [line("2026-10-07", 650)],
    });
  });

  it("carries a correction that lowers hours as a negative adjustment", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    expect(close(P2, [cell("2026-10-05", 725)]).adjustments).toEqual([
      line("2026-10-05", -75),
    ]);
  });

  it("returns what was exported for a cell that no longer exists", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    // A corrected start moved the session to another job on the same day.
    expect(close(P2, [cell("2026-10-05", 800, W, K)]).adjustments).toEqual([
      line("2026-10-05", -800, W, J),
      line("2026-10-05", 800, W, K),
    ]);
  });

  it("writes each change once: two further closes add nothing", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    const after = [cell("2026-10-05", 725), cell("2026-10-07", 650)];
    expect(close(P2, after).adjustments).toHaveLength(2);
    expect(close(P3, after)).toEqual({ own: [], adjustments: [] });
    expect(close(P4, after)).toEqual({ own: [], adjustments: [] });
  });

  it("subtracts every earlier line of a cell, adjustments included", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    close(P2, [cell("2026-10-05", 725)]);
    // Repaired again after the second close: the difference is from 7.25, not from 8.00.
    expect(close(P3, [cell("2026-10-05", 750)]).adjustments).toEqual([
      line("2026-10-05", 25),
    ]);
    expect(close(P4, [cell("2026-10-05", 750)]).adjustments).toEqual([]);
  });

  it("adjusts a day of the period just closed as well as an older one", () => {
    const close = closing();
    close(P1, [cell("2026-10-05", 800)]);
    close(P2, [cell("2026-10-05", 800), cell("2026-10-12", 800)]);
    expect(
      close(P3, [cell("2026-10-05", 810), cell("2026-10-12", 790)]).adjustments,
    ).toEqual([line("2026-10-05", 10), line("2026-10-12", -10)]);
  });

  it("exports nothing for a day before the first period or in no period", () => {
    const close = closing();
    // The Friday before the first period, and a day after the closing one.
    const cells = [
      cell("2026-10-02", 800),
      cell("2026-10-05", 800),
      cell("2026-10-20", 800),
    ];
    expect(close(P1, cells)).toEqual({ own: [line("2026-10-05", 800)], adjustments: [] });
    // P3 closes next, leaving P2's week a gap: its day is in no close.
    expect(close(P3, [...cells, cell("2026-10-14", 800)])).toEqual({
      own: [line("2026-10-20", 800)],
      adjustments: [],
    });
  });

  it("orders lines by work date, then worker, then job", () => {
    const lines = closing()(P1, [
      cell("2026-10-06", 100, V, J),
      cell("2026-10-05", 100, V, K),
      cell("2026-10-05", 100, V, J),
      cell("2026-10-05", 100, W, K),
    ]).own;
    expect(lines.map((l) => [l.workDate, l.workerId, l.jobId])).toEqual([
      ["2026-10-05", W, K],
      ["2026-10-05", V, J],
      ["2026-10-05", V, K],
      ["2026-10-06", V, J],
    ]);
  });

  it("refuses a state closes never reach", () => {
    expect(() => closeLines([], [], P1, [P2])).toThrow(/after every closed period/);
    expect(() =>
      closeLines([cell("2026-10-05", 800)], [line("2026-10-05", 800)], P1, []),
    ).toThrow(/open period was exported/);
    expect(() =>
      closeLines([cell("2026-10-05", 1), cell("2026-10-05", 2)], [], P1, []),
    ).toThrow(/one cell/);
  });
});

describe("unresolvedIn", () => {
  it("counts waiting and open sessions on the period's dates only", () => {
    const c = (workDate: string, pendingSessions: number, openSessions: number) => ({
      workDate,
      pendingSessions,
      openSessions,
    });
    expect(
      unresolvedIn(
        [
          c("2026-10-04", 5, 5),
          c("2026-10-05", 1, 0),
          c("2026-10-11", 2, 1),
          c("2026-10-12", 7, 7),
        ],
        P1,
      ),
    ).toEqual({ pendingSessions: 3, openSessions: 1 });
  });
});
