#!/bin/sh
# The phone flows and layout-sweep steps a change can break, read from affected.map, for the
# changes since origin/main (its commits, and the staged, unstaged and untracked files), or
# for the files given. Never in CI.
#
#   apps/mobile/.maestro/affected.sh [file...]
#
# Prints four lines:
#   flows: <flow>...      the flows to run, on the iPhone (suite.sh's SUITE_FLOWS); "all"
#                         for the whole suite, none when nothing of the phone changed
#   steps: <step>...      the sweep's steps (matrix.sh's MATRIX_STEPS) when what a screen
#                         draws changed; "all", or none
#   android: yes|no       yes when the change touches Android's own code, and the same
#                         flows then run on the emulator too (`trader-ws android`)
#   unmapped: <file>...   phone files no line of the map matches; each runs smoke, and
#                         gets a line in the map in the same commit
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
cd "$root"
if [ $# -gt 0 ]; then
  files=$(printf '%s\n' "$@")
else
  base=$(git merge-base origin/main HEAD)
  files=$({
    git diff --name-only "$base"
    git ls-files --others --exclude-standard
  } | sort -u)
fi

flows=
steps=
android=no
unmapped=
words() { [ "$1" = - ] || echo "$1" | tr , ' '; }

while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Android's own code: its manifest and native inputs, its permission paths, and any file
  # that branches on the platform. Some Android layout rules sit in comments in the shared
  # pieces (phone-sign-in, sheet, text), which name the platform in a comment alone.
  case $f in
    *.android.* | apps/mobile/app.json | apps/mobile/package.json | apps/mobile/eas.json | \
      apps/mobile/src/location.ts | apps/mobile/src/reminders.tsx | \
      apps/mobile/src/sync/reminders.ts | apps/mobile/src/biometric*.ts | \
      apps/mobile/src/config.ts | apps/mobile/src/sign-in-provider.ts | \
      apps/mobile/src/ui/phone-sign-in.tsx | apps/mobile/src/ui/sheet.tsx | \
      apps/mobile/src/ui/text.tsx)
      android=yes
      ;;
    apps/mobile/*.ts | apps/mobile/*.tsx)
      if [ -f "$f" ] && grep -q 'Platform\.OS' "$f"; then android=yes; fi
      ;;
  esac
  case $f in
    apps/mobile/.maestro/sweep/[0-9][0-9]-*.yaml)
      steps="$steps $(basename "$f" .yaml)"
      continue
      ;;
    apps/mobile/.maestro/parts/* | apps/mobile/.maestro/*.sh | apps/mobile/.maestro/affected.map)
      flows="$flows all"
      continue
      ;;
    apps/mobile/.maestro/sweep/*)
      steps="$steps all"
      continue
      ;;
    apps/mobile/.maestro/*.yaml)
      flows="$flows $(basename "$f" .yaml)"
      continue
      ;;
  esac
  hit=
  while read -r pattern on drawn; do
    case $pattern in '' | '#'*) continue ;; esac
    # shellcheck disable=SC2254 # the pattern is the map's, matched as a pattern
    case $f in
      $pattern)
        hit=1
        flows="$flows $(words "$on")"
        steps="$steps $(words "$drawn")"
        break
        ;;
    esac
  done <"$here/affected.map"
  if [ -z "$hit" ]; then
    case $f in
      apps/mobile/*)
        unmapped="$unmapped $f"
        flows="$flows smoke"
        ;;
    esac
  fi
done <<EOF
$files
EOF

# One of each, sorted; "all" stands for every one.
list() {
  # shellcheck disable=SC2086 # one word a name
  set -- $1
  for w in "$@"; do [ "$w" != all ] || {
    echo all
    return
  }; done
  printf '%s\n' "$@" | sort -u | tr '\n' ' ' | sed 's/ $//'
}
echo "flows: $(list "$flows")"
echo "steps: $(list "$steps")"
echo "android: $android"
echo "unmapped:$unmapped"
