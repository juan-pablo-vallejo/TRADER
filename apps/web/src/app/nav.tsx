"use client";

// The office navigation (DESIGN, Layout: left navigation wide, a menu narrow), grouped by the
// work rather than the table; a destination is listed once its screen exists. Static links:
// what a screen may do is the API's answer, not the menu's. The profile is reached from the
// name in the header. Consumed by layout.tsx.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";

import styles from "./nav.module.css";
import { strings } from "./strings";

const groups = [
  {
    label: strings.work,
    links: [
      ["/jobs", strings.jobs],
      ["/customers", strings.customers],
      ["/assignments", strings.assignments],
      ["/closeout", strings.closeout],
      ["/materials", strings.materials],
      ["/approvals", strings.approvals],
    ],
  },
  {
    label: strings.people,
    links: [
      ["/roster", strings.roster],
      ["/crews", strings.crews],
      ["/ledger", strings.ledger],
      ["/refusals", strings.refusals],
    ],
  },
] as const;

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
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className={`label ${styles.group}`} aria-hidden="true">
              {group.label}
            </p>
            <ul className={styles.list}>
              {group.links.map(([href, label]) => {
                // A screen beneath a destination (a job's page under Jobs) keeps it marked.
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
          </section>
        ))}
      </div>
    </nav>
  );
}
