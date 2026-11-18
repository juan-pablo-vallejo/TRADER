// docs/LOG.md is append-only (RULES, Git and CI). This fails when a line of the base's log is
// missing, changed or out of order in this tree's log, or when a day's heading repeats.
//
//   node .github/scripts/log-append-only.mjs <base>
//
// CI passes HEAD^1: `main`'s tip under a pull request's merge commit, and the commit before
// the merge on `main` itself. `pnpm check` passes the branch's merge base with origin/main,
// so a branch behind `main` is not red for lines it has not merged yet.
//
// Blank lines are not compared. A base with no log has nothing to lose and passes. One line
// may go: a `## ` heading of the base that repeats an earlier heading of the base, so that a
// duplicate which reached `main` can be taken out again.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LOG = "docs/LOG.md";
const base = process.argv[2];

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const stop = (message) => {
  console.error(`log-append-only: ${message}`);
  process.exit(2);
};
const written = (text) =>
  text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "");

if (!base) stop("usage: log-append-only.mjs <base>");

// A base that cannot be read is an error, never a pass: a shallow clone must not turn the
// check off.
let commit;
try {
  commit = git("rev-parse", "--verify", "--quiet", `${base}^{commit}`).trim();
} catch {
  stop(`the base ${base} is not a commit here`);
}

const tracked = git("ls-tree", "--name-only", commit, "--", LOG).trim() === LOG;
if (!tracked) {
  console.log(`log-append-only: no ${LOG} at ${commit.slice(0, 7)}; nothing to compare`);
  process.exit(0);
}

const before = written(git("show", `${commit}:${LOG}`));
let after;
try {
  after = written(readFileSync(LOG, "utf8"));
} catch {
  console.error(`log-append-only: ${LOG} was at ${commit.slice(0, 7)} and is gone`);
  process.exit(1);
}

const failures = [];

// Every line of the base, in the base's order, is in the log now.
const seenHeadings = new Set();
let from = 0;
for (const { line, number } of before) {
  const repeatedHeading = line.startsWith("## ") && seenHeadings.has(line);
  if (line.startsWith("## ")) seenHeadings.add(line);
  let at = from;
  while (at < after.length && after[at].line !== line) at++;
  if (at < after.length) from = at + 1;
  else if (!repeatedHeading)
    failures.push(
      `line ${number} of the base is missing, changed or out of order: ${line}`,
    );
}

// A day has one heading.
const headings = new Map();
for (const { line, number } of after) {
  if (!line.startsWith("## ")) continue;
  if (headings.has(line))
    failures.push(
      `line ${number} repeats the heading on line ${headings.get(line)}: ${line}`,
    );
  else headings.set(line, number);
}

if (failures.length > 0) {
  console.error(`log-append-only: ${LOG} against ${commit.slice(0, 7)}`);
  for (const failure of failures.slice(0, 10))
    console.error(`  ${failure.length > 200 ? `${failure.slice(0, 200)}…` : failure}`);
  if (failures.length > 10) console.error(`  and ${failures.length - 10} more`);
  process.exit(1);
}
console.log(
  `log-append-only: ${before.length} lines of ${LOG} at ${commit.slice(0, 7)} all present, in order; ${after.length} lines now`,
);
