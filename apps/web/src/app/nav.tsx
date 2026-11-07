"use client";

// The office navigation (DESIGN, Layout: left navigation wide, a menu narrow). Static links;
// what a screen may do is the API's answer, not the menu's. Consumed by layout.tsx.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import styles from "./nav.module.css";
import { strings } from "./strings";

const links = [
  ["/roster", strings.roster],
  ["/customers", strings.customers],
  ["/crews", strings.crews],
  ["/profile", strings.profile],
] as const;

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav className={styles.nav} aria-label={strings.navigation}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="office-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {strings.menu}
      </button>
      <ul id="office-nav" className={`${styles.list} ${open ? styles.open : ""}`}>
        {links.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              className={`${styles.link} ${path === href ? styles.current : ""}`}
              aria-current={path === href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
