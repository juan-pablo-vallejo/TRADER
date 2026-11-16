// Where the API is, and whether this build may use the development identity (ARCHITECTURE,
// identity adapter). `EXPO_PUBLIC_` means public, literally (RULES): nothing here is a secret
// and no secret is ever read by the app. A release build must be told its API; a development
// build with none set talks to `next dev` on this machine — which the Android emulator
// reaches at 10.0.2.2, the host's loopback as it sees it.
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

// This build's number, sent with `status.get` so the service can hold a build too old to
// sync (ARCHITECTURE, kill switch). The store builds' numbers are EAS's to assign (TASKS,
// device builds); until then every build is 1.
export const BUILD = 1;
