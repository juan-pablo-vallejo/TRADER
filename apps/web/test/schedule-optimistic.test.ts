// Schedule edits that show at once (optimistic.ts), against a real query cache: a move, an
// edit and a removal are each drawn before the server answers, and each is put back
// exactly as it was when the answer is a refusal or never comes. Undo is the opposite
// change, and a removed shift comes back under its own id.
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  applied,
  attempt,
  inverse,
  said,
  sameAs,
  type Change,
  type WeekCache,
} from "../src/app/(office)/schedule/optimistic";
import type { Week, WeekShift } from "../src/app/(office)/schedule/schedule-view";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const shift = (n: number, workDate: string, start: string, end: string): WeekShift => ({
  id: id(100 + n),
  workDate,
  expectedStart: start,
  expectedEnd: end,
  worker: { id: id(1), name: "Ana", active: true },
  job: { id: id(11), name: "Kitchen", status: "open" },
  mayClockIn: true,
  blockedBy: null,
  locked: false,
  copyId: null,
});
const MONDAY = shift(1, "2026-11-16", "08:00", "16:00");
const TUESDAY = shift(2, "2026-11-17", "08:00", "12:00");
const week = (shifts: WeekShift[]): Week =>
  ({
    weekStart: "2026-11-16",
    timezone: "America/New_York",
    days: Array.from({ length: 7 }, (_, i) => `2026-11-${16 + i}`),
    shifts,
  }) as Week;

const KEY = ["shift", "week", { weekStart: "2026-11-16" }];
function cached(start: Week) {
  const client = new QueryClient();
  client.setQueryData(KEY, start);
  const calls = { hold: 0, refresh: 0 };
  const cache: WeekCache = {
    read: () => client.getQueryData<Week>(KEY),
    write: (next) => client.setQueryData(KEY, next),
    hold: () => {
      calls.hold += 1;
      return client.cancelQueries({ queryKey: KEY });
    },
    refresh: () => {
      calls.refresh += 1;
      return Promise.resolve();
    },
  };
  return { cache, calls, now: () => client.getQueryData<Week>(KEY)! };
}
// An answer the test gives when it chooses, so the cache is read while the send is out.
function pending<A>() {
  let answer!: (a: A) => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<A>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const CHANGES: [string, Change, (w: Week) => void][] = [
  [
    "a move",
    {
      kind: "update",
      shift: MONDAY,
      to: { workDate: "2026-11-19", expectedStart: "08:00", expectedEnd: "16:00" },
    },
    (w) => expect(w.shifts.find((s) => s.id === MONDAY.id)?.workDate).toBe("2026-11-19"),
  ],
  [
    "an edit",
    {
      kind: "update",
      shift: MONDAY,
      to: { workDate: "2026-11-16", expectedStart: "09:30", expectedEnd: "17:00" },
    },
    (w) =>
      expect(w.shifts.find((s) => s.id === MONDAY.id)).toMatchObject({
        workDate: "2026-11-16",
        expectedStart: "09:30",
        expectedEnd: "17:00",
      }),
  ],
  [
    "a removal",
    { kind: "remove", shift: MONDAY },
    (w) => expect(w.shifts.map((s) => s.id)).toEqual([TUESDAY.id]),
  ],
];

describe("a schedule change shown at once", () => {
  for (const [name, change, shown] of CHANGES) {
    it(`${name}: drawn before the answer, and put back when the server refuses`, async () => {
      const before = week([MONDAY, TUESDAY]);
      const { cache, calls, now } = cached(before);
      const server = pending<{ result: string; code?: string }>();
      const result = attempt(cache, change, () => server.promise);
      await settled();
      // Shown, with nothing answered yet; a fetch in flight was held off first.
      expect(calls.hold).toBe(1);
      shown(now());
      expect(now()).not.toEqual(before);

      server.answer({ result: "rejected", code: "locked" });
      // The answer comes back for the screen to say why, from its own code.
      expect(await result).toEqual({
        outcome: "refused",
        answer: { result: "rejected", code: "locked" },
      });
      // The cache is restored: the week as it was, shift for shift.
      expect(now()).toEqual(before);
      expect(calls.refresh).toBe(1);
    });

    it(`${name}: put back when no answer comes`, async () => {
      const before = week([MONDAY, TUESDAY]);
      const { cache, now } = cached(before);
      const server = pending<{ result: string }>();
      const result = attempt(cache, change, () => server.promise);
      await settled();
      shown(now());
      server.fail(new Error("network"));
      expect(await result).toEqual({ outcome: "failed" });
      expect(now()).toEqual(before);
    });

    it(`${name}: stays when the server takes it, and Undo is the opposite change`, async () => {
      const before = week([MONDAY, TUESDAY]);
      const { cache, calls, now } = cached(before);
      const taken = change.kind === "remove" ? "removed" : "updated";
      expect(
        await attempt(cache, change, () => Promise.resolve({ result: taken })),
      ).toEqual({
        outcome: "done",
        answer: { result: taken },
      });
      shown(now());
      expect(calls.refresh).toBe(1);

      const back = inverse(change);
      await attempt(cache, back, () => Promise.resolve({ result: "updated" }));
      const byId = (w: Week) => [...w.shifts].sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(byId(now())).toEqual(byId(before));
      // And an Undo the server refuses leaves the change standing, as the server has it.
      const again = cached(applied(before, change));
      const standing = again.now();
      expect(
        await attempt(again.cache, back, () =>
          Promise.resolve({ result: "rejected", code: "stale" }),
        ),
      ).toMatchObject({ outcome: "refused" });
      expect(again.now()).toEqual(standing);
    });
  }

  it("brings a removed shift back as itself, and never twice", () => {
    const back = inverse({ kind: "remove", shift: MONDAY });
    expect(back).toEqual({ kind: "restore", shift: MONDAY });
    const restored = applied(week([TUESDAY]), back);
    expect(restored.shifts.map((s) => s.id)).toEqual([TUESDAY.id, MONDAY.id]);
    expect(applied(restored, back)).toBe(restored);
  });

  it("touches no other shift, and names what was done", () => {
    const [, move] = CHANGES[0]!;
    const [, edit] = CHANGES[1]!;
    const moved = applied(week([MONDAY, TUESDAY]), move);
    expect(moved.shifts.find((s) => s.id === TUESDAY.id)).toBe(TUESDAY);
    expect(said(move)).toBe("moved");
    expect(said(edit)).toBe("changed");
    expect(said({ kind: "remove", shift: MONDAY })).toBe("removed");
    expect(
      sameAs(MONDAY, {
        workDate: "2026-11-16",
        expectedStart: "08:00",
        expectedEnd: "16:00",
      }),
    ).toBe(true);
    expect(
      sameAs(MONDAY, {
        workDate: "2026-11-16",
        expectedStart: "08:00",
        expectedEnd: "16:30",
      }),
    ).toBe(false);
  });

  it("sends even when the week is not in the cache, and draws nothing", async () => {
    const client = new QueryClient();
    const cache: WeekCache = {
      read: () => client.getQueryData<Week>(KEY),
      write: (next) => client.setQueryData(KEY, next),
      hold: () => Promise.resolve(),
      refresh: () => Promise.resolve(),
    };
    const [, move] = CHANGES[0]!;
    expect(
      await attempt(cache, move, () =>
        Promise.resolve({ result: "rejected", code: "stale" }),
      ),
    ).toMatchObject({ outcome: "refused" });
    expect(client.getQueryData(KEY)).toBeUndefined();
  });
});
