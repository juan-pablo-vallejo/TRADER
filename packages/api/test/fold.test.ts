import { describe, expect, it } from "vitest";

import { deriveSessions, payrollByWorkDate, workDate } from "../src/sync/derive";
import {
  checkLegality,
  foldSessions,
  openSession,
  type FoldEvent,
} from "../src/sync/fold";

const TZ = "America/New_York";

/**
 * Events are built by hand rather than through Drizzle: the fold is a pure
 * function over the five fields it reads, and constructing whole rows would hide
 * that behind fixture noise.
 *
 * `id` is monotonic per call so the CONFLICT-2 tiebreaker is deterministic.
 */
let seq = 0;
function ev(
  type: FoldEvent["type"],
  clientIso: string,
  opts: { serverIso?: string; jobId?: string; id?: string } = {},
): FoldEvent {
  seq += 1;
  return {
    id: opts.id ?? `00000000-0000-7000-8000-${String(seq).padStart(12, "0")}`,
    workerId: "worker-1",
    jobId: opts.jobId ?? "job-1",
    type,
    clientTimestamp: new Date(clientIso),
    serverTimestamp: new Date(opts.serverIso ?? clientIso),
  };
}

const hours = (ms: number) => ms / 3_600_000;

describe("foldSessions — DERIVE-3, worked duration", () => {
  it("sums start-to-end", () => {
    const [s] = foldSessions([
      ev("started", "2026-07-30T12:00:00Z"),
      ev("ended", "2026-07-30T20:00:00Z"),
    ]);
    expect(hours(s!.workedMs)).toBe(8);
  });

  it("excludes paused spans", () => {
    const s = foldSessions([
      ev("started", "2026-07-30T12:00:00Z"),
      ev("paused", "2026-07-30T16:00:00Z"),
      ev("resumed", "2026-07-30T17:00:00Z"),
      ev("ended", "2026-07-30T20:00:00Z"),
    ])[0]!;
    // 4h + 3h worked; the 1h break is not paid.
    expect(hours(s.workedMs)).toBe(7);
  });

  it("does not double-count a duplicated resume", () => {
    const s = foldSessions([
      ev("started", "2026-07-30T12:00:00Z"),
      ev("paused", "2026-07-30T13:00:00Z"),
      ev("resumed", "2026-07-30T14:00:00Z"),
      ev("resumed", "2026-07-30T15:00:00Z"),
      ev("ended", "2026-07-30T16:00:00Z"),
    ])[0]!;
    // 1h before the break, 2h after. A second `resumed` must not restart the
    // interval clock, which would silently drop the 14:00–15:00 hour.
    expect(hours(s.workedMs)).toBe(3);
  });
});

describe("foldSessions — DERIVE-4/5, voided and open", () => {
  /**
   * The session must have **already accumulated** time before the void, or the
   * assertion cannot fail: a start-then-void session has `workedMs` at its
   * initial 0 whether or not DERIVE-4 is implemented. The `paused` here closes a
   * 4-hour interval first, so a missing `workedMs = 0` shows up as 4h of paid
   * time on a voided session.
   */
  it("a voided session contributes zero even after accumulating worked time", () => {
    const events = [
      ev("started", "2026-07-30T12:00:00Z"),
      ev("paused", "2026-07-30T16:00:00Z"),
      ev("resumed", "2026-07-30T17:00:00Z"),
      ev("voided", "2026-07-30T20:00:00Z"),
    ];
    const s = foldSessions(events)[0]!;
    expect(s.voided).toBe(true);
    expect(s.workedMs).toBe(0);
    // And it must not reach payroll by any other route.
    expect(payrollByWorkDate(events, TZ).size).toBe(0);
  });

  it("an open session is excluded from payroll but still visible", () => {
    const events = [ev("started", "2026-07-30T12:00:00Z")];
    expect(openSession(events)).not.toBeNull();
    expect(deriveSessions(events, TZ)[0]!.countsTowardPayroll).toBe(false);
    expect(payrollByWorkDate(events, TZ).size).toBe(0);
  });

  it("SESSION-1: at most one session is open across a job switch", () => {
    // SESSION-5: a switch is `ended` then `started`, never an update.
    const events = [
      ev("started", "2026-07-30T12:00:00Z", { jobId: "job-a" }),
      ev("ended", "2026-07-30T15:00:00Z", { jobId: "job-a" }),
      ev("started", "2026-07-30T15:00:00Z", { jobId: "job-b" }),
    ];
    const sessions = foldSessions(events);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.endedAt === null)).toHaveLength(1);
    expect(openSession(events)!.jobId).toBe("job-b");
  });

  it("SESSION-6: a half-synced switch leaves no open session, and invents nothing", () => {
    // `ended` on job A arrived; `started` on job B did not.
    const events = [
      ev("started", "2026-07-30T12:00:00Z", { jobId: "job-a" }),
      ev("ended", "2026-07-30T15:00:00Z", { jobId: "job-a" }),
    ];
    expect(openSession(events)).toBeNull();
    expect(foldSessions(events)).toHaveLength(1);
  });
});

