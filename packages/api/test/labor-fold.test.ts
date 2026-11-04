// The session fold, pure: no database. Every timeline is built from fixed instants.
import { describe, expect, it } from "vitest";

import {
  compareEvents,
  foldSessions,
  LedgerInconsistentError,
  openSession,
  replay,
} from "../src/labor/fold";
import { at, builder, HOUR, JOB_A, JOB_B, MINUTE, v7 } from "./labor-events";

describe("worked and break duration", () => {
  it("sums a session from start to end", () => {
    const ev = builder();
    const [s] = foldSessions([ev("started", at("08:00")), ev("ended", at("16:00"))]);
    expect(s).toMatchObject({ workedMs: 8 * HOUR, breakMs: 0, elapsedMs: 8 * HOUR });
    expect(s).toMatchObject({ complete: true, state: "ended", jobId: JOB_A });
  });

  it("excludes paused spans and counts them as break", () => {
    const ev = builder();
    const [s] = foldSessions([
      ev("started", at("08:00")),
      ev("paused", at("10:00")),
      ev("resumed", at("10:15")),
      ev("paused", at("12:00")),
      ev("resumed", at("12:30")),
      ev("ended", at("16:00")),
    ]);
    expect(s!.breakMs).toBe(45 * MINUTE);
    expect(s!.workedMs).toBe(8 * HOUR - 45 * MINUTE);
  });

  it("counts a pause closed by the end as break", () => {
    const ev = builder();
    const [s] = foldSessions([
      ev("started", at("08:00")),
      ev("paused", at("15:00")),
      ev("ended", at("16:00")),
    ]);
    expect(s).toMatchObject({ workedMs: 7 * HOUR, breakMs: HOUR, elapsedMs: 8 * HOUR });
  });

  it("keeps worked plus break equal to elapsed for a complete session", () => {
    const ev = builder();
    const sessions = foldSessions([
      ev("started", at("07:03")),
      ev("paused", at("09:41")),
      ev("resumed", at("09:58")),
      ev("ended", at("11:12")),
      ev("started", at("12:00"), { job: JOB_B }),
      ev("paused", at("14:30"), { job: JOB_B }),
      ev("ended", at("15:07"), { job: JOB_B }),
    ]);
    for (const s of sessions) expect(s.workedMs + s.breakMs).toBe(s.elapsedMs);
  });

  it("folds a zero-length session to zero, never negative", () => {
    const ev = builder();
    const [s] = foldSessions([ev("started", at("08:00")), ev("ended", at("08:00"))]);
    expect(s).toMatchObject({ workedMs: 0, breakMs: 0, elapsedMs: 0 });
  });
});

describe("open sessions", () => {
  it("leaves elapsed null and counts closed intervals only", () => {
    const ev = builder();
    const events = [
      ev("started", at("08:00")),
      ev("paused", at("10:00")),
      ev("resumed", at("10:30")),
    ];
    const open = openSession(events);
    expect(open).toMatchObject({
      complete: false,
      state: "working",
      endedAt: null,
      elapsedMs: null,
      workedMs: 2 * HOUR,
      breakMs: 30 * MINUTE,
    });
  });

  it("has no open session after an end", () => {
    const ev = builder();
    expect(
      openSession([ev("started", at("08:00")), ev("ended", at("09:00"))]),
    ).toBeNull();
  });

  it("holds at most one open session across a job switch", () => {
    const ev = builder();
    const sessions = foldSessions([
      ev("started", at("08:00")),
      ev("ended", at("12:00")),
      ev("started", at("12:00"), { job: JOB_B }),
    ]);
    expect(sessions.map((s) => [s.jobId, s.complete])).toEqual([
      [JOB_A, true],
      [JOB_B, false],
    ]);
  });

  it("leaves a half-synced switch idle and invents nothing", () => {
    const ev = builder();
    const events = [ev("started", at("08:00")), ev("ended", at("12:00"))];
    expect(openSession(events)).toBeNull();
    expect(foldSessions(events)).toHaveLength(1);
  });

  it("folds several sessions in one day", () => {
    const ev = builder();
    const sessions = foldSessions([
      ev("started", at("07:00")),
      ev("ended", at("09:00")),
      ev("started", at("10:00"), { job: JOB_B }),
      ev("ended", at("12:00"), { job: JOB_B }),
      ev("started", at("13:00")),
      ev("ended", at("14:00")),
    ]);
    expect(sessions.map((s) => s.workedMs)).toEqual([2 * HOUR, 2 * HOUR, HOUR]);
  });
});

