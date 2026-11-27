#!/bin/sh
# The layout sweep (sweep/) on each device given, at the phone's default and largest text,
# in English then Spanish: every screen and state, its picture and its view tree saved after
# each step, for check-hierarchy.mjs and for a person to look at. Metro must be running (see
# run.sh) and nothing else may hold port 3000: this starts the API on its own database,
# `trader_demo_sweep`, rebuilt for each run. Never in CI.
#
#   .maestro/matrix.sh ios <simulator udid>...
#   .maestro/matrix.sh android <emulator serial>...
#
# MATRIX_TEXT=largest (or default) runs one text size alone.
#
# Out: $TRADER_SWEEP_OUT (default ~/Library/Caches/TRADER/sweep)/<commit>/<device>/<text>/
# <language>/<step>.png and .json. The last line of each run is its summary:
# "<device> <text> <language>: <screens> screens, <faults> faults".
set -eu
platform=$1
shift
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
DB=trader_demo_sweep
LUIS=luis.herrera@demo.invalid
SAM=sam.carter@demo.invalid
OFFICE=office@demo.invalid
api_pid=
device=
. "$here/lib.sh"

# The commit, or, in a copy with no history (the workstation's), the time of the run.
if commit=$(git -C "$root" rev-parse --short HEAD 2>/dev/null); then
  [ -z "$(git -C "$root" status --porcelain)" ] || commit="$commit-dirty"
else
  commit=run-$(date +%Y%m%d-%H%M)
fi
out=${TRADER_SWEEP_OUT:-$HOME/Library/Caches/TRADER/sweep}/$commit
limit=
! command -v timeout >/dev/null 2>&1 || limit="timeout 600"
# Maestro's iOS driver can take longer to start than its own default after many runs.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}
trap 'api_down; [ -z "$device" ] || largest_text off' EXIT

# The demo, as each run starts it: the schedule enforced, the worker with a shift around now
# and Sam with none, the office's number and jobsite notes, and one person invited by
# number alone, who has no email.
prepare() {
  api_down
  (cd "$root" && pnpm demo --db $DB --reset >/dev/null)
  sql "update companies set phone = '(401) 555-0142', schedule_enforced = true;
       update jobs set notes = 'Gate code 4411. Park on the street.';
       insert into users (company_id, name, role, sign_in_phone)
       select company_id, 'Number Sign-in', 'worker', '+14015550109' from users
       where email = '$OFFICE';" >/dev/null
  shift_now $LUIS >/dev/null
  sql "delete from shifts a using users u, companies c
       where u.id = a.user_id and c.id = u.company_id and u.email = '$SAM'
         and a.work_date = (now() at time zone c.timezone)::date;" >/dev/null
  api_up
}

# Pixels to a point: iOS's tree is in points already; Android's in pixels, at its density.
density() {
  case "$platform" in
    ios) echo 1 ;;
    android)
      "${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" shell wm density |
        awk '/density/ { d = $NF } END { print d / 160 }'
      ;;
  esac
}

picture() {
  case "$platform" in
    ios) xcrun simctl io "$device" screenshot "$1" >/dev/null 2>&1 ;;
    android) "${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" exec-out screencap -p >"$1" ;;
  esac
}

# One run: the sweep's steps in order. A step that fails is a fault, and the run ends there,
# as what follows rests on it.
run() {
  text=$1
  lang=$2
  dir=$out/$device/$text/$lang
  mkdir -p "$dir"
  prepare
  screens=0
  faults=0
  for step in "$here"/sweep/[0-9][0-9]-*.yaml; do
    name=$(basename "$step" .yaml)
    start=resume
    [ "$name" != 00-start ] || start=fresh
    # Ten minutes a step at most, where the system has `timeout` (the workstation): a driver
    # that hangs is one fault, not a run that never ends.
    if ! FLOW_ENV="-e LANG=$lang -e LUIS=$LUIS -e SAM=$SAM -e OFFICE=$OFFICE" \
      $limit "$here/run.sh" "$platform" "$device" "sweep/$name" "$start" allow "$LUIS" \
      >"$dir/$name.log" 2>&1; then
      faults=$((faults + 1))
      picture "$dir/$name.failed.png"
      echo "fault: $device $text $lang: $name (log: $dir/$name.log)" >&2
      break
    fi
    [ "$name" != 00-start ] || continue
    picture "$dir/$name.png"
    $limit maestro --device "$device" hierarchy >"$dir/$name.json" 2>/dev/null || true
    screens=$((screens + 1))
  done
  # What the saved view trees show: nameless or small controls, text past the edge or cut.
  if [ "$screens" -gt 0 ]; then
    node "$here/check-hierarchy.mjs" "$platform" "$(density)" "$dir"/[0-9]*.json \
      >"$dir/check.txt" 2>&1 || true
    found=$(tail -n 1 "$dir/check.txt" | sed -n 's/^\([0-9]*\) faults$/\1/p')
    faults=$((faults + ${found:-1}))
    sed '$d' "$dir/check.txt" >&2
  fi
  echo "$device $text $lang: $screens screens, $faults faults" | tee -a "$out/summary.txt"
}

for device in "$@"; do
  # From the default, whatever a stopped run left.
  largest_text off
  for text in ${MATRIX_TEXT:-default largest}; do
    if [ "$text" = largest ]; then largest_text on; else largest_text off; fi
    run "$text" en
    run "$text" es
  done
  largest_text off
done
echo "out: $out"
