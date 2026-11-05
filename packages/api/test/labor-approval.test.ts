// Stage 3 line 8: whether a session counts, derived from the fold and its events' decisions.
// Pure: no database. The authorized precedence: approved void, rejected source, pending, else
// eligible; a rejected void is disregarded for accounting only.
import { describe, expect, it } from "vitest";

import {
  assertSameSessions,
  eventEffect,
  sessionApprovals,
  type Decision,
} from "../src/labor/approval";
import { replay, type LaborEvent } from "../src/labor/fold";
import { at, builder, HOUR } from "./labor-events";

const decided = (...pairs: [LaborEvent, Decision][]) =>
  new Map(pairs.map(([e, d]) => [e.id, d]));

// One eight-hour session, 08:00–16:00.
function day() {
  const ev = builder();
  const start = ev("started", at("08:00"));
  const end = ev("ended", at("16:00"));
  return { ev, start, end, ledger: [start, end] };
}

const only = (r: ReturnType<typeof sessionApprovals>) => [...r.byRoot.values()];

describe("sessionApprovals", () => {
  it("counts a session with no approval rows", () => {
    const { ledger, start } = day();
    expect(only(sessionApprovals(ledger, new Map()))).toEqual([
      {
        rootEventId: start.id,
        accounting: "eligible",
        eligibleWorkedMs: 8 * HOUR,
        complete: true,
      },
    ]);
  });

  it("withholds the whole session while its start or its end is pending", () => {
    const { ledger, start, end } = day();
    for (const pending of [start, end]) {
      const [s] = only(sessionApprovals(ledger, decided([pending, null])));
      expect(s).toMatchObject({ accounting: "pending", eligibleWorkedMs: 0 });
    }
    const [s] = only(
      sessionApprovals(ledger, decided([start, "approved"], [end, "approved"])),
    );
    expect(s).toMatchObject({ accounting: "eligible", eligibleWorkedMs: 8 * HOUR });
  });

  it("makes a session with a rejected source ineligible", () => {
    const { ledger, start } = day();
    const [s] = only(sessionApprovals(ledger, decided([start, "rejected"])));
    expect(s).toMatchObject({ accounting: "rejected", eligibleWorkedMs: 0 });
  });

  it("puts a rejected source before a pending one", () => {
    const { ledger, start, end } = day();
    const [s] = only(sessionApprovals(ledger, decided([start, "rejected"], [end, null])));
    expect(s?.accounting).toBe("rejected");
  });

  it("judges an approved correction, not the rejected root it supersedes", () => {
    const { ev, ledger, start } = day();
    const fix = ev("started", at("09:00"), { corrects: start.id });
    const [s] = only(
      sessionApprovals([...ledger, fix], decided([start, "rejected"], [fix, "approved"])),
    );
    expect(s).toMatchObject({ accounting: "eligible", eligibleWorkedMs: 7 * HOUR });
  });

  it("blocks on a rejected correction until a later correction wins", () => {
    const { ev, ledger, start } = day();
    const bad = ev("started", at("09:00"), { corrects: start.id });
    const [blocked] = only(
      sessionApprovals([...ledger, bad], decided([bad, "rejected"])),
    );
    expect(blocked?.accounting).toBe("rejected");
    const good = ev("started", at("08:30"), {
      corrects: start.id,
      server: at("10:00"),
    });
    const ledger2 = [...ledger, bad, good];
    expect(
      only(sessionApprovals(ledger2, decided([bad, "rejected"], [good, null])))[0],
    ).toMatchObject({ accounting: "pending" });
    expect(
      only(sessionApprovals(ledger2, decided([bad, "rejected"], [good, "approved"])))[0],
    ).toMatchObject({ accounting: "eligible", eligibleWorkedMs: 7.5 * HOUR });
  });

  it("ignores a superseded correction's pending or rejected decision", () => {
    const { ev, ledger, start } = day();
    const old = ev("started", at("09:00"), { corrects: start.id });
    const winner = ev("started", at("08:30"), {
      corrects: start.id,
      server: at("10:00"),
    });
    for (const d of [null, "rejected"] as const) {
      const [s] = only(
        sessionApprovals(
          [...ledger, old, winner],
          decided([old, d], [winner, "approved"]),
        ),
      );
      expect(s).toMatchObject({ accounting: "eligible", eligibleWorkedMs: 7.5 * HOUR });
    }
  });

  it("withholds a session whose void is pending", () => {
    const { ev, ledger, start } = day();
    const v = ev("voided", at("17:00"), { voids: start.id });
    const [s] = only(sessionApprovals([...ledger, v], decided([v, null])));
    expect(s).toMatchObject({ accounting: "pending", eligibleWorkedMs: 0 });
  });

  it("zeroes an approved void, ahead of any pending or rejected source", () => {
    const { ev, ledger, start, end } = day();
    const v = ev("voided", at("17:00"), { voids: start.id });
    for (const d of [null, "rejected", "approved"] as const) {
      const [s] = only(
        sessionApprovals([...ledger, v], decided([v, "approved"], [end, d])),
      );
      expect(s).toMatchObject({ accounting: "voided", eligibleWorkedMs: 0 });
    }
  });

  it("restores eight hours behind a rejected void, the structure still voided", () => {
    const { ev, ledger, start } = day();
    const v = ev("voided", at("17:00"), { voids: start.id });
    const all = [...ledger, v];
    const result = sessionApprovals(all, decided([v, "rejected"], [start, null]));
    expect(only(result)[0]?.accounting).toBe("pending");
    const cleared = sessionApprovals(all, decided([v, "rejected"], [start, "approved"]));
    expect(only(cleared)[0]).toMatchObject({
      accounting: "eligible",
      eligibleWorkedMs: 28_800_000,
    });
    // The structural fold is untouched: the session is voided and its hours zero.
    expect(cleared.structural.sessions[0]).toMatchObject({ voided: true, workedMs: 0 });
  });

  it("counts an open, cleared session's closed intervals and leaves it incomplete", () => {
    const ev = builder();
    const ledger = [
      ev("started", at("08:00")),
      ev("paused", at("10:00")),
      ev("resumed", at("10:30")),
    ];
    const [s] = only(sessionApprovals(ledger, new Map()));
    expect(s).toMatchObject({
      accounting: "eligible",
      eligibleWorkedMs: 2 * HOUR,
      complete: false,
    });
  });

  it("refuses a projection that moves a session's sources", () => {
    const { ev, ledger } = day();
    const other = [ev("started", at("18:00")), ev("ended", at("19:00"))];
    expect(() => assertSameSessions(replay(ledger), replay(other))).toThrow(
      "the accounting projection moved a session's sources",
    );
    expect(() => assertSameSessions(replay(ledger), replay(ledger))).not.toThrow();
  });
});

