// The Crew tab's own arithmetic: the times a new shift is offered, the shift a minute
// falls in, the crew by job, and a refusal as one of the tab's sentences.
import type { PullOutput } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import {
  byJob,
  coveringShift,
  offeredEnd,
  opensOnCrew,
  quarterAfter,
  refusalOf,
  stepTime,
  type Crew,
  type CrewPerson,
} from "../../src/sync/crew";

describe("the times a new shift is offered", () => {
  it("starts at the quarter hour at or after now, inside the day", () => {
    expect(quarterAfter("07:00")).toBe("07:00");
    expect(quarterAfter("07:01")).toBe("07:15");
    expect(quarterAfter("07:59")).toBe("08:00");
    expect(quarterAfter("23:46")).toBe("23:45");
  });

  it("ends at the usual end, or two hours on, and always after the start", () => {
    expect(offeredEnd("07:15")).toBe("15:30");
    expect(offeredEnd("15:30")).toBe("17:30");
    expect(offeredEnd("22:30")).toBe("23:59");
    expect(offeredEnd("23:45")).toBe("23:59");
    for (const start of ["00:00", "15:15", "15:30", "23:45"]) {
      expect(offeredEnd(start) > start).toBe(true);
    }
  });

  it("steps by quarter hours and never leaves the day", () => {
    expect(stepTime("07:15", 1)).toBe("07:30");
    expect(stepTime("07:15", -1)).toBe("07:00");
    expect(stepTime("00:00", -1)).toBe("00:00");
    expect(stepTime("23:45", 1)).toBe("23:59");
    expect(stepTime("23:59", 1)).toBe("23:59");
    expect(stepTime("23:59", -1)).toBe("23:45");
    // A time off the grid, as a shift made in the office may have, lands on it.
    expect(stepTime("07:20", 1)).toBe("07:30");
  });
});

const J = "00000000-0000-7000-8000-00000000000a";
const K = "00000000-0000-7000-8000-00000000000b";
const job = (id: string, name: string): Crew["jobs"][number] => ({
  id,
  name,
  address: null,
  notes: null,
  location: null,
  status: "open",
  customer: { id: "00000000-0000-7000-8000-0000000000c1", name: "C" },
});
let n = 0;
const person = (
  name: string,
  shifts: [string, string, string][],
  clock: CrewPerson["clock"] = { status: "off" },
): CrewPerson => ({
  person: {
    id: `00000000-0000-7000-8000-0000000001${String(n++).padStart(2, "0")}`,
    name,
    phone: null,
  },
  shifts: shifts.map(([jobId, start, end], i) => ({
    id: `00000000-0000-7000-8000-00000000020${i}`,
    jobId,
    start,
    end,
    clockedIn: false,
  })),
  clock,
  workedMs: 0,
  workedJobIds: [],
});
const NO_MONEY: Crew["money"] = {
  owed: [],
  overdue: [],
  drafts: 0,
  completeJobsNotInvoiced: 0,
};
const on = (jobId: string): CrewPerson["clock"] => ({
  status: "working",
  jobId,
  since: new Date("2026-11-16T12:00:00Z"),
  sinceDay: "2026-11-16",
});

describe("the shift a minute falls in", () => {
  const p = person("A", [
    [J, "07:00", "11:00"],
    [K, "11:00", "15:30"],
  ]);
  it("includes its start and excludes its end", () => {
    expect(coveringShift(p, "06:59")).toBeNull();
    expect(coveringShift(p, "07:00")?.jobId).toBe(J);
    expect(coveringShift(p, "10:59")?.jobId).toBe(J);
    expect(coveringShift(p, "11:00")?.jobId).toBe(K);
    expect(coveringShift(p, "15:30")).toBeNull();
  });
});

describe("the crew by job", () => {
  it("puts a person where their clock is, and otherwise where their shift is", () => {
    const working = person("Working", [[J, "07:00", "15:30"]], on(J));
    const moved = person("Moved", [[J, "07:00", "15:30"]], on(K));
    const late = person("Late", [[J, "07:00", "15:30"]]);
    // Worked at K this morning with no shift, and is off the clock now.
    const dropIn = { ...person("Drop-in", []), workedJobIds: [K] };
    const crew: Crew = {
      timezone: "America/New_York",
      today: "2026-11-16",
      asOf: new Date("2026-11-16T14:00:00Z"),
      people: [dropIn, late, moved, working],
      earlier: [],
      jobs: [job(J, "J"), job(K, "K")],
      money: NO_MONEY,
    };
    const groups = byJob(crew, "09:00");
    expect(
      groups.map((g) => [
        g.job.name,
        g.here.map((x) => `${x.person.person.name}:${x.status}`),
        g.scheduled.map((x) => `${x.person.person.name}:${x.status}`),
      ]),
    ).toEqual([
      ["J", ["Working:working"], ["Late:late", "Moved:working"]],
      ["K", ["Moved:working"], ["Drop-in:done"]],
    ]);
  });

  it("leaves out a job nobody is at or scheduled on", () => {
    const crew: Crew = {
      timezone: "America/New_York",
      today: "2026-11-16",
      asOf: new Date("2026-11-16T14:00:00Z"),
      people: [],
      earlier: [],
      jobs: [job(J, "J")],
      money: NO_MONEY,
    };
    expect(byJob(crew, "09:00")).toEqual([]);
  });
});

