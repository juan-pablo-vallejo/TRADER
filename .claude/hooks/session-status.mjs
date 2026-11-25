#!/usr/bin/env node
// SessionStart hook. Prints what a session should know before its first command, in a few
// lines that Claude Code adds to the conversation: toolchain against the repository's pins,
// the working tree, whether its tree has a recorded green check, the workstation, an open
// release. Read-only, every probe on a short timeout, never a failure: a hook that cannot
// tell says so and exits 0. The workstation is asked through `trader-ws`: the owner's shim
// for `scripts/trader-ws`, which says which machine; a machine without it is told so and
// loses nothing.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd, args, ms = 3000) =>
  new Promise((resolve) =>
    execFile(cmd, args, { timeout: ms, encoding: "utf8" }, (error, stdout) =>
      resolve(error ? null : stdout.trim()),
    ),
  );
const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

const root = (await run("git", ["rev-parse", "--show-toplevel"])) ?? process.cwd();
const common = await run("git", [
  "-C",
  root,
  "rev-parse",
  "--path-format=absolute",
  "--git-common-dir",
]);

const [node, pnpm, docker, dirty, branch, tree, behind, ws, release] = await Promise.all([
  run("node", ["--version"]),
  run("pnpm", ["--version"]),
  run("docker", ["info", "--format", "{{.ServerVersion}}"]),
  run("git", ["-C", root, "status", "--porcelain"]),
  run("git", ["-C", root, "branch", "--show-current"]),
  run("git", ["-C", root, "rev-parse", "HEAD^{tree}"]),
  run("git", ["-C", root, "rev-list", "--left-right", "--count", "HEAD...origin/main"]),
  run("trader-ws", ["status"], 5000),
  run(
    "gh",
    [
      "pr",
      "list",
      "--base",
      "production",
      "--state",
      "open",
      "--json",
      "number",
      "--jq",
      "length",
    ],
    5000,
  ),
]);

const wantNode = read(`${root}/.nvmrc`)?.trim();
const wantPnpm = JSON.parse(read(`${root}/package.json`) ?? "{}").packageManager?.split(
  "@",
)[1];
const green =
  common && tree
    ? (read(`${common}/trader/green`) ?? "").includes(`${tree} check `)
    : false;
const [ahead, back] = (behind ?? "? ?").split(/\s+/);

const lines = [
  `toolchain: node ${node ?? "missing"}${wantNode && node && !node.startsWith(`v${wantNode}`) ? ` (repository wants ${wantNode})` : ""}, pnpm ${pnpm ?? "missing"}${wantPnpm && pnpm && pnpm !== wantPnpm ? ` (repository wants ${wantPnpm})` : ""}, docker ${docker ?? "not running"}`,
  `tree: ${branch || "detached"}, ${dirty === null ? "status unknown" : dirty === "" ? "clean" : `${dirty.split("\n").length} changed files`}, ${ahead} ahead and ${back} behind origin/main as last fetched; HEAD's tree ${green ? "has a recorded green check" : "has no recorded green check of its own (a commit that changed Markdown alone needs none)"}`,
  `workstation: ${ws ?? "no answer (wake it, or `trader-ws check --local`; Android waits)"}`,
  `release: ${release === null ? "GitHub did not answer" : release === "0" ? "no pull request into production is open" : "A PULL REQUEST INTO PRODUCTION IS OPEN: do not push to main"}`,
];
console.log(lines.join("\n"));
