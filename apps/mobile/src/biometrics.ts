// Face ID or fingerprint sign-in: the phone's own lock, with its passcode standing in. Clerk's
// biometric credentials on a build with its key (@clerk/expo/biometrics, read 2026-11-23): a
// key made on this phone for the person signed in, a sign-in by it, and its revocation. The
// iOS Simulator cannot make such a key (Clerk's guide says so), so a development build with
// the development identity has a stand-in instead, which keeps the person on the phone and
// signs them in with the development headers: the simulators and Maestro walk every screen.
// When each is offered is biometric-rules.ts.
import { useBiometricCredentials } from "@clerk/expo/biometrics";
import {
  AuthenticationType,
  supportedAuthenticationTypesAsync,
} from "expo-local-authentication";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import type { Unavailable } from "./biometric-rules";
import { clerkKey } from "./config";
import type { Session } from "./session";
import { deviceStore } from "./store/device";

// What the phone's lock is called on it: an iPhone's face or finger, any Android's.
export type KeyName = "faceId" | "touchId" | "fingerprint";

export type KeySignIn =
  | { ok: true; session: Session }
  // `cancelled`: the person closed the system's sheet, which says nothing.
  | { ok: false; cancelled: boolean };

export type Biometrics = {
  name: KeyName;
  availability(): Promise<Unavailable | null>;
  // A key for whoever is signed in now; false when it was not made (cancelled, refused).
  enroll(session: Session, reason: string): Promise<boolean>;
  signIn(): Promise<KeySignIn>;
  // This phone's key, gone at the provider and on the phone. Needs the person still signed in.
  revokeHere(): Promise<void>;
};

// Who the phone's key was made for, and who said "Not now", each by roster id.
export const KEY_FOR = "biometric-key-for";
export const DECLINED_BY = "biometric-declined-by";

function useKeyName(): KeyName {
  const [name, setName] = useState<KeyName>(
    Platform.OS === "ios" ? "faceId" : "fingerprint",
  );
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void supportedAuthenticationTypesAsync()
      .then((kinds) => {
        if (
          kinds.includes(AuthenticationType.FINGERPRINT) &&
          !kinds.includes(AuthenticationType.FACIAL_RECOGNITION)
        ) {
          setName("touchId");
        }
      })
      .catch(() => undefined);
  }, []);
  return name;
}

const cancelled = (error: unknown): boolean => {
  const e = error as { code?: unknown; errors?: { code?: unknown }[] } | null;
  const codes = [
    e?.code,
    ...(Array.isArray(e?.errors) ? e.errors.map((x) => x?.code) : []),
  ];
  return codes.some((c) => typeof c === "string" && /cancel/i.test(c));
};

function useClerkBiometrics(): Biometrics {
  const credentials = useBiometricCredentials();
  const name = useKeyName();
  return useMemo(
    () => ({
      name,
      availability: async () => {
        try {
          const { unavailableReason } = await credentials.getAvailability();
          return (unavailableReason ?? null) as Unavailable | null;
        } catch {
          return "environment_unavailable";
        }
      },
      enroll: async (_session, reason) => {
        try {
          await credentials.enroll({ reason });
          return true;
        } catch {
          return false;
        }
      },
      signIn: async () => {
        try {
          const result = await credentials.signIn();
          if (result.status !== "complete" || result.createdSessionId === null) {
            return { ok: false, cancelled: false };
          }
          await result.setActive({ session: result.createdSessionId });
          return { ok: true, session: { kind: "clerk" } };
        } catch (error) {
          return { ok: false, cancelled: cancelled(error) };
        }
      },
      revokeHere: async () => {
        try {
          await credentials.revokeCurrentDeviceCredential();
        } catch {
          // Nothing to undo: the server refuses this person whatever the key says.
        }
      },
    }),
    [credentials, name],
  );
}

// The stand-in's key: the development session it was made for, kept on the phone.
const STAND_IN_KEY = "stand-in-biometric";

function useStandInBiometrics(): Biometrics {
  const name: KeyName = Platform.OS === "ios" ? "faceId" : "fingerprint";
  return useMemo(
    () => ({
      name,
      availability: async () =>
        (await deviceStore.read(STAND_IN_KEY)) === null ? "no_local_credential" : null,
      enroll: async (session) => {
        if (session.kind !== "dev") return false;
        await deviceStore.write(STAND_IN_KEY, JSON.stringify(session));
        return true;
      },
      signIn: async () => {
        const kept = await deviceStore.read(STAND_IN_KEY);
        return kept === null
          ? { ok: false, cancelled: false }
          : { ok: true, session: JSON.parse(kept) as Session };
      },
      revokeHere: async () => {
        await deviceStore.write(STAND_IN_KEY, null);
      },
    }),
    [name],
  );
}

// Which one a build has is fixed when it is built, so the hook is chosen once.
export const useBiometrics: () => Biometrics =
  clerkKey !== null ? useClerkBiometrics : useStandInBiometrics;