describe("a refusal, as one of the tab's sentences", () => {
  it("names what the server answered, and anything unknown as a failure", () => {
    expect(refusalOf({ result: "created" })).toBeNull();
    expect(refusalOf({ result: "moved" })).toBeNull();
    expect(refusalOf({ result: "duplicate" })).toBeNull();
    expect(
      refusalOf({ result: "rejected", code: "schedule", issues: [{ code: "overlap" }] }),
    ).toBe("schedule");
    expect(refusalOf({ result: "rejected", code: "user_inactive" })).toBe(
      "user_inactive",
    );
    expect(refusalOf({ result: "rejected", code: "job_archived" })).toBe("job_archived");
    expect(refusalOf({ result: "rejected", code: "same_job" })).toBe("same_job");
    expect(refusalOf({ result: "rejected", code: "started" })).toBe("started");
    expect(refusalOf({ result: "rejected", code: "end_required" })).toBe("failed");
    expect(refusalOf({ result: "rejected", code: "id_conflict" })).toBe("failed");
    expect(refusalOf(undefined)).toBe("failed");
  });
});

describe("where the app opens", () => {
  const NOW = new Date("2026-11-16T09:00:00-05:00").getTime();
  const pull = (over: Partial<PullOutput> = {}): PullOutput => ({
    serverNow: new Date(NOW),
    me: { id: "00000000-0000-7000-8000-000000000301", role: "admin", name: "Dana" },
    company: { name: "Co", timezone: "America/New_York", phone: null },
    scheduleEnforced: false,
    locationStamps: false,
    shifts: [],
    jobs: [],
    sessions: [],
    events: [],
    ...over,
  });
  const shiftOn = (workDate: string): PullOutput["shifts"][number] => ({
    id: "00000000-0000-7000-8000-000000000302",
    workDate,
    start: "07:00",
    end: "15:30",
    job: { id: J, name: "J", address: null, notes: null },
    locked: false,
  });

  it("is Crew for an admin with no shift today", () => {
    expect(opensOnCrew(pull(), NOW)).toBe(true);
    // A shift tomorrow is not today's.
    expect(opensOnCrew(pull({ shifts: [shiftOn("2026-11-17")] }), NOW)).toBe(true);
  });

  it("is their own clock for an admin who works today, or is on the clock", () => {
    expect(opensOnCrew(pull({ shifts: [shiftOn("2026-11-16")] }), NOW)).toBe(false);
    const open: PullOutput["sessions"][number] = {
      rootEventId: "00000000-0000-7000-8000-000000000303",
      jobId: J,
      workDate: "2026-11-16",
      startedAt: new Date(NOW - 3_600_000),
      endedAt: null,
      state: "working",
      workedMs: 0,
      breakMs: 0,
      voided: false,
    };
    expect(opensOnCrew(pull({ sessions: [open] }), NOW)).toBe(false);
    // Voided while still open, it is open on the server too (H1): their clock, not Crew.
    expect(opensOnCrew(pull({ sessions: [{ ...open, voided: true }] }), NOW)).toBe(false);
    expect(
      opensOnCrew(
        pull({ sessions: [{ ...open, state: "ended", endedAt: new Date(NOW) }] }),
        NOW,
      ),
    ).toBe(true);
  });

  it("is never Crew for a worker", () => {
    const worker = pull({
      me: { id: "00000000-0000-7000-8000-000000000304", role: "worker", name: "Luis" },
    });
    expect(opensOnCrew(worker, NOW)).toBe(false);
  });

  it("reads today on the company's clock, not the phone's", () => {
    // 23:30 in New York on the 16th: already the 17th in UTC.
    const late = new Date("2026-11-16T23:30:00-05:00").getTime();
    expect(opensOnCrew(pull({ shifts: [shiftOn("2026-11-16")] }), late)).toBe(false);
    expect(opensOnCrew(pull({ shifts: [shiftOn("2026-11-17")] }), late)).toBe(true);
  });
});
