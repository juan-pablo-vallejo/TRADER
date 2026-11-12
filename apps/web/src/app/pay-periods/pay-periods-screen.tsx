"use client";

// The pay-periods screen (PRD, Labor: the office closes a pay period; DESIGN, Pay-period
// close). The calendar is one query, newest first; the page header's action opens the form
// for the next period. A row's Details read that one period (`payPeriod.read`): its hours,
// the adjustments it carries, and what is still unresolved on its dates — and, for a period
// that is open, the latest one's dates and the close.
//
// The close is the destructive action: its sentence says the period and its export can never
// change, and when anything is unresolved the counts stand beside a checkbox that must be
// ticked first. What is ticked is sent as the acknowledgment and judged by the server against
// what is unresolved then (pay-periods/close.ts): a count that moved closes nothing and is
// said beneath the button, with the details read again. A button the server would refuse — an
// earlier period still open, a last day not yet past — is a sentence instead.
//
// Every figure is the server's, formatted here and never added in the browser. Consumed by
// page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { day as formatDay, dayIn, hours, signedHours } from "../format";
import { Note } from "../note";
import { CREATE_FORM_ID, PageHeader } from "../page-header";
import {
  DestructiveAction,
  EditorFooter,
  EditorRow,
  EditorSection,
  RowToggle,
} from "../row-editor";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./pay-periods.module.css";
import {
  boundsOk,
  closeState,
  editable,
  nextBounds,
  type Calendar,
  type Period,
} from "./period-view";

const rangeOf = (p: { startsOn: string; endsOn: string }) =>
  strings.periodRange(formatDay(p.startsOn), formatDay(p.endsOn));

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.payPeriod.pathFilter());
}

export function PayPeriodsScreen({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.payPeriod.list.queryOptions());
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title={strings.payPeriods}
        action={
          list.isSuccess
            ? {
                label: strings.openPeriod,
                open: adding,
                onToggle: () => setAdding((a) => !a),
              }
            : undefined
        }
      />
      <p className={`secondary ${styles.explain}`}>{strings.payPeriodsExplain}</p>
      {list.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure
          error={list.error}
          devSignIn={devSignIn}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          {adding && <OpenForm calendar={list.data} onDone={() => setAdding(false)} />}
          {list.data.periods.length === 0 ? (
            <EmptyState text={strings.emptyPayPeriods} />
          ) : (
            <>
              <p className={`secondary ${styles.explain}`}>
                {strings.workDatesIn(list.data.timezone)}
              </p>
              <PeriodsTable calendar={list.data} devSignIn={devSignIn} />
            </>
          )}
        </>
      )}
    </>
  );
}

