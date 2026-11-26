#!/usr/bin/env node
// PreToolUse guard for Bash, Edit and Write. It reads the whole command, including what is
// handed to `sh -c`, `eval`, `$(...)` and `ssh <host> '...'`, and refuses the few commands
// CLAUDE.md says never to run. A change to a guard file (GUARDED, below) is put to the
// owner: his answer to that prompt is the "apply". It is a tripwire, not a boundary: a deny
// rule and this file both read text, and text can be disguised (`git apply` of a patch
// names no path, for one). The lock is GitHub's ruleset on `production` and the owner's
// bypass of it; the `gh` login on this Mac is the owner's and could use that bypass, which
// is why this file and `.claude/settings.json` refuse it (docs/ARCHITECTURE.md, Claude and
// production).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Split a script into simple commands, each an argv. Quotes are honoured; the bodies of
// $(...) and `...` are returned as further scripts to check.
export function parse(script) {
  const commands = [];
  const nested = [];
  let argv = [];
  let word = null;
  const push = () => {
    if (word !== null) argv.push(word);
    word = null;
  };
  const end = () => {
    push();
    if (argv.length) commands.push(argv);
    argv = [];
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === "'") {
      const j = script.indexOf("'", i + 1);
      const stop = j === -1 ? script.length : j;
      word = (word ?? "") + script.slice(i + 1, stop);
      i = stop;
    } else if (c === '"') {
      word = word ?? "";
      for (i++; i < script.length && script[i] !== '"'; i++) {
        if (script[i] === "\\" && i + 1 < script.length) word += script[++i];
        else if (script[i] === "$" && script[i + 1] === "(") {
          const j = closing(script, i + 1);
          nested.push(script.slice(i + 2, j));
          i = j;
        } else word += script[i];
      }
    } else if (c === "\\" && i + 1 < script.length) {
      word = (word ?? "") + script[++i];
    } else if (c === "$" && script[i + 1] === "(") {
      const j = closing(script, i + 1);
      nested.push(script.slice(i + 2, j));
      word = (word ?? "") + "$()";
      i = j;
    } else if (c === "`") {
      const j = script.indexOf("`", i + 1);
      const stop = j === -1 ? script.length : j;
      nested.push(script.slice(i + 1, stop));
      word = (word ?? "") + "$()";
      i = stop;
    } else if (";&|\n(){}".includes(c)) {
      end();
    } else if (c === " " || c === "\t") {
      push();
    } else {
      word = (word ?? "") + c;
    }
  }
  end();
  return { commands, nested };
}

function closing(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return s.length;
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const WRAPPERS = new Set([
  "command",
  "builtin",
  "exec",
  "nohup",
  "time",
  "sudo",
  "env",
  "nice",
  "stdbuf",
  "xargs",
  "caffeinate",
]);
// ssh options that take a value, so the word after them is not the host.
const SSH_VALUE = new Set("BbcDEeFIiJLlmOopQRSWw".split("").map((f) => `-${f}`));
// git options that take a value, so the word after them is not the subcommand.
const GIT_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--super-prefix",
  "--config-env",
]);

// The PR's base branch, asked of GitHub. Kept apart so the tests can replace it.
export function baseOf(selector) {
  const args = [
    "pr",
    "view",
    ...(selector ? [selector] : []),
    "--json",
    "baseRefName",
    "--jq",
    ".baseRefName",
  ];
  return execFileSync("gh", args, { encoding: "utf8", timeout: 15000 }).trim();
}

