"use client";

// Hours: every worker's hours by day and job for a range of up to 31 work dates, read
// through `labor.hours`, each with its flags, and sessions still open kept apart. Every
// entry counts; a flag says why the office may want to look. Read-only.
//
// Every figure is the server's: the cells, each person's sum and the totals are fields of
// the answer (labor/day-hours.ts), formatted here and never added or rounded in the browser.
// Consumed by page.tsx.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { Note } from "../note";
import { addDays, day as formatDay, hours, weekDay } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import { type Cell, hoursByPerson, type PersonHours, stillOpen } from "./hours-view";
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
      <PayrollFile from={from} to={to} />
      {asked !== null && <Reconciliation asked={asked} signInHref={signInHref} />}
    </>
  );
}

// Payroll hours for the dates in the form, as a file: its own named button, what the file
// holds beneath it. Any range that runs forward, however long. Asked for when pressed, never
// cached: the server builds it from the ledger as it stands (api labor/export.ts), and the
// browser saves it as it came.
function PayrollFile({ from, to }: Range) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    if (from === "" || to === "" || from > to) {
      setNote(strings.payrollRange);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const file = await queryClient.fetchQuery(
        trpc.labor.export.queryOptions({ from, to }, { staleTime: 0, gcTime: 0 }),
      );
      const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setSaved(true);
      setNote(strings.payrollCsvSaved(file.filename, hours(file.hundredths)));
    } catch {
      setNote(strings.requestFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={controls.secondary}
        disabled={busy}
        onClick={() => void save()}
      >
        {strings.payrollCsv}
      </button>
      <p className={`secondary ${styles.explain}`}>{strings.payrollCsvExplain}</p>
      <Note text={note} tone={saved ? "saved" : undefined} />
    </div>
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
      <Counted
        people={hoursByPerson(answer)}
        total={strings.reconTotal(hours(answer.totals.hundredths))}
      />
      <Open cells={stillOpen(answer)} />
    </>
  );
}

// Each person's hours by day and job, with the flags of the entries behind each figure.
function Counted({ people, total }: { people: PersonHours[]; total: string }) {
  return (
    <section className={styles.section} aria-labelledby="hours-counted">
      <h2 id="hours-counted" className="heading">
        {strings.hoursHeading}
      </h2>
      {people.length === 0 ? (
        <p className={`body ${styles.total}`}>{strings.noHoursYet}</p>
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
                <span>{strings.hoursValue(hours(p.hundredths))}</span>
              </h3>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">{strings.date}</th>
                    <th scope="col">{strings.job}</th>
                    <th scope="col" className={table.number}>
                      {strings.hours}
                    </th>
                    <th scope="col">{strings.flags}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.cells.map((c) => {
                    const flags = c.flags.map((f) => strings.reasonTags[f]).join(", ");
                    return (
                      <tr key={`${c.workDate}-${c.job.id}`}>
                        <td data-label={strings.date} className="body-strong">
                          {weekDay(c.workDate)}
                        </td>
                        <td data-label={strings.job}>{c.job.name}</td>
                        <td data-label={strings.hours} className={table.number}>
                          {hours(c.hundredths)}
                        </td>
                        <td
                          data-label={strings.flags}
                          data-empty={flags === "" ? "" : undefined}
                        >
                          {flags === "" ? "" : strings.flagged(flags)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </section>
  );
}

// Sessions with no clock-out yet: their time is in no figure above until it arrives.
function Open({ cells }: { cells: Cell[] }) {
  if (cells.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="hours-open">
      <h2 id="hours-open" className="heading">
        {strings.notInHours}
      </h2>
      <p className={`secondary ${styles.explain}`}>{strings.notInHoursExplain}</p>
      <p className={`${controls.actions} ${styles.links}`}>
        <Link href="#entries">{strings.repairInLedger}</Link>
      </p>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">{strings.person}</th>
            <th scope="col">{strings.job}</th>
            <th scope="col">{strings.date}</th>
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
              <td data-label={strings.unresolvedState}>
                {strings.sessionsOpen(c.openSessions)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
