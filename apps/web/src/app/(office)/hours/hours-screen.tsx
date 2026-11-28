"use client";

// Hours: a week of every person's hours, people by days, read through `labor.hours`.
// Each cell is a day's hours with its flags as badges; a row ends in the person's week,
// and a row of each day's sum closes the table. A range that is not a week is a list by
// person, date and jobsite. Sessions still open stand in a strip above: none of their time
// is in any figure. Every entry counts; a flag says why the office may want to look.
//
// Every figure is the server's (labor/day-hours.ts): a person's day, a person's sum, a
// day's sum and the total are fields of the answer, formatted here and never added or
// rounded in the browser. The dates and the presets live in the address
// (use-url-filters.ts), so a reload or a pasted link shows the same thing.
//
// The strip reads the same answer as the table, so with Flagged only on it lists only the
// open sessions whose cell is flagged. A `location` flag reads "No location" or "Off-site"
// in the day panel, where each entry says whether a stamp was recorded; in the week table a
// day's badge reads "location", since a day's flags are a sum over entries and
// `labor.hours` does not say which kind.
//
// A cell opens that person's day in the side panel (day-panel.tsx), and which panel is open
// is in the address too.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { DataTable, type Column } from "../../data-table";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { Field } from "../../field";
import { hours } from "../../format";
import { useStrings } from "../../i18n";
import { Note } from "../../note";
import { PageHeader } from "../../page-header";
import { FlagBadges, StatusBadge } from "../../status-badge";
import { useTRPC } from "../../trpc";
import { useAsked, useUrlFilters } from "../../use-url-filters";
import { DayPanel } from "./day-panel";
import {
  DAY_FILTERS,
  daysIn,
  HOURS_FILTERS,
  isWeek,
  listRows,
  panelOf,
  rangeOf,
  stillOpen,
  weekOf,
  weekRows,
  weekTotals,
  type Cell,
  type Hours,
  type Range,
  type WeekRow,
} from "./hours-view";
import styles from "./hours.module.css";

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function HoursScreen({ signInHref }: { signInHref: string }) {
  const { t, f } = useStrings();
  const [filters, setFilters] = useUrlFilters(HOURS_FILTERS);
  const [dayFilters, setDay] = useUrlFilters(DAY_FILTERS);
  const panel = panelOf(dayFilters);
  const range = rangeOf(filters, today());
  const flagged = filters.flagged === "1";
  // The dates in the form: the range on screen until someone types others.
  const shown = range ?? weekOf(today());
  const person = /^[0-9a-f-]{36}$/.test(filters.person) ? filters.person : null;
  // The band's main fact: the total for the dates shown. The same read the table makes
  // (Shown, below), so one request answers both.
  const trpc = useTRPC();
  const total = useQuery(
    trpc.labor.hours.queryOptions(
      {
        ...shown,
        ...(flagged && { flagged: true }),
        ...(person !== null && { workerId: person }),
      },
      { placeholderData: keepPreviousData, enabled: range !== null },
    ),
  );
  const [draft, setDraft] = useState<Range | null>(null);
  const typed = draft ?? shown;
  // The two fields keep their own values, as sign-in's does: React empties a field it holds
  // as it takes the page over, and dates typed before then were put back to the range
  // shown. Typed before then: a field's value is not the one its markup came with
  // (`defaultValue`), and those dates are the draft. After that, the fields follow the
  // range shown whenever nothing typed is waiting.
  const fromField = useRef<HTMLInputElement>(null);
  const toField = useRef<HTMLInputElement>(null);
  const tookOver = useRef(false);
  // Dates typed before the take-over, held until they are the draft: a development double
  // mount runs this again before the draft arrives, and would put them back.
  const early = useRef<Range | null>(null);
  useEffect(() => {
    const from = fromField.current;
    const to = toField.current;
    if (from === null || to === null) return;
    if (!tookOver.current) {
      tookOver.current = true;
      if (from.value !== from.defaultValue || to.value !== to.defaultValue) {
        early.current = { from: from.value, to: to.value };
        setDraft(early.current);
        return;
      }
    }
    if (draft !== null) {
      early.current = null;
      return;
    }
    if (early.current !== null) return;
    from.value = shown.from;
    to.value = shown.to;
  }, [draft, shown.from, shown.to]);
  // Whether the dates in the form, typed or shown, are a range the rule refuses: said under
  // the field as they are typed, and cleared as soon as they are a range again.
  const refused =
    draft === null
      ? range === null
      : rangeOf({ ...filters, range: "dates", ...draft }, today()) === null;
  const [exportingHere, setExporting] = useState(false);
  // The command menu's Export hours asks for the same dialog by the address.
  const [asked, clearAsked] = useAsked("export");
  const exporting = exportingHere || asked;
  const preset =
    filters.range === "dates" ? null : filters.range === "last" ? "last" : "this";

  const choose = (name: "this" | "last") => {
    setDraft(null);
    setFilters({ range: name, from: "", to: "" });
  };
  // The dates typed become the range. A range the rule refuses keeps what was typed in
  // its fields, under the reason, rather than falling back to this week.
  const apply = () => {
    const asked = { ...filters, range: "dates", from: typed.from, to: typed.to };
    setFilters({ range: "dates", from: typed.from, to: typed.to });
    if (rangeOf(asked, today()) !== null) setDraft(null);
    return rangeOf(asked, today());
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply();
  };
  const said = (r: Range) => `${f.day(r.from)} – ${f.day(r.to)}`;

  return (
    <>
      <PageHeader
        title={t.hoursTitle}
        fact={
          range === null || total.data === undefined
            ? undefined
            : {
                label: said(range),
                value: t.hoursValue(hours(total.data.totals.hundredths)),
              }
        }
      />
      <p className={`secondary ${styles.explain}`}>{t.reconExplain}</p>
      <div className={styles.presets} role="group" aria-label={t.hoursTitle}>
        <button
          type="button"
          className={controls.secondary}
          aria-pressed={preset === "this"}
          onClick={() => choose("this")}
        >
          {t.week.thisWeek}
        </button>
        <button
          type="button"
          className={controls.secondary}
          aria-pressed={preset === "last"}
          onClick={() => choose("last")}
        >
          {t.week.lastWeek}
        </button>
        <label className={controls.check}>
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFilters({ flagged: e.target.checked ? "1" : "" })}
          />
          <span>{t.week.flaggedOnly}</span>
        </label>
      </div>
      <form aria-label={t.week.dates} className={controls.card} onSubmit={submit}>
        <div className={styles.lookupGrid}>
          <Field id="hours-from" label={t.planFrom}>
            <input
              ref={fromField}
              id="hours-from"
              className={controls.input}
              type="date"
              required
              defaultValue={typed.from}
              onChange={(e) => setDraft({ ...typed, from: e.target.value })}
            />
          </Field>
          <Field id="hours-to" label={t.planThrough}>
            <input
              ref={toField}
              id="hours-to"
              className={controls.input}
              type="date"
              required
              defaultValue={typed.to}
              aria-invalid={refused}
              aria-describedby={refused ? "hours-range" : undefined}
              onChange={(e) => setDraft({ ...typed, to: e.target.value })}
            />
            {refused && (
              <p id="hours-range" className={`secondary ${controls.error}`} role="alert">
                {t.hoursRange}
              </p>
            )}
          </Field>
        </div>
        <div className={controls.actions}>
          <button type="submit" className={controls.secondary}>
            {t.week.show}
          </button>
          <button
            type="button"
            className={controls.secondary}
            disabled={refused}
            onClick={() => {
              // Export takes the dates just typed, as Show would.
              if (draft === null || apply() !== null) setExporting(true);
            }}
          >
            {t.week.export}
          </button>
        </div>
      </form>
      {exporting && range !== null && (
        <ExportDialog
          range={range}
          said={said(range)}
          onClose={() => {
            setExporting(false);
            clearAsked();
          }}
        />
      )}
      {range !== null && (
        <Shown
          range={range}
          said={said(range)}
          flagged={flagged}
          person={person}
          onEveryone={() => setFilters({ person: "" })}
          signInHref={signInHref}
          onOpen={(workerId, day) => setDay({ who: workerId, day })}
        />
      )}
      {panel !== null && (
        <DayPanel
          // Another person or day is another panel, with its own editors.
          key={`${panel.workerId}-${panel.day}`}
          workerId={panel.workerId}
          day={panel.day}
          signInHref={signInHref}
          onClose={() => setDay({ who: "", day: "" })}
        />
      )}
    </>
  );
}

