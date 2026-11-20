// Keyboard movement through the office's tables and its two grids, as arithmetic: which
// stop the focus goes to next. A stop is something a row already offers by pointer and by
// Tab (a link or a button), so the keys add a way through and take nothing away.
//
// A table is read as rows of cells, each cell holding some number of stops (a schedule
// cell holds a card for each shift and its own Add button). Down and up go through a
// cell's stops and then to the nearest cell with one in the next row; left and right go
// along the row. Pure. Consumed by keyboard-rows.tsx, which finds the stops in the page.
export type Direction = "down" | "up" | "left" | "right";
// For each row, how many stops each of its cells holds.
export type Stops = readonly (readonly number[])[];
export type Place = { row: number; cell: number; stop: number };

// The arrow keys, or J and K. Nothing with a modifier: those are the browser's.
export function directionOf(event: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): Direction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case "ArrowDown":
    case "j":
    case "J":
      return "down";
    case "ArrowUp":
    case "k":
    case "K":
      return "up";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

// Whether what has the focus is somewhere a person types or chooses: a key never acts
// there. A select and a radio use the arrows themselves.
export function isField(
  target: {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  } | null,
): boolean {
  if (target === null || target.tagName === undefined) return false;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable === true) return true;
  const role = target.getAttribute?.("role") ?? "";
  return ["textbox", "combobox", "listbox", "slider", "spinbutton"].includes(role);
}

const filled = (row: readonly number[] | undefined) =>
  row !== undefined && row.some((n) => n > 0);
// The cell with a stop nearest to `cell`; the earlier one when two are as near.
function nearest(row: readonly number[], cell: number): number {
  let best = -1;
  for (const [index, count] of row.entries()) {
    if (count === 0) continue;
    if (best === -1 || Math.abs(index - cell) < Math.abs(best - cell)) best = index;
  }
  return best;
}

// Where the focus goes from `at`; null when there is nowhere further that way. From
// nowhere (`at` null), down or up enters at the first row that has a stop.
export function move(stops: Stops, at: Place | null, direction: Direction): Place | null {
  if (at === null) {
    if (direction === "left" || direction === "right") return null;
    const row = stops.findIndex(filled);
    return row === -1 ? null : { row, cell: nearest(stops[row]!, 0), stop: 0 };
  }
  const here = stops[at.row];
  if (here === undefined) return move(stops, null, "down");
  if (direction === "down" || direction === "up") {
    const step = direction === "down" ? 1 : -1;
    const within = at.stop + step;
    if (within >= 0 && within < (here[at.cell] ?? 0)) return { ...at, stop: within };
    for (let row = at.row + step; row >= 0 && row < stops.length; row += step) {
      if (!filled(stops[row])) continue;
      const cell = nearest(stops[row]!, at.cell);
      // Going up arrives at the foot of the cell above, as going down leaves from it.
      return { row, cell, stop: direction === "down" ? 0 : stops[row]![cell]! - 1 };
    }
    return null;
  }
  const step = direction === "right" ? 1 : -1;
  for (let cell = at.cell + step; cell >= 0 && cell < here.length; cell += step) {
    if (here[cell]! > 0) return { row: at.row, cell, stop: 0 };
  }
  return null;
}
