// Keyboard movement through the tables and the two grids, as arithmetic (row-keys.ts):
// which key means which way, where a key must not act, and where the focus goes next.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";
import { KEYS } from "../src/app/keyboard-rows";
import { directionOf, isField, move, type Stops } from "../src/app/row-keys";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/app/${path}`, import.meta.url)), "utf8");

describe("which key means which way", () => {
  it("reads the arrows, and J and K in either case", () => {
    expect(["ArrowDown", "j", "J"].map((key) => directionOf({ key }))).toEqual([
      "down",
      "down",
      "down",
    ]);
    expect(["ArrowUp", "k", "K"].map((key) => directionOf({ key }))).toEqual([
      "up",
      "up",
      "up",
    ]);
    expect(directionOf({ key: "ArrowLeft" })).toBe("left");
    expect(directionOf({ key: "ArrowRight" })).toBe("right");
    for (const key of ["h", "l", "Enter", " ", "Tab", "?", "a"]) {
      expect([key, directionOf({ key })]).toEqual([key, null]);
    }
  });

  it("leaves a key with a modifier to the browser", () => {
    expect(directionOf({ key: "k", metaKey: true })).toBeNull();
    expect(directionOf({ key: "k", ctrlKey: true })).toBeNull();
    expect(directionOf({ key: "ArrowLeft", altKey: true })).toBeNull();
  });
});

describe("where a key never acts", () => {
  it("is anywhere a person types or chooses", () => {
    for (const tagName of ["INPUT", "textarea", "SELECT"]) {
      expect([tagName, isField({ tagName })]).toEqual([tagName, true]);
    }
    expect(isField({ tagName: "DIV", isContentEditable: true })).toBe(true);
    for (const role of ["textbox", "combobox", "listbox"]) {
      expect(isField({ tagName: "DIV", getAttribute: () => role })).toBe(true);
    }
  });

  it("is not a button, a link, the page or nothing at all", () => {
    for (const tagName of ["BUTTON", "A", "BODY", "TD"]) {
      expect([tagName, isField({ tagName, getAttribute: () => null })]).toEqual([
        tagName,
        false,
      ]);
    }
    expect(isField(null)).toBe(false);
  });
});

describe("where the focus goes", () => {
  // A list: a link in the first cell of each row and an Edit button in the last.
  const LIST: Stops = [
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
  ];
  // A grid like the schedule's: a cell holds a card for each shift and its Add button.
  // The second row is a person with nothing (their name's cell holds no stop).
  const GRID: Stops = [
    [0, 3, 1, 1],
    [0, 0, 0, 0],
    [0, 1, 2, 1],
  ];

  it("enters at the first row with a stop, by down or up, and not sideways", () => {
    expect(move(LIST, null, "down")).toEqual({ row: 0, cell: 0, stop: 0 });
    expect(move(LIST, null, "up")).toEqual({ row: 0, cell: 0, stop: 0 });
    expect(move(GRID, null, "down")).toEqual({ row: 0, cell: 1, stop: 0 });
    expect(move(LIST, null, "left")).toBeNull();
    expect(move([[0, 0]], null, "down")).toBeNull();
    expect(move([], null, "down")).toBeNull();
  });

  it("moves row by row in the same column, and stops at the ends", () => {
    expect(move(LIST, { row: 0, cell: 0, stop: 0 }, "down")).toEqual({
      row: 1,
      cell: 0,
      stop: 0,
    });
    expect(move(LIST, { row: 1, cell: 2, stop: 0 }, "down")).toEqual({
      row: 2,
      cell: 2,
      stop: 0,
    });
    expect(move(LIST, { row: 1, cell: 2, stop: 0 }, "up")).toEqual({
      row: 0,
      cell: 2,
      stop: 0,
    });
    expect(move(LIST, { row: 2, cell: 0, stop: 0 }, "down")).toBeNull();
    expect(move(LIST, { row: 0, cell: 0, stop: 0 }, "up")).toBeNull();
  });

  it("moves along the row, over cells with nothing in them", () => {
    expect(move(LIST, { row: 0, cell: 0, stop: 0 }, "right")).toEqual({
      row: 0,
      cell: 2,
      stop: 0,
    });
    expect(move(LIST, { row: 0, cell: 2, stop: 0 }, "left")).toEqual({
      row: 0,
      cell: 0,
      stop: 0,
    });
    expect(move(LIST, { row: 0, cell: 2, stop: 0 }, "right")).toBeNull();
    expect(move(LIST, { row: 0, cell: 0, stop: 0 }, "left")).toBeNull();
  });

  it("goes through a cell's own stops before leaving it, and skips an empty row", () => {
    // Monday's three: two cards and the Add button.
    expect(move(GRID, { row: 0, cell: 1, stop: 0 }, "down")).toEqual({
      row: 0,
      cell: 1,
      stop: 1,
    });
    expect(move(GRID, { row: 0, cell: 1, stop: 1 }, "down")).toEqual({
      row: 0,
      cell: 1,
      stop: 2,
    });
    // Out of the foot of the cell, over the empty row, into the top of the cell below.
    expect(move(GRID, { row: 0, cell: 1, stop: 2 }, "down")).toEqual({
      row: 2,
      cell: 1,
      stop: 0,
    });
    // And back up into the foot of the cell above.
    expect(move(GRID, { row: 2, cell: 1, stop: 0 }, "up")).toEqual({
      row: 0,
      cell: 1,
      stop: 2,
    });
    expect(move(GRID, { row: 2, cell: 2, stop: 1 }, "up")).toEqual({
      row: 2,
      cell: 2,
      stop: 0,
    });
    // Sideways lands on the cell's first stop.
    expect(move(GRID, { row: 0, cell: 1, stop: 2 }, "right")).toEqual({
      row: 0,
      cell: 2,
      stop: 0,
    });
  });

  it("takes the nearest cell when the row beyond has none in this column", () => {
    const ragged: Stops = [
      [1, 0, 0, 1],
      [0, 1, 0, 0],
    ];
    expect(move(ragged, { row: 0, cell: 3, stop: 0 }, "down")).toEqual({
      row: 1,
      cell: 1,
      stop: 0,
    });
    expect(move(ragged, { row: 1, cell: 1, stop: 0 }, "up")).toEqual({
      row: 0,
      cell: 0,
      stop: 0,
    });
  });

  it("starts again from the top when the place it had is gone", () => {
    expect(move(LIST, { row: 9, cell: 0, stop: 0 }, "down")).toEqual({
      row: 0,
      cell: 0,
      stop: 0,
    });
  });
});

describe("where the keys are wired", () => {
  it("marks every shared table and the schedule's grid, and mounts one listener", () => {
    expect(read("data-table.tsx")).toMatch(/<table[^>]*data-keys/);
    expect(read("(office)/schedule/schedule-screen.tsx")).toMatch(/<table[^>]*data-keys/);
    expect(read("(office)/layout.tsx")).toContain("<KeyboardRows />");
  });

  it("lists every key it reads, each with a sentence in both languages", () => {
    const caps = KEYS.flatMap(([keys]) => [...keys]);
    for (const cap of ["↓", "J", "↑", "K", "←", "→", "Enter", "Space", "Esc", "?"]) {
      expect([cap, caps.includes(cap as (typeof caps)[number])]).toEqual([cap, true]);
    }
    for (const [, does] of KEYS) {
      expect(en.keys.does[does]).not.toBe("");
      expect(es.keys.does[does]).not.toBe(en.keys.does[does]);
    }
  });
});
