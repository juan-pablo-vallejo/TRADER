#!/bin/sh
# The field app's flow suite on one device (TASKS, mobile flow suite; R5, S7, S8). Every
# flow that writes is followed by a read of the server's own tables. The demo database
# `trader_demo_e2e` is rebuilt first, so a run starts from the same place every time; it is
# a local database made for this and nothing else. The suite starts and stops `next dev`
# itself, because two flows need the API to be unreachable for a while. Metro must already
# be running (see run.sh), and nothing else may hold port 3000. Never in CI.
#
#   .maestro/suite.sh ios <simulator udid>
#   .maestro/suite.sh android <emulator serial>
set -eu
platform=$1
device=$2
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
DB=trader_demo_e2e
LUIS=luis.herrera@demo.invalid
ANA=ana.ruiz@demo.invalid
TOM=tom.nguyen@demo.invalid
SAM=sam.carter@demo.invalid
OMAR=omar.haddad@demo.invalid
api_pid=

# One statement's answer, as the database's own superuser inside its container: the
# container's environment names the role, so nothing of `.env` is read here.
sql() {
  (cd "$root" && docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d $DB -At -v ON_ERROR_STOP=1 -f -") <<SQL
$1
SQL
}
expect() {
  got=$(sql "$2")
  if [ "$got" != "$3" ]; then
    echo "FAILED: $1: expected '$3', the server holds '$got'" >&2
    exit 1
  fi
  echo "ok: $1"
}
api_up() {
  (cd "$root/apps/web" && POSTGRES_DB=$DB DATABASE_URL= TRADER_DEV_IDENTITY=enabled \
    exec pnpm exec next dev --webpack -p 3000 >"${TMPDIR:-/tmp}/trader-e2e-api.log" 2>&1) &
  api_pid=$!
  n=0
  until curl -fs -o /dev/null "http://localhost:3000/api/ready"; do
    n=$((n + 1))
    [ "$n" -lt 90 ] || { echo "the API did not start" >&2; exit 1; }
    sleep 1
  done
}
api_down() {
  if [ -n "$api_pid" ]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
    api_pid=
  fi
  # `next dev` leaves a child holding the port.
  lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill 2>/dev/null || true
}
trap api_down EXIT
flow() { "$here/run.sh" "$platform" "$device" "$@"; }

# A shift for one person on the first job of crew A, around now on the company's clock.
shift_now() {
  sql "insert into job_assignments
         (company_id, user_id, job_id, work_date, expected_start, expected_end)
       select u.company_id, u.id, j.id, l.t::date,
         case when l.t::time < time '01:00' then time '00:00'
              else (l.t - interval '1 hour')::time end,
         case when l.t::time >= time '21:59' then time '23:59'
              else (l.t + interval '2 hours')::time end
       from users u
       join companies c on c.id = u.company_id
       join jobs j on j.company_id = c.id and j.name = 'Whitmore exterior repaint'
       cross join lateral (select date_trunc('minute', now() at time zone c.timezone) as t) l
       where u.email = '$1';"
}
events_of() {
  echo "select count(*) from work_session_events e join users u on u.id = e.worker_id
        where u.email = '$1'
          and e.client_timestamp > now() - interval '1 hour'"
}

(cd "$root" && pnpm demo --db $DB --reset >/dev/null)
api_up

echo "— smoke"
flow smoke

echo "— clock, with a connection"
flow clock
expect "six events, once each" "$(events_of $LUIS)" 6
expect "in the order they were made" \
  "select string_agg(e.type::text, ',' order by e.client_timestamp, e.id)
   from work_session_events e join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'" \
  "started,ended,started,paused,resumed,ended"
expect "on two jobs" \
  "select count(distinct e.job_id) from work_session_events e
   join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'" 2
expect "captured with a connection" \
  "select count(*) from work_session_events e join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'
     and e.captured_offline" 0

expect "with the location, where the permission was granted" \
  "select count(*) > 0 from work_session_events e join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'
     and e.location_lat is not null" t

echo "— capture with the API unreachable, then deliver"
api_down
flow offline-capture resume
api_up
expect "nothing arrived while it was down" "$(events_of $LUIS)" 6
flow deliver resume
expect "two more events, once each" "$(events_of $LUIS)" 8
flow deliver resume
expect "a second send adds nothing" "$(events_of $LUIS)" 8

echo "— location refused"
flow location-denied fresh deny $OMAR
expect "the entries have no location" \
  "select count(*) || ' ' || count(e.location_lat) from work_session_events e
   join users u on u.id = e.worker_id where u.email = '$OMAR'
     and e.client_timestamp > now() - interval '1 hour'" "2 0"

echo "— the weekly schedule, enforced"
sql "update companies set schedule_enforced = true;"
shift_now $LUIS
flow schedule
expect "the start locked its shift" \
  "select count(*) from job_assignments a join users u on u.id = a.user_id
   where u.email = '$LUIS' and a.locked_at is not null" 1
flow schedule-none fresh allow $SAM

echo "— a start the server refuses"
shift_now $TOM
flow schedule-offered fresh allow $TOM
sql "delete from job_assignments a using users u
     where u.id = a.user_id and u.email = '$TOM' and a.locked_at is null;"
flow schedule-refused resume
expect "nothing was written" "$(events_of $TOM)" 0
expect "the refusal left a line for the office" \
  "select count(*) from sync_diagnostics d join users u on u.id = d.user_id
   where u.email = '$TOM' and d.code = 'not_scheduled'" 1

echo "— a schedule changed while the phone was offline"
shift_now $ANA
flow schedule-offered fresh allow $ANA
api_down
sql "delete from job_assignments a using users u
     where u.id = a.user_id and u.email = '$ANA' and a.locked_at is null;"
# Long enough that the phone's last word from the API is stale (clock.ts): what it
# captures now says it was captured offline.
sleep 135
flow schedule-stale-capture resume
api_up
flow schedule-stale-review resume
expect "the start is stored and waits for the office, as unscheduled" \
  "select count(*) from work_session_events e
   join users u on u.id = e.worker_id
   join approvals p on p.event_id = e.id
   where u.email = '$ANA' and e.captured_offline and p.decision is null
     and 'unscheduled' = any (p.reasons)" 1

echo "all flows green on $platform"
