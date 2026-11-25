// What the clock shows and what a tap records (src/sync/clock.ts), and that what it records
// is what the server parses (the contract's own schema).
import { laborPayloadV1, type PullOutput, wallClock } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import { createMinter } from "../../src/ids";
import {
  capturedOffline,
  clockState,
  offerAt,
  READING_FRESH_MS,
  recordsFor,
  type Capture,
} from "../../src/sync/clock";
import type { NewRecord, OutboxRecord } from "../../src/sync/types";

const ME = "01900000-0000-7000-8000-000000000001";
const J = "01900000-0000-7000-8000-00000000000a";
const K = "01900000-0000-7000-8000-00000000000b";
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

const capture = (over: Partial<Capture> = {}): Capture => ({
  me: ME,
  now: T0,
  reading: T0,
  location: null,
  mint: createMinter((n) => new Uint8Array(n).fill(1)),
  ...over,
});
const kept = (
  r: NewRecord,
  standing: OutboxRecord["standing"] = "pending",
): OutboxRecord => ({
  ...r,
  kind: "labor_event",
  schemaVersion: 1,
  standing,
  syncingSince: null,
  code: null,
  flags: [],
});
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
const open = (state: "working" | "paused"): PullOutput["sessions"][number] => ({
  rootEventId: "01900000-0000-7000-8000-0000000000e1",
  jobId: J,
  workDate: "2026-11-16",
  startedAt: new Date(T0 - 3_600_000),
  endedAt: null,
  state,
  workedMs: 3_600_000,
  breakMs: 0,
  voided: false,
});

describe("offline evidence", () => {
  it("is online only on a fresh reading", () => {
    expect(capturedOffline(null, T0)).toBe(true);
    expect(capturedOffline(T0, T0)).toBe(false);
    expect(capturedOffline(T0 - READING_FRESH_MS, T0)).toBe(false);
    expect(capturedOffline(T0 - READING_FRESH_MS - 1, T0)).toBe(true);
    // A reading from the future is a clock that moved: not evidence.
    expect(capturedOffline(T0 + 1, T0)).toBe(true);
  });

  it("is written into the record at capture", () => {
    const stale = recordsFor(
      { action: "start", jobId: J },
      { status: "off" },
      capture({ reading: T0 - READING_FRESH_MS - 1 }),
    );
    expect(stale[0]!.payload.capturedOffline).toBe(true);
    const fresh = recordsFor({ action: "start", jobId: J }, { status: "off" }, capture());
    expect(fresh[0]!.payload.capturedOffline).toBe(false);
  });
});

describe("a tap", () => {
  it("records what the server's schema parses, with nothing the phone may not say", () => {
    const [record] = recordsFor(
      { action: "start", jobId: J },
      { status: "off" },
      capture({ location: { lat: 41.8, lng: -71.4, accuracyM: 12 } }),
    );
    expect(laborPayloadV1.safeParse(record!.payload).success).toBe(true);
    expect(record!.payload).toMatchObject({
      workerId: ME,
      jobId: J,
      type: "started",
      clientTimestamp: new Date(T0),
      timeSetByUser: false,
    });
  });

  it("switches jobs as ended then started, in id and time order", () => {
    const records = recordsFor(
      { action: "switch", jobId: K },
      { status: "working", jobId: J, since: new Date(T0 - 1000) },
      capture(),
    );
    expect(records.map((r) => [r.payload.type, r.payload.jobId])).toEqual([
      ["ended", J],
      ["started", K],
    ]);
    expect(records[0]!.id < records[1]!.id).toBe(true);
    expect(
      records[0]!.payload.clientTimestamp < records[1]!.payload.clientTimestamp,
    ).toBe(true);
  });

  it("records nothing that makes no sense from where the clock stands", () => {
    const working = { status: "working", jobId: J, since: new Date(T0) } as const;
    const paused = { ...working, status: "paused" } as const;
    expect(recordsFor({ action: "start", jobId: K }, working, capture())).toEqual([]);
    expect(recordsFor({ action: "end" }, { status: "off" }, capture())).toEqual([]);
    expect(recordsFor({ action: "pause" }, paused, capture())).toEqual([]);
    expect(recordsFor({ action: "resume" }, working, capture())).toEqual([]);
    expect(recordsFor({ action: "switch", jobId: J }, working, capture())).toEqual([]);
    expect(
      recordsFor({ action: "switch", jobId: K }, { status: "off" }, capture()),
    ).toEqual([]);
    expect(
      recordsFor({ action: "end" }, paused, capture()).map((r) => r.payload.type),
    ).toEqual(["ended"]);
  });
});

