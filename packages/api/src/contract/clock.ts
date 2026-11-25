// The clock's rule, the one copy: which entry may follow which. The server's fold
// (labor/fold.ts) refuses anything else; the phone's clock reads its own records through the
// same table, so it never shows a state the server will not reach, and never offers a tap the
// server will refuse.

// Where a person's clock stands: off, on the clock, or on a break.
export type ClockStep = "idle" | "working" | "paused";

// An entry that moves the clock; a void names a session and is not a step in it.
export type ClockEntry = "started" | "paused" | "resumed" | "ended";

export const CLOCK_TRANSITIONS: Readonly<
  Record<ClockStep, Readonly<Partial<Record<ClockEntry, ClockStep>>>>
> = {
  idle: { started: "working" },
  working: { paused: "paused", ended: "idle" },
  paused: { resumed: "working", ended: "idle" },
};

// Where an entry leaves the clock, or undefined when the server refuses it from there.
export const clockAfter = (step: ClockStep, entry: ClockEntry): ClockStep | undefined =>
  CLOCK_TRANSITIONS[step][entry];

// How many minutes before a shift's start a clock-in is admitted, where the schedule is
// enforced (assignments/eligibility.ts); the phone offers the shift from the same minute.
export const EARLY_MINUTES = 15;
