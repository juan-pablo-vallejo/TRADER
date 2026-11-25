// The office's correction sets (src/app/(office)/hours/correction-set.ts): what a ledger editor's draft
// becomes on the wire. `labor.correct` judges the set; this holds the set to what the ledger
// showed — the root and the replaced entry of a correction, the job rule, the ids' order.
import { describe, expect, it } from "vitest";

import {
  createMinter,
  draftOf,
  inEffect,
  missingHours,
  sessionOperations,
  voidOperation,
  type LedgerEvent,
  type LedgerSession,
  missingPreview,
  previewOf,
} from "../src/app/(office)/hours/correction-set";

const NY = "America/New_York";
const J1 = "00000000-0000-7000-8000-0000000000a1";
const NOW = Date.parse("2026-07-01T20:00:00Z");
const J2 = "00000000-0000-7000-8000-0000000000a2";

function event(
  id: string,
  type: LedgerEvent["type"],
  at: string,
  over: Partial<LedgerEvent> = {},
): LedgerEvent {
  return {
    id,
    type,
    job: { id: J1, name: "J1" },
    clientTimestamp: new Date(at),
    serverTimestamp: new Date(at),
    initiator: { id: "w", name: "W" },
    clockSkewed: false,
    clockSkewMs: 0,
    timeSetByUser: false,
    capturedOffline: false,
    hasLocation: false,
    correctsEventId: null,
    voidsEventId: null,
    effect: "in_effect",
    flags: [],
    ...over,
  };
}

// 07:00:12 to 15:30 Eastern on July 1; the clock-out was corrected twice, so its root
// ("end") and a first correction ("end-c1") are both replaced by "end-c2".
const session = (): LedgerSession =>
  ({
    rootEventId: "start",
    job: { id: J1, name: "J1", status: "open" },
    events: [
      event("start", "started", "2026-07-01T11:00:12.345Z"),
      event("end", "ended", "2026-07-01T19:00:00Z", { effect: "superseded" }),
      event("end-c1", "ended", "2026-07-01T19:10:00Z", {
        effect: "superseded",
        correctsEventId: "end",
      }),
      event("end-c2", "ended", "2026-07-01T19:30:00Z", { correctsEventId: "end" }),
    ],
  }) as unknown as LedgerSession;

