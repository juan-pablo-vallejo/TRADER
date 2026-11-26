"use client";

// What stands in for a page that could not be shown: a wrong address (not-found.tsx) or a
// screen that threw (error.tsx). A short label, the heading the focus lands on, one sentence,
// the way on, and a reference for support: the address asked for, or the error's code.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import styles from "./status-screen.module.css";

type Action =
  | { label: string; href: string; primary?: boolean }
  | { label: string; onClick: () => void; primary?: boolean };

export function StatusScreen({
  code,
  title,
  body,
  actions,
  reference,
}: {
  code: string;
  title: string;
  body: string;
  actions: Action[];
  // Said after the label "Reference"; the address shown when not given.
  reference?: string;
}) {
  const { t } = useStrings();
  const path = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  // The page changed under the person: the focus starts at what it now says.
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className={styles.screen}>
      <title>{`${title} · TRADER`}</title>
      <div className={styles.column}>
        <p className={`secondary ${styles.code}`}>{code}</p>
        <h1 ref={heading} tabIndex={-1} className={`title ${styles.title}`}>
          {title}
        </h1>
        <p className={`body ${styles.body}`}>{body}</p>
        <div className={styles.actions}>
          {actions.map((action) => {
            const className = action.primary ? controls.primary : controls.secondary;
            return "href" in action ? (
              <Link key={action.label} className={className} href={action.href}>
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                className={className}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            );
          })}
        </div>
        <p className={`secondary ${styles.reference}`}>
          {t.fallback.reference}: <code>{reference ?? path}</code>
        </p>
      </div>
    </div>
  );
}