// A reason to refuse this script, or null.
export function refusal(script, lookup = baseOf, depth = 0) {
  if (depth > 6) return "the command nests too deeply to read";
  const { commands, nested } = parse(script);
  for (const inner of nested) {
    const why = refusal(inner, lookup, depth + 1);
    if (why) return why;
  }
  for (let argv of commands) {
    for (;;) {
      while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]))
        argv = argv.slice(1);
      if (!argv.length || !WRAPPERS.has(basename(argv[0]))) break;
      argv = argv.slice(1);
      // The wrapper's own options and their plain-number or duration values.
      while (argv.length && (/^-/.test(argv[0]) || /^\d+[smhd]?$/.test(argv[0])))
        argv = argv.slice(1);
    }
    if (!argv.length) continue;
    const name = basename(argv[0]);
    const rest = argv.slice(1);

    if (name === "timeout") {
      const why = refusal(
        rest.filter((a, i) => !(i === 0 && /^\d/.test(a)) && !/^-/.test(a)).join(" "),
        lookup,
        depth + 1,
      );
      if (why) return why;
      continue;
    }
    if (SHELLS.has(name)) {
      const at = rest.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (at !== -1 && rest[at + 1] !== undefined) {
        const why = refusal(rest[at + 1], lookup, depth + 1);
        if (why) return why;
      }
      continue;
    }
    if (name === "eval") {
      const why = refusal(rest.join(" "), lookup, depth + 1);
      if (why) return why;
      continue;
    }
    if (name === "ssh") {
      let i = 0;
      while (i < rest.length && rest[i].startsWith("-"))
        i += SSH_VALUE.has(rest[i]) ? 2 : 1;
      const why = refusal(rest.slice(i + 1).join(" "), lookup, depth + 1);
      if (why) return `on the remote host: ${why}`;
      continue;
    }
    if (name === "git") {
      let i = 0;
      while (i < rest.length && rest[i].startsWith("-"))
        i += GIT_VALUE.has(rest[i]) ? 2 : 1;
      const sub = rest[i];
      const args = rest.slice(i + 1);
      if (sub === "credential") return "git credential reads a stored login";
      if (["commit", "push", "merge"].includes(sub) && args.includes("--no-verify"))
        return `git ${sub} --no-verify skips the repository's hooks`;
      if (sub === "commit" && args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a)))
        return "git commit -n skips the repository's hooks";
      if (sub === "push" && args.some((a) => /(^|[:/+])production$/.test(a)))
        return "a push to production: releases are the owner's";
      continue;
    }
    if (name === "gh") {
      const has = (w) => rest.includes(w);
      if (has("api")) return "gh api can do anything the login can: use a gh subcommand";
      if (rest[0] === "auth" && rest[1] !== "status")
        return "gh auth changes or reveals the login";
      if (["secret", "variable"].includes(rest[0]) && !["list", "get"].includes(rest[1]))
        return `gh ${rest[0]} ${rest[1] ?? ""} changes what a workflow is handed`;
      if (rest[0] === "workflow" && rest[1] === "run")
        return "a workflow started by hand is the owner's to start";
      if (
        rest[0] === "repo" &&
        ["edit", "delete", "deploy-key", "archive", "rename"].includes(rest[1])
      )
        return `gh repo ${rest[1]} changes the repository itself`;
      if (rest[0] === "pr" && rest[1] === "merge") {
        if (has("--admin")) return "the admin bypass is the owner's";
        const selector = rest.slice(2).find((a) => !a.startsWith("-"));
        let base;
        try {
          base = lookup(selector);
        } catch {
          return "the pull request's base branch could not be read, so the merge is refused";
        }
        if (base === "production")
          return "a merge into production: releases are the owner's";
      }
      continue;
    }
    if (name === "eas") {
      if (["submit", "credentials"].includes(rest[0]))
        return `eas ${rest[0]} is the owner's`;
      if (
        rest[0] === "build" &&
        rest.some((a) => a === "production" || a === "--profile=production")
      )
        return "a production build is the owner's";
      continue;
    }
    if (name === "vercel") {
      if (rest.includes("--prod") || ["promote", "rollback"].includes(rest[0]))
        return "a production deployment is the owner's";
      continue;
    }
    if (name === "security") return "the macOS keychain holds the owner's logins";
  }
  return null;
}

// Guard files: what decides what is checked, what counts as green and what is refused.
// A path ending in "/" is a folder; any other matches by its end, wherever it sits. An
// edit to one is asked of the owner. Names are compared without regard to case: this Mac's
// disk takes `Package.JSON` for `package.json`.
const GUARDED = [
  "scripts/trader-ws",
  "scripts/trader-ws.d/",
  "scripts/check-ci.sh",
  "scripts/staging.sh",
  "scripts/release-facts.sh",
  ".claude/hooks/",
  ".claude/agents/",
  ".claude/skills/",
  ".githooks/",
  ".github/workflows/",
  "pnpm-workspace.yaml",
  "eslint.config.mjs",
  "tsconfig.base.json",
  "tsconfig.json",
  "vitest.config.ts",
  ".gitleaksignore",
  ".prettierignore",
];
// Guarded at the repository's root only: the root manifest holds `check` and `lint`, while
// a package's own manifest changes with every dependency it adds; a package's `test` and
// `typecheck` scripts are guarded by what an edit changes (scriptChange, below). A relative
// path is read against the root, or against where a `cd` earlier in the command left it.
const AT_ROOT = ["package.json"];
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// The owner's alone: Claude never writes these, asked or not.
const OWNERS = [
  [".claude/settings.json", "the settings file is the owner's to apply"],
  [".claude/settings.local.json", "a local settings file would override the owner's"],
  [
    "trader/green",
    "the record of greens is written by trader-ws and scripts/staging.sh local alone",
  ],
];

