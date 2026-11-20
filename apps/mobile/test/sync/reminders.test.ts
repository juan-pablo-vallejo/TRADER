// Shift reminders (src/sync/reminders.ts): the one function that decides the whole set
// from the shifts, the clock and the time; the wall-clock-to-instant step it rests on; and
// the difference against what the phone already holds.
import type { PullOutput } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import type { ClockState } from "../../src/sync/clock";
import {
  MAX_REMINDERS,
  reconcile,
  reminders,
  zonedInstant,
} from "../../src/sync/reminders";

const NY = "America/New_York";
const J = "01900000-0000-7000-8000-00000000000a";
const K = "01900000-0000-7000-8000-00000000000b";
const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
// New York's winter is UTC-5.
const at = (day: string, time: string) => new Date(`${day}T${time}:00-05:00`).getTime();

const shift = (
  n: number,
  day: string,
  start: string,
  end: string,
  o: Partial<PullOutput["shifts"][number]> & { jobId?: string } = {},
): PullOutput["shifts"][number] => ({
  id: id(n),
  workDate: day,
  start,
  end,
  job: {
    id: o.jobId ?? J,
    name: o.jobId === K ? "Harbor" : "Elm St",
    address: null,
    notes: null,
  },
  locked: o.locked ?? false,
});
const off: ClockState = { status: "off" };
const on = (jobId: string, since: number): ClockState => ({
  status: "working",
  jobId,
  since: new Date(since),
});
const base = { enabled: true, timeZone: NY, clock: off };
const said = (r: ReturnType<typeof reminders>) =>
  r.map((x) => `${x.kind} ${x.shiftId.slice(-2)} ${x.at.toISOString()}`);

describe("a wall-clock time as an instant", () => {
  it("reads a day and a time in the company's zone, winter and summer", () => {
    expect(zonedInstant("2026-11-16", "07:00", NY).toISOString()).toBe(
      "2026-11-16T12:00:00.000Z",
    );
    expect(zonedInstant("2026-07-06", "07:00", NY).toISOString()).toBe(
      "2026-07-06T11:00:00.000Z",
    );
    expect(zonedInstant("2026-11-16", "23:59", "UTC").toISOString()).toBe(
      "2026-11-16T23:59:00.000Z",
    );
  });

  it("is right on the days the clocks change", () => {
    // 2026-11-01: back an hour at 02:00. 07:00 is already winter time.
    expect(zonedInstant("2026-11-01", "07:00", NY).toISOString()).toBe(
      "2026-11-01T12:00:00.000Z",
    );
    // 2026-03-08: forward an hour at 02:00. 07:00 is already summer time.
    expect(zonedInstant("2026-03-08", "07:00", NY).toISOString()).toBe(
      "2026-03-08T11:00:00.000Z",
    );
    // The hour that is skipped lands on a real instant, not a crash.
    expect(Number.isNaN(zonedInstant("2026-03-08", "02:30", NY).getTime())).toBe(false);
  });
});

