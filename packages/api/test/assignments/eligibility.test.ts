// The schedule's eligibility rules (assignments/eligibility.ts), without a database: one
// person's shifts and overrides on one day, and which shift is eligible at every minute.
import { describe, expect, it } from "vitest";

import {
  admitStart,
  EARLY_MINUTES,
  resolveDay,
  type DayResolution,
  type Override,
  type ResolvedDay,
  type Shift,
} from "../../src/assignments/eligibility";

const A = "018f0000-0000-7000-8000-00000000000a";
const B = "018f0000-0000-7000-8000-00000000000b";
const C = "018f0000-0000-7000-8000-00000000000c";
const D = "018f0000-0000-7000-8000-00000000000d";
const E = "018f0000-0000-7000-8000-00000000000e";

const J = "018f0000-0000-7000-8000-000000000101";
const K = "018f0000-0000-7000-8000-000000000102";

const shift = (id: string, start: string, end: string, jobId = J): Shift => ({
  id,
  jobId,
  start,
  end,
});

const over = (holderId: string, yieldingId: string): Override => ({
  holderId,
  yieldingId,
});

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const time = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

function resolved(answer: DayResolution): ResolvedDay {
  if (answer.result !== "resolved") {
    throw new Error(`refused: ${JSON.stringify(answer.issues)}`);
  }
  return answer;
}

function issues(answer: DayResolution) {
  if (answer.result !== "rejected") throw new Error("accepted");
  return answer.issues;
}

// The shifts eligible at a minute, read from each shift's own windows.
const eligibleAt = (day: ResolvedDay, minute: number) =>
  day.shifts
    .filter((s) =>
      s.windows.some((w) => minutes(w.start) <= minute && minute < minutes(w.end)),
    )
    .map((s) => s.shiftId);

const windowsOf = (day: ResolvedDay, shiftId: string) =>
  day.shifts.find((s) => s.shiftId === shiftId)?.windows;

// What an accepted day promises, minute by minute over the whole day.
function expectOneEligibleShift(shifts: readonly Shift[], day: ResolvedDay) {
  for (let m = 0; m < 24 * 60; m++) {
    const covering = shifts
      .filter((s) => minutes(s.start) <= m && m < minutes(s.end))
      .map((s) => s.id);
    const eligible = eligibleAt(day, m);
    const onTimeline = day.timeline
      .filter((t) => minutes(t.start) <= m && m < minutes(t.end))
      .map((t) => t.shiftId);
    if (
      eligible.length !== Math.min(covering.length, 1) ||
      (eligible[0] !== undefined && !covering.includes(eligible[0])) ||
      onTimeline.length !== eligible.length ||
      onTimeline[0] !== eligible[0]
    ) {
      throw new Error(
        `at ${time(m)}: covering ${covering.join()}, eligible ${eligible.join()}, timeline ${onTimeline.join()}`,
      );
    }
  }
  expect(day.shifts.map((s) => s.shiftId).sort()).toEqual(shifts.map((s) => s.id).sort());
  for (const s of day.shifts) {
    expect(s.windows.length).toBeGreaterThan(0);
    for (const w of s.windows) expect(minutes(w.end)).toBeGreaterThan(minutes(w.start));
  }
}

// The rules again, written another way, for shifts with distinct ids and sound times: every
// overlap decided once, no circle among the overrides (searched depth first), and every
// shift unbeaten at some minute among the shifts covering it.
function accepts(shifts: readonly Shift[], overrides: readonly Override[]): boolean {
  const beats = (x: string, y: string) =>
    overrides.some((o) => o.holderId === x && o.yieldingId === y);
  const meet = (a: Shift, b: Shift) => a.start < b.end && b.start < a.end;
  for (const a of shifts) {
    for (const b of shifts) {
      if (a.id >= b.id) continue;
      const said = Number(beats(a.id, b.id)) + Number(beats(b.id, a.id));
      if (said !== (meet(a, b) ? 1 : 0)) return false;
    }
  }
  const state = new Map<string, "open" | "done">();
  const circles = (id: string): boolean => {
    if (state.get(id) === "open") return true;
    if (state.get(id) === "done") return false;
    state.set(id, "open");
    const found = overrides.some((o) => o.holderId === id && circles(o.yieldingId));
    state.set(id, "done");
    return found;
  };
  if (shifts.some((s) => circles(s.id))) return false;
  return shifts.every((s) => {
    for (let m = minutes(s.start); m < minutes(s.end); m++) {
      const others = shifts.filter(
        (o) => o.id !== s.id && minutes(o.start) <= m && m < minutes(o.end),
      );
      if (others.every((o) => !beats(o.id, s.id))) return true;
    }
    return false;
  });
}

