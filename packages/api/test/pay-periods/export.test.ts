// The payroll-hours file as text (pay-periods/export.ts, core/csv.ts): its columns, its
// order, the hours as signed decimals, and a name a spreadsheet could misread. Pure: the
// file against a closed period's real figures is close.test.ts's.
import { describe, expect, it } from "vitest";

import { csv, hoursText, text } from "../../src/core/csv";
import { PAYROLL_COLUMNS, payrollCsv } from "../../src/pay-periods/export";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const ana = { id: id(1), name: "Ana Ruiz" };
const kitchen = { id: id(11), name: "Kitchen" };
const closed = {
  at: new Date("2026-10-12T14:00:00Z"),
  by: { id: id(9), name: "Dana" },
  unresolved: { pendingSessions: 0, openSessions: 0 },
};
const period = { id: id(50), startsOn: "2026-10-05", endsOn: "2026-10-11", closed };
const none = { lines: [], total: 0, carriedBy: null };

describe("hoursText", () => {
  it("writes hundredths as a decimal with two places, signed", () => {
    expect([800, 650, 5, 0, -50, -1205, 100000].map(hoursText)).toEqual([
      "8.00",
      "6.50",
      "0.05",
      "0.00",
      "-0.50",
      "-12.05",
      "1000.00",
    ]);
    expect(() => hoursText(1.5)).toThrow();
  });
});

describe("csv", () => {
  it("quotes a cell that holds a comma, a quote or a line break, and ends every row CRLF", () => {
    expect(csv([["a", "b,c", 'd "e"', "f\ng"]])).toBe('a,"b,c","d ""e""","f\ng"\r\n');
    expect(csv([["x"], ["y"]])).toBe("x\r\ny\r\n");
  });

  it("leads typed text a spreadsheet would run as a formula with an apostrophe", () => {
    expect(["=SUM(A1)", "+1", "-2", "@x", "Ana", "O'Neil - East"].map(text)).toEqual([
      "'=SUM(A1)",
      "'+1",
      "'-2",
      "'@x",
      "Ana",
      "O'Neil - East",
    ]);
  });
});

describe("payrollCsv", () => {
  it("is a header, the period's own hours, then its adjustments, each with ids", () => {
    const file = payrollCsv({
      period,
      approved: {
        cells: [
          { worker: ana, job: kitchen, workDate: "2026-10-05", hundredths: 800 },
          { worker: ana, job: kitchen, workDate: "2026-10-06", hundredths: 650 },
        ],
        workers: [{ worker: ana, hundredths: 1450 }],
        total: 1450,
      },
      adjustments: {
        lines: [{ worker: ana, job: kitchen, workDate: "2026-09-30", hundredths: -50 }],
        total: -50,
        carriedBy: null,
      },
    });
    expect(file).toBe(
      [
        PAYROLL_COLUMNS.join(","),
        `2026-10-05,2026-10-11,hours,Ana Ruiz,${ana.id},Kitchen,${kitchen.id},2026-10-05,8.00`,
        `2026-10-05,2026-10-11,hours,Ana Ruiz,${ana.id},Kitchen,${kitchen.id},2026-10-06,6.50`,
        `2026-10-05,2026-10-11,adjustment,Ana Ruiz,${ana.id},Kitchen,${kitchen.id},2026-09-30,-0.50`,
        "",
      ].join("\r\n"),
    );
  });

  it("keeps a name with a comma in one cell and a name that looks like a formula as text", () => {
    const file = payrollCsv({
      period,
      approved: {
        cells: [
          {
            worker: { id: ana.id, name: "Ruiz, Ana" },
            job: { id: kitchen.id, name: "=Kitchen" },
            workDate: "2026-10-05",
            hundredths: 800,
          },
        ],
        workers: [],
        total: 800,
      },
      adjustments: none,
    });
    expect(file.split("\r\n")[1]).toBe(
      `2026-10-05,2026-10-11,hours,"Ruiz, Ana",${ana.id},'=Kitchen,${kitchen.id},2026-10-05,8.00`,
    );
  });

  it("is a header alone for a period with nothing in it", () => {
    expect(
      payrollCsv({
        period,
        approved: { cells: [], workers: [], total: 0 },
        adjustments: none,
      }),
    ).toBe(`${PAYROLL_COLUMNS.join(",")}\r\n`);
  });
});
