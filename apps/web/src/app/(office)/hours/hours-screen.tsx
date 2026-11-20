"use client";

// Hours: every worker's hours by day and job for a range of up to 31 work dates, read
// through `labor.hours`, each with its flags, and sessions still open kept apart. Every
// entry counts; a flag says why the office may want to look. Read-only.
//
// Every figure is the server's: the cells, each person's sum and the totals are fields of
// the answer (labor/day-hours.ts), formatted here and never added or rounded in the browser.
// Consumed by page.tsx.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { EmptyState, Failure } from "../../failure";
import { Field } from "../../field";
import { Note } from "../../note";
import { addDays, hours } from "../../format";
import { PageHeader } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
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
  const { t } = useStrings();
  return (
    <>
      <PageHeader title={t.hoursTitle} />
      <p className={`secondary ${styles.explain}`}>{t.reconExplain}</p>
      <ByDates signInHref={signInHref} />
    </>
  );
}

function ByDates({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
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
      <form aria-label={t.hoursTitle} className={controls.card} onSubmit={submit}>
        <div className={styles.lookupGrid}>
          <Field id="recon-from" label={t.planFrom}>
            <input
              id="recon-from"
              className={controls.input}
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id="recon-to" label={t.planThrough}>
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
                {t.ledgerRange}
              </p>
            )}
          </Field>
        </div>
        <button type="submit" className={controls.primary}>
          {t.showHours}
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
  const { t } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    if (from === "" || to === "" || from > to) {
      setNote(t.payrollRange);
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
      setNote(t.payrollCsvSaved(file.filename, hours(file.hundredths)));
    } catch {
      setNote(t.requestFailed);
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
        {t.payrollCsv}
      </button>
      <p className={`secondary ${styles.explain}`}>{t.payrollCsvExplain}</p>
      <Note text={note} tone={saved ? "saved" : undefined} />
    </div>
  );
}

function Reconciliation({ asked, signInHref }: { asked: Range; signInHref: string }) {
  const { t, f } = useStrings();
  const trpc = useTRPC();
  // Other dates keep the rows on screen until their own arrive (providers.tsx).
  const read = useQuery(
    trpc.labor.hours.queryOptions(asked, { placeholderData: keepPreviousData }),
  );
  if (read.isPending) return <LoadingRows />;
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
  const range = `${f.day(asked.from)} – ${f.day(asked.to)}`;
  if (answer.cells.length === 0) {
    return (
      <>
        <p className={`secondary ${styles.line}`}>{range}</p>
        <EmptyState text={t.emptyReconciliation} />
      </>
    );
  }
  return (
    <>
      <p className={`secondary ${styles.line}`}>
        {range} · {t.workDatesIn(answer.timezone)}
      </p>
      <Counted
        people={hoursByPerson(answer)}
        total={t.reconTotal(hours(answer.totals.hundredths))}
      />
      <Open cells={stillOpen(answer)} />
    </>
  );
}

// Each person's hours by day and job, with the flags of the entries behind each figure.
function Counted({ people, total }: { people: PersonHours[]; total: string }) {
  const { t, f } = useStrings();
  return (
    <section className={styles.section} aria-labelledby="hours-counted">
      <h2 id="hours-counted" className="heading">
        {t.hoursHeading}
      </h2>
      {people.length === 0 ? (
        <p className={`body ${styles.total}`}>{t.noHoursYet}</p>
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
                <span>{t.hoursValue(hours(p.hundredths))}</span>
              </h3>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">{t.date}</th>
                    <th scope="col">{t.job}</th>
                    <th scope="col" className={table.number}>
                      {t.hours}
                    </th>
                    <th scope="col">{t.flags}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.cells.map((c) => {
                    const flags = c.flags.map((f) => t.reasonTags[f]).join(", ");
                    return (
                      <tr key={`${c.workDate}-${c.job.id}`}>
                        <td data-label={t.date} className="body-strong">
                          {f.weekDay(c.workDate)}
                        </td>
                        <td data-label={t.job}>{c.job.name}</td>
                        <td data-label={t.hours} className={table.number}>
                          {hours(c.hundredths)}
                        </td>
                        <td
                          data-label={t.flags}
                          data-empty={flags === "" ? "" : undefined}
                        >
                          {flags === "" ? "" : t.flagged(flags)}
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
  const { t, f } = useStrings();
  if (cells.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="hours-open">
      <h2 id="hours-open" className="heading">
        {t.notInHours}
      </h2>
      <p className={`secondary ${styles.explain}`}>{t.notInHoursExplain}</p>
      <p className={`${controls.actions} ${styles.links}`}>
        <Link href="#entries">{t.repairInLedger}</Link>
      </p>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">{t.person}</th>
            <th scope="col">{t.job}</th>
            <th scope="col">{t.date}</th>
            <th scope="col">{t.unresolvedState}</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => (
            <tr key={`${c.workDate}-${c.worker.id}-${c.job.id}`}>
              <td data-label={t.person} className="body-strong">
                {c.worker.name}
              </td>
              <td data-label={t.job}>{c.job.name}</td>
              <td data-label={t.date}>{f.weekDay(c.workDate)}</td>
              <td data-label={t.unresolvedState}>{t.sessionsOpen(c.openSessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
