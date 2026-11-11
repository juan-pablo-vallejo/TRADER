// Two-sided transition validation, pure: no database. Committed events carry their device
// time as receipt; every candidate carries RECEIVED, as one push transaction would stamp it.
import { describe, expect, it } from "vitest";

import {
  foldSessions,
  LedgerInconsistentError,
  type LaborEvent,
} from "../../src/labor/fold";
import {
  validateEvent,
  validateEvents,
  type ValidationContext,
} from "../../src/labor/validate";
import { at, builder, JOB_A, JOB_B, v7, WORKER } from "./events";

const RECEIVED = at("23:00", "2026-10-06");

// The locked baseline is the newest committed stamp; batch-mates already carry RECEIVED.
function ctxFor(existing: readonly LaborEvent[]): ValidationContext {
  const committed = existing
    .map((e) => e.serverTimestamp.getTime())
    .filter((t) => t !== RECEIVED.getTime());
  return {
    workerId: WORKER,
    baselineStamp: committed.length > 0 ? new Date(Math.max(...committed)) : null,
    receivedAt: RECEIVED,
  };
}

// A single candidate's rejection always names that candidate; the comparisons below are on the
// rest of the verdict.
function push(existing: readonly LaborEvent[], candidate: LaborEvent) {
  const verdict = validateEvent(ctxFor(existing), existing, candidate);
  if (verdict.verdict === "accepted") return verdict;
  const { eventId, ...rest } = verdict;
  expect(eventId).toBe(candidate.id);
  return rest;
}

const ok = { verdict: "accepted" };
const no = (code: string, conflictingEventId?: string) => ({
  verdict: "rejected",
  code,
  ...(conflictingEventId === undefined ? {} : { conflictingEventId }),
});

// Accepts each candidate in turn into one growing timeline, as a batch would.
function pushAll(existing: LaborEvent[], ...candidates: LaborEvent[]) {
  const timeline = [...existing];
  for (const c of candidates) {
    expect(push(timeline, c)).toEqual(ok);
    timeline.push(c);
  }
  return timeline;
}

describe("legal transitions", () => {
  it("accepts every legal edge at the tail", () => {
    const ev = builder();
    const r = { server: RECEIVED };
    pushAll(
      [],
      ev("started", at("08:00"), r),
      ev("paused", at("10:00"), r),
      ev("resumed", at("10:15"), r),
      ev("paused", at("15:00"), r),
      ev("ended", at("16:00"), r),
      ev("started", at("16:00"), { ...r, job: JOB_B }),
      ev("ended", at("17:00"), { ...r, job: JOB_B }),
    );
  });

  it("accepts an end that arrives two days late", () => {
    const ev = builder();
    const late = ev("ended", at("16:00"), { server: RECEIVED });
    expect(push([ev("started", at("08:00"))], late)).toEqual(ok);
  });

  it("accepts a missed pause inserted mid-session when no later pause follows", () => {
    const ev = builder();
    pushAll(
      [ev("started", at("08:00")), ev("ended", at("16:00"))],
      ev("paused", at("10:00"), { server: RECEIVED }),
      ev("resumed", at("10:15"), { server: RECEIVED }),
    );
  });

  it("accepts a missed session appended after the last event", () => {
    const ev = builder();
    pushAll(
      [ev("started", at("08:00")), ev("ended", at("12:00"))],
      ev("started", at("13:00"), { server: RECEIVED, job: JOB_B }),
      ev("ended", at("17:00"), { server: RECEIVED, job: JOB_B }),
    );
  });

  it("accepts an admin's end for a forgotten clock-out", () => {
    const ev = builder();
    expect(
      push([ev("started", at("08:00"))], ev("ended", at("16:00"), { server: RECEIVED })),
    ).toEqual(ok);
  });
});

