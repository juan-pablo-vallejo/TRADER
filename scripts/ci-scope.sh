#!/bin/sh
# Whether a CI run may take the short path: a push to `main` whose commits since the push
# before it change Markdown alone. Prints `docs_only=true` or `docs_only=false`, for
# $GITHUB_OUTPUT. Anything it cannot tell is false, so the whole check runs: a pull request,
# `production`, a branch's first push, a commit before it that cannot be fetched.
#   EVENT=<event> REF=<ref> BEFORE=<sha> SHA=<sha> scripts/ci-scope.sh
set -u
answer() {
  echo "docs_only=$1"
  exit 0
}
[ "${EVENT:-}" = push ] && [ "${REF:-}" = refs/heads/main ] || answer false
printf '%s' "${BEFORE:-}" | grep -Eqx '[0-9a-f]{40}' || answer false
[ "$BEFORE" != 0000000000000000000000000000000000000000 ] || answer false
git fetch --no-tags --depth=1 origin "$BEFORE" >/dev/null 2>&1 || answer false
changed=$(git diff --name-only "$BEFORE" "${SHA:?}") || answer false
[ -n "$changed" ] || answer false
! printf '%s\n' "$changed" | grep -qvE '\.md$' || answer false
answer true