describe("ordering — CONFLICT-2", () => {
  it("orders by client_timestamp, not arrival", () => {
    // An offline 15:00 clock-out syncing at 18:00 beats a 14:00 event.
    const s = foldSessions([
      ev("ended", "2026-07-30T15:00:00Z", { serverIso: "2026-07-30T18:00:00Z" }),
      ev("started", "2026-07-30T14:00:00Z", { serverIso: "2026-07-30T18:00:01Z" }),
    ])[0]!;
    expect(hours(s.workedMs)).toBe(1);
    expect(s.endedAt).not.toBeNull();
  });

  it("breaks client_timestamp ties with server_timestamp", () => {
    const s = foldSessions([
      ev("ended", "2026-07-30T15:00:00Z", { serverIso: "2026-07-30T15:00:02Z" }),
      ev("paused", "2026-07-30T15:00:00Z", { serverIso: "2026-07-30T15:00:01Z" }),
      ev("started", "2026-07-30T12:00:00Z"),
    ])[0]!;
    // paused then ended, both at 15:00 — so the session ends, rather than the
    // pause landing after the end and being dropped.
    expect(s.events.map((e) => e.type)).toEqual(["started", "paused", "ended"]);
    expect(hours(s.workedMs)).toBe(3);
  });
});

describe("workDate — DERIVE-1/2", () => {
  it("uses the company timezone, not UTC", () => {
    // 01:00 UTC on the 31st is 21:00 on the 30th in New York.
    expect(workDate(new Date("2026-07-31T01:00:00Z"), TZ)).toBe("2026-07-30");
  });

  it("a session crossing midnight belongs entirely to its start date", () => {
    // 22:00 → 02:00 local: four hours on the first day, not two on each.
    const events = [
      ev("started", "2026-07-31T02:00:00Z"), // 22:00 on the 30th, New York
      ev("ended", "2026-07-31T06:00:00Z"), //   02:00 on the 31st, New York
    ];
    const totals = payrollByWorkDate(events, TZ);
    expect([...totals.keys()]).toEqual(["2026-07-30"]);
    expect(hours(totals.get("2026-07-30")!)).toBe(4);
  });

  it("is correct across a DST boundary, where a fixed offset would not be", () => {
    // US DST ended 2026-11-01. 04:00 UTC is 00:00 EDT (UTC-4) on the 1st;
    // 06:00 UTC is 01:00 EST (UTC-5), still the 1st.
    expect(workDate(new Date("2026-11-01T04:00:00Z"), TZ)).toBe("2026-11-01");
    expect(workDate(new Date("2026-11-01T06:00:00Z"), TZ)).toBe("2026-11-01");
    // And 03:00 UTC is still 23:00 on 10-31.
    expect(workDate(new Date("2026-11-01T03:00:00Z"), TZ)).toBe("2026-10-31");
  });
});

describe("checkLegality — SESSION-2/3/4", () => {
  const started = ev("started", "2026-07-30T12:00:00Z");

  it("rejects an event with no open session", () => {
    const r = checkLegality([], ev("paused", "2026-07-30T13:00:00Z"));
    expect(r.ok).toBe(false);
  });

  it("rejects an illegal transition", () => {
    const r = checkLegality([started], ev("resumed", "2026-07-30T13:00:00Z"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflictingEventId).toBe(started.id);
  });

  it("rejects a second concurrent session, enforcing SESSION-1", () => {
    const r = checkLegality([started], ev("started", "2026-07-30T13:00:00Z"));
    expect(r.ok).toBe(false);
  });

  it("accepts a legal transition", () => {
    expect(checkLegality([started], ev("paused", "2026-07-30T13:00:00Z")).ok).toBe(true);
  });

  /**
   * The rule the whole protocol rests on. A `resumed` whose own `paused` has not
   * arrived yet must be judged at its timestamp position, not against the latest
   * state — otherwise ordinary out-of-order sync would reject valid labor.
   */
  it("SESSION-3: judges at the candidate's position, not against latest-arrived", () => {
    const paused = ev("paused", "2026-07-30T13:00:00Z");
    const resumed = ev("resumed", "2026-07-30T14:00:00Z");

    // `resumed` arrives before its own `paused`: illegal at that moment.
    expect(checkLegality([started], resumed).ok).toBe(false);
    // Once `paused` is present, the same event is legal at its own position —
    // even though `resumed` is not "the latest thing that happened" by arrival.
    expect(checkLegality([started, paused], resumed).ok).toBe(true);
  });

  it("SESSION-3: a late-arriving event inserted mid-history is judged in place", () => {
    const paused = ev("paused", "2026-07-30T13:00:00Z");
    const resumed = ev("resumed", "2026-07-30T14:00:00Z");
    const ended = ev("ended", "2026-07-30T17:00:00Z");
    // `paused` at 13:00 arrives last, after 14:00 and 17:00 are already stored.
    expect(checkLegality([started, resumed, ended], paused).ok).toBe(true);
  });

  it("rejects an insertion that would leave a following event illegal", () => {
    const ended = ev("ended", "2026-07-30T17:00:00Z");
    // Slipping `ended` in at 14:00 would orphan the 17:00 `ended` after it.
    const r = checkLegality([started, ended], ev("ended", "2026-07-30T14:00:00Z"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflictingEventId).toBe(ended.id);
  });

  it("CONFLICT-1: a repeated id is legal, not a conflict", () => {
    expect(checkLegality([started], started).ok).toBe(true);
  });
});