describe("the reminders", () => {
  it("are one at each coming shift's start while off the clock, soonest first", () => {
    const got = reminders({
      ...base,
      now: at("2026-11-16", "06:00"),
      shifts: [
        shift(2, "2026-11-17", "07:00", "15:30"),
        shift(1, "2026-11-16", "07:00", "15:30"),
      ],
    });
    expect(said(got)).toEqual([
      "start 01 2026-11-16T12:00:00.000Z",
      "start 02 2026-11-17T12:00:00.000Z",
    ]);
    expect(got[0]).toMatchObject({ jobName: "Elm St", wall: "07:00" });
  });

  it("drop a start that has passed, and one somebody already clocked in on", () => {
    const shifts = [
      shift(1, "2026-11-16", "07:00", "11:00"),
      shift(2, "2026-11-16", "12:00", "15:30", { locked: true }),
      shift(3, "2026-11-17", "07:00", "15:30"),
    ];
    // Well past 07:00, the first one is over and done with.
    expect(said(reminders({ ...base, now: at("2026-11-16", "07:20"), shifts }))).toEqual([
      "start 03 2026-11-17T12:00:00.000Z",
    ]);
  });

  it("swap the start for the end once the person clocks in, early or late", () => {
    const shifts = [shift(1, "2026-11-16", "07:00", "15:30")];
    // Clocked in ten minutes early: the start reminder would be noise.
    const early = reminders({
      ...base,
      shifts,
      now: at("2026-11-16", "06:50"),
      clock: on(J, at("2026-11-16", "06:50")),
    });
    expect(said(early)).toEqual(["end 01 2026-11-16T20:30:00.000Z"]);
    expect(early[0]).toMatchObject({ wall: "15:30" });
    // Late, mid-shift: the same.
    expect(
      said(
        reminders({
          ...base,
          shifts,
          now: at("2026-11-16", "09:00"),
          clock: on(J, at("2026-11-16", "08:40")),
        }),
      ),
    ).toEqual(["end 01 2026-11-16T20:30:00.000Z"]);
  });

  it("remind of an end only for the job the clock is on, and of nothing once it has passed", () => {
    const shifts = [
      shift(1, "2026-11-16", "07:00", "11:00"),
      shift(2, "2026-11-16", "12:00", "15:30", { jobId: K }),
    ];
    // On J in the morning: J's end, and K's start is still coming.
    expect(
      said(
        reminders({
          ...base,
          shifts,
          now: at("2026-11-16", "08:00"),
          clock: on(J, at("2026-11-16", "07:00")),
        }),
      ),
    ).toEqual(["end 01 2026-11-16T16:00:00.000Z", "start 02 2026-11-16T17:00:00.000Z"]);
    // Still on J at 11:30, well past its end: that reminder is over; K's remains.
    expect(
      said(
        reminders({
          ...base,
          shifts,
          now: at("2026-11-16", "11:30"),
          clock: on(J, at("2026-11-16", "07:00")),
        }),
      ),
    ).toEqual(["start 02 2026-11-16T17:00:00.000Z"]);
    // Clocked out: no end reminder at all.
    expect(said(reminders({ ...base, shifts, now: at("2026-11-16", "09:00") }))).toEqual([
      "start 02 2026-11-16T17:00:00.000Z",
    ]);
  });

  it("do not take tomorrow's shift on the same job for the one being worked", () => {
    const shifts = [shift(1, "2026-11-17", "07:00", "15:30")];
    expect(
      said(
        reminders({
          ...base,
          shifts,
          now: at("2026-11-16", "20:00"),
          clock: on(J, at("2026-11-16", "19:00")),
        }),
      ),
    ).toEqual(["start 01 2026-11-17T12:00:00.000Z"]);
  });

  it("are none when turned off, and never more than the phone will keep", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      shift(i + 1, `2026-12-${String((i % 28) + 1).padStart(2, "0")}`, "07:00", "08:00", {
        jobId: i < 28 ? J : K,
      }),
    );
    const now = at("2026-11-16", "06:00");
    expect(reminders({ ...base, enabled: false, now, shifts: many })).toEqual([]);
    const kept = reminders({ ...base, now, shifts: many });
    expect(kept).toHaveLength(MAX_REMINDERS);
    // The nearest are the ones kept.
    expect(kept[0]!.at.getTime()).toBeLessThanOrEqual(kept.at(-1)!.at.getTime());
  });

  it("name a reminder by its shift, kind and time, so a moved shift is a new one", () => {
    const now = at("2026-11-16", "06:00");
    const [a] = reminders({
      ...base,
      now,
      shifts: [shift(1, "2026-11-16", "07:00", "15:30")],
    });
    const [again] = reminders({
      ...base,
      now: now + 60_000,
      shifts: [shift(1, "2026-11-16", "07:00", "15:30")],
    });
    const [moved] = reminders({
      ...base,
      now,
      shifts: [shift(1, "2026-11-16", "08:00", "15:30")],
    });
    expect(again!.id).toBe(a!.id);
    expect(moved!.id).not.toBe(a!.id);
  });
});