describe("a session's correction set", () => {
  it("drafts the entries in effect at the company's clock, and sends nothing unchanged", () => {
    const s = session();
    expect(inEffect(s).map((e) => e.id)).toEqual(["start", "end-c2"]);
    const draft = draftOf(s, NY);
    expect(draft).toEqual({
      jobId: J1,
      times: { start: "2026-07-01T07:00", "end-c2": "2026-07-01T15:30" },
      added: [],
    });
    expect(sessionOperations(s, draft, NY)).toEqual({ ok: true, operations: [] });
  });

  it("corrects a twice-corrected entry by its root, replacing the one in effect", () => {
    const s = session();
    const draft = draftOf(s, NY);
    draft.times["end-c2"] = "2026-07-01T16:00";
    expect(sessionOperations(s, draft, NY)).toEqual({
      ok: true,
      operations: [
        {
          kind: "correct",
          correctsEventId: "end",
          replacesEventId: "end-c2",
          type: "ended",
          jobId: J1,
          clientTimestamp: new Date("2026-07-01T20:00:00Z"),
        },
      ],
    });
  });

  it("moves a start to another job at its own instant, and no other entry with it", () => {
    const s = session();
    const draft = { ...draftOf(s, NY), jobId: J2 };
    expect(sessionOperations(s, draft, NY)).toEqual({
      ok: true,
      operations: [
        {
          kind: "correct",
          correctsEventId: "start",
          replacesEventId: "start",
          type: "started",
          jobId: J2,
          // Untouched time: the seconds and milliseconds the phone recorded are kept.
          clientTimestamp: new Date("2026-07-01T11:00:12.345Z"),
        },
      ],
    });
  });

  it("adds entries after the corrections, on the job the set leaves the session on", () => {
    const s = session();
    const draft = draftOf(s, NY);
    draft.jobId = J2;
    draft.times.start = "2026-07-01T06:45";
    draft.times["end-c2"] = "2026-07-01T16:00";
    draft.added = [
      { type: "paused", at: "2026-07-01T12:00" },
      { type: "resumed", at: "2026-07-01T12:30" },
    ];
    const built = sessionOperations(s, draft, NY);
    expect(
      built.ok && built.operations.map((op) => [op.kind, "jobId" in op && op.jobId]),
    ).toEqual([
      ["correct", J2],
      // A corrected clock-out keeps its own job: only a start re-attributes a session.
      ["correct", J1],
      ["append", J2],
      ["append", J2],
    ]);
    expect(built.ok && built.operations.map((op) => "type" in op && op.type)).toEqual([
      "started",
      "ended",
      "paused",
      "resumed",
    ]);
  });

  it("names the control holding a time the zone's clock never read", () => {
    const s = session();
    const draft = draftOf(s, NY);
    draft.times["end-c2"] = "";
    expect(sessionOperations(s, draft, NY)).toEqual({
      ok: false,
      problem: "bad_time",
      field: "end-c2",
    });
    const added = draftOf(s, NY);
    added.added = [{ type: "ended", at: "2026-03-08T02:30" }];
    expect(sessionOperations(s, added, NY)).toEqual({
      ok: false,
      problem: "bad_time",
      field: "added-0",
    });
  });

  it("refuses more than one call takes", () => {
    const s = session();
    const draft = draftOf(s, NY);
    draft.added = Array.from({ length: 21 }, () => ({
      type: "paused" as const,
      at: "2026-07-01T12:00",
    }));
    expect(sessionOperations(s, draft, NY)).toEqual({ ok: false, problem: "too_many" });
  });

  it("voids an ended session by its root", () => {
    const ended = { ...session(), complete: true } as LedgerSession;
    expect(voidOperation(ended, NOW)).toEqual([{ kind: "void", voidsEventId: "start" }]);
  });

  // The server refuses a void that leaves its session open.
  it("ends an open session before voiding it, a minute back or at its last entry", () => {
    const open = {
      ...session(),
      complete: false,
      events: [event("start", "started", "2026-07-01T11:00:00Z")],
    } as unknown as LedgerSession;
    expect(voidOperation(open, Date.parse("2026-07-01T15:00:00Z"))).toEqual([
      {
        kind: "append",
        type: "ended",
        jobId: J1,
        clientTimestamp: new Date("2026-07-01T14:59:00Z"),
      },
      { kind: "void", voidsEventId: "start" },
    ]);
    // Clocked in under a minute ago: the end is at the clock-in, never before it.
    expect(voidOperation(open, Date.parse("2026-07-01T11:00:30Z"))[0]).toMatchObject({
      clientTimestamp: new Date("2026-07-01T11:00:00Z"),
    });
  });
});

describe("missing hours", () => {
  it("is a clock in and, when given, a clock out", () => {
    const both = missingHours(
      { jobId: J1, start: "2026-07-01T07:00", end: "2026-07-01T15:30" },
      NY,
    );
    expect(both).toEqual({
      ok: true,
      operations: [
        {
          kind: "append",
          type: "started",
          jobId: J1,
          clientTimestamp: new Date("2026-07-01T11:00:00Z"),
        },
        {
          kind: "append",
          type: "ended",
          jobId: J1,
          clientTimestamp: new Date("2026-07-01T19:30:00Z"),
        },
      ],
    });
    const open = missingHours({ jobId: J1, start: "2026-07-01T07:00", end: "" }, NY);
    expect(open.ok && open.operations).toHaveLength(1);
    expect(missingHours({ jobId: J1, start: "", end: "" }, NY)).toMatchObject({
      field: "start",
    });
    expect(
      missingHours({ jobId: J1, start: "2026-07-01T07:00", end: "nope" }, NY),
    ).toMatchObject({ field: "end" });
  });
});

