#!/bin/sh
# The layout sweep (sweep/) on each device given, at each text size, in English then
# Spanish: every screen and state, its picture and its view tree saved after each step, for
# scripts/sweep/check.mjs and for a person to look at. Metro must be running (see run.sh)
# and nothing else may hold the API's port: this starts the API on its own database,
# rebuilt for each run. Never in CI.
#
#   .maestro/matrix.sh ios <simulator udid>...
#   .maestro/matrix.sh android <emulator serial>...
#
# From the environment, each with its default:
#   MATRIX_TEXT        the text sizes, of default, mid and largest ("default largest")
#   MATRIX_LANG        the languages ("en es")
#   MATRIX_STEPS       the steps a batch's change can break (affected.sh), or "all" (the
#                      default): a run goes from 00-start through the last one named, as
#                      each step rests on those before it, and skips none in between
#   TRADER_API_PORT    the API's port (3000); Metro's EXPO_PUBLIC_API_URL must name it
#   TRADER_API_DIR     the folder the API runs from (apps/web; lib.sh says why)
#   TRADER_METRO_PORT  Metro's port (8081)
#   TRADER_SWEEP_DB    the demo database (trader_demo_sweep)
#   TRADER_SWEEP_OUT   where runs land (~/Library/Caches/TRADER/sweep)
#   TRADER_SWEEP_TREE  the run's folder (the commit, "-dirty" when the tree has changes, or
#                      in a copy with no history the time of the run)
#   SWEEP_PROFILE      the device's name in its cells (the simulator's name, or the
#                      emulator's AVD, lowercased, each run of other characters a hyphen)
#
# Out: $TRADER_SWEEP_OUT/<tree>/<platform>-<profile>-<text>-<language>/: <step>.png and
# .json, then <step>-2, -3… for each stop of the scroll to the screen's foot (above the
# default text), and cell.json. The last line of each run is its summary:
# "<cell>: <screens> screens, <faults> faults".
set -eu
platform=$1
shift
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
DB=${TRADER_SWEEP_DB:-trader_demo_sweep}
LUIS=luis.herrera@demo.invalid
SAM=sam.carter@demo.invalid
TOM=tom.nguyen@demo.invalid
OMAR=omar.haddad@demo.invalid
OFFICE=office@demo.invalid
api_pid=
device=
. "$here/lib.sh"

if [ -n "${TRADER_SWEEP_TREE:-}" ]; then
  tree=$TRADER_SWEEP_TREE
elif tree=$(git -C "$root" rev-parse --short HEAD 2>/dev/null); then
  [ -z "$(git -C "$root" status --porcelain)" ] || tree="$tree-dirty"
else
  tree=run-$(date +%Y%m%d-%H%M)
fi
out=${TRADER_SWEEP_OUT:-$HOME/Library/Caches/TRADER/sweep}/$tree
limit=
! command -v timeout >/dev/null 2>&1 || limit="timeout 600"
# Maestro's iOS driver can take longer to start than its own default after many runs.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}
trap 'api_down; [ -z "$device" ] || text_size default' EXIT

# The last step a run takes: the latest of MATRIX_STEPS, each of which must exist.
last=
for name in ${MATRIX_STEPS:-all}; do
  [ "$name" != all ] || {
    last=
    break
  }
  [ -f "$here/sweep/$name.yaml" ] || {
    echo "matrix.sh: no sweep step $name" >&2
    exit 64
  }
  if [ -z "$last" ] || [ "$name" \> "$last" ]; then last=$name; fi
done

# The demo, as each run starts it: the schedule enforced, the worker with a shift around now
# and Sam with none, the office's number and jobsite notes, and one person invited by
# number alone, who has no email.
prepare() {
  api_down
  (cd "$root" && pnpm demo --db "$DB" --reset >/dev/null)
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

# What a step needs changed behind the phone before it runs: the API stopped or started,
# or the database.
before() {
  case "$1" in
    # The admin's Today and Crew, each fetched as it opens, with no API.
    24-admin-today-offline) api_down ;;
    26-sign-in-refused) api_up ;;
    # Without the schedule a person on the clock may switch to any open jobsite.
    29-switch-job) sql "update companies set schedule_enforced = false;" >/dev/null ;;
    # Tom, offered a shift around now.
    31-today-offer)
      sql "update companies set schedule_enforced = true;" >/dev/null
      shift_now $TOM >/dev/null
      ;;
    # The office removes Tom's shift while the phone has no connection: his start waits on
    # the phone, then the server refuses it (schedule-refused.yaml).
    32-sync-waiting)
      api_down
      sql "delete from shifts a using users u, companies c
           where u.id = a.user_id and c.id = u.company_id and u.email = '$TOM'
             and a.work_date = (now() at time zone c.timezone)::date
             and a.locked_at is null;" >/dev/null
      ;;
    33-sync-refused) api_up ;;
    # The kill switch paused (packages/api, core/status.ts).
    34-sync-paused)
      api_down
      api_up TRADER_SYNC_MODE=paused
      ;;
  esac
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

