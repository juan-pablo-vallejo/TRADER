// Who is signed in on this phone. In this build the only way in is the development identity
// (config.ts): an email, sent to the API as the two development headers, which the server
// honours only where it is enabled and never in production. The provider's own sign-in
// takes its place in TASKS R5; screens ask `useSession()` and do not know which it is.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Me = { id: string; name: string; role: "admin" | "foreman" | "worker" };
export type Session = { email: string; me: Me };

type Value = {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
};
const SessionContext = createContext<Value | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const value = useMemo(
    () => ({ session, signIn: setSession, signOut: () => setSession(null) }),
    [session],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession needs SessionProvider above it");
  return value;
}