const ask = (why) => ({
  decision: "ask",
  why: `${why}: show the owner the diff, and his answer here is the "apply"`,
});

// What a write to this path meets: { decision: "deny" | "ask", why }, or null.
export function guards(path, root = ROOT) {
  const p = `/${String(path).replace(/^(\.\/)+/, "")}`.toLowerCase();
  for (const [end, why] of OWNERS)
    if (p.endsWith(`/${end}`)) return { decision: "deny", why: `${end}: ${why}` };
  for (const g of GUARDED)
    if (g.endsWith("/") ? p.includes(`/${g}`) : p.endsWith(`/${g}`))
      return ask(`${g} is a guard file`);
  if (path === "") return null;
  for (const g of AT_ROOT)
    if (
      resolve(root, String(path)).toLowerCase() === join(resolve(root), g).toLowerCase()
    )
      return ask(`the root ${g} is a guard file`);
  return null;
}

// A package manifest's `test` or `typecheck` script, changed by an edit: what `pnpm check`
// runs in that package. `before` and `after` are the file's text; unreadable JSON on either
// side is taken as a change, since nothing then says what runs.
export function scriptChange(path, before, after) {
  if (basename(String(path)).toLowerCase() !== "package.json") return null;
  const scripts = (text) => {
    try {
      const s = JSON.parse(text)?.scripts ?? {};
      return JSON.stringify([s.test, s.typecheck]);
    } catch {
      return null;
    }
  };
  const a = scripts(before);
  const b = scripts(after);
  if (a !== null && a === b) return null;
  return ask("a package's test or typecheck script is a guard");
}

// Commands that read a file they are given and never change it.
const READERS = new Set(
  "cat head tail less more grep egrep fgrep rg wc ls stat file diff cmp shasum sha256sum md5 md5sum nl od xxd cut sort uniq jq test [ echo printf gitleaks shellcheck trader-ws tsc vitest".split(
    " ",
  ),
);
const GIT_WRITERS = new Set(["checkout", "restore", "mv", "rm"]);
const NAMES = [...GUARDED, ...OWNERS.map(([end]) => end)];
// A root-only name inside code counts when nothing path-like comes before it, so that
// `apps/web/package.json` in an argument is not taken for the root's.
const ROOT_NAMES = AT_ROOT.map(
  (n) => new RegExp(`(^|[^\\w./-])${n.replace(/\./g, "\\.")}`, "i"),
);
const RUNNERS = new Set([...SHELLS, "node"]);

