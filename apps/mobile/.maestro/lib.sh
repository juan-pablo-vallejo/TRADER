#!/bin/sh
# What suite.sh and matrix.sh share: the database's answers, the API on 3000 started and
# stopped, the phone's text size, and a shift around now. Sourced, with `root`, `DB`,
# `platform` and `device` set by the caller.

# One statement's answer, as the database's own superuser, through Postgres' client over
# loopback and not through `docker compose exec`: the account that runs this on the
# workstation has no Docker. `.env` names the role, in the three lines compose reads.
pg() { sed -n "s/^$1=//p" "$root/.env" | tail -n 1; }
sql() {
  PGPASSWORD=$(pg POSTGRES_PASSWORD) psql -h 127.0.0.1 -U "$(pg POSTGRES_USER)" -d "$DB" \
    -At -v ON_ERROR_STOP=1 -f - <<SQL
$1
SQL
}

api_up() {
  (cd "$root/apps/web" && POSTGRES_DB=$DB DATABASE_URL= TRADER_DEV_IDENTITY=enabled \
    exec pnpm exec next dev --webpack -H 127.0.0.1 -p 3000 >"${TMPDIR:-/tmp}/trader-e2e-api.log" 2>&1) &
  api_pid=$!
  n=0
  until curl -fs -o /dev/null "http://localhost:3000/api/ready"; do
    n=$((n + 1))
    [ "$n" -lt 90 ] || { echo "the API did not start" >&2; exit 1; }
    sleep 1
  done
  # `next dev` compiles a route on its first request, and the API's took longer than the
  # phone's 25 s deadline on a request (src/api.ts): compiled here, before any flow asks.
  curl -s -o /dev/null --max-time 120 \
    "http://localhost:3000/api/trpc/status.get?input=%7B%22json%22%3A%7B%22protocolVersion%22%3A1%2C%22platform%22%3A%22ios%22%2C%22build%22%3A1%7D%7D"
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

# The phone's text size: its largest, or its default. The trap puts the default back if a
# flow fails at the largest.
largest_text() {
  case "$platform:$1" in
    ios:on) xcrun simctl ui "$device" content_size accessibility-extra-extra-extra-large ;;
    ios:off) xcrun simctl ui "$device" content_size large ;;
    android:on) "${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" shell settings put system font_scale 2.0 ;;
    android:off) "${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb" -s "$device" shell settings put system font_scale 1.0 ;;
  esac
}

# A shift for one person on the demo's first job, around now on the company's clock.
shift_now() {
  sql "insert into shifts
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
