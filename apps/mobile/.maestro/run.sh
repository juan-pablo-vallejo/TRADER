#!/bin/sh
# Runs the smoke flow on a booted iOS simulator or Android emulator (TASKS R4). Needs the
# development build installed (`pnpm ios` / `pnpm android`), Metro on 8081 started with
# EXPO_PUBLIC_DEV_IDENTITY=enabled, and `next dev` on 3000 serving the demo database with
# TRADER_DEV_IDENTITY=enabled. Never in CI.
#
#   .maestro/run.sh ios <simulator udid>
#   .maestro/run.sh android <emulator serial>
set -eu
platform=$1
device=$2
here=$(dirname "$0")
link='exp+trader://?__expo_url=http%3A%2F%2Flocalhost%3A8081&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1'

case "$platform" in
  ios)
    exec maestro --device "$device" test -e LAUNCH=maestro "$here/smoke.yaml"
    ;;
  android)
    adb=${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb
    # The emulator's own loopback is not the Mac's: forward the bundler and the API.
    "$adb" -s "$device" reverse tcp:8081 tcp:8081
    "$adb" -s "$device" reverse tcp:3000 tcp:3000
    "$adb" -s "$device" shell pm clear app.jpteq.trader >/dev/null
    "$adb" -s "$device" shell am start -a android.intent.action.VIEW -d "'$link'" >/dev/null
    exec maestro --device "$device" test -e LAUNCH=adb "$here/smoke.yaml"
    ;;
  *)
    echo "usage: run.sh ios <udid> | run.sh android <serial>" >&2
    exit 64
    ;;
esac
