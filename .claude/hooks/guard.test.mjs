import assert from "node:assert/strict";
import { refusal } from "./guard.mjs";

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
console.log(`guard: ${refused.length} refused, ${allowed.length} allowed, as expected`);
