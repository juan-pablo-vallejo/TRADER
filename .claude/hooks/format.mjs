#!/usr/bin/env node
// PostToolUse hook for Edit and Write. Formats the one file Claude just changed with the
// repository's own Prettier, so `format:check` never fails a check over whitespace. It never
// blocks: no Prettier installed, a file Prettier ignores or cannot parse, and it exits 0.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

let text = "";
for await (const chunk of process.stdin) text += chunk;
let file;
try {
  file = JSON.parse(text)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof file !== "string" || !file.startsWith("/")) process.exit(0);

// Prettier as the file's own checkout installed it: a worktree has its own node_modules.
let bin;
for (const from of [
  file,
  join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), "package.json"),
]) {
  try {
    const pkg = createRequire(from).resolve("prettier/package.json");
    bin = join(dirname(pkg), "bin", "prettier.cjs");
    break;
  } catch {
    // look in the next place
  }
}
if (!bin) process.exit(0);
try {
  execFileSync(
    process.execPath,
    [bin, "--write", "--ignore-unknown", "--log-level", "warn", file],
    {
      cwd: dirname(file),
      timeout: 20000,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
} catch {
  // A file that does not parse is the type checker's to report, not this hook's.
}
