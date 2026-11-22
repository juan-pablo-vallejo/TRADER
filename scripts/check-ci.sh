#!/bin/sh
# CI's `check`, step for step and in its order (.github/workflows/ci.yml, job `check`), for
# a machine that is not CI: change one, change the other. `pnpm check` is the quick loop and
# skips the build and the migration; a tree is green when this ends green on it. It needs
# the local Postgres up (`pnpm db:up`); CI gets its own from a service container.
# One command a line, so that the first failure ends the run.
set -eu
cd "$(dirname "$0")/.."
step() {
  echo "== $*"
  "$@"
}
step pnpm install --frozen-lockfile
step pnpm typecheck
step pnpm lint
step pnpm format:check
step pnpm build
step pnpm db:migrate
step pnpm test