describe("illegal transitions", () => {
  it("rejects a repeated clock-in, naming the open session", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    expect(push([start], ev("started", at("09:00"), { server: RECEIVED }))).toEqual(
      no("session_already_open", start.id),
    );
  });

  it("rejects a second clock-out under a new id", () => {
    const ev = builder();
    const end = ev("ended", at("16:00"));
    expect(
      push(
        [ev("started", at("08:00")), end],
        ev("ended", at("16:05"), { server: RECEIVED }),
      ),
    ).toEqual(no("no_open_session", end.id));
  });

  it("rejects a pause, resume or end with no open session", () => {
    const ev = builder();
    for (const type of ["paused", "resumed", "ended"] as const) {
      expect(push([], ev(type, at("08:00"), { server: RECEIVED }))).toEqual(
        no("no_open_session"),
      );
    }
  });

  it("rejects a resume while working", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    expect(push([start], ev("resumed", at("09:00"), { server: RECEIVED }))).toEqual(
      no("not_paused", start.id),
    );
  });

  it("rejects a pause while paused and a start while paused", () => {
    const ev = builder();
    const existing = [ev("started", at("08:00")), ev("paused", at("10:00"))];
    expect(push(existing, ev("paused", at("10:05"), { server: RECEIVED }))).toEqual(
      no("already_paused", existing[1]!.id),
    );
    expect(push(existing, ev("started", at("10:05"), { server: RECEIVED }))).toEqual(
      no("session_already_open", existing[1]!.id),
    );
  });

  it("rejects an insertion that strands a following event", () => {
    const ev = builder();
    const later = ev("started", at("13:00"));
    const existing = [later, ev("ended", at("17:00"))];
    expect(push(existing, ev("started", at("08:00"), { server: RECEIVED }))).toEqual(
      no("breaks_following_event", later.id),
    );
  });

  it("rejects a start inside a voided session's span", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const existing = [
      start,
      ev("ended", at("16:00")),
      ev("voided", at("17:00"), { voids: start.id }),
    ];
    expect(
      push(existing, ev("started", at("10:00"), { server: RECEIVED })),
    ).toMatchObject(no("session_already_open"));
  });
});

