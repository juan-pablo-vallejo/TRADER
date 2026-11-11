// Stage 3 line 5: the review fingerprint, pure. The golden vector pins v1: a change to the
// canonical tuple, its order or its serialization fails here and needs a new version.
import { describe, expect, it } from "vitest";

import type { DayMaterial, DaySession } from "../../src/closeout/day";
import { reviewFingerprint, type ReviewState } from "../../src/closeout/fingerprint";

const W1 = "0199a000-0000-7000-8000-000000000001";
const W2 = "0199a000-0000-7000-8000-000000000002";

const session = (
  workerId: string,
  root: string,
  start: string,
  end: string | null,
  o: Partial<DaySession["session"]> = {},
): DaySession => {
  const startedAt = new Date(start);
  const endedAt = end === null ? null : new Date(end);
  const span = endedAt === null ? null : endedAt.getTime() - startedAt.getTime();
  return {
    workerId,
    corrected: false,
    session: {
      rootEventId: root,
      startedSourceEventId: root,
      jobId: "0199a000-0000-7000-8000-0000000000aa",
      startedAt,
      endedAt,
      complete: endedAt !== null,
      state: endedAt === null ? "working" : "ended",
      voided: false,
      workedMs: span ?? 0,
      breakMs: 0,
      elapsedMs: span,
      eventSourceIds: [root, `${root.slice(0, -1)}f`],
      workDate: "2026-10-05",
      ...o,
    },
  };
};

const material = (id: string, o: Partial<DayMaterial> = {}): DayMaterial => ({
  id,
  loggedByUserId: W1,
  description: "Eggshell, white",
  quantity: "2.000",
  unit: "gal",
  loggedAt: new Date("2026-10-05T15:00:00.000Z"),
  ...o,
});

const base = (): ReviewState => ({
  companyId: "0199a000-0000-7000-8000-0000000000c0",
  jobId: "0199a000-0000-7000-8000-0000000000aa",
  workDate: "2026-10-05",
  timeZone: "America/New_York",
  jobStatus: "open",
  sessions: [
    session(
      W1,
      "0199a000-0000-7000-8000-000000000101",
      "2026-10-05T12:00:00Z",
      "2026-10-05T16:00:00Z",
    ),
    session(
      W1,
      "0199a000-0000-7000-8000-000000000102",
      "2026-10-05T17:00:00Z",
      "2026-10-05T19:00:00Z",
    ),
    session(W2, "0199a000-0000-7000-8000-000000000201", "2026-10-05T13:00:00Z", null),
  ],
  materials: [
    material("0199a000-0000-7000-8000-000000000301"),
    material("0199a000-0000-7000-8000-000000000302", { quantity: "1.500", unit: "qt" }),
  ],
});

describe("reviewFingerprint", () => {
  // Recomputed outside the code from the canonical JSON written by hand (shasum -a 256).
  it("pins v1 to a golden vector", () => {
    expect(reviewFingerprint(base())).toBe(
      "v1.366d6350ecbc620a102d06160bfb4f88e6ae739602d8439b07249705b89afafb",
    );
  });

  it("is the same for the same state in any order", () => {
    const b = base();
    const permuted: ReviewState = {
      ...b,
      sessions: [...b.sessions].reverse(),
      materials: [...b.materials].reverse(),
    };
    expect(reviewFingerprint(permuted)).toBe(reviewFingerprint(b));
    expect(reviewFingerprint(base())).toBe(reviewFingerprint(b));
    expect(reviewFingerprint(b)).toMatch(/^v1\.[0-9a-f]{64}$/);
  });

  it("changes with every field of the tuple", () => {
    const b = base();
    const s0 = b.sessions[0]!;
    const m0 = b.materials[0]!;
    const withSession = (o: Partial<DaySession["session"]>): ReviewState => ({
      ...b,
      sessions: [{ ...s0, session: { ...s0.session, ...o } }, ...b.sessions.slice(1)],
    });
    const withMaterial = (o: Partial<DayMaterial>): ReviewState => ({
      ...b,
      materials: [{ ...m0, ...o }, ...b.materials.slice(1)],
    });
    const variants: Record<string, ReviewState> = {
      companyId: { ...b, companyId: "0199a000-0000-7000-8000-0000000000c1" },
      jobId: { ...b, jobId: "0199a000-0000-7000-8000-0000000000ab" },
      workDate: { ...b, workDate: "2026-10-06" },
      timeZone: { ...b, timeZone: "UTC" },
      jobStatus: { ...b, jobStatus: "complete" },
      worker: { ...b, sessions: [{ ...s0, workerId: W2 }, ...b.sessions.slice(1)] },
      startedSource: withSession({
        startedSourceEventId: "0199a000-0000-7000-8000-000000000109",
      }),
      eventSources: withSession({
        eventSourceIds: [s0.session.rootEventId, "0199a000-0000-7000-8000-00000000010e"],
      }),
      startedAt: withSession({ startedAt: new Date("2026-10-05T12:00:00.001Z") }),
      endedAt: withSession({ endedAt: new Date("2026-10-05T16:00:00.001Z") }),
      state: withSession({ state: "paused" }),
      complete: withSession({ complete: false }),
      voided: withSession({ voided: true }),
      workedMs: withSession({ workedMs: 1 }),
      breakMs: withSession({ breakMs: 1 }),
      sessionGone: { ...b, sessions: b.sessions.slice(1) },
      materialGone: { ...b, materials: b.materials.slice(1) },
      materialId: withMaterial({ id: "0199a000-0000-7000-8000-000000000309" }),
      loggedBy: withMaterial({ loggedByUserId: W2 }),
      description: withMaterial({ description: "Eggshell, white." }),
      quantity: withMaterial({ quantity: "2.001" }),
      unit: withMaterial({ unit: "qt" }),
      loggedAt: withMaterial({ loggedAt: new Date("2026-10-05T15:00:00.001Z") }),
    };
    const original = reviewFingerprint(b);
    for (const [field, state] of Object.entries(variants)) {
      expect([field, reviewFingerprint(state)]).not.toEqual([field, original]);
    }
    // The ones that differ must also differ from one another: no two collapse together.
    const all = Object.values(variants).map(reviewFingerprint);
    expect(new Set(all).size).toBe(all.length);
  });

  it("ignores what is not in the tuple: the correction flag shown, the work date per session", () => {
    const b = base();
    const s0 = b.sessions[0]!;
    expect(
      reviewFingerprint({
        ...b,
        sessions: [{ ...s0, corrected: true }, ...b.sessions.slice(1)],
      }),
    ).toBe(reviewFingerprint(b));
  });
});
