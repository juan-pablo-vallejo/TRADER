#!/bin/sh
# `pnpm check:fast`: the check for a commit between pushes, on what changed since origin/main
# (its commits, and the staged, unstaged and untracked files). The gate before a push is
# still `scripts/trader-ws check`, on the whole tree.
#
# A change outside apps/ and packages/ other than Markdown, or to a manifest, the lockfile,
# a tsconfig or a vitest config, can change what every package builds or tests with: that
# runs `pnpm check` instead. Otherwise: the typecheck of each changed package and of those
# that depend on it; lint and format of the changed files; the tests vitest finds related to
# the changes through imports (`--changed`); and the tests that read other packages' files
# from disk, which no import shows. Never piped: a pipe's exit status hides a red run.
set -eu
cd "$(dirname "$0")/.."
base=$(git merge-base origin/main HEAD)
changed=$({
  git diff --name-only "$base"
  git ls-files --others --exclude-standard
} | sort -u)
if [ -z "$changed" ]; then
  echo "check:fast: nothing changed since origin/main"
  exit 0
fi

wide=$(printf '%s\n' "$changed" | grep -vE '^(apps|packages)/|\.md$' || true)
wide="$wide$(printf '%s\n' "$changed" |
  grep -E '(^|/)(package\.json|pnpm-lock\.yaml|tsconfig[^/]*\.json|vitest\.config\.ts)$' || true)"
if [ -n "$wide" ]; then
  echo "check:fast: $(printf '%s\n' "$wide" | head -n 1) reaches every package, so pnpm check"
  exec pnpm check
fi

# Each changed package, with `...` so pnpm adds the packages that depend on it.
filters=
for p in apps/web apps/mobile packages/api packages/db; do
  if printf '%s\n' "$changed" | grep -q "^$p/"; then
    filters="$filters --filter ...@trader/$(basename "$p")"
  fi
done
# What still exists of the changed files: a deleted one has nothing to lint.
present=$(printf '%s\n' "$changed" | while IFS= read -r f; do [ ! -f "$f" ] || echo "$f"; done)
code=$(printf '%s\n' "$present" | grep -E '\.(ts|tsx|js|mjs|cjs)$' || true)

step() {
  echo "== $*"
  "$@"
}
if [ -n "$filters" ]; then
  # shellcheck disable=SC2086 # one word a filter
  step pnpm $filters typecheck
fi
if [ -n "$code" ]; then
  # shellcheck disable=SC2086 # one word a file; none holds a space
  step pnpm exec eslint --no-warn-ignored $code
fi
if [ -n "$present" ]; then
  # shellcheck disable=SC2086
  step pnpm exec prettier --check --ignore-unknown $present
fi
if printf '%s\n' "$changed" | grep -q '^packages/db/drizzle/'; then
  step pnpm db:migrate
fi
if [ -n "$filters" ]; then
  # shellcheck disable=SC2086
  step pnpm $filters exec vitest run --changed "$base" --passWithNoTests
fi
# They read the documents, .env.example and the other packages' source from disk.
step pnpm --filter @trader/api exec vitest run test/core/documents.test.ts \
  test/core/structure.test.ts test/contract/phone.test.ts
step pnpm --filter @trader/mobile exec vitest run test/calls.test.ts
echo "check:fast: green on what changed since $(git rev-parse --short "$base")"
