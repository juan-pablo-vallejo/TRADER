"use client";

// The Overview (DESIGN, Overview; PRD, Office review and job cost): what waits today, as a
// short list of counts, each a link to the screen that shows it. One read, `overview.get`;
// a zero is shown as a zero; when the read fails the screen says so and shows no number.
// Nothing here is a total of money or hours.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Failure } from "../failure";
import { day } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import { useTRPC } from "../trpc";
import styles from "./overview.module.css";

const s = strings.overview;

export function OverviewScreen({ signInHref }: { signInHref: string }) {
  const trpc = useTRPC();
  const read = useQuery(trpc.overview.get.queryOptions());
  if (read.isPending) {
    return (
      <>
        <PageHeader title={s.title} />
        <p className="body">{strings.loading}</p>
      </>
    );
  }
  if (read.isError) {
    return (
      <>
        <PageHeader title={s.title} />
        <Failure
          error={read.error}
          signInHref={signInHref}
          onRetry={() => void read.refetch()}
        />
      </>
    );
  }
  const o = read.data;
  const lines: { href: string; label: string; count: number; help?: string }[] = [
    { href: "/approvals", label: s.approvals, count: o.approvalsPending },
    {
      href: "/reconciliation",
      label: s.openSessions,
      count: o.openSessions,
      help: s.openSessionsHelp,
    },
    {
      href: "/refusals",
      label: s.refusals,
      count: o.refusedEntries,
      help: s.refusalsHelp,
    },
    { href: "/schedule", label: s.shifts, count: o.shiftsThisWeek },
    { href: "/invoices", label: s.invoicesOwed, count: o.invoicesOwed },
  ];
  return (
    <>
      <PageHeader title={s.title} />
      <p className={`secondary ${styles.explain}`}>
        {s.explain(day(o.today), o.timezone)}
      </p>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.href}>
            <Link
              href={line.href}
              className={styles.line}
              aria-label={s.open(line.label, line.count)}
            >
              <span className={`title ${styles.count}`}>{line.count}</span>
              <span className="body-strong">{line.label}</span>
              {line.help !== undefined && (
                <span className={`secondary ${styles.help}`}>{line.help}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
