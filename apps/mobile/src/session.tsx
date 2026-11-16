// Who is signed in on this phone, and how a call says so. Screens ask `useSession()` and do
// not know which identity it is: the development one (config.ts) is an email sent as the
// development headers, which the server honours only where it is enabled and never in
// production. The session is kept in the device's store so the app opens signed in and a
// capture never waits on a sign-in (ARCHITECTURE, Sync protocol).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { devHeaders } from "./api";
import { devIdentity } from "./config";
import { deviceStore } from "./store/device";
import { SNAPSHOT_KEY } from "./sync/engine";

export type Session = { kind: "dev"; email: string };

const KEY = "session";

type Value = {
  // `undefined` while the store is being read at start.
  session: Session | null | undefined;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Value | null>(null);

// The headers a call carries for a session; none when nobody is signed in.
export function headersFor(session: Session | null): Record<string, string> {
  return session !== null && devIdentity ? devHeaders(session.email) : {};
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void deviceStore.read(KEY).then((raw) => {
      const kept = raw === null ? null : (JSON.parse(raw) as Session);
      // A development session means nothing to a build without the development identity.
      setSession(kept !== null && devIdentity ? kept : null);
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
