"use client";

// The signed-in person in the header: their name, which opens a small menu with their
// settings, the other language and Sign out. `me.get` is the one query every role may call; while it is pending or refused the
// name is absent. Sign-out is the identity's own: the development route's form where that
// route answers, Clerk's where Clerk's provider is around
// the office (clerk-session.tsx), and absent on a server with neither.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { DEV_SIGN_IN_PATH } from "../server/sign-in-paths";
import { ClerkHeaderRefused, ClerkSignOut } from "./clerk-session";
import controls from "./controls.module.css";
import styles from "./account.module.css";
import { useClerkOn } from "./providers";
import { useStrings } from "./i18n";
import { KEYS_HELP_EVENT } from "./keyboard-rows";
import { LANGUAGES } from "./i18n/language";
import { blocking } from "./failure";
import { firstName } from "./format";
import { useTRPC } from "./trpc";

export function Account({ signInHref }: { signInHref: string }) {
  const { t, language, setLanguage } = useStrings();
  const clerk = useClerkOn();
  const devSignIn = signInHref === DEV_SIGN_IN_PATH;
  const trpc = useTRPC();
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const open = menu.current;
      if (open?.open && !open.contains(e.target as Node)) open.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const me = useQuery(trpc.me.get.queryOptions());
  if (me.isPending) return null;
  // Signed out only when the server says so, or nothing was ever read: a refresh that
  // failed keeps the name (failure.tsx, blocking).
  if (blocking([me]) !== undefined || me.data === undefined) {
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
  // A choice made, or a press anywhere outside, closes the menu; a native disclosure
  // otherwise stays open over the screen it led to.
  const close = () => {
    if (menu.current === null) return;
    menu.current.open = false;
    // The focus stays on the person's name, not on a link the menu has just hidden.
    menu.current.querySelector("summary")?.focus();
  };
  // The person's name opens what is theirs: Settings, and Sign out. A native
  // disclosure: it opens by pointer, Enter or Space, and Escape closes it with the focus
  // back on the name.
  return (
    <details
      ref={menu}
      className={styles.account}
      // The focus leaving the menu closes it, as a click elsewhere does (below).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          e.currentTarget.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary className={styles.name} title={t.account}>
        <span className={styles.nameText}>{me.data.name}</span>
        {/* At phone width the first name alone, kept whole beside the company's. */}
        <span className={styles.firstName}>{firstName(me.data.name)}</span>
      </summary>
      <div className={styles.menu}>
        <Link
          href="/settings"
          onClick={close}
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
            onClick={() => {
              close();
              setLanguage(l);
            }}
          >
            {t.languages[l]}
          </button>
        ))}
        <button
          type="button"
          className={controls.textAction}
          onClick={() => {
            close();
            document.dispatchEvent(new Event(KEYS_HELP_EVENT));
          }}
        >
          {t.keys.open}
        </button>
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