describe("ordering", () => {
  it("orders by device time, not arrival", () => {
    const ev = builder();
    // The end arrives first; the fold still sees start then end.
    const end = ev("ended", at("16:00"), { server: at("09:00", "2026-10-07") });
    const start = ev("started", at("08:00"), { server: at("09:01", "2026-10-07") });
    expect(foldSessions([end, start])[0]!.workedMs).toBe(8 * HOUR);
  });

  it("breaks a device-time tie by receipt", () => {
    const ev = builder();
    // Receipt and id disagree, so only the receipt key can put `a` first.
    const a = ev("started", at("08:00"), {
      server: at("08:00"),
      id: v7(at("09:00").getTime(), 1),
    });
    const b = ev("ended", at("08:00"), {
      server: at("08:01"),
      id: v7(at("08:30").getTime(), 1),
    });
    expect(a.id > b.id).toBe(true);
    expect(compareEvents(a, b)).toBeLessThan(0);
    expect(compareEvents(b, a)).toBeGreaterThan(0);
  });

  it("breaks a device-time and receipt tie by id", () => {
    const ev = builder();
    const a = ev("started", at("08:00"), { server: at("09:00") });
    const b = ev("ended", at("08:00"), { server: at("09:00") });
    expect(a.id < b.id).toBe(true);
    expect(compareEvents(a, b)).toBeLessThan(0);
    expect(foldSessions([b, a])).toHaveLength(1);
  });

  it("places a skewed event at its receipt, not its device time", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    // A phone clock reset to 03:00 ends the session; receipt at 16:00 places it.
    const end = ev("ended", at("03:00"), { server: at("16:00"), skewed: true });
    const [s] = foldSessions([start, end]);
    expect(s).toMatchObject({ workedMs: 8 * HOUR, endedAt: at("16:00") });
  });
});

describe("voids", () => {
  it("zeroes a voided session and keeps its span", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const sessions = foldSessions([
      start,
      ev("paused", at("10:00")),
      ev("resumed", at("10:30")),
      ev("ended", at("16:00")),
      ev("voided", at("17:00"), { voids: start.id }),
    ]);
    expect(sessions[0]).toMatchObject({
      voided: true,
      workedMs: 0,
      breakMs: 0,
      elapsedMs: 8 * HOUR,
      endedAt: at("16:00"),
    });
  });

  it("leaves a voided open session open", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const events = [start, ev("voided", at("09:00"), { voids: start.id })];
    expect(openSession(events)).toMatchObject({ voided: true, complete: false });
  });
});

describe("corrections", () => {
  it("replaces a root with its correction and reports the correction as source", () => {
    const ev = builder();
    const end = ev("ended", at("16:00"));
    const fix = ev("ended", at("15:00"), { corrects: end.id, server: at("18:00") });
    const r = replay([ev("started", at("08:00")), end, fix]);
    expect(r.violation).toBeNull();
    expect(r.sessions[0]).toMatchObject({ workedMs: 7 * HOUR, endedAt: at("15:00") });
    expect(r.winners.get(end.id)).toBe(fix.id);
    expect(r.sessions[0]!.eventSourceIds).toContain(fix.id);
    expect(r.sessions[0]!.eventSourceIds).not.toContain(end.id);
  });

  it("lets the newest accepted correction win", () => {
    const ev = builder();
    const end = ev("ended", at("16:00"));
    const older = ev("ended", at("15:00"), { corrects: end.id, server: at("18:00") });
    const newer = ev("ended", at("17:00"), { corrects: end.id, server: at("19:00") });
    // Input order must not matter.
    const r = replay([newer, ev("started", at("08:00")), older, end]);
    expect(r.winners.get(end.id)).toBe(newer.id);
    expect(r.sessions[0]!.workedMs).toBe(9 * HOUR);
  });

  it("breaks a same-receipt tie between corrections by the higher id", () => {
    const ev = builder();
    const end = ev("ended", at("16:00"));
    const first = ev("ended", at("15:00"), { corrects: end.id, server: at("18:00") });
    const second = ev("ended", at("17:00"), { corrects: end.id, server: at("18:00") });
    expect(
      replay([ev("started", at("08:00")), end, first, second]).winners.get(end.id),
    ).toBe(second.id);
  });

  it("re-attributes the session when the start is corrected to another job", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const end = ev("ended", at("16:00"));
    const fix = ev("started", at("08:00"), {
      job: JOB_B,
      corrects: start.id,
      server: at("18:00"),
    });
    const [s] = foldSessions([start, end, fix]);
    // The end keeps its own job as provenance; the session is the corrected start's.
    expect(end.jobId).toBe(JOB_A);
    expect(s).toMatchObject({ jobId: JOB_B, rootEventId: start.id });
    expect(s!.startedSourceEventId).toBe(fix.id);
  });
});

describe("violations", () => {
  it("throws LedgerInconsistentError for an illegal stored ledger", () => {
    const ev = builder();
    expect(() => foldSessions([ev("paused", at("08:00"))])).toThrow(
      LedgerInconsistentError,
    );
  });

  it("refuses to fold two workers together", () => {
    const ev = builder();
    expect(() =>
      replay([
        ev("started", at("08:00")),
        ev("started", at("08:00"), { worker: "0190d000-0000-7000-8000-00000000a002" }),
      ]),
    ).toThrow(/one worker/);
  });
});
