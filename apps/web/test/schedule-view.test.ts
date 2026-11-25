// The Weekly Schedule screen's own arithmetic: the week a day is in, the rows by employee and by jobsite, the overlaps a
// change would make, and a refusal in words. The rules are the server's and are tested there
// (api eligibility.test.ts); here only what the screen does with them.
import { describe, expect, it } from "vitest";

import { en } from "../src/app/i18n/en";
import {
  byEmployee,
  byJobsite,
  copiesIn,
  issueText,
  mondayOf,
  nowIn,
  offeredTimes,
  overlapsWith,
  peopleOn,
  personWeek,
  refusalText,
  SCHEDULE_FILTERS,
  scheduleOf,
  weekFilter,
  type WeekShift,
} from "../src/app/(office)/schedule/schedule-view";

// The English words: what the sentences below are held to.
const S = en.schedule;
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

describe("a refusal in words", () => {
  it("names the shifts and the hours of each issue", () => {
    expect(
      issueText(
        S,
        {
          code: "overlap",
          shiftIds: [id(101), id(102)],
          start: "12:00",
          end: "15:30",
        },
        label,
      ),
    ).toBe("shift 101 and shift 102 overlap during 12:00–15:30.");
    expect(
      issueText(S, { code: "duplicate_shift", shiftIds: [id(101), id(102)] }, label),
    ).toBe("That shift already exists.");
  });

  it("says each refusal a write can answer", () => {
    expect(refusalText(S, { code: "locked" }, label)).toContain(
      "Correct attendance in Hours",
    );
    expect(refusalText(S, { code: "authorization", shiftId: id(101) }, label)).toContain(
      "already clocked in on shift 101",
    );
    expect(refusalText(S, { code: "user_inactive" }, label)).toBe(
      "That employee is deactivated.",
    );
    expect(refusalText(S, { code: "job_archived" }, label)).toBe(
      "That jobsite is archived.",
    );
    expect(
      refusalText(
        S,
        {
          code: "schedule",
          issues: [
            { code: "duplicate_shift", shiftIds: [id(101), id(102)] },
            {
              code: "overlap",
              shiftIds: [id(101), id(102)],
              start: "12:00",
              end: "15:30",
            },
          ],
        },
        label,
      ),
    ).toBe(
      "That shift already exists. shift 101 and shift 102 overlap during 12:00–15:30.",
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

describe("the time now on the company's clock", () => {
  it("is the zone's day and minute, whatever zone the browser is in", () => {
    const at = new Date("2026-11-17T04:30:00Z");
    // 23:30 on the 16th in New York, already the 17th in UTC.
    expect(nowIn("America/New_York", at)).toEqual({ day: "2026-11-16", minute: "23:30" });
    expect(nowIn("UTC", at)).toEqual({ day: "2026-11-17", minute: "04:30" });
  });
});

describe("the hours a new shift opens with", () => {
  const now = (minute: string) => ({ day: "2026-11-16", minute });

  it("is the usual day for any other day, and for today before the usual start", () => {
    expect(offeredTimes("2026-11-17", now("10:20"))).toEqual({
      start: "07:00",
      end: "15:30",
    });
    expect(offeredTimes("", now("10:20"))).toEqual({ start: "07:00", end: "15:30" });
    expect(offeredTimes("2026-11-16", now("06:10"))).toEqual({
      start: "07:00",
      end: "15:30",
    });
  });

  it("starts today's from the next quarter hour, to the usual end or two hours on", () => {
    expect(offeredTimes("2026-11-16", now("10:20"))).toEqual({
      start: "10:30",
      end: "15:30",
    });
    expect(offeredTimes("2026-11-16", now("10:30"))).toEqual({
      start: "10:30",
      end: "15:30",
    });
    expect(offeredTimes("2026-11-16", now("15:40"))).toEqual({
      start: "15:45",
      end: "17:45",
    });
    // Never past the day, and the end always after the start.
    expect(offeredTimes("2026-11-16", now("22:50"))).toEqual({
      start: "23:00",
      end: "23:59",
    });
    expect(offeredTimes("2026-11-16", now("23:58"))).toEqual({
      start: "23:45",
      end: "23:59",
    });
  });
});

describe("a person's week, beside the form", () => {
  it("is their shifts alone, day by day, each day in time order", () => {
    const days = Array.from({ length: 7 }, (_, n) =>
      new Date(Date.parse(`${MON}T00:00:00Z`) + n * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
    const week = {
      weekStart: MON,
      timezone: "America/New_York",
      days,
      shifts: [
        shift(1, ana, porch, MON, "12:00", "15:30"),
        shift(2, tom, kitchen, MON, "07:00", "15:30"),
        shift(3, ana, kitchen, MON, "07:00", "11:30"),
        shift(4, ana, kitchen, "2026-11-11", "07:00", "15:30", { locked: true }),
      ],
    };
    const theirs = personWeek(week, ana.id);
    expect(theirs.map((d) => d.day)).toEqual(days);
    expect(
      theirs
        .filter((d) => d.shifts.length > 0)
        .map((d) => [d.day, d.shifts.map((x) => `${x.job.name} ${x.expectedStart}`)]),
    ).toEqual([
      [MON, ["Kitchen 07:00", "Porch 12:00"]],
      ["2026-11-11", ["Kitchen 07:00"]],
    ]);
    expect(personWeek(week, id(99)).every((d) => d.shifts.length === 0)).toBe(true);
  });
});

describe("the schedule's place in the address", () => {
  const today = "2026-11-25"; // a Wednesday

  it("opens on this week, by employee, today chosen, when the address says nothing", () => {
    expect(scheduleOf(SCHEDULE_FILTERS, today)).toEqual({
      weekStart: "2026-11-23",
      selected: "2026-11-25",
      view: "employee",
      only: "",
    });
  });

  it("keeps the week, the day, the view and the person it names", () => {
    const filters = {
      ...SCHEDULE_FILTERS,
      week: "2026-11-30",
      day: "2026-12-02",
      view: "jobsite",
      who: "p1",
    };
    expect(scheduleOf(filters, today)).toEqual({
      weekStart: "2026-11-30",
      selected: "2026-12-02",
      view: "jobsite",
      only: "p1",
    });
  });

  it("chooses another week's Monday when it names no day in it", () => {
    const filters = { ...SCHEDULE_FILTERS, week: "2026-11-30" };
    expect(scheduleOf(filters, today).selected).toBe("2026-11-30");
  });

  it("reads a week that is no Monday, or no date, as this week", () => {
    for (const week of ["2026-12-01", "next", "2026-13-40"]) {
      expect(scheduleOf({ ...SCHEDULE_FILTERS, week }, today).weekStart).toBe(
        "2026-11-23",
      );
    }
  });

  it("reads a day outside the week as the week's own default", () => {
    const filters = { ...SCHEDULE_FILTERS, day: "2026-12-09" };
    expect(scheduleOf(filters, today).selected).toBe("2026-11-25");
  });

  it("writes this week as nothing, so the plain address is the plain screen", () => {
    expect(weekFilter("2026-11-23", today)).toBe("");
    expect(weekFilter("2026-11-30", today)).toBe("2026-11-30");
  });
});
