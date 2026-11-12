// What the pay-periods screen works out from the calendar before it asks the server (DESIGN,
// Pay-period close): the dates a new period is offered, which dates of a period may move,
// and whether the close is offered or said to be blocked. The rules are the server's
// (pay-periods/periods.ts, close.ts); these hold the screen to them.
import { describe, expect, it } from "vitest";

import {
  boundsOk,
  closeState,
  editable,
  latestOf,
  nextBounds,
  nextToClose,
  type Calendar,
  type Period,
} from "../src/app/pay-periods/period-view";

const dana = { id: "00000000-0000-7000-8000-00000000000a", name: "Dana" };

const period = (n: number, startsOn: string, endsOn: string, closed = false): Period => ({
  id: `00000000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`,
  startsOn,
  endsOn,
  closed: closed
    ? {
        at: new Date("2026-11-03T15:00:00Z"),
        by: dana,
        unresolved: { pendingSessions: 0, openSessions: 0 },
      }
    : null,
});

// Newest first, as the server answers.
const calendar = (today: string, ...periods: Period[]): Calendar => ({
  timezone: "America/New_York",
  today,
  periods,
});

const W1 = period(1, "2026-10-26", "2026-11-01", true);
const W2 = period(2, "2026-11-02", "2026-11-08");
const W3 = period(3, "2026-11-09", "2026-11-15");

describe("the next period's dates", () => {
  it("assumes nothing before the first period", () => {
    expect(nextBounds(calendar("2026-11-12"))).toEqual({
      startsOn: "",
      endsOn: "",
      fixedStart: false,
    });
  });

  it("starts the day after the latest ends and runs as long as it did", () => {
    expect(nextBounds(calendar("2026-11-12", W2, W1))).toEqual({
      startsOn: "2026-11-09",
      endsOn: "2026-11-15",
      fixedStart: true,
    });
    // A month follows a month's length, across the year's end.
    const december = period(4, "2026-12-01", "2026-12-31");
    expect(nextBounds(calendar("2027-01-02", december))).toEqual({
      startsOn: "2027-01-01",
      endsOn: "2027-01-31",
      fixedStart: true,
    });
  });

  it("takes a period forward and of at most 31 days", () => {
    expect(boundsOk("2026-10-01", "2026-10-31")).toBe(true);
    expect(boundsOk("2026-10-01", "2026-10-01")).toBe(true);
    expect(boundsOk("2026-10-01", "2026-11-01")).toBe(false);
    expect(boundsOk("2026-10-02", "2026-10-01")).toBe(false);
  });
});

describe("which period is which", () => {
  it("names the latest, and the earliest still open as the next to close", () => {
    const c = calendar("2026-11-12", W3, W2, W1);
    expect(latestOf(c)).toBe(W3);
    expect(nextToClose(c)).toBe(W2);
    expect(nextToClose(calendar("2026-11-12", W1))).toBeUndefined();
  });

  it("lets only the latest open period's dates move, and its start only when it is the first", () => {
    const c = calendar("2026-11-12", W3, W2, W1);
    expect(editable(W3, c)).toEqual({ start: false, end: true });
    expect(editable(W2, c)).toEqual({ start: false, end: false });
    expect(editable(W1, c)).toEqual({ start: false, end: false });
    expect(editable(W2, calendar("2026-11-12", W2))).toEqual({ start: true, end: true });
    expect(editable(W1, calendar("2026-11-12", W1))).toEqual({
      start: false,
      end: false,
    });
  });
});

describe("whether a period can be closed", () => {
  it("offers the close for the earliest open period once its last day has passed", () => {
    expect(closeState(W2, calendar("2026-11-09", W3, W2, W1))).toEqual({
      state: "ready",
    });
  });

  it("waits for the day after the last day, in the company's today", () => {
    expect(closeState(W2, calendar("2026-11-08", W2, W1))).toEqual({
      state: "not_ended",
    });
    expect(closeState(W2, calendar("2026-11-05", W2, W1))).toEqual({
      state: "not_ended",
    });
  });

  it("names the period to close first", () => {
    expect(closeState(W3, calendar("2026-11-20", W3, W2, W1))).toEqual({
      state: "earlier_open",
      first: W2,
    });
  });

  it("has nothing to offer on a closed period", () => {
    expect(closeState(W1, calendar("2026-11-20", W2, W1))).toEqual({ state: "closed" });
  });
});
