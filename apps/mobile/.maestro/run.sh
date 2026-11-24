#!/bin/sh
# Runs one flow on a booted iOS simulator or Android emulator. Needs the development build
# installed (`pnpm android`; on iOS see below), Metro on 8081 started with
# EXPO_PUBLIC_DEV_IDENTITY=enabled, and `next dev` on 3000 serving the demo database with
# TRADER_DEV_IDENTITY=enabled (suite.sh starts that one itself). Never in CI.
# Start Metro plainly: with CI=1 it does not watch files and serves a stale bundle after an
# edit. Use --clear when in doubt.
# The iOS development build: `pnpm ios` refuses a simulator since Sign in with Apple's
# entitlement is in the project (app.json, usesAppleSignIn): Expo's CLI then asks for a signing
# certificate (2026-11-23). Xcode signs a simulator build to run locally with none; unsigned,
# the build has no keychain and nothing that keeps a secret works. From apps/mobile:
#   pnpm exec expo prebuild -p ios --clean
#   (cd ios && xcodebuild -workspace TRADER.xcworkspace -scheme TRADER -configuration Debug \
#     -destination "id=<udid>" -derivedDataPath build CODE_SIGN_IDENTITY=- \
#     CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build)
#   xcrun simctl install <udid> ios/build/Build/Products/Debug-iphonesimulator/TRADER.app
#
#   .maestro/run.sh ios <simulator udid> <flow> [fresh|resume] [allow|deny|never] [email] [lands on]
#   .maestro/run.sh android <emulator serial> <flow> [fresh|resume] [allow|deny|never] [email] [lands on]
#
# `fresh` starts the app with nothing kept and signs in (the flow runs parts/sign-in.yaml);
# `resume` leaves the app as the flow before left it. `allow` or `deny` is the location
# permission of a fresh start; `never` starts unasked and fails the flow if the app asks.
set -eu
platform=$1
device=$2
flow=$3
start=${4:-fresh}
location=${5:-allow}
email=${6:-luis.herrera@demo.invalid}
# What Today shows once signed in: off the clock, unless the server already has this person
# on it (earlier-day.yaml).
lands=${7:-clock-off}
here=$(dirname "$0")
link='exp+trader://?__expo_url=http%3A%2F%2Flocalhost%3A8081&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1'

case "$platform" in
  ios)
    # A place to be, so a granted permission has something to read.
    xcrun simctl location "$device" set 41.8240,-71.4128
    # The simulator keeps a permission across a cleared app: say which this run starts
    # with. A refusing run starts unasked, so the flow answers the system's own sheet.
    if [ "$start" = fresh ]; then
      if [ "$location" = allow ]; then
        xcrun simctl privacy "$device" grant location app.jpteq.trader
      else
        xcrun simctl privacy "$device" reset location app.jpteq.trader
      fi
    fi
    # Maestro's own words for the iOS location permission at launch.
    case "$location" in
      allow) ios_location=inuse ;;
      never) ios_location=unset ;;
      *) ios_location=never ;;
    esac
    exec maestro --device "$device" test -e LAUNCH=maestro -e LOCATION="$location" \
      -e IOS_LOCATION="$ios_location" -e LANDS_ON="$lands" \
      -e EMAIL="$email" "$here/$flow.yaml"
    ;;
  android)
    adb=${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb
    # The emulator's own loopback is not the Mac's: forward the bundler and the API.
    "$adb" -s "$device" reverse tcp:8081 tcp:8081
    "$adb" -s "$device" reverse tcp:3000 tcp:3000
    # The emulator hands a fix only to an app that is already asking: keep them coming
    # for as long as the flow runs.
    (while :; do
      "$adb" -s "$device" emu geo fix -71.4128 41.8240 >/dev/null 2>&1 || true
      sleep 3
    done) &
    fixes=$!
    trap 'kill "$fixes" 2>/dev/null || true' EXIT
    if [ "$start" = fresh ]; then
      "$adb" -s "$device" shell pm clear app.jpteq.trader >/dev/null
      if [ "$location" = allow ]; then
        "$adb" -s "$device" shell pm grant app.jpteq.trader android.permission.ACCESS_FINE_LOCATION
        "$adb" -s "$device" shell pm grant app.jpteq.trader android.permission.ACCESS_COARSE_LOCATION
      else
        # A grant made through adb outlives a cleared app: take it back, so the app asks
        # and the flow answers the system's own sheet.
        "$adb" -s "$device" shell pm revoke app.jpteq.trader android.permission.ACCESS_FINE_LOCATION
        "$adb" -s "$device" shell pm revoke app.jpteq.trader android.permission.ACCESS_COARSE_LOCATION
      fi
      "$adb" -s "$device" shell am start -a android.intent.action.VIEW -d "'$link'" >/dev/null
    fi
    maestro --device "$device" test -e LAUNCH=adb -e LOCATION="$location" \
      -e LANDS_ON="$lands" -e EMAIL="$email" "$here/$flow.yaml"
    ;;
  *)
    echo "usage: run.sh ios <udid> <flow> | run.sh android <serial> <flow>" >&2
    exit 64
    ;;
esac
