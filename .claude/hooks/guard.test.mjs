import assert from "node:assert/strict";
import { guards, refusal, scriptChange, touches } from "./guard.mjs";

const base = (sel) => (sel === "41" || sel === undefined ? "production" : "main");
const refused = [
  "git push origin production",
  "git push origin HEAD:production",
  "git push origin main:refs/heads/production",
  "git -C . push origin +HEAD:production",
  "git -c push.default=current push origin production",
  "/usr/bin/git push origin production",
  "FOO=1 command git push origin production",
  "sh -c 'git push origin production'",
  'bash -lc "git push origin production"',
  "echo $(git push origin production)",
  "cd /tmp && git push origin production",
  "git commit --no-verify -m x",
  "git commit -nm x",
  "git push --no-verify origin main",
  "gh pr merge 41 --merge",
  "gh pr merge --merge",
  "gh pr merge 12 --admin --merge",
  "gh api repos/o/r/pulls/1/merge -X PUT",
  "/opt/homebrew/bin/gh api user",
  "env GH_PAGER=cat gh api user",
  "gh auth token",
  "gh auth switch --user someone",
  "gh secret set X --env production",
  "gh variable delete X --env staging",
  "gh workflow run release-phone.yml",
  "gh workflow run ci.yml",
  "gh workflow run preview-phone.yml --ref production",
  'gh workflow run "Preview builds" --ref some-branch',
  "gh workflow run preview-phone.yml -f profile=production",
  "gh repo edit --visibility private",
  "git credential fill",
  "security find-generic-password -s gh:github.com -w",
  "eas submit --platform ios",
  "eas credentials",
  "eas build --profile production --platform all",
  "vercel deploy --prod",
  "vercel promote some-url",
  "ssh buildhost 'gh api user'",
  "ssh -p 22 -o BatchMode=yes buildhost git push origin production",
  "timeout 30 git push origin production",
  "nohup git push origin production",
];
const allowed = [
  'gh workflow run "Preview builds" --ref main',
  "gh workflow run preview-phone.yml",
  "git push origin main",
  "git push -u origin item-12-sentry",
  "git push ws 0123abc:refs/trees/0123abc",
  "git diff production...main",
  "git log --oneline production..main",
  "git fetch origin production",
  "git commit -m 'explain why gh api and git push origin production are blocked'",
  'git commit -m "note: never use --no-verify"',
  "git commit -S -m x",
  "gh pr create --base production --head main --title Release --body-file -",
  "gh pr merge 12 --merge --delete-branch",
  "gh pr view 41 --json baseRefName",
  "gh run watch 123 --exit-status",
  "gh auth status",
  "gh secret list --env staging",
  "eas build --profile preview --platform all --non-interactive",
  "vercel inspect some-url",
  "ssh buildhost 'cd ~/trader && pnpm check'",
  "pnpm check",
  "grep -rn production docs/",
  "echo production",
];
for (const c of refused) assert.ok(refusal(c, base), `should refuse: ${c}`);
for (const c of allowed) assert.equal(refusal(c, base), null, `should allow: ${c}`);
// A lookup that fails refuses the merge instead of guessing.
assert.ok(
  refusal("gh pr merge 5 --merge", () => {
    throw new Error("offline");
  }),
);

// Guard files: an edit is asked of the owner; his settings and the record of greens are refused.
const asked = [
  "/Users/x/TRADER/scripts/trader-ws",
  "/Users/x/TRADER/scripts/trader-ws.d/audit",
  "/Users/x/TRADER/scripts/check-ci.sh",
  "/Users/x/TRADER/.claude/hooks/guard.mjs",
  "/Users/x/TRADER/.claude/agents/release-auditor.md",
  "/Users/x/TRADER/.claude/skills/verify/SKILL.md",
  "/Users/x/TRADER/.githooks/pre-push",
  "/Users/x/TRADER/.github/workflows/ci.yml",
  "scripts/trader-ws",
  "/Users/x/TRADER/scripts/staging.sh",
  "/Users/x/TRADER/scripts/release-facts.sh",
  "/Users/x/TRADER/pnpm-workspace.yaml",
  "/Users/x/TRADER/eslint.config.mjs",
  "/Users/x/TRADER/tsconfig.base.json",
  "/Users/x/TRADER/apps/web/tsconfig.json",
  "/Users/x/TRADER/packages/api/vitest.config.ts",
  "/Users/x/TRADER/.gitleaksignore",
  "/Users/x/TRADER/.prettierignore",
  "package.json",
  "./package.json",
  // This Mac's disk is not case-sensitive: these are the same files.
  "/Users/x/TRADER/Package.JSON",
  "/Users/x/TRADER/.Claude/Hooks/guard.mjs",
  "Scripts/Trader-WS",
];
const denied = [
  "/Users/x/TRADER/.claude/settings.json",
  "/Users/x/TRADER/.claude/settings.local.json",
  "/Users/x/TRADER/.git/trader/green",
  ".git/trader/green",
  "/Users/x/TRADER/.Claude/Settings.json",
];
const free = [
  "/Users/x/TRADER/apps/web/package.json",
  "apps/mobile/package.json",
  "/Users/x/TRADER/apps/web/src/app/nav.tsx",
  "/Users/x/TRADER/docs/TASKS.md",
  "/Users/x/TRADER/scripts/trader-ws-notes.md",
];
const root = "/Users/x/TRADER";
for (const p of asked) assert.equal(guards(p, root)?.decision, "ask", `should ask: ${p}`);
for (const p of denied)
  assert.equal(guards(p, root)?.decision, "deny", `should deny: ${p}`);
