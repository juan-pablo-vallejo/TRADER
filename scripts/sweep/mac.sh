#!/bin/sh
# This Mac's half of the sweep (`scripts/trader-ws sweep` runs it): the iPhone cells on the
# three simulators, WebKit's web cells, and sign-in's cells against Clerk's development
# instance, one after another, as each serves on port 3000. Out: <out>/<cell>/.
#
#   scripts/sweep/mac.sh <out> [ios|web|signin]...
#
# With no part named, all three. The iPhone cells need the development build on each
# simulator (`pnpm ios`); Metro is started here and stopped after.
set -eu
out=${1:?usage: mac.sh <out> [ios|web|signin]...}
shift
[ $# -gt 0 ] || set -- ios web signin
root=$(cd "$(dirname "$0")/../.." && pwd)
rc=0
metro=

finish() {
  [ -z "$metro" ] || kill "$metro" 2>/dev/null || true
  lsof -ti tcp:"${TRADER_METRO_PORT:-8081}" -sTCP:LISTEN | xargs kill 2>/dev/null || true
}
trap finish EXIT

# A simulator's id by its name, booted.
simulator() {
  udid=$(xcrun simctl list devices available -j | node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    const all = Object.values(d).flat().filter((s) => s.name === process.argv[1]);
    process.stdout.write((all.find((s) => s.state === "Booted") ?? all[0] ?? {}).udid ?? "");
  ' "$1")
  [ -n "$udid" ] || { echo "mac.sh: no simulator named $1" >&2; return 1; }
  xcrun simctl boot "$udid" 2>/dev/null || true
  echo "$udid"
}

for part in "$@"; do
  case $part in
    ios)
      echo "== the iPhones"
      (cd "$root/apps/mobile" && EXPO_PUBLIC_DEV_IDENTITY=enabled exec pnpm exec expo start --dev-client --localhost --port "${TRADER_METRO_PORT:-8081}") \
        >"$out/.metro.log" 2>&1 &
      metro=$!
      until curl -fs -o /dev/null "http://127.0.0.1:${TRADER_METRO_PORT:-8081}/status"; do sleep 2; done
      for sim in "iPhone SE (3rd generation)" "iPhone 17" "iPhone 17 Pro Max"; do
        text="default largest"
        [ "$sim" != "iPhone 17" ] || text="default mid largest"
        udid=$(simulator "$sim") || { rc=1; continue; }
        TRADER_SWEEP_OUT=$(dirname "$out") TRADER_SWEEP_TREE=$(basename "$out") MATRIX_TEXT=$text \
          "$root/apps/mobile/.maestro/matrix.sh" ios "$udid" || rc=1
      done
      finish
      metro=
      ;;
    web)
      echo "== WebKit's web cells"
      (cd "$root" && pnpm demo --db trader_demo_websweep --reset >/dev/null)
      cd "$root/apps/web"
      SWEEP_OUT=$out SWEEP_BROWSERS=webkit pnpm exec playwright test -c e2e/sweep.config.ts || rc=1
      SWEEP_OUT=$out SWEEP_BROWSERS=webkit SWEEP_PASS=frame \
        pnpm exec playwright test -c e2e/sweep.config.ts || rc=1
      cd "$root"
      ;;
    signin)
      echo "== sign-in, with Clerk"
      "$root/scripts/staging.sh" sweep-signin "$out" || rc=1
      ;;
    *)
      echo "mac.sh: no part $part" >&2
      exit 64
      ;;
  esac
done
exit $rc
