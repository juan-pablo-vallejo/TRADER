"use client";

// The office navigation: five destinations, a left column when wide and a menu when narrow.
// Schedule, Hours, Jobs, Invoices, People, in the order a week is worked; Today joins them
// first when it exists. Customers is a tab beside Jobs (jobs-tabs.tsx), so Jobs stays marked
// there. Static links: what a screen may do is the API's answer, not the menu's. The profile
// is behind the person's name in the header.
//
// A link fetches its screen's list when the pointer or the keyboard reaches it, so the rows
// are usually there before the click lands (providers.tsx keeps them fresh for 30 s).
// Consumed by (office)/layout.tsx.
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";

import styles from "./nav.module.css";
import { strings } from "./strings";
import { useTRPC } from "./trpc";

type Destination = {
  href: string;
  label: string;
  // Other addresses that are part of this destination.
  also?: string[];
};

const links: Destination[] = [
  { href: "/schedule", label: strings.nav.schedule },
  { href: "/hours", label: strings.nav.hours },
  { href: "/jobs", label: strings.nav.jobs, also: ["/customers"] },
  { href: "/invoices", label: strings.nav.invoices },
  { href: "/people", label: strings.nav.people },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The lists a screen opens on and that take no range. Schedule and Hours ask for a week
  // of their own choosing and keep the last one on screen while the next loads.
  const warm = (href: string) => {
    const fetch = {
      job: () => void queryClient.prefetchQuery(trpc.job.list.queryOptions()),
      customer: () => void queryClient.prefetchQuery(trpc.customer.list.queryOptions()),
      invoice: () => void queryClient.prefetchQuery(trpc.invoice.list.queryOptions()),
      roster: () => void queryClient.prefetchQuery(trpc.roster.list.queryOptions()),
    };
    if (href === "/jobs") [fetch.job, fetch.customer].forEach((f) => f());
    if (href === "/invoices") [fetch.invoice, fetch.job].forEach((f) => f());
    if (href === "/people") fetch.roster();
    // Schedule opens on the roster and the jobs beside its week.
    if (href === "/schedule") [fetch.roster, fetch.job].forEach((f) => f());
  };
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
          {links.map(({ href, label, also = [] }) => {
            // A screen beneath a destination (an invoice's page under Invoices) or beside
            // it (Customers beside Jobs) keeps it marked.
            const here = path === href;
            const within =
              here || [href, ...also].some((a) => path === a || path.startsWith(`${a}/`));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.link} ${within ? styles.current : ""}`}
                  aria-current={here ? "page" : within ? "true" : undefined}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => warm(href)}
                  onFocus={() => warm(href)}
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