describe("corrections and voids", () => {
  const day = () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const pause = ev("paused", at("10:00"));
    const resume = ev("resumed", at("10:30"));
    const end = ev("ended", at("16:00"));
    return { ev, start, pause, resume, end, existing: [start, pause, resume, end] };
  };

  it("accepts a corrected end or start time", () => {
    const { ev, start, end, existing } = day();
    const r = { server: RECEIVED };
    expect(push(existing, ev("ended", at("15:00"), { ...r, corrects: end.id }))).toEqual(
      ok,
    );
    expect(
      push(existing, ev("started", at("07:30"), { ...r, corrects: start.id })),
    ).toEqual(ok);
  });

  it("accepts a start corrected to another job", () => {
    const { ev, start, existing } = day();
    const fix = ev("started", at("08:00"), {
      server: RECEIVED,
      corrects: start.id,
      job: JOB_B,
    });
    expect(push(existing, fix)).toEqual(ok);
    expect(foldSessions([...existing, fix])[0]!.jobId).toBe(JOB_B);
  });

  it("removes a mistaken pause by correcting the resume onto it", () => {
    const { ev, resume, existing } = day();
    const fix = ev("resumed", at("10:00"), { server: RECEIVED, corrects: resume.id });
    expect(push(existing, fix)).toEqual(ok);
    expect(foldSessions([...existing, fix])[0]!.breakMs).toBe(0);
  });

  it("rejects a correction that moves a pause past its resume", () => {
    const { ev, pause, resume, existing } = day();
    const fix = ev("paused", at("11:00"), { server: RECEIVED, corrects: pause.id });
    expect(push(existing, fix)).toEqual(no("breaks_following_event", resume.id));
  });

  it("blames the correction itself when it lands illegally", () => {
    const { ev, start, resume, existing } = day();
    const fix = ev("resumed", at("09:00"), { server: RECEIVED, corrects: resume.id });
    expect(push(existing, fix)).toEqual(no("not_paused", start.id));
  });

  it("rejects corrections with a bad target", () => {
    const { ev, end, existing } = day();
    const r = { server: RECEIVED };
    const fix = ev("ended", at("15:00"), { server: at("18:00"), corrects: end.id });
    const withFix = [...existing, fix];
    expect(push(withFix, ev("ended", at("15:30"), { ...r, corrects: fix.id }))).toEqual(
      no("target_is_correction"),
    );
    expect(push(existing, ev("paused", at("15:00"), { ...r, corrects: end.id }))).toEqual(
      no("correction_type_mismatch"),
    );
    const elsewhere = v7(at("08:00").getTime(), 999);
    expect(
      push(existing, ev("ended", at("15:00"), { ...r, corrects: elsewhere })),
    ).toEqual(no("target_missing"));
  });

  it("voids a closed session and an open one, and the open one still ends", () => {
    const { ev, start, existing } = day();
    expect(
      push(existing, ev("voided", at("17:00"), { server: RECEIVED, voids: start.id })),
    ).toEqual(ok);
    const ev2 = builder();
    const open = ev2("started", at("08:00"));
    const timeline = pushAll(
      [open],
      ev2("voided", at("09:00"), { server: RECEIVED, voids: open.id }),
      ev2("ended", at("16:00"), { server: RECEIVED }),
    );
    expect(foldSessions(timeline)[0]).toMatchObject({
      voided: true,
      complete: true,
      workedMs: 0,
    });
  });

  it("rejects a bad void and a correction of a void", () => {
    const { ev, start, end, existing } = day();
    const r = { server: RECEIVED };
    expect(push(existing, ev("voided", at("17:00"), { ...r, voids: end.id }))).toEqual(
      no("void_target_not_started"),
    );
    const v = ev("voided", at("17:00"), { server: at("18:00"), voids: start.id });
    expect(
      push([...existing, v], ev("voided", at("17:05"), { ...r, voids: start.id })),
    ).toEqual(no("already_voided"));
    expect(push(existing, ev("voided", at("17:00"), { ...r, voids: v7(1, 1) }))).toEqual(
      no("target_missing"),
    );
  });

  it("rejects correcting a void", () => {
    const { ev, start, existing } = day();
    const v = ev("voided", at("17:00"), { server: at("18:00"), voids: start.id });
    // A non-void event naming the void as the event it corrects.
    const fix = ev("ended", at("17:00"), { server: RECEIVED, corrects: v.id });
    expect(push([...existing, v], fix)).toEqual(no("correction_of_void"));
  });
});

describe("preconditions and ledger faults", () => {
  it("throws on an id already recorded", () => {
    const ev = builder();
    const start = ev("started", at("08:00"), { server: RECEIVED });
    expect(() => push([start], start)).toThrow(/duplicate/);
  });

  it("throws on another worker's candidate", () => {
    const ev = builder();
    const other = ev("started", at("08:00"), {
      server: RECEIVED,
      worker: "0190d000-0000-7000-8000-00000000a002",
    });
    expect(() => push([], other)).toThrow(/another worker/);
  });

  it("throws LedgerInconsistentError on a malformed stored reference graph", () => {
    const ev = builder();
    const orphan = ev("ended", at("16:00"), { corrects: v7(1, 1) });
    expect(() =>
      push(
        [ev("started", at("08:00")), orphan],
        ev("paused", at("09:00"), { server: RECEIVED }),
      ),
    ).toThrow(LedgerInconsistentError);
  });

  it("throws LedgerInconsistentError on an illegal stored sequence, never rejecting", () => {
    const ev = builder();
    expect(() =>
      push([ev("paused", at("08:00"))], ev("started", at("09:00"), { server: RECEIVED })),
    ).toThrow(LedgerInconsistentError);
  });
});