for (const p of free) assert.equal(guards(p, root), null, `should pass: ${p}`);
// The root manifest, written by its absolute path; another folder's is not the root's.
assert.equal(guards("/Users/x/TRADER/package.json", root)?.decision, "ask");
assert.equal(guards("/Users/x/other/package.json", root), null);

// A package's test and typecheck scripts: an edit that changes either is asked; one that
// adds a dependency is not.
const manifest = (test, deps = {}) =>
  JSON.stringify({
    scripts: { test, typecheck: "tsc --noEmit" },
    dependencies: deps,
  });
assert.equal(
  scriptChange("apps/web/package.json", manifest("vitest run"), manifest("true"))
    ?.decision,
  "ask",
);
assert.equal(
  scriptChange(
    "apps/web/package.json",
    manifest("vitest run"),
    manifest("vitest run", { zod: "4.0.0" }),
  ),
  null,
);
assert.equal(
  scriptChange("apps/web/package.json", manifest("vitest run"), "{")?.decision,
  "ask",
);
assert.equal(scriptChange("apps/web/src/a.ts", "x", "y"), null);

const changing = [
  ["sed -i '' s/a/b/ scripts/trader-ws", "ask"],
  ["echo x > scripts/trader-ws.d/audit", "ask"],
  ["echo x >>.githooks/pre-push", "ask"],
  ["cp /tmp/guard.mjs .claude/hooks/guard.mjs", "ask"],
  ["rm .claude/skills/verify/SKILL.md", "ask"],
  ["git checkout HEAD~3 -- scripts/check-ci.sh", "ask"],
  ["bash -c 'tee .github/workflows/ci.yml < /tmp/x'", "ask"],
  ["python3 -c \"open('scripts/trader-ws','w').write('')\"", "ask"],
  ["echo 'abc check now here' >> .git/trader/green", "deny"],
  ["cp /tmp/s.json .claude/settings.json", "deny"],
  ["jq 'del(.hooks)' .claude/settings.json > .claude/settings.json", "deny"],
  ["sed -i '' s/a/b/ scripts/staging.sh", "ask"],
  ["jq '.scripts.check=\"true\"' package.json > /tmp/p && mv /tmp/p package.json", "ask"],
  ["node -e \"fs.writeFileSync('package.json','{}')\"", "ask"],
  ["echo '{}' > packages/db/tsconfig.json", "ask"],
  // A relative path after a `cd`.
  ["cd scripts && sed -i '' s/a/b/ trader-ws", "ask"],
  ["cd .claude/hooks; echo x > guard.mjs", "ask"],
  ["cd .git && echo x >> trader/green", "deny"],
  // The root manifest, changed without being named.
  ["pnpm pkg set scripts.check=true", "ask"],
  ["npm pkg delete scripts.lint", "ask"],
  ["cp /tmp/p Package.json", "ask"],
  // A package's manifest, by pkg set in any folder; tsc and vitest writing a file.
  ["pnpm --filter @trader/web pkg set scripts.test=true", "ask"],
  ["cd apps/web && pnpm pkg set scripts.typecheck=true", "ask"],
  ["cd ~/Documents/TRADER && pnpm pkg set scripts.check=true", "ask"],
  ["tsc x.ts --outFile .claude/hooks/guard.mjs", "ask"],
  ["pnpm exec tsc -p packages/api/tsconfig.json --outDir scripts/trader-ws.d", "ask"],
  ["vitest run --reporter=json --outputFile=.github/workflows/ci.yml", "ask"],
  ["echo x > .prettierignore", "ask"],
];
const unchanged = [
  "scripts/trader-ws check",
  "sh scripts/trader-ws status",
  "trader-ws check --local",
  "cat scripts/trader-ws",
  "sed -n '1,20p' .claude/hooks/guard.mjs",
  "node .claude/hooks/guard.test.mjs",
  "git add scripts/trader-ws .claude/hooks/guard.mjs",
  "git diff -- .githooks/pre-push",
  "git log --oneline -- .github/workflows/ci.yml",
  "tail -5 .git/trader/green",
  "jq . .claude/settings.json",
  "grep -rn trader-ws scripts/",
  "pnpm check",
  "scripts/staging.sh smoke",
  "jq .scripts package.json",
  "cp /tmp/p apps/web/package.json",
  "node -e \"require('./apps/web/package.json')\"",
  "pnpm --filter @trader/web add @vercel/functions",
  "echo 'see scripts/trader-ws and .claude/hooks/guard.mjs'",
  "git commit -m 'scripts/trader-ws moves into the repository'",
  "ls scripts/trader-ws.d/",
  // Tools that read a guard file to run: no change.
  "tsc -p tsconfig.json --noEmit",
  "pnpm exec tsc -p packages/api/tsconfig.json",
  "pnpm exec vitest run --config vitest.config.ts",
  "npx vitest run --config packages/api/vitest.config.ts",
  "cd apps/web && cat package.json",
];
for (const [c, d] of changing)
  assert.equal(touches(c, 0, root)?.decision, d, `should ${d}: ${c}`);
for (const c of unchanged) assert.equal(touches(c, 0, root), null, `should pass: ${c}`);
console.log(
  `guard: ${refused.length} refused, ${allowed.length} allowed, ${asked.length + changing.length + denied.length + 4} guard-file cases, as expected`,
);