# The device's name in its cells.
profile() {
  if [ -n "${SWEEP_PROFILE:-}" ]; then
    name=$SWEEP_PROFILE
  elif [ "$platform" = ios ]; then
    name=$(xcrun simctl list devices -j | node -e '
      const all = JSON.parse(require("node:fs").readFileSync(0, "utf8")).devices;
      const d = Object.values(all).flat().find((d) => d.udid === process.argv[1]);
      console.log(d ? d.name : process.argv[1]);' "$device")
  else
    name=$("${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" emu avd name |
      head -n 1 | tr -d '\r')
  fi
  echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//'
}

picture() {
  case "$platform" in
    ios) xcrun simctl io "$device" screenshot "$1" >/dev/null 2>&1 ;;
    android) "${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" exec-out screencap -p >"$1" ;;
  esac
}

# The screen as it is now: its picture and its view tree, at <path>.png and .json.
look() {
  picture "$1.png"
  $limit maestro --device "$device" hierarchy >"$1.json" 2>/dev/null || true
}

# What a tree holds, its words aside: a clock's second ticking is no change.
shape() {
  node -e '
    const walk = (n) => [n.attributes?.["resource-id"] ?? "", n.attributes?.bounds ?? "",
      (n.children ?? []).map(walk)];
    try {
      console.log(JSON.stringify(walk(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")))));
    } catch { console.log(""); }' "$1"
}

# Above the default text a screen is taller than the phone: scrolled to its foot, a stop
# saved each time the tree changes, at most eleven more, then, if it moved, back to its top
# for the step after. sweep/scroll.yaml drags the open sheet when one is up, else the page.
foot() {
  base=$1
  n=2
  while [ "$n" -le 12 ]; do
    run_flow scroll >/dev/null 2>&1 || return 0
    look "$base-$n"
    prev=$base
    [ "$n" -eq 2 ] || prev=$base-$((n - 1))
    if [ "$(shape "$base-$n.json")" = "$(shape "$prev.json")" ]; then
      rm -f "$base-$n.png" "$base-$n.json"
      break
    fi
    screens=$((screens + 1))
    n=$((n + 1))
  done
  [ "$n" -eq 2 ] || run_flow scroll-top >/dev/null 2>&1 || true
}

# One flow of sweep/, with the run's words, resuming the app as the step before left it.
run_flow() {
  FLOW_ENV="-e LANG=$lang -e LUIS=$LUIS -e SAM=$SAM -e TOM=$TOM -e OMAR=$OMAR -e OFFICE=$OFFICE" \
    $limit "$here/run.sh" "$platform" "$device" "sweep/$1" "${2:-resume}" allow "$LUIS"
}

# One run: the sweep's steps in order. A step that fails is a fault, and the run ends there,
# as what follows rests on it.
run() {
  text=$1
  lang=$2
  cell=$platform-$(profile)-$text-$lang
  dir=$out/$cell
  rm -rf "$dir"
  mkdir -p "$dir"
  prepare
  began=$(date +%s)
  screens=0
  faults=0
  for step in "$here"/sweep/[0-9][0-9]-*.yaml; do
    name=$(basename "$step" .yaml)
    start=resume
    [ "$name" != 00-start ] || start=fresh
    before "$name"
    # Ten minutes a step at most, where the system has `timeout` (the workstation): a driver
    # that hangs is one fault, not a run that never ends.
    if ! run_flow "$name" "$start" >"$dir/$name.log" 2>&1; then
      faults=$((faults + 1))
      picture "$dir/$name.failed.png"
      echo "fault: $cell: $name (log: $dir/$name.log)" >&2
      break
    fi
    [ "$name" != 00-start ] || continue
    look "$dir/$name"
    screens=$((screens + 1))
    [ "$text" = default ] || foot "$dir/$name"
    [ "$name" != "$last" ] || break
  done
  # What the saved view trees show (scripts/sweep/check.mjs).
  if [ "$screens" -gt 0 ]; then
    node "$root/scripts/sweep/check.mjs" --platform "$platform" --density "$(density)" \
      "$dir"/[0-9]*.json >"$dir/check.txt" 2>&1 || true
    found=$(tail -n 1 "$dir/check.txt" | sed -n 's/^\([0-9]*\) faults$/\1/p')
    faults=$((faults + ${found:-1}))
    sed '$d' "$dir/check.txt" >&2
  fi
  # Its wall time, from its first step to its check.
  seconds=$(($(date +%s) - began))
  printf '{"platform":"%s","profile":"%s","text":"%s","lang":"%s","density":%s,"screens":%s,"faults":%s,"seconds":%s}\n' \
    "$platform" "$(profile)" "$text" "$lang" "$(density)" "$screens" "$faults" "$seconds" >"$dir/cell.json"
  echo "$cell: $screens screens, $faults faults" | tee -a "$out/summary.txt"
}

for device in "$@"; do
  # From the default, whatever a stopped run left.
  text_size default
  for text in ${MATRIX_TEXT:-default largest}; do
    text_size "$text"
    for lang in ${MATRIX_LANG:-en es}; do run "$text" "$lang"; done
  done
  text_size default
done
echo "out: $out"
