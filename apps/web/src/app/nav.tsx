"use client";

// The office navigation: six destinations, a left column when wide and a menu when narrow.
// Static links: what a screen may do is the API's answer, not the menu's. The profile is
// reached from the name in the header. Consumed by layout.tsx.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";

import styles from "./nav.module.css";
import { strings } from "./strings";

const links: (readonly [string, string])[] = [
  ["/people", strings.nav.people],
  ["/customers", strings.nav.customers],
  ["/jobs", strings.nav.jobs],
  ["/schedule", strings.nav.schedule],
  ["/hours", strings.nav.hours],
  ["/invoices", strings.nav.invoices],
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  // Escape closes the menu and hands focus back to the button that opened it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <nav className={styles.nav} aria-label={strings.navigation} onKeyDown={onKeyDown}>
      <button
        ref={toggle}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="office-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {strings.menu}
      </button>
      <div id="office-nav" className={`${styles.groups} ${open ? styles.open : ""}`}>
        <ul className={styles.list}>
          {links.map(([href, label]) => {
            // A screen beneath a destination (an invoice's page under Invoices) keeps it
            // marked.
            const here = path === href;
            const within = here || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.link} ${within ? styles.current : ""}`}
                  aria-current={here ? "page" : within ? "true" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
