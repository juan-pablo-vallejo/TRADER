// crewStatus and its counts: the one naming of a person's status on the company's today,
// from what overview.today answers and the minute.
import { describe, expect, it } from "vitest";

import { crewCounts, crewStatus, minuteIn, type CrewFacts } from "../../src/contract";

const off = { status: "off" } as const;
const shift = (start: string, clockedIn = false) => ({ start, clockedIn });

describe("a person's status", () => {
  it("is the clock's own word while the clock runs, whatever the shifts say", () => {
    const late = [shift("07:00")];
    expect(crewStatus({ shifts: late, clock: { status: "working" } }, "12:00")).toBe(
      "working",
    );
    expect(crewStatus({ shifts: late, clock: { status: "paused" } }, "12:00")).toBe(
      "break",
    );
    expect(crewStatus({ shifts: [], clock: { status: "working" } }, "03:00")).toBe(
      "working",
    );
  });

  it("is expected until 15 minutes past a start with no clock-in, and late from then", () => {
    const person: CrewFacts = { shifts: [shift("07:00")], clock: off };
    expect(crewStatus(person, "00:00")).toBe("expected");
    expect(crewStatus(person, "06:59")).toBe("expected");
    expect(crewStatus(person, "07:00")).toBe("expected");
    expect(crewStatus(person, "07:14")).toBe("expected");
    expect(crewStatus(person, "07:15")).toBe("late");
    expect(crewStatus(person, "23:59")).toBe("late");
  });

  it("is done off the clock once every shift was clocked in on", () => {
    expect(crewStatus({ shifts: [shift("07:00", true)], clock: off }, "16:00")).toBe(
      "done",
    );
    // Worked today with no shift at all.
    expect(crewStatus({ shifts: [], clock: off }, "16:00")).toBe("done");
  });

  it("looks at the shift still waiting: expected for the afternoon's, late past it", () => {
    const person: CrewFacts = {
      shifts: [shift("07:00", true), shift("13:00")],
      clock: off,
    };
    expect(crewStatus(person, "11:30")).toBe("expected");
    expect(crewStatus(person, "13:15")).toBe("late");
  });

  it("is late when any waiting shift is, in whatever order they come", () => {
    const person: CrewFacts = { shifts: [shift("13:00"), shift("07:00")], clock: off };
    expect(crewStatus(person, "09:00")).toBe("late");
  });
});

describe("the counts above the list", () => {
  it("count each person once, at their status", () => {
    const people: CrewFacts[] = [
      { shifts: [shift("07:00", true)], clock: { status: "working" } },
      { shifts: [shift("07:00", true)], clock: { status: "working" } },
      { shifts: [shift("07:00", true)], clock: { status: "paused" } },
      { shifts: [shift("07:00")], clock: off },
      { shifts: [shift("13:00")], clock: off },
      { shifts: [shift("07:00", true)], clock: off },
    ];
    expect(crewCounts(people, "09:00")).toEqual({
      working: 2,
      break: 1,
      late: 1,
      expected: 1,
      done: 1,
    });
    expect(crewCounts([], "09:00")).toEqual({
      working: 0,
      break: 0,
      late: 0,
      expected: 0,
      done: 0,
    });
  });
});

describe("the minute on the company's wall clock", () => {
  it("is read through the zone's rules, either side of a clock change", () => {
    expect(minuteIn(new Date("2026-11-16T12:05:00Z"), "America/New_York")).toBe("07:05");
    expect(minuteIn(new Date("2026-07-16T12:05:00Z"), "America/New_York")).toBe("08:05");
    expect(minuteIn(new Date("2026-11-16T05:00:00Z"), "America/New_York")).toBe("00:00");
    expect(minuteIn(new Date("2026-11-16T04:59:59Z"), "America/New_York")).toBe("23:59");
  });
});
