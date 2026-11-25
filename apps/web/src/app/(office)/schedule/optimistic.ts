// Schedule edits that show at once. Moving, changing or removing a shift nobody has
// clocked in on is drawn in the week's cache before the server answers, and the server
// still decides: a refusal, or no answer at all, puts the week back exactly as it was and
// hands the answer back so the screen can say why from its own code. Undo is the opposite
// change sent the same way, never a write withheld: an update back to what the shift
// was, or the removed shift planned again under its own id.
//
// Only these three. A started shift, Copy last week, adding a shift, and everything
// outside Schedule wait for the server; nothing append-only is ever drawn before it is
// written. Pure but for the cache it is handed.
import type { Week, WeekShift } from "./schedule-view";

type Plan = { workDate: string; expectedStart: string; expectedEnd: string };
export type Change =
  | { kind: "update"; shift: WeekShift; to: Plan }
  | { kind: "remove"; shift: WeekShift }
  // Only ever an undo: the removed shift, planned again.
  | { kind: "restore"; shift: WeekShift };

// What the office did, in its own words: a shift on another day was moved; the same day
// at other hours was changed.
export const said = (change: Change): "moved" | "changed" | "removed" | "restored" =>
  change.kind === "update"
    ? change.to.workDate !== change.shift.workDate
      ? "moved"
      : "changed"
    : change.kind === "remove"
      ? "removed"
      : "restored";

export const sameAs = (shift: WeekShift, to: Plan) =>
  shift.workDate === to.workDate &&
  shift.expectedStart === to.expectedStart &&
  shift.expectedEnd === to.expectedEnd;

// The week as it reads once the change is made.
export function applied(week: Week, change: Change): Week {
  switch (change.kind) {
    case "update":
      return {
        ...week,
        shifts: week.shifts.map((s) =>
          s.id === change.shift.id ? { ...s, ...change.to } : s,
        ),
      };
    case "remove":
      return { ...week, shifts: week.shifts.filter((s) => s.id !== change.shift.id) };
    case "restore":
      return week.shifts.some((s) => s.id === change.shift.id)
        ? week
        : { ...week, shifts: [...week.shifts, change.shift] };
  }
}

// The change that undoes one.
export function inverse(change: Change): Change {
  switch (change.kind) {
    case "update":
      return {
        kind: "update",
        shift: { ...change.shift, ...change.to },
        to: {
          workDate: change.shift.workDate,
          expectedStart: change.shift.expectedStart,
          expectedEnd: change.shift.expectedEnd,
        },
      };
    case "remove":
      return { kind: "restore", shift: change.shift };
    case "restore":
      return { kind: "remove", shift: change.shift };
  }
}

// One week in the query cache.
export type WeekCache = {
  read(): Week | undefined;
  write(week: Week | undefined): void;
  // Stops a fetch in flight from landing over what was just drawn.
  hold(): Promise<unknown>;
  // Asks the server for the week as it now stands.
  refresh(): Promise<unknown>;
};

export type Outcome<A> =
  | { outcome: "done"; answer: A }
  // The server said no: its answer carries the code.
  | { outcome: "refused"; answer: A }
  // No answer came.
  | { outcome: "failed" };

// Draws the change, sends it, and puts the week back as it was unless the server took it.
export async function attempt<A extends { result: string }>(
  cache: WeekCache,
  change: Change,
  send: () => Promise<A>,
): Promise<Outcome<A>> {
  await cache.hold();
  const before = cache.read();
  if (before !== undefined) cache.write(applied(before, change));
  let answer: A;
  try {
    answer = await send();
  } catch {
    cache.write(before);
    void cache.refresh();
    return { outcome: "failed" };
  }
  if (answer.result === "rejected") {
    cache.write(before);
    void cache.refresh();
    return { outcome: "refused", answer };
  }
  void cache.refresh();
  return { outcome: "done", answer };
}
