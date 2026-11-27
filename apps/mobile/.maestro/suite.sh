#!/bin/sh
# The phone app's flow suite on one device. Every
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
ELENA=elena.petrov@demo.invalid
MARCUS=marcus.bell@demo.invalid
OFFICE=office@demo.invalid
api_pid=
. "$here/lib.sh"

expect() {
  got=$(sql "$2")
  if [ "$got" != "$3" ]; then
    echo "FAILED: $1: expected '$3', the server holds '$got'" >&2
    exit 1
  fi
  echo "ok: $1"
}
trap 'api_down; largest_text off' EXIT
flow() { "$here/run.sh" "$platform" "$device" "$@"; }

events_of() {
  echo "select count(*) from entries e join users u on u.id = e.worker_id
        where u.email = '$1'
          and e.client_timestamp > now() - interval '1 hour'"
}

(cd "$root" && pnpm demo --db $DB --reset >/dev/null)
# What the office would have typed: its number, which the office's WhatsApp button opens a
# chat with, and notes on every jobsite, which the job's sheet shows.
sql "update companies set phone = '(401) 555-0142';
     update jobs set notes = 'Gate code 4411. Park on the street.';"
api_up

echo "— sign-in: refused, the code step, in Spanish"
flow sign-in-refused fresh allow nobody.invited@demo.invalid
flow sign-in-refused fresh allow 4015550199
expect "an address no company has added bound nobody" \
  "select count(*) from users where identity_subject like 'dev:nobody%' or identity_subject = 'dev:+14015550199'" 0
flow sign-in-codes fresh allow $LUIS
flow sign-in-spanish fresh allow $LUIS

echo "— smoke"
flow smoke

# A link to a screen the app does not have: the not-found screen, and the way back.
flow not-found

echo "— clock, with a connection"
flow clock
expect "six events, once each" "$(events_of $LUIS)" 6
expect "in the order they were made" \
  "select string_agg(e.type::text, ',' order by e.client_timestamp, e.id)
   from entries e join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'" \
  "started,ended,started,paused,resumed,ended"
expect "on two jobs" \
  "select count(distinct e.job_id) from entries e
   join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'" 2
expect "captured with a connection" \
  "select count(*) from entries e join users u on u.id = e.worker_id
   where u.email = '$LUIS' and e.client_timestamp > now() - interval '1 hour'
     and e.captured_offline" 0

expect "with the location, where the permission was granted" \
  "select count(*) > 0 from entries e join users u on u.id = e.worker_id
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
  "select count(*) || ' ' || count(e.location_lat) from entries e
   join users u on u.id = e.worker_id where u.email = '$OMAR'
     and e.client_timestamp > now() - interval '1 hour'" "2 0"

echo "— a session left open from an earlier day"
sql "insert into entries
       (id, company_id, worker_id, job_id, type, client_timestamp, server_timestamp,
        clock_skewed, clock_skew_ms, schema_version, time_set_by_user, captured_offline,
        initiator_user_id)
     select uuidv7(), u.company_id, u.id, j.id, 'started',
       now() - interval '26 hours', now() - interval '26 hours', false, 0, 1, false, false, u.id
     from users u join jobs j on j.company_id = u.company_id
       and j.name = 'Whitmore exterior repaint'
     where u.email = '$ELENA';"
flow earlier-day fresh allow $ELENA clock-working
expect "yesterday's session is closed, by one clock-out" \
  "select count(*) from entries e join users u on u.id = e.worker_id
   where u.email = '$ELENA' and e.type = 'ended'
     and e.client_timestamp > now() - interval '1 hour'" 1

echo "— location stamps off for one person"
# A worker for this flow: an admin's Today has no clock-in.
sql "update users set location_stamps = false, role = 'worker' where email = '$MARCUS';"
flow stamps-off fresh never $MARCUS
expect "two entries, neither with a location, neither flagged for one" \
  "select count(*) || ' ' || count(e.location_lat) || ' '
     || count(*) filter (where 'location' = any (e.flags))
   from entries e join users u on u.id = e.worker_id
   where u.email = '$MARCUS' and e.client_timestamp > now() - interval '1 hour'" "2 0 0"