describe("eventEffect", () => {
  it("maps an event in effect, a superseded correction and a void to their session", () => {
    const { ev, ledger, start, end } = day();
    const old = ev("started", at("09:00"), { corrects: start.id });
    const winner = ev("started", at("08:30"), {
      corrects: start.id,
      server: at("10:00"),
    });
    const v = ev("voided", at("17:00"), { voids: start.id });
    const { structural } = sessionApprovals([...ledger, old, winner, v], new Map());
    const effect = (e: LaborEvent) => eventEffect(structural, e);
    expect(effect(end)).toEqual({ sessionRootEventId: start.id, effect: "in_effect" });
    expect(effect(winner)).toEqual({ sessionRootEventId: start.id, effect: "in_effect" });
    expect(effect(old)).toEqual({ sessionRootEventId: start.id, effect: "superseded" });
    expect(effect(start)).toEqual({ sessionRootEventId: start.id, effect: "superseded" });
    expect(effect(v)).toEqual({ sessionRootEventId: start.id, effect: "void" });
  });

  it("throws for an event the timeline does not hold", () => {
    const { ev, ledger } = day();
    const { structural } = sessionApprovals(ledger, new Map());
    expect(() => eventEffect(structural, ev("started", at("20:00")))).toThrow(
      "maps to no session",
    );
  });
});
