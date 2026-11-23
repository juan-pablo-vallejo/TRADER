import assert from "node:assert/strict";
import { guards, refusal, touches } from "./guard.mjs";

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
  "gh workflow run preview-phone.yml",
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
];
const denied = [
  "/Users/x/TRADER/.claude/settings.json",
  "/Users/x/TRADER/.claude/settings.local.json",
  "/Users/x/TRADER/.git/trader/green",
  ".git/trader/green",
];
const free = [
  "/Users/x/TRADER/scripts/staging.sh",
  "/Users/x/TRADER/apps/web/src/app/nav.tsx",
  "/Users/x/TRADER/docs/TASKS.md",
  "/Users/x/TRADER/scripts/trader-ws-notes.md",
];
for (const p of asked) assert.equal(guards(p)?.decision, "ask", `should ask: ${p}`);
for (const p of denied) assert.equal(guards(p)?.decision, "deny", `should deny: ${p}`);
for (const p of free) assert.equal(guards(p), null, `should pass: ${p}`);

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
  "sed -i '' s/a/b/ scripts/staging.sh",
  "echo 'see scripts/trader-ws and .claude/hooks/guard.mjs'",
  "git commit -m 'scripts/trader-ws moves into the repository'",
  "ls scripts/trader-ws.d/",
];
for (const [c, d] of changing) assert.equal(touches(c)?.decision, d, `should ${d}: ${c}`);
for (const c of unchanged) assert.equal(touches(c), null, `should pass: ${c}`);
console.log(
  `guard: ${refused.length} refused, ${allowed.length} allowed, ${asked.length + changing.length + denied.length} guard-file cases, as expected`,
);
