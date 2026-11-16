// The Weekly Schedule screen's own arithmetic (DESIGN, Weekly Schedule, Shift card, Overlap
// override, Copy Last Week): the week a day is in, the rows by employee and by jobsite, what
// a card says about clocking in, the overlaps a change would make, the day as it would stand,
// and a refusal in words. The rules are the server's and are tested there
// (api eligibility.test.ts); here only what the screen does with them.
import { describe, expect, it } from "vitest";

import {
  byEmployee,
  byJobsite,
  clockInNote,
  copiesIn,
  issueText,
  mondayOf,
  overlapsWith,
  peopleOn,
  previewDay,
  refusalText,
  type WeekShift,
} from "../src/app/schedule/schedule-view";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const ana = { id: id(1), name: "Ana", active: true };
const tom = { id: id(2), name: "Tom", active: true };
const kitchen = { id: id(11), name: "Kitchen", status: "open" as const };
const porch = { id: id(12), name: "Porch", status: "open" as const };

const shift = (
  n: number,
  worker: WeekShift["worker"],
  job: WeekShift["job"],
  workDate: string,
  expectedStart: string,
  expectedEnd: string,
  over: Partial<WeekShift> = {},
): WeekShift => ({
  id: id(100 + n),
  workDate,
  expectedStart,
  expectedEnd,
  worker,
  job,
  mayClockIn: true,
  blockedBy: null,
  locked: false,
  copyId: null,
  eligible: [{ start: expectedStart, end: expectedEnd }],
  ...over,
});

const MON = "2026-11-09";
const label = (shiftId: string) => `shift ${shiftId.slice(-3)}`;

