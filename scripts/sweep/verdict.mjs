// The sweep's verdict on one run's folder: every cell's trees through check.mjs, against
// the list of faults already there (known-faults.json).
//
//   node scripts/sweep/verdict.mjs <run folder> [--partial] [--write-known]
//
// One line a cell, "<cell>: <screens> screens, <faults> faults", then the total. Clean
// means: every cell of cells.json is in the folder (a missing cell is a fault), no fault
// outside known-faults.json, every listed fault still seen, and no listed fault that
// origin/main's copy of the list does not hold, so the list only shrinks. Exit 0 when
// clean, 1 when not, 64 on a usage error. --partial: a run of some cells (`sweep phone`,
// `sweep web`, one profile) reads only the cells it holds and is never clean.
// --write-known: the first whole run writes the list; refused once origin/main has one.
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { Console } from "node:console";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { check, fromMaestro } from "./check.mjs";

const console = new Console(process.stdout, process.stderr);

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const run = args.find((a) => !a.startsWith("--"));
const partial = args.includes("--partial");
const writeKnown = args.includes("--write-known");
if (run === undefined || !existsSync(run)) {
  console.error("usage: verdict.mjs <run folder> [--partial] [--write-known]");
  process.exit(64);
}

const { cells } = JSON.parse(readFileSync(join(here, "cells.json"), "utf8"));
const knownFile = join(here, "known-faults.json");
const known = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, "utf8")) : [];
let base = null;
try {
  base = JSON.parse(
    execFileSync("git", ["show", "origin/main:scripts/sweep/known-faults.json"], {
      cwd: here,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  base = null;
}

const found = [];
let screensTotal = 0;
// The cells' own minutes, added up: the work a run did, whatever ran side by side.
let secondsTotal = 0;
for (const cell of cells) {
  const dir = join(run, cell);
  if (!existsSync(dir)) {
    if (!partial) {
      found.push(`${cell}: missing`);
      console.log(`${cell}: missing`);
    }
    continue;
  }
  const meta = existsSync(join(dir, "cell.json"))
    ? JSON.parse(readFileSync(join(dir, "cell.json"), "utf8"))
    : {};
  const trees = readdirSync(dir).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".faults.json") && f !== "cell.json",
  );
  let faults = 0;
  // A phone step that failed leaves its picture and no tree: matrix.sh counts it.
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".failed.png"))) {
    found.push(`${cell}/${f.replace(/\.failed\.png$/, "")}: the step failed`);
    faults += 1;
  }
  for (const file of trees.sort()) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const tree = Array.isArray(raw.nodes)
      ? raw
      : fromMaestro(raw, meta.platform ?? "android", Number(meta.density ?? 1));
    const these = check(tree);
    writeFileSync(
      join(dir, file.replace(/\.json$/, ".faults.json")),
      JSON.stringify({ width: tree.width, height: tree.height, faults: these }),
    );
    for (const f of these)
      found.push(`${cell}/${file.replace(/\.json$/, "")}: ${f.what}`);
    faults += these.length;
  }
  screensTotal += trees.length;
  const seconds = Number(meta.seconds ?? 0);
  secondsTotal += seconds;
  console.log(
    `${cell}: ${trees.length} screens, ${faults} faults${seconds ? `, ${Math.round(seconds / 60)} min` : ""}`,
  );
}

const fresh = found.filter((f) => !known.includes(f));
const gone = partial ? [] : known.filter((f) => !found.includes(f));
const unlisted = base === null ? [] : known.filter((f) => !base.includes(f));
console.log(
  `total: ${screensTotal} screens, ${found.length} faults, ${Math.round(secondsTotal / 60)} cell-minutes, ${fresh.length} not listed, ${gone.length} listed and gone, ${unlisted.length} listed here and not on origin/main`,
);
for (const f of fresh) console.log(`  new: ${f}`);
for (const f of gone) console.log(`  gone: ${f}`);
for (const f of unlisted) console.log(`  not on origin/main: ${f}`);

if (writeKnown) {
  if (partial) {
    console.error("verdict: only a whole run writes the list");
    process.exit(1);
  }
  if (base !== null) {
    console.error("verdict: origin/main holds a list already; it only shrinks, by hand");
    process.exit(1);
  }
  writeFileSync(knownFile, `${JSON.stringify([...new Set(found)].sort(), null, 2)}\n`);
  console.log(`wrote ${knownFile}: ${new Set(found).size} faults`);
  process.exit(0);
}
const clean =
  !partial && fresh.length === 0 && gone.length === 0 && unlisted.length === 0;
// The run's wall time, from its own files: its first picture to its last cell's record,
// against the whole sweep's budget of 90 minutes. One line a verdict in timings.tsv beside
// the runs: when, run, whole or partial, wall minutes, cell-minutes, screens, faults.
const times = readdirSync(run, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(join(run, d.name))
      // What the run wrote, not what a verdict writes after it.
      .filter((f) => f.endsWith(".png") || f === "cell.json")
      .map((f) => statSync(join(run, d.name, f)).mtimeMs),
  );
const wall = times.length
  ? Math.round((Math.max(...times) - Math.min(...times)) / 60000)
  : 0;
console.log(`time: ${wall} min wall, of a 90-minute budget for a whole run`);
appendFileSync(
  join(dirname(run), "timings.tsv"),
  `${[new Date().toISOString(), basename(run), partial ? "partial" : "whole", wall, Math.round(secondsTotal / 60), screensTotal, found.length, clean ? "clean" : "not clean"].join("\t")}\n`,
);
console.log(clean ? "clean" : "not clean");
process.exit(clean ? 0 : 1);
