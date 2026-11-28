// The sweep's one checker, for the phone and the web: reads the view trees a sweep saved and
// names what a person would trip on. One tree shape (below); Maestro's Android and iOS trees
// are adapted to it here, and the web's collector (apps/web/e2e/sweep.shots.ts) writes it
// directly.
//
//   node scripts/sweep/check.mjs [--platform android|ios --density <n>] <file.json>...
//
// --platform and --density are for Maestro's trees, which do not say them. One line per
// fault, "<file>: <what>"; the last line "<n> faults". Beside each tree it writes
// <file>.faults.json, { width, height, faults: [{ what, box }] }, for the gallery to mark on the picture. Exit 1 on
// any fault.
//
// The shape: { platform, width, height, layoutWidth, nodes: [Node], faults: [string] }.
// A Node: { parent (an index or -1), box [x0, y0, x1, y1] in points or CSS px, text (the
// words drawn), name (what a screen reader says), control (a press does something),
// stateful (a radio, a checkbox, a switch, a tab, a pressed filter, a disclosure, a nav
// item), state (said, or null), clip (the box its nearest clipping ancestor draws in, or
// null), truncated, broken (a word on two lines), narrow (a word wider than its box),
// ellipsisAllowed (a catalogue string that ends so, or a busy button), pinned (fixed or
// sticky, over what scrolls beneath it), scrolls (its clip is a scroller) }. `faults` are the
// collector's own, already decided (axe, focus, console, motion, sideways scroll).
import { readFileSync, writeFileSync } from "node:fs";
import { Console } from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";

const console = new Console(process.stdout, process.stderr);

const APP = "app.jpteq.trader";
const STATEFUL_ANDROID = /\.(RadioButton|CheckBox|Switch|ToggleButton)$|TabWidget|\.Tab$/;

// Maestro's tree, as the one shape.
export function fromMaestro(root, platform, density) {
  const nodes = [];
  const px = (b) => {
    const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b ?? "");
    return m
      ? m.slice(1).map((v) => Number(v) / (platform === "android" ? density : 1))
      : null;
  };
  // The screen: the first box that starts at the top-left corner.
  let width = 0;
  let height = 0;
  const walk = (node, parent, clip, outer) => {
    const a = node.attributes ?? {};
    const box = px(a.bounds);
    if (box && width === 0 && box[0] === 0 && box[1] === 0 && box[2] > 0) {
      width = box[2];
      height = box[3];
    }
    const id = a["resource-id"] ?? "";
    // Another app's window (the keyboard, the system's bar): its package on the node, or as
    // the prefix of its or an ancestor's id ("com.google.android.inputmethod.latin:id/…").
    // The app's own ids are bare test ids.
    const own =
      platform === "android" ? (a.package ?? /^([\w.]+):id\//.exec(id)?.[1]) : undefined;
    // The framework's own frame ("android:id/content") holds every app's window: neutral.
    const foreign =
      (own !== undefined && own !== APP && own !== "android") ||
      (parent >= 0 && nodes[parent].foreign);
    const ours = !foreign;
    const text =
      (a.text ?? "").trim() ||
      (platform === "ios" ? (a.accessibilityText ?? "").trim() : "");
    const index = nodes.length;
    nodes.push({
      parent,
      box,
      text,
      name: (a.text || a.accessibilityText || a.hintText || "").trim(),
      control:
        platform === "android" &&
        a.clickable === "true" &&
        ours &&
        a["important-for-accessibility"] !== "false",
      stateful: platform === "android" && STATEFUL_ANDROID.test(a.class ?? ""),
      state:
        "checked" in a || "selected" in a
          ? `${a.checked ?? ""}${a.selected ?? ""}`
          : null,
      clip,
      foreign,
      scrolls: clip !== null,
      parentBox: outer,
      // The band and the tab bar stay put while the screen scrolls beneath them (the app's
      // `band` and `tab-` ids), and so does what they hold; so does iOS's status bar, the
      // strip at the screen's very top ("Carrier", the clock, "Not charging").
      pinned:
        id === "band" ||
        id.startsWith("tab-") ||
        (parent >= 0 && nodes[parent].pinned) ||
        (platform === "ios" && box !== null && box[1] <= 4 && box[3] <= 60),
      truncated: id.endsWith("-truncated"),
      // "-broken", or "-broken-truncated" when both apply (ui/text.tsx).
      broken: /-broken(-truncated)?$/.test(id),
      narrow: false,
      ellipsisAllowed: false,
      // iOS's scroll indicator says how far down it is ("0%", "100%"): no text of the app's.
      hidden:
        /^\d+%$/.test(text) ||
        !ours ||
        (box !== null && box[2] - box[0] <= 0 && box[3] - box[1] <= 0),
    });
    // A scrolling view cuts what it holds: Android gives a node's visible part.
    const next = a.scrollable === "true" && box ? box : clip;
    const has = box && box[2] - box[0] > 0 ? box : outer;
    for (const child of node.children ?? []) walk(child, index, next, has);
  };
  walk(root, -1, null, null);
  // A control names itself or by the words beneath it.
  const named = new Set();
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].name || named.has(i)) {
      named.add(i);
      if (nodes[i].parent >= 0) named.add(nodes[i].parent);
    }
  }
  for (const [i, n] of nodes.entries()) if (named.has(i) && !n.name) n.name = "(below)";
  return { platform, width, height, layoutWidth: width, nodes, faults: [] };
}

