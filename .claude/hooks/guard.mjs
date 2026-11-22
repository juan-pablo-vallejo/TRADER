#!/usr/bin/env node
// PreToolUse guard for the Bash tool. It reads the whole command, including what is handed
// to `sh -c`, `eval`, `$(...)` and `ssh <host> '...'`, and refuses the few commands
// CLAUDE.md says never to run. It is a tripwire, not a boundary: a deny rule and this file
// both read text, and text can be disguised. The boundary is that the `gh` login on this
// Mac cannot bypass production's ruleset (docs/ARCHITECTURE.md, Claude and production).
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
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

async function main() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  let command = "";
  try {
    command = String(JSON.parse(text)?.tool_input?.command ?? "");
  } catch {
    process.exit(0); // not a Bash call this hook understands: the permission flow decides
  }
  const why = refusal(command);
  if (!why) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Refused by .claude/hooks/guard.mjs: ${why}. If this is the only way to do the task, stop and ask the owner.`,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
