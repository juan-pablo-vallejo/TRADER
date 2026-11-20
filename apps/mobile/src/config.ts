// Where the API is, and whether this build may use the development identity.
// `EXPO_PUBLIC_` means public, literally: nothing here is a secret
// and no secret is ever read by the app. A release build must be told its API; a development
// build with none set talks to `next dev` on this machine — which the Android emulator
// reaches at 10.0.2.2, the host's loopback as it sees it.
import * as Application from "expo-application";
import { Platform } from "react-native";

const configured = process.env.EXPO_PUBLIC_API_URL;

export const apiUrl: string | null =
  configured !== undefined && configured !== ""
    ? configured.replace(/\/$/, "")
    : __DEV__
      ? Platform.OS === "android"
        ? "http://10.0.2.2:3000"
        : "http://localhost:3000"
      : null;

// The development sign-in exists only in a development build that asks for it. `__DEV__` is
// false in every release build, so the branch — and the screen behind it — is not there.
export const devIdentity: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_IDENTITY === "enabled";

// The identity provider's publishable key: public by name
// and by nature, and set per build, never written in this repository — it carries the
// provider's own host. A build with the development identity on does not use it.
const clerk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const clerkKey: string | null =
  !devIdentity && clerk !== undefined && clerk !== "" ? clerk : null;

// This build's number, sent with `status.get` so the service can hold a build too old to
// sync (the kill switch), shown in Me and named on an error report. EAS assigns it
// (eas.json: the remote version source, `autoIncrement`) and writes it into the native
// project, where `expo-application` reads it back. A build made on this machine has
// whatever the generated project says, which is 1.
const native = Number(Application.nativeBuildVersion);
export const BUILD = Number.isSafeInteger(native) && native > 0 ? native : 1;

// Sentry's DSN for the phone's project: public by Sentry's own definition (it can only
// submit events), set per build like the two above. Blank: nothing is reported.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryDsn: string | null = dsn !== undefined && dsn !== "" ? dsn : null;

// Which TRADER environment this build talks to, named on an error report: `staging` for a
// preview build and `production` for a store build, stated in eas.json. Blank on a
// development machine.
const named = process.env.EXPO_PUBLIC_TRADER_ENVIRONMENT;
export const environment: string | null =
  named === "staging" || named === "production" ? named : null;
