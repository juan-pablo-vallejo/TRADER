// What Week works out (src/sync/week.ts): hours by day with each session's flags, and the
// scheduled days from today on.
import type { PullOutput } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import { hoursByDay, shiftDays } from "../../src/sync/week";

const ME = "01900000-0000-7000-8000-000000000001";
const J = "01900000-0000-7000-8000-00000000000a";
const K = "01900000-0000-7000-8000-00000000000b";
const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = (day: string, time: string) => new Date(`${day}T${time}:00-05:00`);
const HOUR = 3_600_000;

const snapshot = (over: Partial<PullOutput> = {}): PullOutput => ({
  serverNow: at("2026-11-17", "12:00"),
  me: { id: ME, role: "worker", name: "Luis" },
  company: { name: "Co", timezone: "America/New_York", phone: null },
  scheduleEnforced: false,
  locationStamps: true,
  shifts: [],
  jobs: [],
  sessions: [],
  events: [],
  ...over,
});
const session = (
  n: number,
  jobId: string,
  day: string,
  start: string,
  end: string | null,
  o: Partial<PullOutput["sessions"][number]> = {},
): PullOutput["sessions"][number] => ({
  rootEventId: id(n),
  jobId,
  workDate: day,
  startedAt: at(day, start),
  endedAt: end === null ? null : at(day, end),
  state: end === null ? "working" : "ended",
  workedMs: end === null ? 0 : at(day, end).getTime() - at(day, start).getTime(),
  breakMs: 0,
  voided: false,
  ...o,
});
const event = (
  n: number,
  jobId: string,
  day: string,
  time: string,
  flags: PullOutput["events"][number]["flags"],
): PullOutput["events"][number] => ({
  id: id(n),
  type: "started",
  jobId,
  clientTimestamp: at(day, time),
  serverTimestamp: at(day, time),
  clockSkewed: false,
  correctsEventId: null,
  voidsEventId: null,
  flags,
});
const shift = (
  n: number,
  day: string,
  start: string,
  end: string,
): PullOutput["shifts"][number] => ({
  id: id(n),
  workDate: day,
  start,
  end,
  job: { id: J, name: "Elm St", address: null, notes: null },
  locked: false,
});

describe("hours by day", () => {
  it("groups sessions under their day, newest day first, with the day's total", () => {
    const data = snapshot({
      sessions: [
        session(3, J, "2026-11-17", "07:00", "11:00"),
        session(1, J, "2026-11-16", "07:00", "12:00"),
        session(2, K, "2026-11-16", "13:00", "16:00"),
      ],
    });
    const days = hoursByDay(data);
    expect(days.map((d) => [d.day, d.workedMs / HOUR])).toEqual([
      ["2026-11-17", 4],
      ["2026-11-16", 8],
    ]);
    // A day's sessions in the order they began.
    expect(days[1]!.sessions.map((s) => s.session.jobId)).toEqual([J, K]);
  });

  it("leaves out a session the office voided, and its hours", () => {
    const data = snapshot({
      sessions: [
        session(1, J, "2026-11-16", "07:00", "12:00"),
        session(2, K, "2026-11-16", "13:00", "16:00", { voided: true }),
      ],
    });
    expect(hoursByDay(data)).toMatchObject([{ workedMs: 5 * HOUR, sessions: [{}] }]);
    expect(hoursByDay(snapshot())).toEqual([]);
  });

  it("names each session's flags once, in one order, from its own entries only", () => {
    const data = snapshot({
      sessions: [
        session(1, J, "2026-11-16", "07:00", "12:00"),
        session(2, K, "2026-11-16", "13:00", "16:00"),
        session(3, J, "2026-11-17", "07:00", null),
      ],
      events: [
        event(1, J, "2026-11-16", "07:00", ["unscheduled", "offline"]),
        event(4, J, "2026-11-16", "12:00", ["offline", "location"]),
        // Another job's entry in the same hours is not this session's.
        event(5, K, "2026-11-16", "09:00", ["clock_skewed"]),
        event(2, K, "2026-11-16", "13:00", []),
        // An open session takes every entry after its clock-in.
        event(3, J, "2026-11-17", "07:00", []),
        event(6, J, "2026-11-17", "09:30", ["corrected", "user_timed"]),
      ],
    });
    const [tuesday, monday] = hoursByDay(data);
    expect(monday!.sessions.map((s) => s.flags)).toEqual([
      ["offline", "location", "unscheduled"],
      [],
    ]);
    expect(tuesday!.sessions.map((s) => s.flags)).toEqual([["corrected", "user_timed"]]);
  });
});

describe("the scheduled days", () => {
  it("start today, in date order, each day's shifts in time order", () => {
    const data = snapshot({
      shifts: [
        shift(4, "2026-11-18", "07:00", "15:30"),
        shift(2, "2026-11-17", "12:30", "15:30"),
        shift(1, "2026-11-17", "07:00", "11:30"),
        shift(3, "2026-11-16", "07:00", "15:30"),
      ],
    });
    const days = shiftDays(data, "2026-11-17");
    expect(days.map((d) => d.day)).toEqual(["2026-11-17", "2026-11-18"]);
    expect(days[0]!.shifts.map((s) => s.start)).toEqual(["07:00", "12:30"]);
    expect(shiftDays(snapshot(), "2026-11-17")).toEqual([]);
  });
});