describe("batch stamps", () => {
  it("accepts several events sharing one receivedAt", () => {
    const ev = builder();
    const r = { server: RECEIVED };
    const timeline = pushAll(
      [ev("started", at("06:00")), ev("ended", at("07:00"))],
      ev("started", at("08:00"), r),
      ev("paused", at("10:00"), r),
      ev("resumed", at("10:15"), r),
    );
    expect(timeline).toHaveLength(5);
  });

  it("throws on an existing event stamped after the baseline but not receivedAt", () => {
    const ev = builder();
    const committed = ev("started", at("08:00"));
    const stray = ev("paused", at("10:00"), { server: at("12:00", "2026-10-06") });
    const ctx = { workerId: WORKER, baselineStamp: at("08:00"), receivedAt: RECEIVED };
    expect(() =>
      validateEvent(
        ctx,
        [committed, stray],
        ev("resumed", at("10:15"), { server: RECEIVED }),
      ),
    ).toThrow(/after the locked baseline/);
  });

  it("throws on a candidate not stamped receivedAt", () => {
    const ev = builder();
    expect(() =>
      push([], ev("started", at("08:00"), { server: at("22:00", "2026-10-06") })),
    ).toThrow(/receivedAt/);
  });

  it("throws when receivedAt is not after the baseline", () => {
    const ev = builder();
    const ctx = { workerId: WORKER, baselineStamp: RECEIVED, receivedAt: RECEIVED };
    expect(() =>
      validateEvent(ctx, [], ev("started", at("08:00"), { server: RECEIVED })),
    ).toThrow(/baseline/);
  });
});

describe("atomic repairs are not possible one record at a time", () => {
  it("cannot add a missed session in front of a later one, one event at a time", () => {
    const ev = builder();
    const later = ev("started", at("13:00"), { job: JOB_B });
    const existing = [later, ev("ended", at("17:00"), { job: JOB_B })];
    const start = ev("started", at("08:00"), { server: RECEIVED });
    const end = ev("ended", at("12:00"), { server: RECEIVED });
    expect(push(existing, start)).toEqual(no("breaks_following_event", later.id));
    expect(push(existing, end)).toEqual(no("no_open_session"));
    // Together the pair is a legal timeline: the limit is the per-record path, not the fold.
    expect(foldSessions([...existing, start, end])).toHaveLength(2);
  });

  it("cannot add a missed pause before a later pause, one event at a time", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const laterPause = ev("paused", at("12:00"));
    const existing = [
      start,
      laterPause,
      ev("resumed", at("12:30")),
      ev("ended", at("16:00")),
    ];
    const pause = ev("paused", at("10:00"), { server: RECEIVED });
    const resume = ev("resumed", at("10:15"), { server: RECEIVED });
    expect(push(existing, pause)).toEqual(no("breaks_following_event", laterPause.id));
    expect(push(existing, resume)).toEqual(no("not_paused", start.id));
    expect(foldSessions([...existing, pause, resume])[0]!.breakMs).toBe(45 * 60_000);
  });
});

describe("job attribution", () => {
  const corrected = () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const end = ev("ended", at("16:00"));
    const fix = ev("started", at("08:00"), {
      server: at("18:00"),
      corrects: start.id,
      job: JOB_B,
    });
    return { ev, start, end, fix };
  };

  it("holds an ordinary pause to the session's effective job", () => {
    const { ev, start, end, fix } = corrected();
    const existing = [start, end, fix];
    expect(
      push(existing, ev("paused", at("10:00"), { server: RECEIVED, job: JOB_B })),
    ).toEqual(ok);
    expect(
      push(existing, ev("paused", at("10:00"), { server: RECEIVED, job: JOB_A })),
    ).toEqual(no("job_id_mismatch", fix.id));
  });

  it("holds a historical correction to its root's job", () => {
    const { ev, start, end, fix } = corrected();
    const existing = [start, end, fix];
    const keep = ev("ended", at("15:00"), {
      server: RECEIVED,
      corrects: end.id,
      job: JOB_A,
    });
    expect(push(existing, keep)).toEqual(ok);
    expect(
      push(
        existing,
        ev("ended", at("15:00"), { server: RECEIVED, corrects: end.id, job: JOB_B }),
      ),
    ).toEqual(no("correction_job_mismatch"));
    const [s] = foldSessions([...existing, keep]);
    expect(s!.jobId).toBe(JOB_B);
    expect(keep.jobId).toBe(JOB_A);
  });

  it("rejects a correction that carries a pause into another session", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const pause = ev("paused", at("10:00"));
    const existing = [
      start,
      pause,
      ev("ended", at("12:00")),
      ev("started", at("13:00"), { job: JOB_B }),
      ev("ended", at("17:00"), { job: JOB_B }),
    ];
    const fix = ev("paused", at("14:00"), { server: RECEIVED, corrects: pause.id });
    expect(push(existing, fix)).toEqual(no("correction_moves_session", start.id));
  });
});

