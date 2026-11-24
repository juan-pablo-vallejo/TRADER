// Who is signed in on this phone, and how a call says so. Screens ask `useSession()` and do
// not know which identity it is. The provider's is a session it keeps in the
// secure store, sent as its short-lived token on every call; the development one
// (config.ts) is an email sent as the development headers, which the server honours only
// where it is enabled and never in production. That somebody is signed in is kept in the
// device's store, apart from the provider: the app opens on the clock with no network, and
// a capture never waits on a session. A token the provider
// cannot give is a call with no identity, which the server answers 401; the sync layer
// then says to sign in again and keeps every record.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getClerkInstance } from "@clerk/expo";

import { devHeaders, type DevWho } from "./api";
import { clerkKey, devIdentity } from "./config";
import { deviceStore } from "./store/device";
import { SNAPSHOT_KEY } from "./sync/engine";
import { bearerFrom } from "./token";

export type Session = ({ kind: "dev" } & DevWho) | { kind: "clerk" };

const KEY = "session";

type Value = {
  // `undefined` while the store is being read at start.
  session: Session | null | undefined;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Value | null>(null);

// The headers a call carries for a session; none when nobody is signed in.
export async function headersFor(
  session: Session | null | undefined,
): Promise<Record<string, string>> {
  if (session === null || session === undefined) return {};
  if (session.kind === "dev") return devIdentity ? devHeaders(session) : {};
  return clerkKey === null ? {} : bearer();
}

// The provider's token for this moment, as the header the server's adapter reads; a call
// is not made at all while the provider is still loading or cannot mint one (token.ts).
export function bearer(): Promise<Record<string, string>> {
  return bearerFrom(() => {
    const clerk = getClerkInstance();
    return { loaded: clerk.loaded, session: clerk.session };
  });
}

// A kept session means something only to a build that has its kind of identity.
const usable = (kept: Session | null): Session | null =>
  kept === null
    ? null
    : kept.kind === "dev"
      ? devIdentity
        ? kept
        : null
      : clerkKey !== null
        ? kept
        : null;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void deviceStore.read(KEY).then((raw) => {
      setSession(usable(raw === null ? null : (JSON.parse(raw) as Session)));
    });
  }, []);
  // The snapshot says whose records a push sends (engine.ts): it never outlives the
  // session it was pulled under, in either direction.
  const signIn = useCallback(async (next: Session) => {
    await deviceStore.write(SNAPSHOT_KEY, null);
    await deviceStore.write(KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const signOut = useCallback(async () => {
    // The outbox stays: its records are their owner's and go when they sign in again.
    await deviceStore.write(KEY, null);
    await deviceStore.write(SNAPSHOT_KEY, null);
    if (clerkKey !== null) {
      // The provider's own session goes too; offline it goes when it next can.
      try {
        await getClerkInstance().signOut();
      } catch {
        // Nothing to undo: this phone no longer sends anything as that person.
      }
    }
    setSession(null);
  }, []);
  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession needs SessionProvider above it");
  return value;
}