function Shown({
  range,
  said,
  flagged,
  person,
  onEveryone,
  signInHref,
  onOpen,
}: {
  range: Range;
  said: string;
  flagged: boolean;
  // One person's hours alone, or everyone's.
  person: string | null;
  onEveryone: () => void;
  signInHref: string;
  onOpen: (workerId: string, day: string) => void;
}) {
  const { t, f } = useStrings();
  const trpc = useTRPC();
  // Other dates keep the rows on screen until their own arrive (providers.tsx).
  const read = useQuery(
    trpc.labor.hours.queryOptions(
      {
        ...range,
        ...(flagged && { flagged: true }),
        ...(person !== null && { workerId: person }),
      },
      { placeholderData: keepPreviousData },
    ),
  );
  const answer = read.data;
  const failed =
    blocking([read]) !== undefined ? (
      <Failure
        error={read.error}
        signInHref={signInHref}
        onRetry={() => void read.refetch()}
      />
    ) : undefined;
  const empty = flagged ? t.week.emptyFlagged : t.emptyReconciliation;
  const days = daysIn(range);

  // A day's figure: the hours, the flags as badges, and a mark for a session still open.
  const figure = (d: { hundredths: number; openSessions: number } | null) =>
    d === null
      ? ""
      : d.hundredths === 0 && d.openSessions > 0
        ? ""
        : t.hoursValue(hours(d.hundredths));

  const weekColumns: Column<WeekRow>[] = [
    { key: "person", header: t.person, cell: (row) => row.worker.name, total: undefined },
    ...days.map((day, index): Column<WeekRow> => {
      const total =
        answer === undefined ? null : (weekTotals(answer, days)[index] ?? null);
      return {
        key: day,
        header: f.weekColumn(day),
        number: true,
        empty: (row) => row.days[index] === null,
        cell: (row) => {
          const d = row.days[index] ?? null;
          if (d === null) return "";
          return (
            <>
              <span>{figure(d)}</span>
              {d.openSessions > 0 && (
                <StatusBadge tone="active" label={t.week.stillOpenBadge} />
              )}
              <FlagBadges flags={d.flags} />
            </>
          );
        },
        open: (row) =>
          row.days[index] === null
            ? null
            : {
                label: t.week.openDay(row.worker.name, f.weekDay(day)),
                onOpen: () => onOpen(row.worker.id, day),
              },
        total: total === null ? undefined : t.hoursValue(hours(total.hundredths)),
      };
    }),
    {
      key: "total",
      header: t.week.total,
      number: true,
      cell: (row) => t.hoursValue(hours(row.hundredths)),
      total:
        answer === undefined ? undefined : t.hoursValue(hours(answer.totals.hundredths)),
    },
  ];

  const listColumns: Column<Cell>[] = [
    { key: "date", header: t.date, cell: (c) => f.weekDay(c.workDate) },
    {
      key: "job",
      header: t.job,
      cell: (c) => <Link href={`/jobs/${c.job.id}`}>{c.job.name}</Link>,
    },
    {
      key: "hours",
      header: t.hours,
      number: true,
      cell: (c) => t.hoursValue(hours(c.hundredths)),
      open: (c) => ({
        label: t.week.openDay(c.worker.name, f.weekDay(c.workDate)),
        onOpen: () => onOpen(c.worker.id, c.workDate),
      }),
    },
    {
      key: "flags",
      header: t.flags,
      empty: (c) => c.flags.length === 0,
      cell: (c) => <FlagBadges flags={c.flags} />,
    },
  ];
  const sumOf = (answer: Hours, id: string) =>
    answer.workers.find((w) => w.worker.id === id)?.hundredths ?? 0;

  return (
    <>
      <p className={`secondary ${styles.line}`}>
        {said}
        {answer !== undefined && ` · ${t.workDatesIn(answer.timezone)}`}
      </p>
      {person !== null && (
        <p className={`body ${styles.only}`}>
          {answer?.workers[0] !== undefined && (
            <span>{t.onlyPerson(answer.workers[0].worker.name)}</span>
          )}
          <button type="button" className={controls.textAction} onClick={onEveryone}>
            {t.showEveryone}
          </button>
        </p>
      )}
      <RefreshFailed reads={[read]} />
      {answer !== undefined && <OpenStrip cells={stillOpen(answer)} />}
      {answer !== undefined && answer.cells.length > 0 && (
        <p className={`body-strong ${styles.total}`}>
          {t.reconTotal(hours(answer.totals.hundredths))}
        </p>
      )}
      {isWeek(range) ? (
        <DataTable
          caption={t.week.caption(said)}
          columns={weekColumns}
          rows={answer === undefined ? [] : weekRows(answer, days)}
          rowKey={(row) => row.worker.id}
          loading={read.isPending}
          failed={failed}
          empty={empty}
          totalLabel={t.week.allPeople}
          lines
        />
      ) : (
        <DataTable
          caption={t.week.listCaption(said)}
          columns={listColumns}
          rows={answer === undefined ? [] : listRows(answer)}
          rowKey={(c) => `${c.worker.id}-${c.workDate}-${c.job.id}`}
          loading={read.isPending}
          failed={failed}
          empty={answer !== undefined && answer.cells.length > 0 ? t.noHoursYet : empty}
          groupOf={(c) => ({
            key: c.worker.id,
            heading: (
              <span className={styles.groupHead}>
                <span>{c.worker.name}</span>
                <span>
                  {answer === undefined
                    ? ""
                    : t.hoursValue(hours(sumOf(answer, c.worker.id)))}
                </span>
              </span>
            ),
          })}
        />
      )}
    </>
  );
}

