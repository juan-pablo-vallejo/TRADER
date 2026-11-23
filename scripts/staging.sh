#!/bin/sh
# Staging, for a session that may use its keys and may not read them. `.env.staging` is
# loaded here, for the one command asked for, and nothing of it is printed. No subcommand
# runs a command of the caller's with those keys in its environment: that would be reading
# the file by another name.
#   scripts/staging.sh url             staging's address
#   scripts/staging.sh ready           what /api/ready answers, beside main's commit
#   scripts/staging.sh names           which of the names this needs are set (names only)
#   scripts/staging.sh smoke           the browser smoke test, as the deploy job runs it
#   scripts/staging.sh look <path>...  office screens as the suite's admin, as screenshots
#                                      at 390, 768 and 1280 wide; prints where they are
#   scripts/staging.sh invite <number> <name>
#                                      one person onto staging's roster as an admin, by
#                                      the suite's admin; the number is never printed
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
file=$root/.env.staging
[ -f "$file" ] || { echo "staging.sh: no .env.staging in this clone" >&2; exit 66; }

# KEY=value lines, read as text and never run: a value with `&` or `$` in it stays a value.
while IFS= read -r line || [ -n "$line" ]; do
  case $line in '' | \#*) continue ;; esac
  name=${line%%=*}
  value=${line#*=}
  case $name in '' | *[!A-Za-z0-9_]*) continue ;; esac
  case $value in
    \"*\") value=${value#\"} value=${value%\"} ;;
    \'*\') value=${value#\'} value=${value%\'} ;;
  esac
  export "$name=$value"
done <"$file"

# The development instance's secret key, under the name the deploy job gives it or Clerk's own.
CLERK_STAGING_SECRET_KEY=${CLERK_STAGING_SECRET_KEY:-${CLERK_SECRET_KEY:-}}
export CLERK_STAGING_SECRET_KEY

is_set() { eval "[ -n \"\${$1:-}\" ]"; }
need() {
  for n in "$@"; do
    is_set "$n" || { echo "staging.sh: .env.staging does not set $n" >&2; exit 78; }
  done
}
out=${TRADER_STAGING_OUT:-$HOME/Library/Caches/TRADER/staging}

# Both sign-in tickets, made as the deploy job makes them and kept out of every log: the
# script that makes them prints each one for the runner to mask, so its output is dropped.
tickets() {
  need STAGING_URL CLERK_STAGING_SECRET_KEY E2E_ADMIN_PHONE E2E_WORKER_PHONE
  made=$(mktemp)
  trap 'rm -f "$made"' EXIT
  if ! GITHUB_ENV=$made node "$root/apps/web/e2e/tickets.ts" >/dev/null; then
    echo "staging.sh: the sign-in tickets were not made" >&2
    exit 1
  fi
  E2E_ADMIN_TICKET=$(sed -n 's/^E2E_ADMIN_TICKET=//p' "$made")
  E2E_WORKER_TICKET=$(sed -n 's/^E2E_WORKER_TICKET=//p' "$made")
  export E2E_ADMIN_TICKET E2E_WORKER_TICKET
  rm -f "$made"
}

case ${1:-} in
  url)
    need STAGING_URL
    echo "$STAGING_URL"
    ;;
  ready)
    need STAGING_URL
    echo "staging: $(curl -sS --max-time 10 "$STAGING_URL/api/ready" || echo "no answer")"
    echo "main:    $(git -C "$root" rev-parse origin/main) (origin/main as last fetched)"
    ;;
  names)
    for n in STAGING_URL STAGING_MIGRATOR_URL CLERK_STAGING_SECRET_KEY E2E_ADMIN_PHONE E2E_WORKER_PHONE VERCEL_AUTOMATION_BYPASS_SECRET; do
      if is_set "$n"; then echo "$n: set"; else echo "$n: not set"; fi
    done
    ;;
  smoke)
    tickets
    mkdir -p "$out"
    cd "$root"
    E2E_OUTPUT_DIR=$out/smoke exec pnpm e2e:staging
    ;;
  look)
    shift
    [ $# -gt 0 ] || { echo "usage: staging.sh look <path>..." >&2; exit 64; }
    for path in "$@"; do
      case $path in /*) ;; *) echo "staging.sh: a path begins with /: $path" >&2; exit 64 ;; esac
    done
    tickets
    mkdir -p "$out/look"
    cd "$root/apps/web"
    LOOK_PATHS=$* LOOK_DIR=$out/look E2E_OUTPUT_DIR=$out/look-results \
      pnpm exec playwright test -c e2e/look.config.ts
    echo "screenshots: $out/look"
    ;;
  invite)
    shift
    [ $# -eq 2 ] || { echo "usage: staging.sh invite <mobile number> <name>" >&2; exit 64; }
    tickets
    cd "$root/apps/web"
    INVITE_PHONE=$1 INVITE_NAME=$2 E2E_OUTPUT_DIR=$out/invite-results \
      pnpm exec playwright test -c e2e/invite.config.ts
    ;;
  *)
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 64
    ;;
esac
