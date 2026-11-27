// Reads the view trees the layout sweep saved (matrix.sh: one `maestro hierarchy` per
// screen) and names what a person would trip on:
//
// - a control with no name: a clickable node with no text or label, in itself or below it;
// - a target under 48 points either way;
// - text that runs past the screen's edge, or past the side of the box it sits in, or is
//   pressed into a strip a letter or two wide;
// - text the app marked as cut short (ui/text.tsx, development builds: "-truncated" on its
//   test id).
//
// Android's tree says which nodes are clickable, in pixels with the screen's density beside
// it; iOS's says neither, so on iOS only the edge and the cut-short mark are read. The same
// screens run on both, so a control is held to its size and name on Android.
//
//   node check-hierarchy.mjs <android|ios> <density> <file.json>...
//
// One line per fault, "<file>: <what>"; the last line "<n> faults". Exit 1 on any.
import { Console } from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";

const console = new Console(process.stdout, process.stderr);

const [platform, densityArg, ...files] = process.argv.slice(2);
const density = Number(densityArg);
if (!["android", "ios"].includes(platform) || !(density > 0) || files.length === 0) {
  console.error("usage: check-hierarchy.mjs <android|ios> <density> <file.json>...");
  process.exit(64);
}

const TARGET = 48;
const APP = "app.jpteq.trader";

const bounds = (b) => {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b ?? "");
  return m ? m.slice(1).map(Number) : null;
};
const named = (node) => {
  const a = node.attributes ?? {};
  if (
    (a.text ?? "").trim() ||
    (a.accessibilityText ?? "").trim() ||
    (a.hintText ?? "").trim()
  )
    return true;
  return (node.children ?? []).some(named);
};

let faults = 0;
for (const file of files) {
  let root;
  try {
    root = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.log(`${file}: no view tree`);
    faults += 1;
    continue;
  }
  // The screen: the window, the first box that starts at the top-left corner. Not the
  // widest box, which is the one that runs past the edge.
  let width = 0;
  const visit = (node, fn) => {
    fn(node);
    for (const child of node.children ?? []) visit(child, fn);
  };
  visit(root, (n) => {
    const b = bounds(n.attributes?.bounds);
    if (b && width === 0 && b[0] === 0 && b[1] === 0 && b[2] > 0) width = b[2];
  });
  const seen = new Set();
  const say = (what) => {
    if (seen.has(what)) return;
    seen.add(what);
    faults += 1;
    console.log(`${file}: ${what}`);
  };
  // A named box wider than the box it sits in: drawn past its container's side, and cut.
  const within = (node, outer) => {
    const ob = bounds(node.attributes?.bounds);
    const has = ob && ob[2] - ob[0] > 0 ? ob : outer;
    for (const child of node.children ?? []) {
      const ca = child.attributes ?? {};
      const cb = bounds(ca.bounds);
      const name = (ca.text || ca.accessibilityText || "").trim();
      if (
        has &&
        cb &&
        name &&
        cb[2] - cb[0] > 0 &&
        (cb[2] > has[2] + 1 || cb[0] < has[0] - 1)
      )
        say(`runs past its container's side: "${name}"`);
      within(child, has);
    }
  };
  within(root, null);
  // Each node with the box of the scrolling view it sits in: Android gives a node's visible
  // part, so one the scroll view's edge cuts is not measured as small.
  const scrolled = new Map();
  const mark = (node, box) => {
    const b = bounds(node.attributes?.bounds);
    const here = node.attributes?.scrollable === "true" && b ? b : box;
    for (const child of node.children ?? []) {
      scrolled.set(child, here);
      mark(child, here);
    }
  };
  mark(root, null);
  visit(root, (node) => {
    const a = node.attributes ?? {};
    const b = bounds(a.bounds);
    if (!b || (b[2] - b[0] <= 0 && b[3] - b[1] <= 0)) return;
    const id = a["resource-id"] ?? "";
    const label = (a.text || a.accessibilityText || id || "").trim();
    if (id.endsWith("-truncated")) say(`cut short: "${label}"`);
    // iOS puts a text's words in its label, Android in its text.
    const words = (a.text || a.accessibilityText || "").trim();
    if (words && (b[2] > width + 1 || b[0] < -1))
      say(`runs past the screen's edge: "${words}"`);
    // Words pressed into a strip, a letter or two a line: their box is narrow and tall. Not
    // iOS's scroll indicator, which says how far down it is ("100%").
    const bw = (b[2] - b[0]) / density;
    const bh = (b[3] - b[1]) / density;
    if (words.length > 3 && !/^\d+%$/.test(words) && bw < 40 && bh > 3 * bw)
      say(`pressed to a strip: "${words}"`);
    if (platform !== "android" || a.clickable !== "true") return;
    if (a.package !== undefined && a.package !== APP) return;
    // Hidden from a screen reader on purpose: a sheet's backdrop, which its Close repeats.
    if (a["important-for-accessibility"] === "false") return;
    if (!named(node)) say(`a control with no name at ${a.bounds}${id ? ` (${id})` : ""}`);
    const box = scrolled.get(node);
    if (box && (b[1] <= box[1] + 1 || b[3] >= box[3] - 1)) return;
    const w = (b[2] - b[0]) / density;
    const h = (b[3] - b[1]) / density;
    if (w < TARGET - 0.5 || h < TARGET - 0.5)
      say(`a target of ${Math.round(w)}×${Math.round(h)} pt: "${label}"`);
  });
}
console.log(`${faults} faults`);
process.exit(faults === 0 ? 0 : 1);