echo "— the weekly schedule, enforced"
sql "update companies set schedule_enforced = true;"
shift_now $LUIS
flow schedule
expect "the start locked its shift" \
  "select count(*) from shifts a join users u on u.id = a.user_id
   where u.email = '$LUIS' and a.locked_at is not null" 1
flow schedule-none fresh allow $SAM

echo "— a start the server refuses"
shift_now $TOM
flow schedule-offered fresh allow $TOM
sql "delete from shifts a using users u
     where u.id = a.user_id and u.email = '$TOM' and a.locked_at is null;"
flow schedule-refused resume
expect "nothing was written" "$(events_of $TOM)" 0

echo "— a schedule changed while the phone was offline"
shift_now $ANA
flow schedule-offered fresh allow $ANA
api_down
sql "delete from shifts a using users u
     where u.id = a.user_id and u.email = '$ANA' and a.locked_at is null;"
# Long enough that the phone's last word from the API is stale (clock.ts): what it
# captures now says it was captured offline.
sleep 135
flow schedule-stale-capture resume
api_up
flow schedule-stale-review resume
expect "the start is stored, flagged as unscheduled" \
  "select count(*) from entries e
   join users u on u.id = e.worker_id
   where u.email = '$ANA' and e.captured_offline and 'unscheduled' = any (e.flags)" 1

echo "— the Crew tab, as the admin"
sql "delete from shifts a using users u, companies c
     where u.id = a.user_id and c.id = u.company_id and u.email = '$SAM'
       and a.work_date = (now() at time zone c.timezone)::date and a.locked_at is null;"
flow crew fresh allow $OFFICE crew
expect "the shift the admin added is on the server, today, on that jobsite" \
  "select count(*) from shifts a
   join users u on u.id = a.user_id join companies c on c.id = u.company_id
   join jobs j on j.id = a.job_id
   where u.email = '$SAM' and j.name = 'Harbor View unit 4B'
     and a.work_date = (now() at time zone c.timezone)::date" 1

echo "— Face ID or fingerprint, Google and Apple"
flow biometric fresh allow $LUIS
# At the phone's largest text size, and back to the default after.
largest_text on
flow biometric-largest-text fresh allow $TOM
largest_text off
flow social fresh allow $LUIS
flow biometric-key-set fresh allow $OMAR
sql "update users set deactivated_at = now() where email = '$OMAR';"
flow biometric-key-refused resume
# The office changed the sign-in address of the person whose key this phone holds: the key
# is older than the change, so a sign-in by it is refused and the key goes.
flow biometric-key-set fresh allow $ELENA
sql "insert into address_changes (company_id, user_id, field, old_value, new_value, changed_by_user_id)
     select p.company_id, p.id, 'email', p.email, 'elena.moved@demo.invalid', o.id
     from users p join users o on o.email = '$OFFICE' where p.email = '$ELENA';"
flow biometric-key-refused resume

# By number: every demo person is bound to their email by now, so one is invited by number
# alone, as the office would, and the number binds them.
echo "— sign-in by number"
sql "insert into users (company_id, name, role, sign_in_phone)
     select company_id, 'Number Sign-in', 'worker', '+14015550109' from users
     where email = '$OFFICE';"
flow sign-in-number fresh allow 4015550109
expect "the number bound the person invited by it" \
  "select identity_subject from users where name = 'Number Sign-in'" "dev:+14015550109"

echo "— an email added by its person, proved by a code"
flow add-email resume
expect "the email is the person's, recorded as their own change" \
  "select u.email || ' ' || (a.changed_by_user_id = u.id) from users u
     join address_changes a on a.user_id = u.id where u.name = 'Number Sign-in'" \
  "number.added@demo.invalid true"

echo "all flows green on $platform"
