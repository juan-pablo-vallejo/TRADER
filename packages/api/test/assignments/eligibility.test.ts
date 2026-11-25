// The schedule's eligibility rules (assignments/eligibility.ts), without a database: one
// person's shifts on one day, the day in time order or why it is refused, and which shift a
// start is admitted on.
import { describe, expect, it } from "vitest";

import { EARLY_MINUTES } from "../../src/contract/clock";
import {
  admitStart,
  resolveDay,
  type DayResolution,
  type ResolvedDay,
  type Shift,
} from "../../src/assignments/eligibility";

const A = "018f0000-0000-7000-8000-00000000000a";
const B = "018f0000-0000-7000-8000-00000000000b";
const C = "018f0000-0000-7000-8000-00000000000c";
const D = "018f0000-0000-7000-8000-00000000000d";

const J = "018f0000-0000-7000-8000-000000000101";
const K = "018f0000-0000-7000-8000-000000000102";

const shift = (id: string, start: string, end: string, jobId = J): Shift => ({
  id,
  jobId,
  start,
  end,
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

// The shifts eligible at a minute, read from the day's timeline.
const eligibleAt = (day: ResolvedDay, minute: number) =>
  day.timeline
    .filter((t) => minutes(t.start) <= minute && minute < minutes(t.end))
    .map((t) => t.shiftId);

// What an accepted day promises: every shift once, whole, in time order, and so exactly the
// shift that covers a minute eligible at it, minute by minute over the whole day.
function expectOneEligibleShift(shifts: readonly Shift[], day: ResolvedDay) {
  for (let m = 0; m < 24 * 60; m++) {
    const covering = shifts
      .filter((s) => minutes(s.start) <= m && m < minutes(s.end))
      .map((s) => s.id);
    const eligible = eligibleAt(day, m);
    if (
      covering.length > 1 ||
      eligible.length !== covering.length ||
      eligible[0] !== covering[0]
    ) {
      throw new Error(
        `at ${time(m)}: covering ${covering.join()}, eligible ${eligible.join()}`,
      );
    }
  }
  const inOrder = [...shifts].sort((a, b) => (a.start < b.start ? -1 : 1));
  expect(day.timeline).toEqual(
    inOrder.map((s) => ({ start: s.start, end: s.end, shiftId: s.id, jobId: s.jobId })),
  );
}

// The rule again, written another way, for shifts with distinct ids and sound times: no
// minute of the day is in two shifts.
function accepts(shifts: readonly Shift[]): boolean {
  for (let m = 0; m < 24 * 60; m++) {
    if (shifts.filter((s) => minutes(s.start) <= m && m < minutes(s.end)).length > 1) {
      return false;
    }
  }
  return true;
}

describe("resolveDay", () => {
  it("answers an empty day for no shifts", () => {
    expect(resolveDay([])).toEqual({ result: "resolved", timeline: [] });
  });

  it("makes one shift eligible from its start to its end", () => {
    expect(resolveDay([shift(A, "08:00", "12:00")])).toEqual({
      result: "resolved",
      timeline: [{ start: "08:00", end: "12:00", shiftId: A, jobId: J }],
    });
  });

  it("includes a shift's start minute and excludes its end minute", () => {
    const day = resolved(resolveDay([shift(A, "08:00", "12:00")]));
    expect(eligibleAt(day, minutes("07:59"))).toEqual([]);
    expect(eligibleAt(day, minutes("08:00"))).toEqual([A]);
    expect(eligibleAt(day, minutes("11:59"))).toEqual([A]);
    expect(eligibleAt(day, minutes("12:00"))).toEqual([]);
  });

  it("does not count shifts that touch as overlapping, and gives the shared minute to the later", () => {
    const shifts = [shift(A, "08:00", "10:00"), shift(B, "10:00", "12:00", K)];
    for (const order of permutations(shifts)) {
      const day = resolved(resolveDay(order));
      expect(eligibleAt(day, minutes("09:59"))).toEqual([A]);
      expect(eligibleAt(day, minutes("10:00"))).toEqual([B]);
      expect(day.timeline).toEqual([
        { start: "08:00", end: "10:00", shiftId: A, jobId: J },
        { start: "10:00", end: "12:00", shiftId: B, jobId: K },
      ]);
      expectOneEligibleShift(shifts, day);
    }
  });

  it("admits two separate shifts on one jobsite, touching or apart", () => {
    const apart = [shift(A, "07:00", "11:00"), shift(B, "13:00", "16:00")];
    expectOneEligibleShift(apart, resolved(resolveDay(apart)));
    const touching = [shift(A, "07:00", "11:00"), shift(B, "11:00", "16:00")];
    const day = resolved(resolveDay(touching));
    // Two shifts, so two stretches: the same jobsite does not make them one.
    expect(day.timeline).toHaveLength(2);
    expectOneEligibleShift(touching, day);
  });

  describe("two overlapping shifts", () => {
    const shifts = [shift(A, "08:00", "12:00"), shift(B, "10:00", "14:00", K)];

    it("refuses the overlap, naming both shifts and the shared time", () => {
      for (const order of permutations(shifts)) {
        expect(resolveDay(order)).toEqual({
          result: "rejected",
          issues: [{ code: "overlap", shiftIds: [A, B], start: "10:00", end: "12:00" }],
        });
      }
    });

    it("refuses it all the same when both are on one jobsite", () => {
      const same = [shift(A, "08:00", "12:00"), shift(B, "10:00", "14:00")];
      expect(issues(resolveDay(same))).toEqual([
        { code: "overlap", shiftIds: [A, B], start: "10:00", end: "12:00" },
      ]);
    });

    it("refuses a shared minute, and a shift inside another", () => {
      expect(
        issues(resolveDay([shift(A, "08:00", "10:01"), shift(B, "10:00", "12:00", K)])),
      ).toEqual([{ code: "overlap", shiftIds: [A, B], start: "10:00", end: "10:01" }]);
      expect(
        issues(resolveDay([shift(A, "08:00", "12:00"), shift(B, "09:00", "10:00", K)])),
      ).toEqual([{ code: "overlap", shiftIds: [A, B], start: "09:00", end: "10:00" }]);
    });

    it("refuses two shifts at the same times on two jobsites as an overlap", () => {
      const twins = [shift(A, "08:00", "12:00"), shift(B, "08:00", "12:00", K)];
      expect(issues(resolveDay(twins))).toEqual([
        { code: "overlap", shiftIds: [A, B], start: "08:00", end: "12:00" },
      ]);
    });
  });

  describe("three overlapping shifts", () => {
    // All three share 10:00 to 12:00.
    const shifts = [
      shift(A, "08:00", "12:00"),
      shift(B, "09:00", "13:00", K),
      shift(C, "10:00", "14:00"),
    ];

    it("names every overlapping pair at once, in time order, whatever the order of the input", () => {
      for (const order of permutations(shifts)) {
        expect(resolveDay(order)).toEqual({
          result: "rejected",
          issues: [
            { code: "overlap", shiftIds: [A, B], start: "09:00", end: "12:00" },
            { code: "overlap", shiftIds: [A, C], start: "10:00", end: "12:00" },
            { code: "overlap", shiftIds: [B, C], start: "10:00", end: "13:00" },
          ],
        });
      }
    });

    it("judges a chain link by link when its ends do not meet", () => {
      const chain = [
        shift(A, "08:00", "11:00"),
        shift(B, "10:00", "13:00", K),
        shift(C, "12:00", "15:00"),
      ];
      // A and C never meet: only the two links are named.
      expect(issues(resolveDay(chain))).toEqual([
        { code: "overlap", shiftIds: [A, B], start: "10:00", end: "11:00" },
        { code: "overlap", shiftIds: [B, C], start: "12:00", end: "13:00" },
      ]);
    });
  });

  describe("shifts refused on their own", () => {
    it("refuses the same shift twice", () => {
      expect(
        resolveDay([shift(B, "08:00", "12:00"), shift(A, "08:00", "12:00")]),
      ).toEqual({
        result: "rejected",
        issues: [{ code: "duplicate_shift", shiftIds: [A, B] }],
      });
    });

    it("refuses one id on two shifts", () => {
      expect(
        resolveDay([shift(A, "08:00", "10:00"), shift(A, "13:00", "15:00")]),
      ).toEqual({
        result: "rejected",
        issues: [{ code: "duplicate_shift_id", shiftId: A }],
      });
    });

    it("says one id on three shifts once", () => {
      expect(
        issues(
          resolveDay([
            shift(A, "08:00", "10:00"),
            shift(A, "11:00", "12:00"),
            shift(A, "13:00", "15:00"),
          ]),
        ),
      ).toEqual([{ code: "duplicate_shift_id", shiftId: A }]);
    });

    it("refuses a shift that ends at or before its start", () => {
      expect(issues(resolveDay([shift(A, "08:00", "08:00")]))).toEqual([
        { code: "invalid_interval", shiftId: A },
      ]);
      // 22:00 to 02:00 is a shift across midnight.
      expect(issues(resolveDay([shift(A, "22:00", "02:00")]))).toEqual([
        { code: "invalid_interval", shiftId: A },
      ]);
    });

    it("throws on a time that is not HH:MM", () => {
      for (const bad of ["8:00", "24:00", "08:60", "08:00:00", ""]) {
        expect(() => resolveDay([shift(A, bad, "12:00")])).toThrow(/HH:MM/);
        expect(() => resolveDay([shift(A, "00:00", bad)])).toThrow(/HH:MM/);
      }
    });

    it("answers every fault of the shifts together, in one order, before any overlap", () => {
      const shifts = [
        shift(C, "09:00", "09:00"),
        shift(B, "08:00", "12:00"),
        shift(A, "08:00", "12:00"),
        shift(D, "13:00", "14:00"),
        shift(D, "15:00", "16:00"),
      ];
      const expected = [
        { code: "duplicate_shift_id", shiftId: D },
        { code: "invalid_interval", shiftId: C },
        { code: "duplicate_shift", shiftIds: [A, B] },
      ];
      for (const order of permutations(shifts)) {
        expect(issues(resolveDay(order))).toEqual(expected);
      }
    });
  });

  it("answers the same day the same way twice and leaves its input alone", () => {
    const shifts = Object.freeze(
      [shift(B, "12:00", "14:00", K), shift(A, "08:00", "12:00")].map((s) =>
        Object.freeze(s),
      ),
    );
    const first = resolveDay(shifts);
    expect(resolveDay(shifts)).toEqual(first);
    expect(shifts.map((s) => s.id)).toEqual([B, A]);
    // What is answered is the caller's to change: nothing in it is shared.
    const segment = resolved(first).timeline[0];
    if (segment === undefined) throw new Error("no segment");
    segment.end = "23:00";
    expect(resolved(resolveDay(shifts)).timeline[0]).toEqual({
      start: "08:00",
      end: "12:00",
      shiftId: A,
      jobId: J,
    });
  });

  describe("a day is accepted exactly when no minute is in two shifts", () => {
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

    const check = (shifts: Shift[]) => {
      const answer = resolveDay(shifts);
      if ((answer.result === "resolved") !== accepts(shifts)) {
        throw new Error(
          `${answer.result}, and the rule says otherwise: ${JSON.stringify(shifts)}`,
        );
      }
      if (answer.result === "resolved") expectOneEligibleShift(shifts, answer);
      else expect(answer.issues.every((i) => i.code === "overlap")).toBe(true);
      return answer.result;
    };

    it("over every day of up to four shifts on six cuts", { timeout: 120_000 }, () => {
      const seen = { resolved: 0, rejected: 0 };
      for (const size of [1, 2, 3, 4]) {
        for (const shifts of subsets(possible, size)) seen[check(shifts)]++;
      }
      expect(seen.resolved).toBeGreaterThan(50);
      expect(seen.rejected).toBeGreaterThan(1_000);
    });

    it("over generated days of two to five shifts, from fixed seeds", () => {
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
        const shifts = Array.from({ length: 2 + below(4) }, (_, i) => {
          const start = 6 * 60 + below(40) * 15;
          return shift(
            `s${i}`,
            time(start),
            time(start + 15 * (1 + below(8))),
            `job-${i}`,
          );
        });
        seen[check(shifts)]++;
      }
      expect(seen.resolved).toBeGreaterThan(40);
      expect(seen.rejected).toBeGreaterThan(40);
    });
  });
});

describe("admitStart", () => {
  const morning = shift(A, "08:00", "10:00");
  const day = (shifts: Shift[]) => resolved(resolveDay(shifts));

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
      shift(B, "09:00", "11:00", K),
      shift(C, "11:10", "13:00"),
      shift(D, "13:20", "15:00", K),
    ];
    const full = day(shifts);
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
