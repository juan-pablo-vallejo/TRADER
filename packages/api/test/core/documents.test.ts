// The four documents against the repository: what one states in two places is held equal
// here, so a change to one copy cannot leave the other behind.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

// The repository's own text files under some folders, as the checks read them: no git, since
// the workstation runs these tests on a copy without one. What is built, installed or
// generated is left out, and so are JSON (the recorded contract) and Markdown (the
// documents are read by name).
const SKIP = new Set([
  "node_modules",
  ".next",
  "build",
  "dist",
  "android",
  "ios",
  ".expo",
  "test-results",
  ".vercel",
  "coverage",
  ".turbo",
  "migrations",
]);
function files(dir: string, out: { path: string; text: string }[] = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) files(path, out);
    } else if (/\.(ts|tsx|mjs|js|cjs|sh|ya?ml|css)$|^[^.]+$/.test(e.name)) {
      out.push({ path, text: readFileSync(join(ROOT, path), "utf8") });
    }
  }
  return out;
}

// A paragraph's words on one line, whatever its wrapping.
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

describe("the four documents", () => {
  it("open README with the MVP's one sentence", () => {
    const mvp = /\*\*One sentence\.\*\* ([^]*?)\n\n/.exec(read("docs/TASKS.md"));
    const readme = /^# TRADER\n\n([^]*?)\n\n/.exec(read("README.md"));
    expect(mvp?.[1]).toBeTruthy();
    expect(flat(readme?.[1] ?? "")).toBe(flat(mvp?.[1] ?? ""));
  });

  // Every variable a program here reads is listed in .env.example, and every listed one is
  // read, so a name renamed in one place cannot be left in the other. Not listed: what a
  // platform sets, and a script's per-run inputs, which its header names.
  it("list in .env.example every variable read, and only those", () => {
    const PLATFORM = [
      "CI",
      "GITHUB_ENV",
      "NEXT_RUNTIME",
      "NODE_ENV",
      "VERCEL_ENV",
      "VERCEL_GIT_COMMIT_SHA",
    ];
    const PER_RUN = [
      "E2E_ADMIN_TICKET",
      "E2E_EXPECT_COMMIT",
      "E2E_OUTPUT_DIR",
      "E2E_WORKER_TICKET",
      "INVITE_NAME",
      "INVITE_PHONE",
      "LOOK_DIR",
      "LOOK_PATHS",
      "SAMPLE_FILE",
      "SHA",
      "TARGET",
      "TRADER_MIGRATE_PURPOSE",
    ];
    const sources = ["apps", "packages", "scripts", ".github"]
      .flatMap((d) => files(d))
      .map((f) => f.text)
      .join("\n");
    const named = new Set(
      [
        ...sources.matchAll(
          /(?:process\.env|\benv)(?:\.|\[["'])([A-Z][A-Z0-9_]+)|\$\{\{\s*(?:secrets|vars)\.([A-Z][A-Z0-9_]+)/g,
        ),
      ].map((m) => m[1] ?? m[2]!),
    );
    const listed = new Set(
      [...read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!),
    );
    // Listed, and read by a tool rather than this repository's code: Sentry's build
    // plugin uploads a build's source maps with it.
    const TOOLS = ["SENTRY_AUTH_TOKEN"];
    const skip = new Set([...PLATFORM, ...PER_RUN]);
    expect([...named].filter((n) => !skip.has(n) && !listed.has(n)).sort()).toEqual([]);
    expect(
      [...listed]
        .filter((n) => !TOOLS.includes(n) && !new RegExp(`\\b${n}\\b`).test(sources))
        .sort(),
    ).toEqual([]);
  });

  // Git keeps a decision's date and the plan that asked for it: a document or comment says
  // what is, and the only date it holds is a looked-up fact's, "(source, read YYYY-MM-DD)".
  it("hold no date but a looked-up fact's, and cite no plan or item from code", () => {
    const grep = (pattern: RegExp, texts: { path: string; text: string }[]) =>
      texts.flatMap(({ path, text }) =>
        text
          .split("\n")
          .flatMap((line, n) => (pattern.test(line) ? [`${path}:${n + 1}:${line}`] : [])),
      );
    const documents = [
      "README.md",
      "CLAUDE.md",
      "docs/ARCHITECTURE.md",
      "docs/TASKS.md",
    ].map((path) => ({ path, text: read(path) }));
    expect(grep(/(?<!read )\b20\d{2}-\d{2}-\d{2}\b/, documents)).toEqual([]);
    // This file names the patterns it refuses, so it is left out of its own search.
    const code = ["apps", "packages", "scripts"]
      .flatMap((d) => files(d))
      .filter((f) => !f.path.endsWith("test/core/documents.test.ts"));
    expect(
      grep(
        /\b[Ii]tems? \d+[a-z]?\b|\bgate \d+\b|\bdecision \d+\b|\bamendment\b|\(D\d{1,3}\)|\bTrack [AB]\b|\bPhase T\b/,
        code,
      ),
    ).toEqual([]);
  });
});