describe("the clock's state", () => {
  it("is off with nothing known", () => {
    expect(clockState(null, [])).toEqual({ status: "off" });
    expect(clockState(snapshot(), [])).toEqual({ status: "off" });
  });

  it("starts from the server's open session", () => {
    expect(clockState(snapshot({ sessions: [open("paused")] }), [])).toEqual({
      status: "paused",
      jobId: J,
      since: new Date(T0 - 3_600_000),
    });
    // A session voided while still open is still open on the server, which refuses a
    // clock-in on top of it; the phone reads it the same way, so Clock out stays offered.
    expect(
      clockState(snapshot({ sessions: [{ ...open("working"), voided: true }] }), []),
    ).toEqual({ status: "working", jobId: J, since: new Date(T0 - 3_600_000) });
  });

  it("applies this phone's records the snapshot does not show yet, in order", () => {
    const c = capture();
    const start = recordsFor({ action: "start", jobId: J }, { status: "off" }, c);
    const working = clockState(
      null,
      start.map((r) => kept(r)),
    );
    expect(working).toMatchObject({ status: "working", jobId: J });
    const pause = recordsFor({ action: "pause" }, working, { ...c, now: T0 + 1000 });
    const swap = recordsFor({ action: "switch", jobId: K }, working, {
      ...c,
      now: T0 + 2000,
    });
    const all = [...start, ...pause, ...swap].map((r) => kept(r, "settled"));
    expect(clockState(null, all)).toMatchObject({ status: "working", jobId: K });
    expect(clockState(null, all.slice(0, 2))).toMatchObject({
      status: "paused",
      jobId: J,
    });
  });

  it("ignores a record the server refused, and one the snapshot already counts", () => {
    const start = recordsFor({ action: "start", jobId: J }, { status: "off" }, capture());
    expect(clockState(null, [kept(start[0]!, "rejected")])).toEqual({ status: "off" });
    // The snapshot shows the start and the session it opened has since ended there.
    const seen = snapshot({
      events: [
        {
          id: start[0]!.id,
          type: "started",
          jobId: J,
          clientTimestamp: new Date(T0),
          serverTimestamp: new Date(T0),
          clockSkewed: false,
          correctsEventId: null,
          voidsEventId: null,
          flags: [],
        },
      ],
    });
    expect(clockState(seen, [kept(start[0]!, "settled")])).toEqual({ status: "off" });
  });

  it("takes a settled record as the server's verdict when the answer before the next pull was lost", () => {
    // The office ended the open session on the server; this phone, still showing it, switched
    // jobs. The server refused the end and took the start, and the pull that would say so was
    // dropped: the clock is on the new job, where its next tap will be judged.
    const sw = recordsFor(
      { action: "switch", jobId: K },
      { status: "working", jobId: J, since: new Date(T0 - 3_600_000) },
      capture(),
    );
    const state = clockState(snapshot({ sessions: [open("working")] }), [
      kept(sw[0]!, "rejected"),
      kept(sw[1]!, "settled"),
    ]);
    expect(state).toMatchObject({ status: "working", jobId: K });
    expect(recordsFor({ action: "pause" }, state, capture())[0]?.payload.jobId).toBe(K);
  });

  it("follows the server's rule, so it never offers a pause on a pause", () => {
    // Clock in, break, then a second clock-in still on the phone: the server refuses that
    // start (a session is open), so the clock is still on its break, on its first job.
    const mint = createMinter((n) => new Uint8Array(n).fill(2));
    const at = (n: number) => capture({ now: T0 + n * 60_000, mint });
    const start = recordsFor({ action: "start", jobId: J }, { status: "off" }, at(0));
    const working = clockState(
      null,
      start.map((r) => kept(r)),
    );
    const pause = recordsFor({ action: "pause" }, working, at(1));
    const again = recordsFor({ action: "start", jobId: K }, { status: "off" }, at(2));
    const records = [...start, ...pause, ...again].map((r) => kept(r));
    const state = clockState(null, records);
    expect(state).toEqual({ status: "paused", jobId: J, since: new Date(T0) });
    expect(recordsFor({ action: "pause" }, state, at(3))).toEqual([]);
    expect(recordsFor({ action: "resume" }, state, at(3))).toHaveLength(1);
  });
});

describe("wall clock", () => {
  it("reads an instant as the company's day and minute, across midnight and DST", () => {
    expect(wallClock(new Date("2026-11-16T04:30:00Z"), "America/New_York")).toEqual({
      day: "2026-11-15",
      minute: "23:30",
    });
    expect(wallClock(new Date("2026-07-01T04:00:00Z"), "America/New_York")).toEqual({
      day: "2026-07-01",
      minute: "00:00",
    });
  });
});

describe("the schedule's offer", () => {
  const shift = (
    id: string,
    start: string,
    end: string,
    workDate = "2026-11-16",
  ): PullOutput["shifts"][number] => ({
    id,
    workDate,
    start,
    end,
    job: { id: J, name: "Elm St", address: null, notes: null },
    locked: false,
  });
  const morning = shift("s1", "07:00", "11:00");
  const midday = shift("s2", "11:00", "15:00");
  const day = [morning, midday];

  it("offers the shift that holds this minute, the end excluded", () => {
    expect(offerAt(day, "2026-11-16", "07:00")).toEqual({
      kind: "eligible",
      shift: morning,
    });
    expect(offerAt(day, "2026-11-16", "10:59")).toEqual({
      kind: "eligible",
      shift: morning,
    });
    expect(offerAt(day, "2026-11-16", "11:00")).toEqual({
      kind: "eligible",
      shift: midday,
    });
    expect(offerAt(day, "2026-11-16", "15:00")).toEqual({ kind: "later", next: null });
  });

  it("offers the next shift fifteen minutes early and no earlier", () => {
    expect(offerAt(day, "2026-11-16", "06:45")).toEqual({
      kind: "eligible",
      shift: morning,
    });
    expect(offerAt(day, "2026-11-16", "06:44")).toEqual({
      kind: "later",
      next: { shift: morning, start: "07:00" },
    });
  });

  it("offers nothing on a day with no shift", () => {
    expect(offerAt(day, "2026-11-17", "08:00")).toEqual({ kind: "none" });
  });
});
