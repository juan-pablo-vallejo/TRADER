// What Today works out (src/sync/today.ts): the running timer, an open session from an
// earlier day, the chip's four states and what it says as it turns, why nothing is loaded,
// whether a tap is stamped, and the two links.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PULL_WINDOW_DAYS, type PullOutput, whatsAppLink } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import type { ClockState } from "../../src/sync/clock";
import type { CycleResult } from "../../src/sync/engine";
import {
  attentionNews,
  fromEarlierDay,
  mapsLink,
  nothingLoaded,
  sessionWorkedMs,
  spokenTimer,
  stampsOn,
  timer,
  waiting,
  workedOn,
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

describe("worked today", () => {
  const DAY = "2026-11-16";
  const open = (over: Partial<PullOutput["sessions"][number]> = {}) => ({
    rootEventId: id(1),
    jobId: J,
    workDate: DAY,
    startedAt: new Date(T0),
    endedAt: null,
    state: "working" as const,
    // The server's fold counts closed intervals only: an open session's running part is
    // the phone's to add.
    workedMs: 0,
    breakMs: 0,
    voided: false,
    ...over,
  });

  it("agrees with the timer when the phone's clock was set back before a break", () => {
    // A wrong clock: a break stamped ten minutes before the clock-in the pull shows. The
    // timer leaves it out, and so do the day's hours.
    const data = snapshot({ sessions: [open()], events: [pulled(1, "started", T0)] });
    const early = [record(2, "paused", T0 - 10 * MIN)];
    const now = T0 + 60 * MIN;
    expect(workedOn(data, early, DAY, now)).toBe(
      sessionWorkedMs(data, early, working, now),
    );
    expect(workedOn(data, early, DAY, now)).toBe(60 * MIN);
  });

  it("counts an open session after a pull from its clock-in, as the timer does", () => {
    const data = snapshot({ sessions: [open()], events: [pulled(1, "started", T0)] });
    expect(workedOn(data, [], DAY, T0 + 90 * MIN)).toBe(90 * MIN);
    // A break the pull shows, then back at work: the break is left out.
    const back = snapshot({
      sessions: [open({ workedMs: 60 * MIN, breakMs: 30 * MIN })],
      events: [
        pulled(1, "started", T0),
        pulled(2, "paused", T0 + 60 * MIN),
        pulled(3, "resumed", T0 + 90 * MIN),
      ],
    });
    expect(workedOn(back, [], DAY, T0 + 120 * MIN)).toBe(90 * MIN);
    // A closed session earlier the same day adds the server's own hours.
    const two = snapshot({
      sessions: [
        open({
          rootEventId: id(7),
          startedAt: new Date(T0 - 300 * MIN),
          endedAt: new Date(T0 - 240 * MIN),
          state: "ended",
          workedMs: 60 * MIN,
        }),
        open(),
      ],
      events: [pulled(1, "started", T0)],
    });
    expect(workedOn(two, [], DAY, T0 + 30 * MIN)).toBe(90 * MIN);
  });

  it("counts an offline start, break and end that the pull does not show yet", () => {
    const data = snapshot();
    const started = [record(1, "started", T0)];
    expect(workedOn(data, started, DAY, T0 + 45 * MIN)).toBe(45 * MIN);
    const onBreak = [...started, record(2, "paused", T0 + 60 * MIN)];
    expect(workedOn(data, onBreak, DAY, T0 + 80 * MIN)).toBe(60 * MIN);
    const ended = [
      ...onBreak,
      record(3, "resumed", T0 + 90 * MIN),
      record(4, "ended", T0 + 120 * MIN),
    ];
    // 60 worked, 30 on a break, 30 worked, then off the clock: 90, however late it is.
    expect(workedOn(data, ended, DAY, T0 + 300 * MIN)).toBe(90 * MIN);
    // A refused clock-in counts nothing; another day's hours are not today's.
    expect(workedOn(data, [record(1, "started", T0, "rejected")], DAY, T0 + MIN)).toBe(0);
    expect(workedOn(data, ended, "2026-11-17", T0 + 300 * MIN)).toBe(0);
  });

  it("ends the open session the pull shows with a clock-out still on this phone", () => {
    const data = snapshot({ sessions: [open()], events: [pulled(1, "started", T0)] });
    const out = [record(5, "ended", T0 + 50 * MIN, "syncing")];
    expect(workedOn(data, out, DAY, T0 + 200 * MIN)).toBe(50 * MIN);
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
  const base = {
    data: snapshot(),
    records: [],
    last: synced,
    syncing: false,
    refused: false,
  };

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

  it("takes a refusal as answered once its day has left the pull's window", () => {
    // A refusal the office corrected long ago: neither record is on the phone now. Two
    // weeks on, the chip is not back on Needs attention with nothing left to do.
    const old = record(5, "started", T0 - PULL_WINDOW_DAYS * 24 * 60 * MIN, "rejected");
    expect(waiting({ ...base, records: [old] })).toMatchObject({
      state: "sent",
      refused: 1,
    });
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

  it("keeps a refused entry on Needs attention until a correcting entry for its day is accepted", () => {
    const refusedStart = record(5, "started", T0, "rejected");
    // Days later, nothing else sent: still attention, however many cycles pass.
    expect(waiting({ ...base, records: [refusedStart] })).toMatchObject({
      state: "attention",
      refused: 1,
    });
    // An entry of another day, accepted: not a correction of this one.
    const tomorrow = record(2, "started", T0 + 24 * 60 * MIN, "settled");
    expect(waiting({ ...base, records: [refusedStart, tomorrow] }).state).toBe(
      "attention",
    );
    // A clock-in later the same day, accepted: the chip clears, and the refusal is still
    // listed in the sheet.
    const again = record(7, "started", T0 + 20 * MIN, "settled");
    expect(waiting({ ...base, records: [refusedStart, again] })).toMatchObject({
      state: "sent",
      refused: 1,
    });
    // Once the pull shows it and the settled copy is pruned, it still clears.
    const shown = snapshot({ events: [pulled(7, "started", T0 + 20 * MIN)] });
    expect(waiting({ ...base, data: shown, records: [refusedStart] }).state).toBe("sent");
    // An entry made before the refused one corrects nothing, even when the server took it
    // after: a day captured offline arrives at once.
    const earlier = snapshot({
      events: [
        {
          ...pulled(4, "started", T0 - 60 * MIN),
          serverTimestamp: new Date(T0 + 600 * MIN),
        },
      ],
    });
    expect(waiting({ ...base, data: earlier, records: [refusedStart] }).state).toBe(
      "attention",
    );
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

  it("opens a chat on WhatsApp, and nothing on the phone dials or texts", () => {
    // The office's number as the office types it, read as a United States number.
    expect(whatsAppLink("(401) 555-0142")).toBe("https://wa.me/14015550142");
    const src = fileURLToPath(new URL("../../src", import.meta.url).href);
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    const dialing = files(src).filter((path) =>
      /\b(?:tel|sms):|telLink/.test(readFileSync(path, "utf8")),
    );
    expect(dialing).toEqual([]);
  });
});

describe("Today with nothing loaded", () => {
  const synced = (pulled: boolean): CycleResult => ({
    outcome: "synced",
    state: "normal",
    settled: 0,
    rejected: 0,
    drained: true,
    pulled,
    clockSkewMs: null,
  });

  it("says the real reason, and asks for a connection only when the server was not reached", () => {
    expect(nothingLoaded({ outcome: "unreachable" }, false)).toBe("offline");
    expect(nothingLoaded({ outcome: "held", state: "update_required" }, false)).toBe(
      "update",
    );
    expect(nothingLoaded({ outcome: "held", state: "paused" }, false)).toBe("paused");
    // The session refused wins over whatever the cycle said: signing in again is the way.
    expect(nothingLoaded(synced(false), true)).toBe("sign_in");
    expect(nothingLoaded({ outcome: "unreachable" }, true)).toBe("sign_in");
    // Reached, and the pull still failed: not a connection to look for.
    expect(nothingLoaded(synced(false), false)).toBe("failed");
  });

  it("waits for the first cycle before it says anything", () => {
    expect(nothingLoaded(null, false)).toBeNull();
  });
});

describe("the chip turning to Needs attention", () => {
  const where = (over: Partial<ReturnType<typeof waiting>>) => ({
    state: "attention" as const,
    unsent: 0,
    refused: 0,
    held: null,
    wrongClock: false,
    ...over,
  });

  it("is said with what the person must do", () => {
    expect(attentionNews(where({ held: "sign_in" }))).toBe("sign_in");
    expect(attentionNews(where({ held: "paused" }))).toBe("paused");
    expect(attentionNews(where({ held: "update" }))).toBe("update");
    expect(attentionNews(where({ wrongClock: true }))).toBe("wrong_clock");
  });

  it("leaves a refusal to the news the cycle gives, and says nothing off attention", () => {
    expect(attentionNews(where({ refused: 1 }))).toBeNull();
    expect(attentionNews(where({ state: "saved", held: "offline" }))).toBeNull();
  });
});

describe("the timer, spoken", () => {
  it("is hours and minutes, the seconds left out", () => {
    expect(spokenTimer(0)).toEqual({ hours: 0, minutes: 0 });
    expect(spokenTimer((2 * 3600 + 5 * 60 + 59) * 1000)).toEqual({
      hours: 2,
      minutes: 5,
    });
    expect(spokenTimer(-1000)).toEqual({ hours: 0, minutes: 0 });
  });
});