describe("a set's ids", () => {
  const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const two = () => {
    const built = missingHours(
      { jobId: J1, start: "2026-07-01T07:00", end: "2026-07-01T07:00" },
      NY,
    );
    if (!built.ok) throw new Error("fixture");
    return built.operations;
  };

  it("are UUIDv7s that sort in the set's order", () => {
    const input = createMinter()("worker", two());
    const ids = input.operations.map((op) => op.id);
    expect(ids.every((id) => V7.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(2);
    expect(input.workerId).toBe("worker");
    // One millisecond apart, whatever the random bits: the order never rests on chance.
    const asked: number[] = [];
    createMinter(
      (ms) => `id-${asked.push(ms)}`,
      () => 5000,
    )("worker", two());
    expect(asked).toEqual([5000, 5001]);
  });

  it("stay the same for the same set and change with the set or the person", () => {
    let clock = 1_762_930_000_000;
    const minted = createMinter(undefined, () => (clock += 1000));
    const first = minted("worker", two());
    expect(minted("worker", two())).toBe(first);
    const other = minted("someone-else", two());
    expect(other.operations[0]!.id).not.toBe(first.operations[0]!.id);
    const changed = minted("someone-else", two().slice(0, 1));
    expect(changed.operations[0]!.id).not.toBe(other.operations[0]!.id);
  });
});

describe("the hours a draft would give, as the times are typed", () => {
  const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00-04:00`);
  const H = 3_600_000;

  it("is the time between clock in and clock out, breaks left out", () => {
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "ended", at: at("15:30") },
      ]),
    ).toEqual({ workedMs: 8.5 * H, open: false });
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "paused", at: at("12:00") },
        { type: "resumed", at: at("12:30") },
        { type: "ended", at: at("15:30") },
      ]),
    ).toEqual({ workedMs: 8 * H, open: false });
  });

  it("reads the entries by their times, however they were listed", () => {
    expect(
      previewOf([
        { type: "ended", at: at("15:30") },
        { type: "resumed", at: at("12:30") },
        { type: "started", at: at("07:00") },
        { type: "paused", at: at("12:00") },
      ]),
    ).toEqual({ workedMs: 8 * H, open: false });
  });

  it("counts closed time only while the session is still open, and says so", () => {
    expect(previewOf([{ type: "started", at: at("07:00") }])).toEqual({
      workedMs: 0,
      open: true,
    });
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "paused", at: at("12:00") },
      ]),
    ).toEqual({ workedMs: 5 * H, open: true });
    // Clocked out from a break: the break is not work.
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "paused", at: at("12:00") },
        { type: "ended", at: at("12:45") },
      ]),
    ).toEqual({ workedMs: 5 * H, open: false });
  });

  it("guesses nothing: a missing time or an order no session can have is no figure", () => {
    expect(previewOf([])).toBeNull();
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "ended", at: null },
      ]),
    ).toBeNull();
    // A clock out before the clock in.
    expect(
      previewOf([
        { type: "started", at: at("15:30") },
        { type: "ended", at: at("07:00") },
      ]),
    ).toBeNull();
    // A break end with no break start.
    expect(
      previewOf([
        { type: "started", at: at("07:00") },
        { type: "resumed", at: at("12:00") },
        { type: "ended", at: at("15:30") },
      ]),
    ).toBeNull();
  });

  it("follows a session's draft and the missing-hours form, in the company's zone", () => {
    expect(
      missingPreview({ start: "2026-10-05T07:00", end: "2026-10-05T15:30" }, NY),
    ).toEqual({ workedMs: 8.5 * H, open: false });
    expect(missingPreview({ start: "2026-10-05T07:00", end: "" }, NY)).toEqual({
      workedMs: 0,
      open: true,
    });
    expect(missingPreview({ start: "", end: "2026-10-05T15:30" }, NY)).toBeNull();
    // A time the clocks skipped that day (2:30 on the spring change) is no time.
    expect(
      missingPreview({ start: "2026-03-08T02:30", end: "2026-03-08T10:00" }, NY),
    ).toBeNull();
  });
});