describe("superseded corrections", () => {
  const base = () => {
    const ev = builder();
    const end = ev("ended", at("16:00"));
    return { ev, end, existing: [ev("started", at("08:00")), end] };
  };

  it("rejects a batch-mate correction that loses the id tie, though the replay is legal", () => {
    const { ev, end, existing } = base();
    const hi = ev("ended", at("15:00"), {
      server: RECEIVED,
      corrects: end.id,
      id: v7(RECEIVED.getTime(), 900),
    });
    const lo = ev("ended", at("15:30"), {
      server: RECEIVED,
      corrects: end.id,
      id: v7(RECEIVED.getTime(), 100),
    });
    expect(push([...existing, hi], lo)).toEqual(no("correction_superseded", hi.id));
  });

  it("accepts the batch-mate that wins the id tie", () => {
    const { ev, end, existing } = base();
    const lo = ev("ended", at("15:30"), {
      server: RECEIVED,
      corrects: end.id,
      id: v7(RECEIVED.getTime(), 100),
    });
    const hi = ev("ended", at("15:00"), {
      server: RECEIVED,
      corrects: end.id,
      id: v7(RECEIVED.getTime(), 900),
    });
    expect(push([...existing, lo], hi)).toEqual(ok);
  });

  it("lets a later receipt beat a committed correction", () => {
    const { ev, end, existing } = base();
    const old = ev("ended", at("15:00"), {
      server: at("18:00"),
      corrects: end.id,
      id: v7(at("18:00").getTime(), 999),
    });
    const fresh = ev("ended", at("15:30"), {
      server: RECEIVED,
      corrects: end.id,
      id: v7(RECEIVED.getTime(), 1),
    });
    expect(push([...existing, old], fresh)).toEqual(ok);
  });
});

describe("two sources for one worker", () => {
  const setup = () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const foremanPause = ev("paused", at("10:00"), { server: RECEIVED });
    const workerResume = ev("resumed", at("10:15"), { server: RECEIVED });
    return { ev, start, foremanPause, workerResume };
  };

  it("accepts both when the pause arrives first", () => {
    const { start, foremanPause, workerResume } = setup();
    pushAll([start], foremanPause, workerResume);
  });

  it("rejects the resume that arrives first; the pause lands; a repair resumes", () => {
    const { ev, start, foremanPause, workerResume } = setup();
    expect(push([start], workerResume)).toEqual(no("not_paused", start.id));
    const timeline = pushAll([start], foremanPause);
    expect(foldSessions(timeline)[0]!.state).toBe("paused");
    pushAll(timeline, ev("resumed", at("10:15"), { server: RECEIVED }));
  });
});

// An office repair set (ARCHITECTURE row 187): every candidate in place, one replay.
const repair = (existing: readonly LaborEvent[], ...candidates: LaborEvent[]) =>
  validateEvents(ctxFor(existing), existing, candidates);
const noAt = (eventId: string, code: string, conflictingEventId?: string) => ({
  ...no(code, conflictingEventId),
  eventId,
});