// What a command that would change a guard file meets, or null. Reading one, running one
// and committing one are not changes.
export function touches(script, depth = 0, root = ROOT) {
  if (depth > 6) return null; // refusal() has already refused a command this deep
  const { commands, nested } = parse(script);
  for (const inner of nested) {
    const hit = touches(inner, depth + 1, root);
    if (hit) return hit;
  }
  // Where a `cd` earlier in the script has left a relative path.
  let cwd = resolve(root);
  const at = (path) =>
    guards(path, root) ??
    (cwd === resolve(root) ? null : guards(resolve(cwd, path), root));
  for (let argv of commands) {
    for (;;) {
      while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]))
        argv = argv.slice(1);
      const head = argv.length ? basename(argv[0]) : "";
      if (WRAPPERS.has(head) || head === "timeout") {
        argv = argv.slice(1);
        while (argv.length && (/^-/.test(argv[0]) || /^\d+[smhd]?$/.test(argv[0])))
          argv = argv.slice(1);
      } else if (head === "npx" || (head === "pnpm" && ["exec", "dlx"].includes(argv[1])))
        argv = argv.slice(head === "npx" ? 1 : 2);
      else break;
    }
    if (!argv.length) continue;
    const name = basename(argv[0]);
    const rest = argv.slice(1);
    if (name === "cd") {
      cwd = resolve(cwd, rest.find((a) => !a.startsWith("-")) ?? process.env.HOME ?? "/");
      continue;
    }
    if (SHELLS.has(name) || name === "eval") {
      const pos =
        name === "eval" ? -1 : rest.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      const inner = name === "eval" ? rest.join(" ") : pos === -1 ? null : rest[pos + 1];
      if (inner != null) {
        const hit = touches(inner, depth + 1, root);
        if (hit) return hit;
        continue;
      }
    }
    // `pnpm pkg set` and `npm pkg set` or `delete` write the manifest of the folder they run
    // in without naming it: at the root, a guard file.
    if (
      ["pnpm", "npm"].includes(name) &&
      rest.includes("pkg") &&
      rest.some((a) => ["set", "delete"].includes(a)) &&
      !rest.some((a) => /^(--filter|-F|--prefix|-C|--dir)(=|$)/.test(a)) &&
      cwd === resolve(root)
    )
      return ask(`${name} pkg changes the root package.json`);
    // A redirection writes whatever the command is.
    for (let i = 0; i < argv.length; i++) {
      const m = /^\d*>{1,2}\|?(.*)$/.exec(argv[i]);
      if (!m) continue;
      const hit = at(m[1] || argv[i + 1] || "");
      if (hit) return hit;
    }
    const bare = (a) => a.replace(/^--?[A-Za-z-]+=/, "").replace(/^[a-z]+=/, "");
    const words = rest.filter((a) => !/^\d*>/.test(a));
    const named = words.map((a) => at(bare(a))).filter(Boolean);
    // A guard file's name inside a longer word: code or a message, not a path argument.
    const inCode = words.some(
      (a) =>
        !at(bare(a)) &&
        (NAMES.some((g) => a.toLowerCase().includes(g)) ||
          ROOT_NAMES.some((r) => r.test(a))),
    );
    if (!named.length && !inCode) continue;
    const hit = named.find((h) => h.decision === "deny") ?? named[0];
    if (name === "git") {
      let i = 0;
      while (i < rest.length && rest[i].startsWith("-"))
        i += GIT_VALUE.has(rest[i]) ? 2 : 1;
      if (GIT_WRITERS.has(rest[i]) && hit) return hit;
      continue;
    }
    if (READERS.has(name)) continue;
    if (name === "sed" && !rest.some((a) => /^-[a-zA-Z]*i|^--in-place/.test(a))) continue;
    if (name === "find" && !rest.some((a) => /^-(delete|exec|execdir|ok)$/.test(a)))
      continue;
    if (
      (name === "prettier" || name === "eslint") &&
      !rest.some((a) => /^(--write|-w|--fix)$/.test(a))
    )
      continue;
    // Running a guard file is not changing it; code handed to an interpreter may be.
    if (RUNNERS.has(name) && !inCode) continue;
    if (at(argv[0]) && !inCode) continue;
    return hit ?? ask(`this command names a guard file inside code handed to ${name}`);
  }
  return null;
}

// The text a file would have after an Edit or a Write.
function after(input, before) {
  const t = input?.tool_input ?? {};
  if (typeof t.content === "string") return t.content;
  if (typeof t.old_string !== "string" || typeof t.new_string !== "string") return before;
  return t.replace_all
    ? before.split(t.old_string).join(t.new_string)
    : before.replace(t.old_string, () => t.new_string);
}

async function main() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    process.exit(0); // not a call this hook understands: the permission flow decides
  }
  let verdict = null;
  if (input?.tool_name === "Bash" || input?.tool_input?.command !== undefined) {
    const command = String(input?.tool_input?.command ?? "");
    const why = refusal(command);
    verdict = why ? { decision: "deny", why } : touches(command);
  } else {
    const path = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
    if (typeof path === "string") {
      verdict = guards(path);
      if (!verdict && basename(path).toLowerCase() === "package.json") {
        let before = "";
        try {
          before = readFileSync(path, "utf8");
        } catch {
          // A new manifest: everything in it is a change.
        }
        verdict = scriptChange(path, before, after(input, before));
      }
    }
  }
  if (!verdict) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.decision,
        permissionDecisionReason:
          verdict.decision === "deny"
            ? `Refused by .claude/hooks/guard.mjs: ${verdict.why}. If this is the only way to do the task, stop and ask the owner.`
            : `Asked by .claude/hooks/guard.mjs: ${verdict.why}.`,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
