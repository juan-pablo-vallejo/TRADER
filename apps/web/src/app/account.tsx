"use client";

// The signed-in person in the header (DESIGN, Layout): their name, linking to the profile, and
// Sign out. `me.get` is the one query every role may call; while it is pending or refused the
// name is absent. Sign-out is the identity's own: the development route's form where that
// route answers (ARCHITECTURE, development sign-in), Clerk's where Clerk's provider is around
// the office (clerk-session.tsx), and absent on a server with neither. Consumed by header.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEV_SIGN_IN_PATH } from "../server/sign-in-paths";
import { ClerkHeaderRefused, ClerkSignOut } from "./clerk-session";
import controls from "./controls.module.css";
import styles from "./account.module.css";
import { useClerkOn } from "./providers";
import { strings } from "./strings";
import { useTRPC } from "./trpc";

export function Account({ signInHref }: { signInHref: string }) {
  const clerk = useClerkOn();
  const devSignIn = signInHref === DEV_SIGN_IN_PATH;
  const trpc = useTRPC();
  const path = usePathname();
  const me = useQuery(trpc.me.get.queryOptions());
  if (me.isPending) return null;
  if (me.isError) {
    return (
      <div className={styles.account}>
        {clerk ? (
          <ClerkHeaderRefused className={styles.name} />
        ) : (
          <a className={styles.name} href={signInHref}>
            {strings.signIn}
          </a>
        )}
      </div>
    );
  }
  return (
    <div className={styles.account}>
      <Link
        href="/profile"
        className={`${styles.name} ${path === "/profile" ? styles.current : ""}`}
        aria-current={path === "/profile" ? "page" : undefined}
        title={strings.profile}
      >
        {me.data.name}
      </Link>
      {clerk && <ClerkSignOut />}
      {devSignIn && (
        <form method="post" action={DEV_SIGN_IN_PATH}>
          <input type="hidden" name="intent" value="signout" />
          <button type="submit" className={controls.textAction}>
            {strings.signOut}
          </button>
        </form>
      )}
    </div>
  );
}
