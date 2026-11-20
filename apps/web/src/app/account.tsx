"use client";

// The signed-in person in the header: their name, which opens a small menu with their
// settings, the other language and Sign out. `me.get` is the one query every role may call; while it is pending or refused the
// name is absent. Sign-out is the identity's own: the development route's form where that
// route answers, Clerk's where Clerk's provider is around
// the office (clerk-session.tsx), and absent on a server with neither. Consumed by header.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEV_SIGN_IN_PATH } from "../server/sign-in-paths";
import { ClerkHeaderRefused, ClerkSignOut } from "./clerk-session";
import controls from "./controls.module.css";
import styles from "./account.module.css";
import { useClerkOn } from "./providers";
import { useStrings } from "./i18n";
import { LANGUAGES } from "./i18n/language";
import { useTRPC } from "./trpc";

export function Account({ signInHref }: { signInHref: string }) {
  const { t, language, setLanguage } = useStrings();
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
            {t.signIn}
          </a>
        )}
      </div>
    );
  }
  // The person's name opens what is theirs: Settings, and Sign out. A native
  // disclosure: it opens by pointer, Enter or Space, and Escape closes it with the focus
  // back on the name.
  return (
    <details
      className={styles.account}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary className={styles.name} title={t.account}>
        <span className={styles.nameText}>{me.data.name}</span>
      </summary>
      <div className={styles.menu}>
        <Link
          href="/settings"
          className={`${styles.item} ${path === "/settings" ? styles.current : ""}`}
          aria-current={path === "/settings" ? "page" : undefined}
        >
          {t.settings.title}
        </Link>
        {/* The other language, under its own name and marked as that language, so a
            person who cannot read this one still finds theirs. */}
        {LANGUAGES.filter((l) => l !== language).map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            className={controls.textAction}
            onClick={() => setLanguage(l)}
          >
            {t.languages[l]}
          </button>
        ))}
        {clerk && <ClerkSignOut />}
        {devSignIn && (
          <form method="post" action={DEV_SIGN_IN_PATH}>
            <input type="hidden" name="intent" value="signout" />
            <button type="submit" className={controls.textAction}>
              {t.signOut}
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
