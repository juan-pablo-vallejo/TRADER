#!/bin/sh
# CI's check for a machine that is not CI: the commands of .github/workflows/ci.yml's jobs
# `static`, `build` and `test`, in three lanes that run side by side after the install, as
# the three jobs do: change one, change the other. A tree is green when all three end green
# on it. It needs the local Postgres up (`pnpm db:up`); CI gets its own from a service
# container. `pnpm check:fast` is the loop between pushes.
#
# Lane A runs the typecheck, lint and build one after another, never side by side: `next
# typegen` (in the typecheck) writes apps/web/.next/types, tsc and the typed lint rules
# read it, and `next build` deletes it and writes it again. Lane B is the format check.
# Lane C migrates, then tests. Each lane logs to its own file; a red lane's last lines are
# printed, and the run ends red when any lane does.
set -eu
cd "$(dirname "$0")/.."
echo "== pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile
logs=$(mktemp -d "${TMPDIR:-/tmp}/check-ci.XXXXXX")

# A lane: its name, then its commands, each run only when the one before it passed.
lane() {
  name=$1
  shift
  began=$(date +%s)
  for c in "$@"; do
    echo "== $c"
    sh -c "$c" || return 1
  done >"$logs/$name.log" 2>&1
  echo "$(($(date +%s) - began))" >"$logs/$name.seconds"
}
lane A "pnpm typecheck" "pnpm lint" "pnpm build" &
a=$!
lane B "pnpm format:check" &
b=$!
lane C "pnpm db:migrate" "pnpm test" &
c=$!

rc=0
for pair in "A $a typecheck, lint, build" "B $b format" "C $c migrate, test"; do
  # shellcheck disable=SC2086 # the pair splits into its words
  set -- $pair
  name=$1
  pid=$2
  shift 2
  if wait "$pid"; then
    echo "== lane $name ($*): green in $(cat "$logs/$name.seconds") s"
  else
    echo "== lane $name ($*): red. Its last lines:"
    tail -n 60 "$logs/$name.log"
    rc=1
  fi
done
rm -rf "$logs"
exit $rc
