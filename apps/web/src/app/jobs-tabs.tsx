"use client";

// Jobs and Customers are two tabs of one place: a job belongs to a customer, and the menu
// names the place once. Links, not buttons: each tab is its own address, so a reload or a
// pasted link opens the same one. Consumed by the Jobs and Customers screens.
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./nav.module.css";
import { strings } from "./strings";

const tabs = [
  ["/jobs", strings.nav.jobs],
  ["/customers", strings.nav.customers],
] as const;

export function JobsTabs() {
  const path = usePathname();
  return (
    <nav className={styles.tabs} aria-label={strings.jobsTabs}>
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`${styles.tab} ${path === href ? styles.tabCurrent : ""}`}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