describe("a reminder whose time has just come", () => {
  const shifts = [shift(1, "2026-11-16", "07:00", "15:30")];

  it("is still wanted for a quarter of an hour, marked due, and then no more", () => {
    const before = reminders({ ...base, shifts, now: at("2026-11-16", "06:59") });
    const just = reminders({ ...base, shifts, now: at("2026-11-16", "07:00") });
    const late = reminders({ ...base, shifts, now: at("2026-11-16", "07:14") });
    const over = reminders({ ...base, shifts, now: at("2026-11-16", "07:15") });
    expect(before.map((r) => r.due)).toEqual([false]);
    expect(just.map((r) => r.due)).toEqual([true]);
    expect(late.map((r) => r.due)).toEqual([true]);
    expect(over).toEqual([]);
    // The same reminder throughout: nothing about it is set again.
    expect(new Set([...before, ...just, ...late].map((r) => r.id)).size).toBe(1);
  });

  it("is left pending for the phone to deliver, late as it may be", () => {
    // The phone has not shown it yet, and a pull comes a minute after its time.
    const [due] = reminders({ ...base, shifts, now: at("2026-11-16", "07:01") });
    expect(reconcile([due!.id], [due!])).toEqual({ cancel: [], schedule: [] });
  });

  it("is never set again once the phone has shown it", () => {
    const [due] = reminders({ ...base, shifts, now: at("2026-11-16", "07:01") });
    // Shown, so no longer pending: setting it now would show it a second time.
    expect(reconcile([], [due!])).toEqual({ cancel: [], schedule: [] });
  });

  it("goes at once when its reason does: a clock-in takes a due start reminder away", () => {
    const [due] = reminders({ ...base, shifts, now: at("2026-11-16", "07:01") });
    const after = reminders({
      ...base,
      shifts,
      now: at("2026-11-16", "07:02"),
      clock: on(J, at("2026-11-16", "07:02")),
    });
    expect(after.map((r) => r.kind)).toEqual(["end"]);
    expect(reconcile([due!.id], after)).toEqual({ cancel: [due!.id], schedule: after });
  });

  it("holds for the end too: still on the clock a few minutes after the shift", () => {
    const got = reminders({
      ...base,
      shifts,
      now: at("2026-11-16", "15:35"),
      clock: on(J, at("2026-11-16", "07:00")),
    });
    expect(got.map((r) => [r.kind, r.due])).toEqual([["end", true]]);
  });
});

describe("what to change on the phone", () => {
  const now = at("2026-11-16", "06:00");
  const wanted = reminders({
    ...base,
    now,
    shifts: [
      shift(1, "2026-11-16", "07:00", "15:30"),
      shift(2, "2026-11-17", "07:00", "15:30"),
    ],
  });

  it("schedules what is missing, cancels what is no longer wanted, leaves the rest", () => {
    const [first, second] = wanted;
    expect(reconcile([], wanted)).toEqual({ cancel: [], schedule: wanted });
    expect(reconcile([first!.id, second!.id], wanted)).toEqual({
      cancel: [],
      schedule: [],
    });
    expect(reconcile([first!.id, "shift-start:gone:1"], wanted)).toEqual({
      cancel: ["shift-start:gone:1"],
      schedule: [second],
    });
    expect(reconcile([first!.id, second!.id], [])).toEqual({
      cancel: [first!.id, second!.id],
      schedule: [],
    });
  });

  it("never touches a notification that is not a shift reminder", () => {
    expect(reconcile(["something-else", "another"], [])).toEqual({
      cancel: [],
      schedule: [],
    });
  });
});