describe("mondayOf", () => {
  it("answers the Monday of the week a day is in, Sunday included", () => {
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-12")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    // Across a month and a year.
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("the week's rows", () => {
  const shifts = [
    shift(1, tom, kitchen, MON, "12:00", "17:00"),
    shift(2, ana, porch, MON, "13:00", "17:00"),
    shift(3, ana, kitchen, MON, "07:00", "12:00"),
    shift(4, ana, kitchen, "2026-11-10", "07:00", "15:30"),
  ];

  it("by employee: in name order, a day's shifts by start, and the unscheduled beneath", () => {
    const gone = { id: id(3), name: "Bea", active: false };
    const idle = { id: id(4), name: "Cal", active: true };
    const rows = byEmployee(shifts, [tom, ana, gone, idle]);
    // A deactivated person with no shift is not offered a row.
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Cal", "Tom"]);
    expect(rows[0]!.days.get(MON)!.map((s) => s.expectedStart)).toEqual([
      "07:00",
      "13:00",
    ]);
    expect(rows[1]!.days.size).toBe(0);
  });

  it("by jobsite: each with its shifts and the people it has each day", () => {
    const rows = byJobsite(shifts);
    expect(rows.map((r) => r.name)).toEqual(["Kitchen", "Porch"]);
    expect(peopleOn(rows[0]!, MON)).toBe(2);
    expect(peopleOn(rows[0]!, "2026-11-10")).toBe(1);
    expect(peopleOn(rows[1]!, "2026-11-11")).toBe(0);
    // One person twice on a jobsite in a day is one person.
    const twice = byJobsite([
      shift(5, ana, kitchen, MON, "07:00", "11:00"),
      shift(6, ana, kitchen, MON, "12:00", "15:00"),
    ]);
    expect(peopleOn(twice[0]!, MON)).toBe(1);
  });
});

describe("clockInNote", () => {
  it("says nothing for a whole shift, the hours an override left, or that nothing is decided", () => {
    const whole = shift(1, ana, kitchen, MON, "07:00", "15:30");
    expect(clockInNote(whole)).toBeNull();
    expect(clockInNote({ ...whole, eligible: [{ start: "07:00", end: "12:00" }] })).toBe(
      "Clock in 07:00–12:00",
    );
    expect(
      clockInNote({
        ...whole,
        eligible: [
          { start: "07:00", end: "09:00" },
          { start: "11:00", end: "15:30" },
        ],
      }),
    ).toBe("Clock in 07:00–09:00, 11:00–15:30");
    expect(clockInNote({ ...whole, eligible: null })).toBe(
      "Overlaps another shift; nothing decided",
    );
  });
});

describe("overlapsWith", () => {
  const morning = shift(1, ana, kitchen, MON, "07:00", "12:00");
  const late = shift(2, ana, porch, MON, "13:00", "17:00");

  it("names each shift a change would overlap and the time they would share", () => {
    const moved = { id: late.id, start: "10:00", end: "14:00" };
    expect(overlapsWith(moved, [morning, late])).toEqual([
      { other: morning, start: "10:00", end: "12:00" },
    ]);
  });

  it("does not count shifts that only touch, nor the shift itself", () => {
    expect(
      overlapsWith({ id: id(999), start: "12:00", end: "13:00" }, [morning, late]),
    ).toEqual([]);
    expect(
      overlapsWith({ id: morning.id, start: "07:00", end: "12:00" }, [morning]),
    ).toEqual([]);
  });
});

describe("previewDay", () => {
  const morning = shift(1, ana, kitchen, MON, "07:00", "15:30");
  const late = { id: id(200), jobId: porch.id, start: "12:00", end: "17:00" };

  it("shows who clocks in where once a decision is made", () => {
    const preview = previewDay(
      late,
      [morning],
      [{ holderId: morning.id, yieldingId: late.id }],
    );
    expect(preview).toEqual({
      ok: true,
      timeline: [
        { start: "07:00", end: "15:30", shiftId: morning.id, jobId: kitchen.id },
        { start: "15:30", end: "17:00", shiftId: late.id, jobId: porch.id },
      ],
    });
  });

  it("answers the server's own issues when the day would not stand", () => {
    expect(previewDay(late, [morning], [])).toMatchObject({
      ok: false,
      issues: [{ code: "missing_decision", start: "12:00", end: "15:30" }],
    });
    const inside = { id: id(201), jobId: porch.id, start: "09:00", end: "11:00" };
    expect(
      previewDay(inside, [morning], [{ holderId: morning.id, yieldingId: inside.id }]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "no_eligible_time", shiftId: inside.id }],
    });
  });

  it("replaces the shift being changed, by its id, with its new hours", () => {
    const preview = previewDay(
      { id: morning.id, jobId: kitchen.id, start: "08:00", end: "10:00" },
      [morning],
      [],
    );
    expect(preview).toMatchObject({
      ok: true,
      timeline: [{ start: "08:00", end: "10:00" }],
    });
  });
});

describe("a refusal in words", () => {
  it("names the shifts and the hours of each issue", () => {
    expect(
      issueText(
        {
          code: "missing_decision",
          shiftIds: [id(101), id(102)],
          start: "12:00",
          end: "15:30",
        },
        label,
      ),
    ).toBe(
      "shift 101 and shift 102 overlap during 12:00–15:30 and nothing says which one holds that time.",
    );
    expect(
      issueText(
        {
          code: "circular_precedence",
          shiftIds: [id(101), id(102), id(103)],
          start: "10:00",
          end: "12:00",
        },
        label,
      ),
    ).toContain("in a circle during 10:00–12:00");
    expect(issueText({ code: "no_eligible_time", shiftId: id(102) }, label)).toBe(
      "shift 102 would have no time of its own to clock in on.",
    );
    expect(
      issueText({ code: "duplicate_shift", shiftIds: [id(101), id(102)] }, label),
    ).toBe("That shift already exists.");
  });

  it("says each refusal a write can answer", () => {
    expect(refusalText({ code: "locked" }, label)).toContain(
      "Correct attendance in Labor",
    );
    expect(refusalText({ code: "authorization", shiftId: id(101) }, label)).toContain(
      "already clocked in on shift 101",
    );
    expect(refusalText({ code: "user_inactive" }, label)).toBe(
      "That employee is deactivated.",
    );
    expect(refusalText({ code: "job_archived" }, label)).toBe(
      "That jobsite is archived.",
    );
    expect(
      refusalText(
        {
          code: "schedule",
          issues: [
            { code: "duplicate_shift", shiftIds: [id(101), id(102)] },
            { code: "no_eligible_time", shiftId: id(102) },
          ],
        },
        label,
      ),
    ).toBe(
      "That shift already exists. shift 102 would have no time of its own to clock in on.",
    );
  });
});

describe("copiesIn", () => {
  it("counts each copy's shifts in the week and whether a clock-in locked any", () => {
    const a = id(900);
    const b = id(901);
    expect(
      copiesIn([
        shift(1, ana, kitchen, MON, "07:00", "12:00", { copyId: a }),
        shift(2, ana, kitchen, "2026-11-10", "07:00", "12:00", {
          copyId: a,
          locked: true,
        }),
        shift(3, tom, porch, MON, "07:00", "12:00", { copyId: b }),
        shift(4, tom, porch, "2026-11-11", "07:00", "12:00"),
      ]),
    ).toEqual([
      { copyId: a, count: 2, locked: true },
      { copyId: b, count: 1, locked: false },
    ]);
  });
});