describe("repair sets validated as one timeline", () => {
  it("accepts a missed session in front of a later one as a pair", () => {
    const ev = builder();
    const existing = [
      ev("started", at("13:00"), { job: JOB_B }),
      ev("ended", at("17:00"), { job: JOB_B }),
    ];
    const start = ev("started", at("08:00"), { server: RECEIVED });
    const end = ev("ended", at("12:00"), { server: RECEIVED });
    expect(repair(existing, start, end)).toEqual(ok);
    expect(repair(existing, end, start)).toEqual(ok);
  });

  it("accepts a missed pause before a later pause as a pair", () => {
    const ev = builder();
    const existing = [
      ev("started", at("08:00")),
      ev("paused", at("14:00")),
      ev("resumed", at("14:30")),
      ev("ended", at("17:00")),
    ];
    const pause = ev("paused", at("10:00"), { server: RECEIVED });
    const resume = ev("resumed", at("10:15"), { server: RECEIVED });
    expect(repair(existing, pause, resume)).toEqual(ok);
  });

  it("rejects a set that is still illegal, naming the candidate it breaks at", () => {
    const ev = builder();
    const existing = [ev("started", at("13:00")), ev("ended", at("17:00"))];
    const start = ev("started", at("08:00"), { server: RECEIVED });
    const pause = ev("paused", at("10:00"), { server: RECEIVED });
    const strayResume = ev("resumed", at("11:00"), { server: RECEIVED });
    // No end before 13:00: the stored start breaks, blamed on the set's first candidate.
    expect(repair(existing, start, pause)).toEqual(
      noAt(start.id, "breaks_following_event", existing[0]!.id),
    );
    // A candidate that lands illegally is named itself, whatever its place in the set.
    const end = ev("ended", at("12:00"), { server: RECEIVED });
    const resumeAgain = ev("resumed", at("11:30"), { server: RECEIVED });
    expect(repair(existing, start, pause, strayResume, resumeAgain, end)).toEqual(
      noAt(resumeAgain.id, "not_paused", strayResume.id),
    );
  });

  it("supersedes the lower id of two corrections of one root in a set", () => {
    const ev = builder();
    const end = ev("ended", at("18:00"));
    const existing = [ev("started", at("08:00")), end];
    const first = ev("ended", at("16:00"), { server: RECEIVED, corrects: end.id });
    const second = ev("ended", at("16:30"), { server: RECEIVED, corrects: end.id });
    expect(repair(existing, first, second)).toEqual(
      noAt(first.id, "correction_superseded", second.id),
    );
  });

  it("accepts a correction identical to the source in effect", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const existing = [start, ev("ended", at("16:00"))];
    const same = ev("started", at("08:00"), { server: RECEIVED, corrects: start.id });
    expect(repair(existing, same)).toEqual(ok);
  });

  it("holds every candidate to the per-event checks", () => {
    const ev = builder();
    const existing = [
      ev("started", at("08:00")),
      ev("ended", at("12:00")),
      ev("started", at("13:00")),
    ];
    const end = ev("ended", at("17:00"), { server: RECEIVED });
    const wrongJob = ev("ended", at("17:00"), { server: RECEIVED, job: JOB_B });
    expect(repair(existing, end)).toEqual(ok);
    expect(repair(existing, wrongJob)).toEqual(
      noAt(wrongJob.id, "job_id_mismatch", existing[2]!.id),
    );
  });

  it("applies the fold's void and lineage rules inside a set", () => {
    const ev = builder();
    const start = ev("started", at("08:00"));
    const end = ev("ended", at("16:00"));
    const existing = [start, end];
    const voidIt = ev("voided", RECEIVED, { server: RECEIVED, voids: start.id });
    const again = ev("voided", RECEIVED, { server: RECEIVED, voids: start.id });
    const voidEnd = ev("voided", RECEIVED, { server: RECEIVED, voids: end.id });
    expect(repair(existing, voidIt)).toEqual(ok);
    expect(repair(existing, voidIt, again)).toEqual(noAt(again.id, "already_voided"));
    expect(repair(existing, voidEnd)).toEqual(
      noAt(voidEnd.id, "void_target_not_started"),
    );
  });

  it("throws on ids repeated within a set", () => {
    const ev = builder();
    const start = ev("started", at("08:00"), { server: RECEIVED });
    expect(() => repair([], start, start)).toThrow(/repeat/);
  });
});
