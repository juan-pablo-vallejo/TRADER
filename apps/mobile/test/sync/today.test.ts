// What Today works out (src/sync/today.ts): the running timer, an open session from an
// earlier day, the chip's four states, whether a tap is stamped, and the two links.
import type { PullOutput } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import type { ClockState } from "../../src/sync/clock";
import type { CycleResult } from "../../src/sync/engine";
import {
  fromEarlierDay,
  mapsLink,
  sessionWorkedMs,
  stampsOn,
  telLink,
  timer,
  waiting,
} from "../../src/sync/today";
import type { OutboxRecord, Standing } from "../../src/sync/types";

const ME = "01900000-0000-7000-8000-000000000001";
const J = "01900000-0000-7000-8000-00000000000a";
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
const MIN = 60_000;
const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;

const snapshot = (over: Partial<PullOutput> = {}): PullOutput => ({
  serverNow: new Date(T0),
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
const pulled = (
  n: number,
  type: PullOutput["events"][number]["type"],
  at: number,
  corrects: string | null = null,
): PullOutput["events"][number] => ({
  id: id(n),
  type,
  jobId: J,
  clientTimestamp: new Date(at),
  serverTimestamp: new Date(at),
  clockSkewed: false,
  correctsEventId: corrects,
  voidsEventId: null,
  flags: [],
});
const record = (
  n: number,
  type: OutboxRecord["payload"]["type"],
  at: number,
  standing: Standing = "pending",
): OutboxRecord => ({
  id: id(n),
  ownerId: ME,
  kind: "labor_event",
  schemaVersion: 1,
  payload: {
    workerId: ME,
    jobId: J,
    type,
    clientTimestamp: new Date(at),
    location: null,
    timeSetByUser: false,
    capturedOffline: true,
  },
  standing,
  syncingSince: null,
  code: standing === "rejected" ? "not_scheduled" : null,
  flags: [],
});
const working: ClockState = { status: "working", jobId: J, since: new Date(T0) };

describe("the running timer", () => {
  it("counts from the clock-in to now, and nothing off the clock", () => {
    expect(sessionWorkedMs(snapshot(), [], { status: "off" }, T0 + 5 * MIN)).toBe(0);
    expect(sessionWorkedMs(snapshot(), [], working, T0 + 90 * MIN)).toBe(90 * MIN);
  });

  it("leaves out a break the pull shows and one still on this phone", () => {
    const data = snapshot({
      events: [
        pulled(1, "started", T0),
        pulled(2, "paused", T0 + 60 * MIN),
        pulled(3, "resumed", T0 + 90 * MIN),
      ],
    });
    // 60 worked, 30 on a break, 30 worked: 90 at the two-hour mark.
    expect(sessionWorkedMs(data, [], working, T0 + 120 * MIN)).toBe(90 * MIN);
    // A second break, captured here and not sent yet: the timer stands still in it.
    const onBreak = [record(4, "paused", T0 + 120 * MIN)];
    const paused: ClockState = { ...working, status: "paused" };
    expect(sessionWorkedMs(data, onBreak, paused, T0 + 150 * MIN)).toBe(90 * MIN);
    const back = [...onBreak, record(5, "resumed", T0 + 150 * MIN)];
    expect(sessionWorkedMs(data, back, working, T0 + 160 * MIN)).toBe(100 * MIN);
  });

  it("counts a sent record once, skips a refused one and an entry the office replaced", () => {
    const data = snapshot({
      events: [
        pulled(1, "started", T0),
        pulled(2, "paused", T0 + 10 * MIN),
        // The office moved that break's start to the 20-minute mark.
        pulled(3, "paused", T0 + 20 * MIN, id(2)),
      ],
    });
    const records = [
      // The same event the pull already shows: not a second break.
      record(2, "paused", T0 + 10 * MIN, "settled"),
      // The server refused it: it changes nothing.
      record(6, "resumed", T0 + 25 * MIN, "rejected"),
    ];
    const paused: ClockState = { ...working, status: "paused" };
    expect(sessionWorkedMs(data, records, paused, T0 + 60 * MIN)).toBe(20 * MIN);
  });

  it("ignores what happened before this session began", () => {
    const data = snapshot({
      events: [pulled(1, "paused", T0 - 60 * MIN), pulled(2, "resumed", T0 - 30 * MIN)],
    });
    expect(sessionWorkedMs(data, [], working, T0 + 10 * MIN)).toBe(10 * MIN);
  });

  it("writes hours, minutes and seconds in figures of one width", () => {
    expect(timer(0)).toBe("0:00:00");
    expect(timer(7 * MIN + 5_000)).toBe("0:07:05");
    expect(timer(12 * 60 * MIN + 30 * MIN + 999)).toBe("12:30:00");
    expect(timer(-5)).toBe("0:00:00");
  });
});

describe("a session left open", () => {
  it("is from an earlier day when its clock-in's day is before the company's today", () => {
    expect(fromEarlierDay("2026-11-15", "2026-11-16")).toBe(true);
    expect(fromEarlierDay("2026-10-31", "2026-11-01")).toBe(true);
    expect(fromEarlierDay("2026-11-16", "2026-11-16")).toBe(false);
    expect(fromEarlierDay("2026-11-17", "2026-11-16")).toBe(false);
  });
});

describe("the chip", () => {
  const synced: CycleResult = {
    outcome: "synced",
    state: "normal",
    settled: 0,
    rejected: 0,
    drained: true,
    pulled: true,
    clockSkewMs: 0,
  };
  const base = { records: [], last: synced, syncing: false, refused: false };

  it("says Sent with nothing waiting, Saved on phone with an entry, Sending while it goes", () => {
    expect(waiting(base)).toMatchObject({ state: "sent", unsent: 0, held: null });
    const one = [record(1, "started", T0)];
    expect(waiting({ ...base, records: one })).toMatchObject({
      state: "saved",
      unsent: 1,
    });
    expect(waiting({ ...base, records: one, syncing: true }).state).toBe("sending");
    // A record the pull has not pruned yet is sent: it waits for nothing.
    expect(
      waiting({ ...base, records: [record(1, "started", T0, "settled")] }).state,
    ).toBe("sent");
  });

  it("stays Saved on phone with no connection, never Sending and never an alarm", () => {
    const offline = { ...base, last: { outcome: "unreachable" } as CycleResult };
    const one = [record(1, "started", T0)];
    expect(waiting({ ...offline, records: one, syncing: true })).toMatchObject({
      state: "saved",
      held: "offline",
    });
    expect(waiting(offline)).toMatchObject({ state: "sent", held: "offline" });
    expect(waiting({ ...base, last: null, records: one }).state).toBe("saved");
  });

  it("needs attention for a refused entry, a wrong clock, or sending held for the person to act", () => {
    expect(
      waiting({ ...base, records: [record(1, "started", T0, "rejected")] }),
    ).toMatchObject({ state: "attention", refused: 1, unsent: 0 });
    expect(waiting({ ...base, last: { ...synced, clockSkewMs: 6 * MIN } })).toMatchObject(
      { state: "attention", wrongClock: true },
    );
    expect(waiting({ ...base, last: { ...synced, clockSkewMs: -5 * MIN } }).state).toBe(
      "sent",
    );
    expect(waiting({ ...base, refused: true })).toMatchObject({
      state: "attention",
      held: "sign_in",
    });
    for (const [state, held] of [
      ["paused", "paused"],
      ["update_required", "update"],
    ] as const) {
      expect(
        waiting({ ...base, last: { outcome: "held", state } as CycleResult }),
      ).toMatchObject({ state: "attention", held });
    }
    // Read-only holds a push and asks nothing of the person: saved, with the reason.
    expect(
      waiting({
        ...base,
        records: [record(1, "started", T0)],
        last: { ...synced, state: "read_only" },
      }),
    ).toMatchObject({ state: "saved", held: "read_only" });
  });
});

describe("the location stamp's switch", () => {
  it("is on only when the last pull says so", () => {
    expect(stampsOn(snapshot())).toBe(true);
    expect(stampsOn(snapshot({ locationStamps: false }))).toBe(false);
    // Before the first pull nothing is known, and nothing is asked of the person.
    expect(stampsOn(null)).toBe(false);
  });
});

describe("the two links", () => {
  it("opens the phone's own maps on the address as the office typed it", () => {
    expect(mapsLink("14 Elmgrove Ave, Providence, RI", "ios")).toBe(
      "maps:0,0?q=14%20Elmgrove%20Ave%2C%20Providence%2C%20RI",
    );
    expect(mapsLink("Calle 8 #12 & Main", "android")).toBe(
      "geo:0,0?q=Calle%208%20%2312%20%26%20Main",
    );
  });

  it("dials the company's number whatever is typed around its digits, or nothing", () => {
    expect(telLink("(401) 555-0100")).toBe("tel:4015550100");
    // An extension is not dialed: the number ends where its run of digits does.
    expect(telLink("+1 401-555-0100 ext. 2")).toBe("tel:+14015550100");
    expect(telLink("Office: 401.555.0100")).toBe("tel:4015550100");
    expect(telLink("call the office")).toBeNull();
    expect(telLink("")).toBeNull();
    expect(telLink(null)).toBeNull();
  });
});
