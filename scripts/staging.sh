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
#                                      one person onto staging's people as an admin, by
#                                      the suite's admin; the number is never printed
#   scripts/staging.sh local           the office's sign-in against real Clerk on this Mac:
#                                      resets trader_demo_clerk, runs e2e/clerk.config.ts
#                                      on localhost with the development instance's keys,
#                                      and records "<tree> clerk <when> mac" when green
#   scripts/staging.sh local only <pattern>
#                                      the tests whose names match; records nothing
#   scripts/staging.sh local serve     the same server and database, and no test
#   scripts/staging.sh passkey         the passkey test alone, against staging, by ticket
#   scripts/staging.sh sample          staging's API timed: seven office reads, five rounds,
#                                      one call a second, as the suite's admin; writes
#                                      sample/<commit>.json and prints a summary
#   scripts/staging.sh reset           empties staging's database, migrates it, and onboards
#                                      "Demo Painting Co." (the Demo flag on) with the
#                                      suite's admin and worker; prints the company's id
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
  loaded="${loaded:-} $name"
done <"$file"

is_set() { eval "[ -n \"\${$1:-}\" ]"; }
need() {
  for n in "$@"; do
    is_set "$n" || { echo "staging.sh: .env.staging does not set $n" >&2; exit 78; }
  done
}
out=${TRADER_STAGING_OUT:-$HOME/Library/Caches/TRADER/staging}

# For a run on this Mac: the development instance's two keys under Clerk's own names, the
# suite's two numbers, and nothing else of the file. Local development never connects to a
# deployed database, so every other name the file set is dropped before anything starts.
# The publishable key is public (staging's own /sign-in carries it); it is read from there
# when the file does not name one.
local_env() {
  need CLERK_SECRET_KEY E2E_ADMIN_PHONE E2E_WORKER_PHONE
  if ! is_set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; then
    need APP_URL
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$(curl -sS --max-time 15 "$APP_URL/sign-in" |
      grep -o 'pk_test_[A-Za-z0-9+/=]*' | head -n 1) || true
    [ -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ] || {
      echo "staging.sh: staging's /sign-in names no publishable key; add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to .env.staging" >&2
      exit 78
    }
  fi
  secret=$CLERK_SECRET_KEY
  for n in $loaded; do
    case $n in
      E2E_ADMIN_PHONE | E2E_WORKER_PHONE | NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ;;
      *) unset "$n" ;;
    esac
  done
  CLERK_SECRET_KEY=$secret secret=
  DATABASE_URL= TRADER_DEV_IDENTITY= CLERK_AUTHORIZED_PARTIES=http://localhost:3000
  export CLERK_SECRET_KEY NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY DATABASE_URL \
    TRADER_DEV_IDENTITY CLERK_AUTHORIZED_PARTIES
}

# The working tree as git sees it, untracked files included, through a temporary index, as
# scripts/trader-ws names it: a green names the tree it ran on.
tree_id() {
  t=$(mktemp -u "${TMPDIR:-/tmp}/staging-index.XXXXXX")
  (cd "$root" && GIT_INDEX_FILE=$t git add -A && GIT_INDEX_FILE=$t git write-tree)
  rm -f "$t"
}

