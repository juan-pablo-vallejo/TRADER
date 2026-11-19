"use client";

// Hours: every worker's hours by day and job for a range of up to 31 work dates, read
// through `labor.hours`, with everything still unresolved kept apart. Read-only.
//
// Every figure is the server's: the cells, each person's sum and the totals are fields of
// the answer (labor/day-hours.ts), formatted here and never added or rounded in the browser.
// Consumed by page.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { addDays, day as formatDay, hours, weekDay } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import {
  approvedByPerson,
  unresolved,
  type PersonView,
  type UnresolvedCell,
} from "./hours-view";
import styles from "./hours.module.css";

type Range = { from: string; to: string };

// The longest range the server reads at once (labor/ledger.ts).
const MAX_RANGE_DAYS = 31;

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function HoursScreen({ signInHref }: { signInHref: string }) {
  return (
    <>
      <PageHeader title={strings.hoursTitle} />
      <p className={`secondary ${styles.explain}`}>{strings.reconExplain}</p>
      <ByDates signInHref={signInHref} />
    </>
  );
}

function ByDates({ signInHref }: { signInHref: string }) {
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => addDays(today(), -6));
  const [asked, setAsked] = useState<Range | null>(null);
  const [rangeError, setRangeError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (from === "" || to === "") return;
    const bad = from > to || to > addDays(from, MAX_RANGE_DAYS - 1);
    setRangeError(bad);
    if (!bad) setAsked({ from, to });
  };
  return (
    <>
      <form aria-label={strings.hoursTitle} className={controls.card} onSubmit={submit}>
        <div className={styles.lookupGrid}>
          <Field id="recon-from" label={strings.planFrom}>
            <input
              id="recon-from"
              className={controls.input}
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id="recon-to" label={strings.planThrough}>
            <input
              id="recon-to"
              className={controls.input}
              type="date"
              required
              value={to}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "recon-range" : undefined}
              onChange={(e) => setTo(e.target.value)}
            />
            {rangeError && (
              <p id="recon-range" className={`secondary ${controls.error}`} role="alert">
                {strings.ledgerRange}
              </p>
            )}
          </Field>
        </div>
        <button type="submit" className={controls.primary}>
          {strings.showHours}
        </button>
      </form>
      {asked !== null && <Reconciliation asked={asked} signInHref={signInHref} />}
    </>
  );
}

function Reconciliation({ asked, signInHref }: { asked: Range; signInHref: string }) {
  const trpc = useTRPC();
  const read = useQuery(trpc.labor.hours.queryOptions(asked));
  if (read.isPending) return <p className="body">{strings.loading}</p>;
  if (read.isError) {
    return (
      <Failure
        error={read.error}
        signInHref={signInHref}
        onRetry={() => void read.refetch()}
      />
    );
  }
  const answer = read.data;
  const range = `${formatDay(asked.from)} – ${formatDay(asked.to)}`;
  if (answer.cells.length === 0) {
    return (
      <>
        <p className={`secondary ${styles.line}`}>{range}</p>
        <EmptyState text={strings.emptyReconciliation} />
      </>
    );
  }
  return (
    <>
      <p className={`secondary ${styles.line}`}>
        {range} · {strings.workDatesIn(answer.timezone)}
      </p>
      <Approved
        people={approvedByPerson(answer)}
        total={strings.reconTotal(hours(answer.totals.approvedHundredths))}
        none={strings.noApprovedHours}
      />
      <Unresolved cells={unresolved(answer)} explain={strings.notInHoursExplain} />
    </>
  );
}

// Each person's approved hours by day and job. `total` and `none` are the sentences for the
// whole: a range's or a period's.
function Approved({
  people,
  total,
  none,
}: {
  people: PersonView[];
  total: string;
  none: string;
}) {
  return (
    <section className={styles.section} aria-labelledby="recon-approved">
      <h2 id="recon-approved" className="heading">
        {strings.approvedHours}
      </h2>
      {people.length === 0 ? (
        <p className={`body ${styles.total}`}>{none}</p>
      ) : (
        <>
          <p className={`body-strong ${styles.total}`}>{total}</p>
          {people.map((p) => (
            <section
              key={p.worker.id}
              className={styles.person}
              aria-label={p.worker.name}
            >
              <h3 className="body-strong">
                <span>{p.worker.name}</span>
                <span>{strings.hoursValue(hours(p.approvedHundredths))}</span>
              </h3>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">{strings.date}</th>
                    <th scope="col">{strings.job}</th>
                    <th scope="col" className={table.number}>
                      {strings.hours}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.cells.map((c) => (
                    <tr key={`${c.workDate}-${c.job.id}`}>
                      <td data-label={strings.date} className="body-strong">
                        {weekDay(c.workDate)}
                      </td>
                      <td data-label={strings.job}>{c.job.name}</td>
                      <td data-label={strings.hours} className={table.number}>
                        {hours(c.approvedHundredths)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </section>
  );
}

// What a cell holds that is in no approved figure, in words: "1 waiting for approval ·
// 1 rejected".
const why = (c: UnresolvedCell) =>
  [
    c.pendingSessions > 0 ? strings.sessionsWaiting(c.pendingSessions) : null,
    c.rejectedSessions > 0 ? strings.sessionsRejected(c.rejectedSessions) : null,
    c.openSessions > 0 ? strings.sessionsOpen(c.openSessions) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

function Unresolved({ cells, explain }: { cells: UnresolvedCell[]; explain: string }) {
  if (cells.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="recon-unresolved">
      <h2 id="recon-unresolved" className="heading">
        {strings.notInHours}
      </h2>
      <p className={`secondary ${styles.explain}`}>{explain}</p>
      {/* Each link a target of its own, never a word inside the sentence. */}
      <p className={`${controls.actions} ${styles.links}`}>
        <Link href="/approvals">{strings.decideInApprovals}</Link>
        <Link href="#entries">{strings.repairInLedger}</Link>
      </p>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">{strings.person}</th>
            <th scope="col">{strings.job}</th>
            <th scope="col">{strings.date}</th>
            <th scope="col" className={table.number}>
              {strings.waitingHours}
            </th>
            <th scope="col">{strings.unresolvedState}</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => (
            <tr key={`${c.workDate}-${c.worker.id}-${c.job.id}`}>
              <td data-label={strings.person} className="body-strong">
                {c.worker.name}
              </td>
              <td data-label={strings.job}>{c.job.name}</td>
              <td data-label={strings.date}>{weekDay(c.workDate)}</td>
              <td
                data-label={strings.waitingHours}
                data-empty={c.pendingSessions === 0 ? "" : undefined}
                className={table.number}
              >
                {c.pendingSessions === 0 ? strings.none : hours(c.pendingHundredths)}
              </td>
              <td data-label={strings.unresolvedState}>{why(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