// Sessions with no clock-out yet, each with the day it was left open: their time is in no
// figure until it arrives.
function OpenStrip({ cells }: { cells: Cell[] }) {
  const { t, f } = useStrings();
  if (cells.length === 0) return null;
  return (
    <section className={styles.strip} aria-labelledby="hours-open">
      <h2 id="hours-open" className="body-strong">
        {t.week.openHeading}
      </h2>
      <ul>
        {cells.map((c) => (
          <li key={`${c.workDate}-${c.worker.id}-${c.job.id}`}>
            {t.week.openSince(c.worker.name, c.job.name, f.weekDay(c.workDate))}
          </li>
        ))}
      </ul>
      <p className="secondary">{t.week.openExplain}</p>
    </section>
  );
}

// Export asks first: what the file will hold for these dates, then Download. The file is
// built once, when the dialog opens, from the ledger as it stands (api labor/export.ts);
// Download saves that same file, so what the dialog says is what the file adds up to.
function ExportDialog({
  range,
  said,
  onClose,
}: {
  range: Range;
  said: string;
  onClose: () => void;
}) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  type File = Awaited<ReturnType<typeof ask>>;
  const ask = () =>
    queryClient.fetchQuery(
      trpc.labor.export.queryOptions(range, { staleTime: 0, gcTime: 0 }),
    );
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    // No cleanup: closing here would report a dismissal nobody made when React mounts an
    // effect twice in development. Unmounting removes the dialog.
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    let current = true;
    ask().then(
      (answer) => current && setFile(answer),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
    // The range is fixed for the life of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const download = () => {
    if (file === null) return;
    const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
    setNote(t.week.downloaded(file.filename));
  };
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId} className="heading">
        {t.week.exportTitle}
      </h2>
      <p className="body-strong">{said}</p>
      {failed ? (
        <p className={`secondary ${controls.error}`} role="alert">
          {t.requestFailed}
        </p>
      ) : file === null ? (
        <p className="body" role="status">
          {t.loading}
        </p>
      ) : (
        <ul className={styles.holds}>
          <li className="body-strong">{t.week.exportTotal(hours(file.hundredths))}</li>
          <li>{t.week.exportFlagged(file.flaggedEntries)}</li>
          <li>{t.week.exportOpen(file.openSessions)}</li>
        </ul>
      )}
      <p className="secondary">{t.week.exportHolds}</p>
      <Note text={note} tone="saved" />
      <div className={controls.actions}>
        <button
          type="button"
          className={controls.primary}
          disabled={file === null}
          onClick={download}
        >
          {t.week.download}
        </button>
        <button type="button" className={controls.secondary} onClick={onClose}>
          {t.close}
        </button>
      </div>
    </dialog>
  );
}
