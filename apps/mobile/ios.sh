#!/bin/sh
# The development build on an iPhone simulator, then the bundler: `pnpm ios [udid]`, the
# booted simulator when no udid is given. `expo run:ios` asks for a signing certificate,
# because the project carries Sign in with Apple's entitlement (app.json, usesAppleSignIn);
# a simulator build runs with none, so Xcode builds it unsigned here. Unsigned, it has no
# keychain, so nothing that keeps a secret works in it.
set -eu
cd "$(dirname "$0")"
udid=${1:-$(xcrun simctl list devices booted | sed -n 's/.*(\([0-9A-F-]\{36\}\)) (Booted).*/\1/p' | head -n 1)}
[ -n "$udid" ] || { echo "ios.sh: boot a simulator first, or name its udid" >&2; exit 64; }
pnpm exec expo prebuild -p ios --clean
(cd ios && xcodebuild -workspace TRADER.xcworkspace -scheme TRADER -configuration Debug \
  -destination "id=$udid" -derivedDataPath build CODE_SIGN_IDENTITY=- \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build -quiet)
xcrun simctl install "$udid" ios/build/Build/Products/Debug-iphonesimulator/TRADER.app
exec pnpm exec expo start --dev-client