const inside = (a, b) =>
  a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[2] <= b[2] + 1 && a[3] <= b[3] + 1;
// Two boxes cross when they share more than a sliver: lines set tighter than their type
// share a little height, which is no overlap a person sees.
const overlap = (a, b) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 2 && h > Math.max(2, 0.4 * Math.min(a[3] - a[1], b[3] - b[1]));
};
const touches = (a, b) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 2 &&
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 2;
const fmt = (b) => b.map((v) => Math.round(v)).join(",");

export function check(tree) {
  const out = [];
  const say = (what, box = null) => {
    if (!out.some((f) => f.what === what)) out.push({ what, box });
  };
  for (const f of tree.faults ?? []) say(f);
  const web = tree.platform === "web";
  const min = web ? (tree.layoutWidth < 768 ? 48 : 36) : 48;
  // A node its scrolling or clipping box has moved wholly out of sight is not drawn.
  const nodes = tree.nodes.filter(
    (n) =>
      !n.hidden &&
      n.box &&
      (n.clip === null || n.clip === undefined || touches(n.box, n.clip)),
  );
  const ancestors = (n) => {
    const seen = new Set();
    for (let p = n.parent; p >= 0; p = tree.nodes[p].parent) seen.add(tree.nodes[p]);
    return seen;
  };
  for (const n of nodes) {
    const b = n.box;
    const label = n.text || n.name || "";
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    if (n.control && !n.name) say(`a control with no name at ${fmt(b)}`, b);
    // A control the edge of a scrolling view cuts is not measured as small.
    const cut = n.clip && (b[1] <= n.clip[1] + 1 || b[3] >= n.clip[3] - 1);
    if (n.control && !cut && (w < min - 0.5 || h < min - 0.5))
      say(`a target of ${Math.round(w)}×${Math.round(h)}: "${label}"`, b);
    if (n.stateful && n.state === null) say(`a state not spoken: "${label}"`, b);
    if (n.truncated) say(`cut short: "${label}"`, b);
    if (n.text && /(…|\.\.\.)$/.test(n.text) && !n.ellipsisAllowed)
      say(`ends in an ellipsis: "${n.text}"`, b);
    if (n.broken) say(`broken inside a word: "${label}"`, b);
    if (n.narrow) say(`a column too narrow for its longest word: "${label}"`, b);
    // A scroller shows part of what it holds by design: what it cuts is no fault.
    if (n.scrolls && n.clip && !inside(b, n.clip)) continue;
    if (n.text && (b[2] > tree.width + 1 || b[0] < -1))
      say(`past the screen's edge: "${n.text}"`, b);
    else if (
      !web &&
      n.name &&
      w > 0 &&
      n.parentBox &&
      (b[2] > n.parentBox[2] + 1 || b[0] < n.parentBox[0] - 1)
    )
      say(`past its box: "${n.name}"`, b);
    else if (n.text && n.clip && w > 0 && (b[2] > n.clip[2] + 1 || b[0] < n.clip[0] - 1))
      say(`past its box: "${n.text}"`, b);
    // Words pressed into a strip, a letter or two a line. Not a scroll indicator ("100%").
    if (!web && n.text.length > 3 && !/^\d+%$/.test(n.text) && w < 40 && h > 3 * w)
      say(`a column too narrow for its longest word: "${n.text}"`, b);
  }
  // Two text boxes, neither inside the other, that cross.
  const texts = nodes.filter((n) => n.text && n.box[2] - n.box[0] > 0 && !n.pinned);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const [a, c] = [texts[i], texts[j]];
      if (!overlap(a.box, c.box) || inside(a.box, c.box) || inside(c.box, a.box))
        continue;
      if (ancestors(a).has(c) || ancestors(c).has(a)) continue;
      // A row that names itself with its words (iOS's accessibility label) is not a second
      // text over them.
      if (a.text.includes(c.text) || c.text.includes(a.text)) continue;
      say(`overlapping: "${a.text}" and "${c.text}"`, a.box);
    }
  }
  return out;
}

// Run as a command, not when imported (verdict.mjs).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

function main() {
  const args = process.argv.slice(2);
  let platformArg = null;
  let densityArg = 1;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform") platformArg = args[++i];
    else if (args[i] === "--density") densityArg = Number(args[++i]);
    else files.push(args[i]);
  }
  if (files.length === 0 || !(densityArg > 0)) {
    console.error(
      "usage: check.mjs [--platform android|ios --density <n>] <file.json>...",
    );
    process.exit(64);
  }

  let total = 0;
  for (const file of files.filter((f) => !f.endsWith(".faults.json"))) {
    let tree;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      tree = Array.isArray(raw.nodes)
        ? raw
        : fromMaestro(raw, platformArg ?? "android", densityArg);
    } catch {
      console.log(`${file}: no view tree`);
      total += 1;
      continue;
    }
    const faults = check(tree);
    writeFileSync(
      `${file.replace(/\.json$/, "")}.faults.json`,
      JSON.stringify({ width: tree.width, height: tree.height, faults }),
    );
    for (const f of faults) console.log(`${file}: ${f.what}`);
    total += faults.length;
  }
  console.log(`${total} faults`);
  process.exit(total === 0 ? 0 : 1);
}