// The two dates of a period, shared by the open form and the dates editor. A start the
// server fixes is shown and not offered.
function DateFields({
  id,
  startsOn,
  endsOn,
  startFixed,
  invalid,
  onChange,
}: {
  id: string;
  startsOn: string;
  endsOn: string;
  startFixed: boolean;
  invalid: boolean;
  onChange: (next: { startsOn: string; endsOn: string }) => void;
}) {
  return (
    <div className={styles.formGrid}>
      <Field id={`${id}-starts`} label={strings.periodStarts}>
        <input
          id={`${id}-starts`}
          className={controls.input}
          type="date"
          required
          readOnly={startFixed}
          aria-describedby={startFixed ? `${id}-starts-why` : undefined}
          value={startsOn}
          onChange={(e) => onChange({ startsOn: e.target.value, endsOn })}
        />
        {startFixed && (
          <p id={`${id}-starts-why`} className="secondary">
            {strings.periodStartsAfterLast}
          </p>
        )}
      </Field>
      <Field id={`${id}-ends`} label={strings.periodEnds}>
        <input
          id={`${id}-ends`}
          className={controls.input}
          type="date"
          required
          value={endsOn}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-range` : undefined}
          onChange={(e) => onChange({ startsOn, endsOn: e.target.value })}
        />
        {invalid && (
          <p id={`${id}-range`} className={`secondary ${controls.error}`} role="alert">
            {strings.ledgerRange}
          </p>
        )}
      </Field>
    </div>
  );
}

function OpenForm({ calendar, onDone }: { calendar: Calendar; onDone: () => void }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const first = nextBounds(calendar);
  const [value, setValue] = useState({ startsOn: first.startsOn, endsOn: first.endsOn });
  const [invalid, setInvalid] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const open = useMutation(
    trpc.payPeriod.open.mutationOptions({
      onSuccess: async (answer) => {
        await refresh();
        if (answer.result === "opened") onDone();
        else if (answer.result === "exists") setNote(strings.periodExists);
        else setNote(strings.periodNotContiguous(formatDay(answer.expectedStartsOn)));
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (value.startsOn === "" || value.endsOn === "") return;
    const bad = !boundsOk(value.startsOn, value.endsOn);
    setInvalid(bad);
    if (!bad) open.mutate(value);
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.openPeriod}
      className={controls.card}
      onSubmit={submit}
    >
      <DateFields
        id="new-period"
        {...value}
        startFixed={first.fixedStart}
        invalid={invalid}
        onChange={setValue}
      />
      <Note text={note} />
      <button type="submit" className={controls.primary} disabled={open.isPending}>
        {strings.openPeriod}
      </button>
    </form>
  );
}

function PeriodsTable({
  calendar,
  devSignIn,
}: {
  calendar: Calendar;
  devSignIn: boolean;
}) {
  const [shown, setShown] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.period}</th>
          <th scope="col">{strings.status}</th>
          <th scope="col">
            <span className="visually-hidden">{strings.details}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {calendar.periods.map((p) => {
          const open = shown === p.id;
          return (
            <Fragment key={p.id}>
              <tr>
                <td data-label={strings.period} className="body-strong">
                  {rangeOf(p)}
                </td>
                <td data-label={strings.status}>
                  {p.closed === null
                    ? strings.periodIsOpen
                    : strings.periodClosedBy(
                        dayIn(p.closed.at, calendar.timezone),
                        p.closed.by.name,
                      )}
                </td>
                <RowToggle
                  rowId={p.id}
                  open={open}
                  label={strings.details}
                  onToggle={() => setShown(open ? null : p.id)}
                />
              </tr>
              {open ? (
                <EditorRow rowId={p.id} colSpan={3}>
                  <Details period={p} calendar={calendar} devSignIn={devSignIn} />
                </EditorRow>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Details({
  period,
  calendar,
  devSignIn,
}: {
  period: Period;
  calendar: Calendar;
  devSignIn: boolean;
}) {
  const trpc = useTRPC();
  const read = useQuery(trpc.payPeriod.read.queryOptions({ periodId: period.id }));
  // Kept here, above the close: once the period is closed its button is gone, and the
  // answer must still be read beneath where it stood.
  const [closeNote, setCloseNote] = useState<CloseNote | null>(null);
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
  const { approved, adjustments, unresolved } = read.data;
  const waiting = {
    pendingSessions: unresolved.pendingSessions,
    openSessions: unresolved.openSessions,
  };
  const anyWaiting = waiting.pendingSessions + waiting.openSessions > 0;
  const dates = editable(period, calendar);
  return (
    <>
      <EditorSection heading={strings.periodHours}>
        <div className={styles.figures}>
          <p className="body">
            {period.closed === null
              ? strings.periodApprovedSoFar(hours(approved.total))
              : strings.periodExported(hours(approved.total))}
          </p>
          <p className="body">
            {adjustments.carriedBy !== null
              ? strings.periodAdjustmentsJoin(rangeOf(adjustments.carriedBy))
              : adjustments.lines.length === 0
                ? strings.periodNoAdjustments
                : strings.periodAdjustments(
                    adjustments.lines.length,
                    signedHours(adjustments.total),
                  )}
          </p>
          {period.closed !== null && (
            <p className="secondary">
              {strings.periodAcknowledged(
                period.closed.unresolved.pendingSessions,
                period.closed.unresolved.openSessions,
              )}
            </p>
          )}
          {anyWaiting && (
            <p className="secondary">
              {strings.periodUnresolvedNow(waiting.pendingSessions, waiting.openSessions)}
            </p>
          )}
        </div>
      </EditorSection>
      {dates.end && <DatesEditor period={period} startFixed={!dates.start} />}
      {(period.closed === null || closeNote !== null) && (
        <EditorFooter>
          <Close
            period={period}
            calendar={calendar}
            acknowledged={anyWaiting ? waiting : undefined}
            note={closeNote}
            setNote={setCloseNote}
          />
        </EditorFooter>
      )}
    </>
  );
}

function DatesEditor({ period, startFixed }: { period: Period; startFixed: boolean }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [value, setValue] = useState({
    startsOn: period.startsOn,
    endsOn: period.endsOn,
  });
  const [invalid, setInvalid] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.payPeriod.update.mutationOptions({
      onSuccess: async (answer) => {
        setNote(
          answer.result === "updated"
            ? strings.saved
            : answer.result === "unchanged"
              ? strings.unchanged
              : answer.code === "not_contiguous"
                ? strings.periodNotContiguous(formatDay(answer.expectedStartsOn))
                : answer.code === "not_latest"
                  ? strings.periodNotLatest
                  : strings.periodAlreadyClosed(answer.period.closed?.by.name ?? ""),
        );
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (value.startsOn === "" || value.endsOn === "") return;
    const bad = !boundsOk(value.startsOn, value.endsOn);
    setInvalid(bad);
    if (!bad) save.mutate({ periodId: period.id, ...value });
  };
  return (
    <EditorSection heading={strings.periodDates}>
      <form onSubmit={submit}>
        <DateFields
          id={`period-${period.id}`}
          {...value}
          startFixed={startFixed}
          invalid={invalid}
          onChange={setValue}
        />
        <button
          type="submit"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={save.isPending}
        >
          {strings.saveDates}
        </button>
        <Note text={note} />
      </form>
    </EditorSection>
  );
}

type CloseNote = { text: string; saved: boolean };

function Close({
  period,
  calendar,
  acknowledged,
  note,
  setNote,
}: {
  period: Period;
  calendar: Calendar;
  acknowledged: { pendingSessions: number; openSessions: number } | undefined;
  note: CloseNote | null;
  setNote: (note: CloseNote | null) => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const close = useMutation(
    trpc.payPeriod.close.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "closed") {
          setNote({ text: strings.periodClosed, saved: true });
        } else if (answer.code === "already_closed") {
          setNote({
            text: strings.periodAlreadyClosed(answer.period.closed?.by.name ?? ""),
            saved: false,
          });
        } else if (answer.code === "earlier_open") {
          setNote({
            text: strings.closeEarlierFirst(rangeOf(answer.period)),
            saved: false,
          });
        } else if (answer.code === "not_ended") {
          setNote({
            text: strings.closeNotEnded(formatDay(period.endsOn)),
            saved: false,
          });
        } else {
          // `unacknowledged` or `unresolved_changed`: the counts moved since they were read.
          setNote({
            text: strings.closeUnresolvedChanged(
              answer.unresolved.pendingSessions,
              answer.unresolved.openSessions,
            ),
            saved: false,
          });
        }
        await refresh();
      },
      onError: () => setNote({ text: strings.requestFailed, saved: false }),
    }),
  );
  const state = closeState(period, calendar);
  return (
    <>
      {state.state === "earlier_open" ? (
        <p className={`secondary ${styles.blocked}`}>
          {strings.closeEarlierFirst(rangeOf(state.first))}
        </p>
      ) : state.state === "not_ended" ? (
        <p className={`secondary ${styles.blocked}`}>
          {strings.closeNotEnded(formatDay(period.endsOn))}
        </p>
      ) : state.state === "ready" ? (
        <DestructiveAction
          label={strings.closePeriod}
          effect={strings.closePeriodEffect(rangeOf(period))}
          acknowledge={
            acknowledged === undefined
              ? undefined
              : strings.closePeriodAcknowledge(
                  acknowledged.pendingSessions,
                  acknowledged.openSessions,
                )
          }
          disabled={close.isPending}
          onConfirm={() => {
            setNote(null);
            close.mutate({ periodId: period.id, acknowledged });
          }}
        />
      ) : null}
      <Note
        text={note?.text ?? null}
        tone={note === null ? undefined : note.saved ? "saved" : "error"}
      />
    </>
  );
}
