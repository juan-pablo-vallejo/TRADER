"use client";

// The reconciliation view (PRD, Office review and job cost: every worker's approved hours by
// day and job, and everything still unresolved; DESIGN, Reconciliation). The office picks a
// range of up to 31 work dates and reads `labor.hours` for it: each person's approved hours
// with their total, the range's total, and — apart, never added in — the days on which
// something waits for approval, was rejected or is still open. Read-only.
//
// Every figure is the server's: the cells, each person's sum and the range's sum are fields
// of the answer (labor/day-hours.ts), formatted here and never added or rounded in the
// browser. The range stands in for a pay period until periods exist; the adjustments a
// period carries from earlier ones join this view with them (TASKS, pay periods).
//
// One query, asked for by the form. Consumed by page.tsx.
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
import { approvedByPerson, unresolved, type Cell, type Hours } from "./reconcile-view";
import styles from "./reconciliation.module.css";

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

export function ReconciliationScreen({ devSignIn }: { devSignIn: boolean }) {
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
      <PageHeader title={strings.reconciliation} />
      <p className={`secondary ${styles.explain}`}>{strings.reconExplain}</p>
      <form
        aria-label={strings.reconciliation}
        className={controls.card}
        onSubmit={submit}
      >
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
      {asked !== null && <Reconciliation asked={asked} devSignIn={devSignIn} />}
    </>
  );
}

function Reconciliation({ asked, devSignIn }: { asked: Range; devSignIn: boolean }) {
  const trpc = useTRPC();
  const read = useQuery(trpc.labor.hours.queryOptions(asked));
  if (read.isPending) return <p className="body">{strings.loading}</p>;
  if (read.isError) {
    return (
      <Failure
        error={read.error}
        devSignIn={devSignIn}
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
      <Approved answer={answer} />
      <Unresolved cells={unresolved(answer)} />
    </>
  );
}

function Approved({ answer }: { answer: Hours }) {
  const people = approvedByPerson(answer);
  return (
    <section className={styles.section} aria-labelledby="recon-approved">
      <h2 id="recon-approved" className="heading">
        {strings.approvedHours}
      </h2>
      {people.length === 0 ? (
        <p className={`body ${styles.total}`}>{strings.noApprovedHours}</p>
      ) : (
        <>
          <p className={`body-strong ${styles.total}`}>
            {strings.reconTotal(hours(answer.totals.approvedHundredths))}
          </p>
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
const why = (c: Cell) =>
  [
    c.pendingSessions > 0 ? strings.sessionsWaiting(c.pendingSessions) : null,
    c.rejectedSessions > 0 ? strings.sessionsRejected(c.rejectedSessions) : null,
    c.openSessions > 0 ? strings.sessionsOpen(c.openSessions) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

function Unresolved({ cells }: { cells: Cell[] }) {
  if (cells.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="recon-unresolved">
      <h2 id="recon-unresolved" className="heading">
        {strings.notInHours}
      </h2>
      <p className={`secondary ${styles.explain}`}>{strings.notInHoursExplain}</p>
      {/* Each link a target of its own, never a word inside the sentence. */}
      <p className={`${controls.actions} ${styles.links}`}>
        <Link href="/approvals">{strings.decideInApprovals}</Link>
        <Link href="/ledger">{strings.repairInLedger}</Link>
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