describe("resolveDay", () => {
  it("answers an empty day for no shifts", () => {
    expect(resolveDay([], [])).toEqual({ result: "resolved", timeline: [], shifts: [] });
  });

  it("makes one shift eligible from its start to its end", () => {
    expect(resolveDay([shift(A, "08:00", "12:00")], [])).toEqual({
      result: "resolved",
      timeline: [{ start: "08:00", end: "12:00", shiftId: A, jobId: J }],
      shifts: [{ shiftId: A, jobId: J, windows: [{ start: "08:00", end: "12:00" }] }],
    });
  });

  it("includes a shift's start minute and excludes its end minute", () => {
    const day = resolved(resolveDay([shift(A, "08:00", "12:00")], []));
    expect(eligibleAt(day, minutes("07:59"))).toEqual([]);
    expect(eligibleAt(day, minutes("08:00"))).toEqual([A]);
    expect(eligibleAt(day, minutes("11:59"))).toEqual([A]);
    expect(eligibleAt(day, minutes("12:00"))).toEqual([]);
  });

  it("needs no decision for shifts that touch, and gives the shared minute to the later", () => {
    const shifts = [shift(A, "08:00", "10:00"), shift(B, "10:00", "12:00", K)];
    const day = resolved(resolveDay(shifts, []));
    expect(eligibleAt(day, minutes("09:59"))).toEqual([A]);
    expect(eligibleAt(day, minutes("10:00"))).toEqual([B]);
    expect(day.timeline).toEqual([
      { start: "08:00", end: "10:00", shiftId: A, jobId: J },
      { start: "10:00", end: "12:00", shiftId: B, jobId: K },
    ]);
    expectOneEligibleShift(shifts, day);
  });

  it("admits two separate shifts on one jobsite, touching or apart", () => {
    const apart = [shift(A, "07:00", "11:00"), shift(B, "13:00", "16:00")];
    expectOneEligibleShift(apart, resolved(resolveDay(apart, [])));
    const touching = [shift(A, "07:00", "11:00"), shift(B, "11:00", "16:00")];
    const day = resolved(resolveDay(touching, []));
    // Two shifts, so two stretches: the same jobsite does not make them one.
    expect(day.timeline).toHaveLength(2);
    expectOneEligibleShift(touching, day);
  });

  describe("two overlapping shifts", () => {
    const shifts = [shift(A, "08:00", "12:00"), shift(B, "10:00", "14:00", K)];

    it("refuses the overlap with no decision, naming the shared time", () => {
      for (const order of permutations(shifts)) {
        expect(resolveDay(order, [])).toEqual({
          result: "rejected",
          issues: [
            { code: "missing_decision", shiftIds: [A, B], start: "10:00", end: "12:00" },
          ],
        });
      }
    });

    it("gives the shared time to the earlier shift when it holds", () => {
      for (const order of permutations(shifts)) {
        const day = resolved(resolveDay(order, [over(A, B)]));
        expect(windowsOf(day, A)).toEqual([{ start: "08:00", end: "12:00" }]);
        expect(windowsOf(day, B)).toEqual([{ start: "12:00", end: "14:00" }]);
        expectOneEligibleShift(shifts, day);
      }
    });

    it("gives the shared time to the later shift when it holds", () => {
      for (const order of permutations(shifts)) {
        const day = resolved(resolveDay(order, [over(B, A)]));
        expect(windowsOf(day, A)).toEqual([{ start: "08:00", end: "10:00" }]);
        expect(windowsOf(day, B)).toEqual([{ start: "10:00", end: "14:00" }]);
        expect(eligibleAt(day, minutes("09:59"))).toEqual([A]);
        expect(eligibleAt(day, minutes("10:00"))).toEqual([B]);
        expectOneEligibleShift(shifts, day);
      }
    });

    it("still needs a decision when both are on one jobsite", () => {
      const same = [shift(A, "08:00", "12:00"), shift(B, "10:00", "14:00")];
      expect(issues(resolveDay(same, [])).map((i) => i.code)).toEqual([
        "missing_decision",
      ]);
      expectOneEligibleShift(same, resolved(resolveDay(same, [over(A, B)])));
    });
  });

  describe("three overlapping shifts", () => {
    // All three share 10:00 to 12:00.
    const shifts = [
      shift(A, "08:00", "12:00"),
      shift(B, "09:00", "13:00", K),
      shift(C, "10:00", "14:00"),
    ];
    // The overrides of a ranking: each shift holds against every shift after it.
    const ranked = (order: readonly string[]) =>
      order.flatMap((holder, i) => order.slice(i + 1).map((y) => over(holder, y)));

    it("answers every ranking the same whatever the order of the input", () => {
      for (const ranking of permutations([A, B, C])) {
        const first = resolveDay(shifts, ranked(ranking));
        for (const shiftOrder of permutations(shifts)) {
          for (const overrideOrder of permutations(ranked(ranking))) {
            expect(resolveDay(shiftOrder, overrideOrder)).toEqual(first);
          }
        }
        if (first.result === "resolved") expectOneEligibleShift(shifts, first);
      }
    });

    it("gives each shift what the shifts ranked above it leave", () => {
      const abc = resolved(resolveDay(shifts, ranked([A, B, C])));
      expect(abc.timeline).toEqual([
        { start: "08:00", end: "12:00", shiftId: A, jobId: J },
        { start: "12:00", end: "13:00", shiftId: B, jobId: K },
        { start: "13:00", end: "14:00", shiftId: C, jobId: J },
      ]);
      const cba = resolved(resolveDay(shifts, ranked([C, B, A])));
      expect(cba.timeline).toEqual([
        { start: "08:00", end: "09:00", shiftId: A, jobId: J },
        { start: "09:00", end: "10:00", shiftId: B, jobId: K },
        { start: "10:00", end: "14:00", shiftId: C, jobId: J },
      ]);
      const bac = resolved(resolveDay(shifts, ranked([B, A, C])));
      expect(windowsOf(bac, A)).toEqual([{ start: "08:00", end: "09:00" }]);
      expect(windowsOf(bac, B)).toEqual([{ start: "09:00", end: "13:00" }]);
      expect(windowsOf(bac, C)).toEqual([{ start: "13:00", end: "14:00" }]);
      expect(resolveDay(shifts, ranked([B, C, A])).result).toBe("resolved");
    });

    it("refuses a ranking that leaves the middle shift no time", () => {
      for (const ranking of [
        [A, C, B],
        [C, A, B],
      ]) {
        expect(resolveDay(shifts, ranked(ranking))).toEqual({
          result: "rejected",
          issues: [{ code: "no_eligible_time", shiftId: B }],
        });
      }
    });

    it("refuses both circles with the time they would leave uncovered", () => {
      for (const circle of [
        [over(A, B), over(B, C), over(C, A)],
        [over(B, A), over(C, B), over(A, C)],
      ]) {
        for (const order of permutations(circle)) {
          expect(resolveDay(shifts, order)).toEqual({
            result: "rejected",
            issues: [
              {
                code: "circular_precedence",
                shiftIds: [A, B, C],
                start: "10:00",
                end: "12:00",
              },
            ],
          });
        }
      }
    });

    it("refuses a circle with the half hour nobody could clock in on", () => {
      const day = [
        shift(A, "08:00", "10:30"),
        shift(B, "09:00", "12:00", K),
        shift(C, "10:00", "11:00"),
      ];
      expect(resolveDay(day, [over(A, B), over(B, C), over(C, A)])).toEqual({
        result: "rejected",
        issues: [
          {
            code: "circular_precedence",
            shiftIds: [A, B, C],
            start: "10:00",
            end: "10:30",
          },
        ],
      });
    });

    it("reports a missing decision and no circle while one pair is undecided", () => {
      expect(resolveDay(shifts, [over(A, B), over(B, C)])).toEqual({
        result: "rejected",
        issues: [
          { code: "missing_decision", shiftIds: [A, C], start: "10:00", end: "12:00" },
        ],
      });
    });

    it("names every undecided pair at once, in time order", () => {
      expect(resolveDay(shifts, [])).toEqual({
        result: "rejected",
        issues: [
          { code: "missing_decision", shiftIds: [A, B], start: "09:00", end: "12:00" },
          { code: "missing_decision", shiftIds: [A, C], start: "10:00", end: "12:00" },
          { code: "missing_decision", shiftIds: [B, C], start: "10:00", end: "13:00" },
        ],
      });
    });
  });

  describe("nested and chained shifts", () => {
    const outer = shift(A, "08:00", "12:00");
    const inner = shift(B, "09:00", "10:00", K);

    it("splits the outer shift in two when the inner one holds", () => {
      const day = resolved(resolveDay([outer, inner], [over(B, A)]));
      expect(windowsOf(day, A)).toEqual([
        { start: "08:00", end: "09:00" },
        { start: "10:00", end: "12:00" },
      ]);
      expect(windowsOf(day, B)).toEqual([{ start: "09:00", end: "10:00" }]);
      expectOneEligibleShift([outer, inner], day);
    });

    it("refuses the inner shift when the outer one holds", () => {
      expect(resolveDay([outer, inner], [over(A, B)])).toEqual({
        result: "rejected",
        issues: [{ code: "no_eligible_time", shiftId: B }],
      });
    });

    it("refuses two shifts at the same times on two jobsites, whichever holds", () => {
      const twins = [shift(A, "08:00", "12:00"), shift(B, "08:00", "12:00", K)];
      expect(issues(resolveDay(twins, [over(A, B)]))).toEqual([
        { code: "no_eligible_time", shiftId: B },
      ]);
      expect(issues(resolveDay(twins, [over(B, A)]))).toEqual([
        { code: "no_eligible_time", shiftId: A },
      ]);
    });

    it("judges a chain link by link when its ends do not meet", () => {
      const chain = [
        shift(A, "08:00", "11:00"),
        shift(B, "10:00", "13:00", K),
        shift(C, "12:00", "15:00"),
      ];
      // A over B, B over C and C "over" A is no circle here: A and C never meet, so that
      // third override has no overlap to decide and is refused for it.
      expect(issues(resolveDay(chain, [over(A, B), over(B, C), over(C, A)]))).toEqual([
        { code: "override_not_overlapping", shiftIds: [A, C] },
      ]);
      const day = resolved(resolveDay(chain, [over(A, B), over(C, B)]));
      expect(windowsOf(day, B)).toEqual([{ start: "11:00", end: "12:00" }]);
      expectOneEligibleShift(chain, day);
      expect(issues(resolveDay(chain, [over(A, B)]))).toEqual([
        { code: "missing_decision", shiftIds: [B, C], start: "12:00", end: "13:00" },
      ]);
    });
  });

  describe("four and more overlapping shifts", () => {
    it("resolves four nested shifts, each inner one holding", () => {
      const shifts = [
        shift(A, "08:00", "16:00"),
        shift(B, "09:00", "15:00", K),
        shift(C, "10:00", "14:00"),
        shift(D, "11:00", "13:00", K),
      ];
      const inward = [
        over(D, C),
        over(D, B),
        over(D, A),
        over(C, B),
        over(C, A),
        over(B, A),
      ];
      for (const order of [shifts, [...shifts].reverse()]) {
        const day = resolved(resolveDay(order, [...inward].reverse()));
        expect(
          day.timeline.map((t) => `${t.start}-${t.end} ${t.shiftId.slice(-1)}`),
        ).toEqual([
          "08:00-09:00 a",
          "09:00-10:00 b",
          "10:00-11:00 c",
          "11:00-13:00 d",
          "13:00-14:00 c",
          "14:00-15:00 b",
          "15:00-16:00 a",
        ]);
        expectOneEligibleShift(shifts, day);
      }
    });

    it("finds a circle among three of five, with the time the three share", () => {
      const shifts = [
        shift(A, "08:00", "14:00"),
        shift(B, "08:10", "14:00", K),
        shift(C, "08:20", "14:00"),
        shift(D, "08:30", "14:00", K),
        shift(E, "10:00", "12:00"),
      ];
      const overrides = [
        // E holds against everyone, D against no one, and A, B and C go round.
        ...[A, B, C, D].map((id) => over(E, id)),
        ...[A, B, C].map((id) => over(id, D)),
        over(A, B),
        over(B, C),
        over(C, A),
      ];
      for (const order of [overrides, [...overrides].reverse()]) {
        expect(resolveDay(shifts, order)).toEqual({
          result: "rejected",
          issues: [
            {
              code: "circular_precedence",
              shiftIds: [A, B, C],
              start: "08:20",
              end: "14:00",
            },
          ],
        });
      }
    });

    it("refuses a circle even where a fourth shift holds all the time the three share", () => {
      // A, B and C meet only from 07:00 to 07:01, and D holds that minute against all
      // three: every minute of the day would have one eligible shift, and the circle is
      // refused all the same.
      const shifts = [
        shift(A, "00:00", "07:01"),
        shift(B, "00:00", "12:00", K),
        shift(C, "07:00", "16:30"),
        shift(D, "07:00", "07:01", K),
      ];
      const overrides = [
        over(A, B),
        over(B, C),
        over(C, A),
        over(D, A),
        over(D, B),
        over(D, C),
      ];
      expect(resolveDay(shifts, overrides)).toEqual({
        result: "rejected",
        issues: [
          {
            code: "circular_precedence",
            shiftIds: [A, B, C],
            start: "07:00",
            end: "07:01",
          },
        ],
      });
      // Turned into a ranking, the same four shifts stand.
      const ranked = [...overrides.slice(0, 2), over(A, C), ...overrides.slice(3)];
      expectOneEligibleShift(shifts, resolved(resolveDay(shifts, ranked)));
    });

    it("names each circle of three among four shifts that all go round", () => {
      const shifts = [
        shift(A, "08:00", "12:00"),
        shift(B, "08:30", "12:30", K),
        shift(C, "09:00", "13:00"),
        shift(D, "09:30", "13:30", K),
      ];
      // A over B over C over D over A, and the two diagonals.
      const overrides = [
        over(A, B),
        over(B, C),
        over(C, D),
        over(D, A),
        over(A, C),
        over(B, D),
      ];
      expect(issues(resolveDay(shifts, overrides))).toEqual([
        {
          code: "circular_precedence",
          shiftIds: [A, B, D],
          start: "09:30",
          end: "12:00",
        },
        {
          code: "circular_precedence",
          shiftIds: [A, C, D],
          start: "09:30",
          end: "12:00",
        },
      ]);
    });
  });

  describe("shifts and overrides refused on their own", () => {
    it("refuses the same shift twice", () => {
      expect(
        resolveDay([shift(B, "08:00", "12:00"), shift(A, "08:00", "12:00")], []),
      ).toEqual({
        result: "rejected",
        issues: [{ code: "duplicate_shift", shiftIds: [A, B] }],
      });
    });

    it("refuses one id on two shifts", () => {
      expect(
        resolveDay([shift(A, "08:00", "10:00"), shift(A, "13:00", "15:00")], []),
      ).toEqual({
        result: "rejected",
        issues: [{ code: "duplicate_shift_id", shiftId: A }],
      });
    });

    it("says one id on three shifts once", () => {
      expect(
        issues(
          resolveDay(
            [
              shift(A, "08:00", "10:00"),
              shift(A, "11:00", "12:00"),
              shift(A, "13:00", "15:00"),
            ],
            [],
          ),
        ),
      ).toEqual([{ code: "duplicate_shift_id", shiftId: A }]);
    });

    it("refuses a shift that ends at or before its start", () => {
      expect(issues(resolveDay([shift(A, "08:00", "08:00")], []))).toEqual([
        { code: "invalid_interval", shiftId: A },
      ]);
      // 22:00 to 02:00 is a shift across midnight.
      expect(issues(resolveDay([shift(A, "22:00", "02:00")], []))).toEqual([
        { code: "invalid_interval", shiftId: A },
      ]);
    });

    it("throws on a time that is not HH:MM", () => {
      for (const bad of ["8:00", "24:00", "08:60", "08:00:00", ""]) {
        expect(() => resolveDay([shift(A, bad, "12:00")], [])).toThrow(/HH:MM/);
        expect(() => resolveDay([shift(A, "00:00", bad)], [])).toThrow(/HH:MM/);
      }
    });

    it("refuses an override naming a shift that is not in the day, or one shift twice", () => {
      const shifts = [shift(A, "08:00", "12:00")];
      expect(issues(resolveDay(shifts, [over(A, B)]))).toEqual([
        { code: "override_unknown_shift", holderId: A, yieldingId: B },
      ]);
      expect(issues(resolveDay(shifts, [over(B, A)]))).toEqual([
        { code: "override_unknown_shift", holderId: B, yieldingId: A },
      ]);
      expect(issues(resolveDay(shifts, [over(A, A)]))).toEqual([
        { code: "override_unknown_shift", holderId: A, yieldingId: A },
      ]);
    });

    it("refuses one pair decided twice, the same way or the other way round", () => {
      const shifts = [shift(A, "08:00", "12:00"), shift(B, "10:00", "14:00", K)];
      for (const twice of [
        [over(A, B), over(B, A)],
        [over(B, A), over(A, B)],
        [over(A, B), over(A, B)],
      ]) {
        expect(resolveDay(shifts, twice)).toEqual({
          result: "rejected",
          issues: [{ code: "override_conflict", shiftIds: [A, B] }],
        });
      }
    });

    it("refuses an override left on shifts that only touch", () => {
      const shifts = [shift(A, "08:00", "10:00"), shift(B, "10:00", "12:00", K)];
      expect(resolveDay(shifts, [over(B, A)])).toEqual({
        result: "rejected",
        issues: [{ code: "override_not_overlapping", shiftIds: [A, B] }],
      });
    });

    it("answers every fault of the shifts and overrides together, in one order", () => {
      const shifts = [
        shift(C, "09:00", "09:00"),
        shift(B, "08:00", "12:00"),
        shift(A, "08:00", "12:00"),
        shift(D, "13:00", "14:00"),
        shift(D, "15:00", "16:00"),
      ];
      const overrides = [over(E, A), over(A, B), over(B, A)];
      const expected = [
        { code: "duplicate_shift_id", shiftId: D },
        { code: "invalid_interval", shiftId: C },
        { code: "duplicate_shift", shiftIds: [A, B] },
        { code: "override_unknown_shift", holderId: E, yieldingId: A },
        { code: "override_conflict", shiftIds: [A, B] },
      ];
      for (const order of permutations(shifts)) {
        expect(issues(resolveDay(order, overrides))).toEqual(expected);
      }
    });
  });

  it("answers the same day the same way twice and leaves its input alone", () => {
    const shifts = Object.freeze(
      [shift(B, "10:00", "14:00", K), shift(A, "08:00", "12:00")].map((s) =>
        Object.freeze(s),
      ),
    );
    const overrides = Object.freeze([Object.freeze(over(B, A))]);
    const first = resolveDay(shifts, overrides);
    expect(resolveDay(shifts, overrides)).toEqual(first);
    expect(shifts.map((s) => s.id)).toEqual([B, A]);
    // What is answered is the caller's to change: nothing in it is shared.
    const day = resolved(first);
    const segment = day.timeline[0];
    if (segment === undefined) throw new Error("no segment");
    segment.end = "23:00";
    expect(windowsOf(day, A)).toEqual([{ start: "08:00", end: "10:00" }]);
  });

  describe("every accepted day has exactly one eligible shift at every covered minute", () => {
    // Every way to decide, or leave undecided, each overlapping pair.
    function decisions(shifts: readonly Shift[], undecided: boolean): Override[][] {
      let all: Override[][] = [[]];
      for (const [i, a] of shifts.entries()) {
        for (const b of shifts.slice(i + 1)) {
          if (!(a.start < b.end && b.start < a.end)) continue;
          all = all.flatMap((sofar) => [
            [...sofar, over(a.id, b.id)],
            [...sofar, over(b.id, a.id)],
            ...(undecided ? [sofar] : []),
          ]);
        }
      }
      return all;
    }

    function subsets<T>(items: readonly T[], size: number): T[][] {
      if (size === 0) return [[]];
      return items.flatMap((item, i) =>
        subsets(items.slice(i + 1), size - 1).map((rest) => [item, ...rest]),
      );
    }

    // Six cuts with a one-minute stretch among them: fifteen possible shifts.
    const cuts = ["00:00", "07:00", "07:01", "12:00", "16:30", "23:59"];
    const possible = subsets(cuts, 2).map(([start, end], i) =>
      shift(`s${String(i).padStart(2, "0")}`, start ?? "", end ?? "", `job-${i}`),
    );

    const check = (shifts: Shift[], overrides: Override[]) => {
      const answer = resolveDay(shifts, overrides);
      if ((answer.result === "resolved") !== accepts(shifts, overrides)) {
        throw new Error(
          `${answer.result}, and the rules say otherwise: ${JSON.stringify({ shifts, overrides })}`,
        );
      }
      if (answer.result === "resolved") expectOneEligibleShift(shifts, answer);
      return answer.result;
    };

    it(
      "over every day of up to three shifts on six cuts, decided or not",
      { timeout: 120_000 },
      () => {
        const seen = { resolved: 0, rejected: 0 };
        for (const size of [1, 2, 3]) {
          for (const shifts of subsets(possible, size)) {
            for (const overrides of decisions(shifts, true)) {
              seen[check(shifts, overrides)]++;
            }
          }
        }
        expect(seen.resolved).toBeGreaterThan(500);
        expect(seen.rejected).toBeGreaterThan(1_000);
      },
    );

    it(
      "over every fully decided day of four shifts on six cuts",
      { timeout: 120_000 },
      () => {
        const seen = { resolved: 0, rejected: 0 };
        for (const shifts of subsets(possible, 4)) {
          for (const overrides of decisions(shifts, false)) {
            seen[check(shifts, overrides)]++;
          }
        }
        expect(seen.resolved).toBeGreaterThan(1_000);
        expect(seen.rejected).toBeGreaterThan(1_000);
      },
    );

    it("over generated days of five to eight shifts, from fixed seeds", () => {
      // mulberry32: the same days on every run.
      const generator = (seed: number) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const seen = { resolved: 0, rejected: 0 };
      for (let seed = 1; seed <= 400; seed++) {
        const random = generator(seed);
        const below = (n: number) => Math.floor(random() * n);
        // Short shifts on a quarter-hour grid across a working day, so that some days stand.
        const shifts = Array.from({ length: 5 + below(4) }, (_, i) => {
          const start = 6 * 60 + below(40) * 15;
          return shift(
            `s${i}`,
            time(start),
            time(start + 15 * (1 + below(8))),
            `job-${i}`,
          );
        });
        // A ranking, mostly followed: now and then a pair is turned round or left out.
        const rank = new Map(shifts.map((s) => [s.id, random()]));
        const overrides: Override[] = [];
        for (const [i, a] of shifts.entries()) {
          for (const b of shifts.slice(i + 1)) {
            if (!(a.start < b.end && b.start < a.end)) continue;
            const slip = random();
            if (slip < 0.03) continue;
            const aHolds = (rank.get(a.id) ?? 0) > (rank.get(b.id) ?? 0) !== slip < 0.08;
            overrides.push(aHolds ? over(a.id, b.id) : over(b.id, a.id));
          }
        }
        seen[check(shifts, overrides)]++;
      }
      expect(seen.resolved).toBeGreaterThan(40);
      expect(seen.rejected).toBeGreaterThan(40);
    });
  });
});