# Both sign-in tickets, made as the deploy job makes them and kept out of every log: the
# script that makes them prints each one for the runner to mask, so its output is dropped.
tickets() {
  need APP_URL CLERK_SECRET_KEY E2E_ADMIN_PHONE E2E_WORKER_PHONE
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
    need APP_URL
    echo "$APP_URL"
    ;;
  ready)
    need APP_URL
    echo "staging: $(curl -sS --max-time 10 "$APP_URL/api/ready" || echo "no answer")"
    echo "main:    $(git -C "$root" rev-parse origin/main) (origin/main as last fetched)"
    ;;
  names)
    for n in APP_URL MIGRATOR_URL CLERK_SECRET_KEY E2E_ADMIN_PHONE E2E_WORKER_PHONE VERCEL_AUTOMATION_BYPASS_SECRET; do
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
  sample)
    need APP_URL
    tickets
    mkdir -p "$out/sample"
    commit=$(curl -sS --max-time 10 "$APP_URL/api/ready" | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')
    [ -n "$commit" ] || { echo "staging.sh: staging named no commit" >&2; exit 1; }
    cd "$root/apps/web"
    SAMPLE_FILE=$out/sample/$commit.json E2E_OUTPUT_DIR=$out/sample-results \
      pnpm exec playwright test -c e2e/sample.config.ts
    ;;
  local)
    shift
    case ${1:-} in
      '' | serve) ;;
      only) [ $# -eq 2 ] || { echo "usage: staging.sh local only <pattern>" >&2; exit 64; } ;;
      *) echo "usage: staging.sh local [serve | only <pattern>]" >&2; exit 64 ;;
    esac
    local_env
    cd "$root"
    pnpm demo --db trader_demo_clerk --reset
    cd "$root/apps/web"
    if [ "${1:-}" = serve ]; then
      # POSTGRES_DB here and in the suite's own server, not before: the demo refuses a
      # target that is already the configured database.
      # `localhost`, not 127.0.0.1: Clerk passes a request on by rewriting it to its own URL,
      # and Next proxies a rewrite to a host it is not bound to as an outside address.
      POSTGRES_DB=trader_demo_clerk exec pnpm exec next dev --webpack -H localhost -p 3000
    fi
    mkdir -p "$out"
    if [ "${1:-}" = only ]; then
      E2E_OUTPUT_DIR=$out/clerk-results exec pnpm exec playwright test -c e2e/clerk.config.ts -g "$2"
    fi
    before=$(tree_id)
    E2E_OUTPUT_DIR=$out/clerk-results pnpm exec playwright test -c e2e/clerk.config.ts
    after=$(tree_id)
    [ "$before" = "$after" ] || { echo "staging.sh: the tree changed during the run; nothing recorded" >&2; exit 1; }
    ledger=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)/trader/green
    mkdir -p "$(dirname "$ledger")"
    printf '%s clerk %s mac\n' "$after" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$ledger"
    echo "clerk suite green on tree $after"
    ;;
  reset)
    # Staging holds fictional data alone (CLAUDE.md, Staging is yours). The migrating role
    # owns the schema and bypasses row-level security, as onboarding requires; the runtime
    # role trader_app is the cluster's and keeps its password. Nothing of the URL is printed.
    need MIGRATOR_URL E2E_ADMIN_PHONE E2E_WORKER_PHONE
    psql "$MIGRATOR_URL" -X -q -v ON_ERROR_STOP=1 \
      -c 'DROP SCHEMA IF EXISTS drizzle CASCADE' -c 'DROP SCHEMA public CASCADE' \
      -c 'CREATE SCHEMA public' >/dev/null
    cd "$root"
    DATABASE_URL=$MIGRATOR_URL TRADER_MIGRATE_PURPOSE=deploy pnpm db:migrate >/dev/null
    said=$(DATABASE_URL=$MIGRATOR_URL pnpm --silent --filter @trader/db onboard \
      --company "Demo Painting Co." --timezone America/New_York --next-invoice 1001 \
      --admin-name "Staging Admin" --admin-phone "$E2E_ADMIN_PHONE" --demo --apply)
    company=$(printf '%s\n' "$said" | sed -n 's/.*: company \([0-9a-f-]*\),.*/\1/p')
    [ -n "$company" ] || { echo "staging.sh: onboarding named no company" >&2; exit 1; }
    psql "$MIGRATOR_URL" -X -q -v ON_ERROR_STOP=1 -v company="$company" \
      -v phone="$E2E_WORKER_PHONE" >/dev/null <<'SQL'
INSERT INTO users (company_id, sign_in_phone, name, role)
VALUES (:'company', :'phone', 'Staging Worker', 'worker');
SQL
    echo "staging reset: one migration applied; company $company (Demo), its admin and worker"
    ;;
  passkey)
    tickets
    cd "$root/apps/web"
    E2E_OUTPUT_DIR=$out/passkey-results exec pnpm exec playwright test -c e2e/passkey.config.ts
    ;;
  *)
    sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
    exit 64
    ;;
esac
