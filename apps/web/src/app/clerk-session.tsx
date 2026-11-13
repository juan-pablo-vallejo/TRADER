"use client";

// What the office shows of a Clerk session (DESIGN, Sign-in): Sign out, and what a person
// sees when the API refuses them. Rendered only inside Clerk's provider (layout.tsx), so
// only where Clerk is this server's identity; account.tsx and failure.tsx choose by
// `useClerkOn`. A person can hold a Clerk session and still be nobody here — their number is
// on no roster, or the office deactivated them: the API answers 401 either way, and the
// screen says so and offers the one useful step, signing out, instead of a sign-in link that
// would only return them here.
import { useAuth, useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { SIGN_IN_PATH } from "../server/sign-in-paths";
import controls from "./controls.module.css";
import { EmptyState } from "./empty-state";
import { strings } from "./strings";

export function ClerkSignOut() {
  const clerk = useClerk();
  return (
    <button
      type="button"
      className={controls.textAction}
      onClick={() => void clerk.signOut({ redirectUrl: SIGN_IN_PATH })}
    >
      {strings.signOut}
    </button>
  );
}

// The header's place for the person, when `me.get` was refused.
export function ClerkHeaderRefused({ className }: { className: string | undefined }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <ClerkSignOut />;
  return (
    <a className={className} href={SIGN_IN_PATH}>
      {strings.signIn}
    </a>
  );
}

// A screen's empty state, when its query was refused for want of a user.
export function ClerkRefused() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) {
    return <EmptyState text={strings.notOnRoster} action={<ClerkSignOut />} />;
  }
  return (
    <EmptyState
      text={strings.signInToContinue}
      action={<a href={SIGN_IN_PATH}>{strings.signIn}</a>}
    />
  );
}

// Everything the browser holds was answered for one person. The office shell stays mounted
// across a sign-out and the next sign-in, so its queries would keep the last person's
// answers — their name in the header, their screens behind the next person's refusal. When
// Clerk's user changes, in either direction, every query is emptied and asked again as
// whoever is there now. Drawn once, by providers.tsx, inside the query client.
export function ClerkSessionReset() {
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  // `undefined` until Clerk has loaded: the first user seen is not a change.
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    if (last.current !== undefined && last.current !== current) {
      void queryClient.resetQueries();
    }
    last.current = current;
  }, [isLoaded, userId, queryClient]);
  return null;
}