describe("admitStart", () => {
  const morning = shift(A, "08:00", "10:00");
  const day = (shifts: Shift[], overrides: Override[] = []) =>
    resolved(resolveDay(shifts, overrides));

  it("admits a start during a shift, from its first minute to its last", () => {
    const one = day([morning]);
    const scheduled = { result: "scheduled", shiftId: A, jobId: J };
    expect(admitStart(one, "08:00")).toEqual(scheduled);
    expect(admitStart(one, "09:59")).toEqual(scheduled);
    expect(admitStart(one, "10:00")).toEqual({ result: "none" });
  });

  it("admits a start 15 minutes before a shift and refuses one at 16", () => {
    const one = day([morning]);
    expect(EARLY_MINUTES).toBe(15);
    expect(admitStart(one, "07:44")).toEqual({ result: "none" });
    expect(admitStart(one, "07:45")).toEqual({
      result: "early",
      shiftId: A,
      jobId: J,
      minutesEarly: 15,
    });
    expect(admitStart(one, "07:59")).toEqual({
      result: "early",
      shiftId: A,
      jobId: J,
      minutesEarly: 1,
    });
  });

  it("admits nothing after the day's last shift, or on a day with none", () => {
    expect(admitStart(day([morning]), "10:01")).toEqual({ result: "none" });
    expect(admitStart(day([morning]), "23:59")).toEqual({ result: "none" });
    expect(admitStart(day([]), "08:00")).toEqual({ result: "none" });
  });

  it("keeps a start on the eligible shift while the next one is within 15 minutes", () => {
    const two = day([morning, shift(B, "10:10", "12:00", K)]);
    // 09:58 is 12 minutes before B and inside A: A, and never B.
    expect(admitStart(two, "09:58")).toEqual({
      result: "scheduled",
      shiftId: A,
      jobId: J,
    });
    // In the gap nothing is eligible, so the next shift's early window applies.
    expect(admitStart(two, "10:05")).toEqual({
      result: "early",
      shiftId: B,
      jobId: K,
      minutesEarly: 5,
    });
    // Touching shifts leave no gap: the later one is simply eligible from its start.
    const touching = day([morning, shift(B, "10:00", "12:00", K)]);
    expect(admitStart(touching, "09:59")).toEqual({
      result: "scheduled",
      shiftId: A,
      jobId: J,
    });
    expect(admitStart(touching, "10:00")).toEqual({
      result: "scheduled",
      shiftId: B,
      jobId: K,
    });
  });

  it("admits an early start on the shift that becomes eligible, not the one that yields", () => {
    // Both begin at 08:00 and B holds: before 08:00 the jobsite to arrive at is B's.
    const both = day(
      [shift(A, "08:00", "12:00"), shift(B, "08:00", "10:00", K)],
      [over(B, A)],
    );
    expect(admitStart(both, "07:50")).toEqual({
      result: "early",
      shiftId: B,
      jobId: K,
      minutesEarly: 10,
    });
    // A becomes eligible at 10:00, with B eligible until then: no early window for A.
    expect(admitStart(both, "09:50")).toEqual({
      result: "scheduled",
      shiftId: B,
      jobId: K,
    });
  });

  it("counts from a shift's eligible time, not from a start another shift holds", () => {
    // B starts at 09:00 under A, which holds until 10:00; A ends, and B is eligible at once.
    const held = day(
      [shift(A, "08:00", "10:00"), shift(B, "09:00", "12:00", K)],
      [over(A, B)],
    );
    expect(admitStart(held, "08:50")).toEqual({
      result: "scheduled",
      shiftId: A,
      jobId: J,
    });
    expect(admitStart(held, "07:50")).toEqual({
      result: "early",
      shiftId: A,
      jobId: J,
      minutesEarly: 10,
    });
  });

  it("stays inside the day at both ends", () => {
    const edges = day([shift(A, "00:10", "01:00"), shift(B, "23:00", "23:59", K)]);
    expect(admitStart(edges, "00:00")).toEqual({
      result: "early",
      shiftId: A,
      jobId: J,
      minutesEarly: 10,
    });
    // 23:59 is the day's last minute and B has ended: tomorrow's shifts are not this day's.
    expect(admitStart(edges, "23:58")).toEqual({
      result: "scheduled",
      shiftId: B,
      jobId: K,
    });
    expect(admitStart(edges, "23:59")).toEqual({ result: "none" });
  });

  it("admits at most one shift at every minute of a day, and never during another's time", () => {
    const shifts = [
      shift(A, "06:00", "09:00"),
      shift(B, "08:00", "11:00", K),
      shift(C, "11:10", "13:00"),
      shift(D, "13:20", "15:00", K),
    ];
    const full = day(shifts, [over(B, A)]);
    for (let m = 0; m < 24 * 60; m++) {
      const admitted = admitStart(full, time(m));
      const eligible = eligibleAt(full, m);
      if (eligible.length === 1) {
        expect(admitted).toMatchObject({ result: "scheduled", shiftId: eligible[0] });
      } else {
        expect(admitted.result).not.toBe("scheduled");
      }
      if (admitted.result === "early") {
        expect(admitted.minutesEarly).toBeGreaterThanOrEqual(1);
        expect(admitted.minutesEarly).toBeLessThanOrEqual(15);
        expect(eligibleAt(full, m + admitted.minutesEarly)).toEqual([admitted.shiftId]);
      }
    }
    // 13:00 to 13:20 is a 20-minute gap: its first five minutes admit nobody.
    expect(admitStart(full, "13:04")).toEqual({ result: "none" });
    expect(admitStart(full, "13:05")).toMatchObject({ result: "early", shiftId: D });
  });

  it("throws on a time that is not HH:MM", () => {
    expect(() => admitStart(day([morning]), "07:45:30")).toThrow(/HH:MM/);
  });
});
