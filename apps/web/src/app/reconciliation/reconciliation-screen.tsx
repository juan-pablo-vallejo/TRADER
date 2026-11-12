"use client";

// The reconciliation view (PRD, Office review and job cost: for a pay period, every worker's
// approved hours by day and job, everything still unresolved, and every adjustment the period
// carries from earlier ones; DESIGN, Reconciliation, Adjustment line). The office picks a pay
// period — the view opens on the next one to close — and reads `payPeriod.read` for it: each
// person's hours with their total, the period's total, then apart the adjustments it carries
// as signed lines, and apart again the days on which something waits for approval, was
// rejected or is still open. A closed period shows what its close stored, which never moves.
// "Other dates" reads a range of up to 31 work dates through `labor.hours` instead: days in
// no period, or across two. Read-only.
//
// Every figure is the server's: the cells, each person's sum, the totals and the adjustments
// are fields of the answers (pay-periods/read.ts, labor/day-hours.ts), formatted here and
// never added or rounded in the browser.
//
// The calendar is one query; the chosen period or range is another. Consumed by page.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { addDays, day as formatDay, dayIn, hours, signedHours, weekDay } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import {
  approvedByPerson,
  DATES,
  defaultChoice,
  periodByPerson,
  unresolved,
  type Calendar,
  type PeriodRead,
  type PersonView,
  type UnresolvedCell,
} from "./reconcile-view";
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

const rangeOf = (r: { startsOn: string; endsOn: string }) =>
  strings.periodRange(formatDay(r.startsOn), formatDay(r.endsOn));

export function ReconciliationScreen({
  devSignIn,
  initialPeriod,
}: {
  devSignIn: boolean;
  initialPeriod: string | null;
}) {
  const trpc = useTRPC();
  const calendar = useQuery(trpc.payPeriod.list.queryOptions());
  // Null until the office chooses: the view then opens where the calendar says.
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title={strings.reconciliation} />
      <p className={`secondary ${styles.explain}`}>{strings.reconExplain}</p>
      {calendar.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : calendar.isError ? (
        <Failure
          error={calendar.error}
          devSignIn={devSignIn}
          onRetry={() => void calendar.refetch()}
        />
      ) : (
        <Chosen
          calendar={calendar.data}
          choice={chosen ?? defaultChoice(calendar.data, initialPeriod)}
          onChoose={setChosen}
          devSignIn={devSignIn}
        />
      )}
    </>
  );
}

function Chosen({
  calendar,
  choice,
  onChoose,
  devSignIn,
}: {
  calendar: Calendar;
  choice: string;
  onChoose: (choice: string) => void;
  devSignIn: boolean;
}) {
  return (
    <>
      {calendar.periods.length === 0 ? (
        <>
          <p className={`secondary ${styles.explain}`}>{strings.reconNoPeriods}</p>
          <p className={`${controls.actions} ${styles.links}`}>
            <Link href="/pay-periods">{strings.goToPayPeriods}</Link>
          </p>
        </>
      ) : (
        <Field id="recon-period" label={strings.reconPeriod}>
          <select
            id="recon-period"
            className={controls.select}
            value={choice}
            onChange={(e) => onChoose(e.target.value)}
          >
            {calendar.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {strings.reconPeriodOption(rangeOf(p), p.closed !== null)}
              </option>
            ))}
            <option value={DATES}>{strings.reconOtherDates}</option>
          </select>
        </Field>
      )}
      {choice === DATES ? (
        <ByDates devSignIn={devSignIn} />
      ) : (
        // Keyed, so one period's answer is never shown under another's name.
        <ByPeriod key={choice} periodId={choice} devSignIn={devSignIn} />
      )}
    </>
  );
}

function ByDates({ devSignIn }: { devSignIn: boolean }) {
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

function ByPeriod({ periodId, devSignIn }: { periodId: string; devSignIn: boolean }) {
  const trpc = useTRPC();
  const read = useQuery(trpc.payPeriod.read.queryOptions({ periodId }));
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
  const closed = answer.period.closed;
  return (
    <>
      <p className={`secondary ${styles.line}`}>
        {rangeOf(answer.period)} · {strings.workDatesIn(answer.timezone)}
      </p>
      <p className={`secondary ${styles.state}`}>
        {closed === null
          ? strings.reconPeriodOpen
          : strings.reconPeriodClosed(dayIn(closed.at, answer.timezone), closed.by.name)}
      </p>
      <Approved
        people={periodByPerson(answer)}
        total={strings.reconPeriodTotal(hours(answer.approved.total))}
        none={
          closed === null ? strings.noApprovedInPeriod : strings.noHoursInClosedPeriod
        }
      />
      <Adjustments answer={answer} />
      <Unresolved
        cells={answer.unresolved.cells}
        explain={
          closed === null ? strings.notInHoursExplain : strings.notInHoursClosedExplain
        }
      />
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

// The adjustments a period carries (DESIGN, Adjustment line): apart from its own hours, each
// a signed line with the day it was worked, never part of a day's total. An open period that
// is not the next to close carries none yet, and says which period will.
function Adjustments({ answer }: { answer: PeriodRead }) {
  const { lines, total, carriedBy } = answer.adjustments;
  return (
    <section className={styles.section} aria-labelledby="recon-adjustments">
      <h2 id="recon-adjustments" className="heading">
        {strings.adjustments}
      </h2>
      <p className={`secondary ${styles.explain}`}>
        {answer.period.closed === null
          ? strings.adjustmentsOpenExplain
          : strings.adjustmentsClosedExplain}
      </p>
      {carriedBy !== null ? (
        <p className={`body ${styles.total}`}>
          {strings.periodAdjustmentsJoin(rangeOf(carriedBy))}
        </p>
      ) : lines.length === 0 ? (
        <p className={`body ${styles.total}`}>{strings.noAdjustments}</p>
      ) : (
        <>
          <p className={`body-strong ${styles.total}`}>
            {strings.adjustmentsTotal(signedHours(total))}
          </p>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">{strings.person}</th>
                <th scope="col">{strings.job}</th>
                <th scope="col">{strings.dateWorked}</th>
                <th scope="col" className={table.number}>
                  {strings.hours}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.workDate}-${l.worker.id}-${l.job.id}`}>
                  <td data-label={strings.person} className="body-strong">
                    {l.worker.name}
                  </td>
                  <td data-label={strings.job}>{l.job.name}</td>
                  {/* Reads on its own in a narrow row, where no heading stands over it. */}
                  <td data-label={strings.dateWorked}>
                    {strings.workedOn(weekDay(l.workDate))}
                  </td>
                  <td data-label={strings.hours} className={table.number}>
                    {signedHours(l.hundredths)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

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
