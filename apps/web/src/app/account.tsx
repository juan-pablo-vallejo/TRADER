"use client";

// The signed-in person in the header (DESIGN, Layout): their name, linking to the profile, and
// Sign out. `me.get` is the one query every role may call; while it is pending or refused the
// name is absent. Sign-out posts the development route's own form (ARCHITECTURE, development
// sign-in), so it is drawn only where that route answers. Consumed by header.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import controls from "./controls.module.css";
import styles from "./account.module.css";
import { strings } from "./strings";
import { useTRPC } from "./trpc";

export function Account({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  const path = usePathname();
  const me = useQuery(trpc.me.get.queryOptions());
  if (me.isPending) return null;
  if (me.isError) {
    return devSignIn ? (
      <div className={styles.account}>
        <a className={styles.name} href="/dev-signin">
          {strings.signIn}
        </a>
      </div>
    ) : null;
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
      {devSignIn && (
        <form method="post" action="/dev-signin">
          <input type="hidden" name="intent" value="signout" />
          <button type="submit" className={controls.textAction}>
            {strings.signOut}
          </button>
        </form>
      )}
    </div>
  );
}
