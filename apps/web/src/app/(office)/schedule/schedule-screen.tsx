"use client";

// The Weekly Schedule. One week,
// Monday to Sunday, by employee or by jobsite; planned shifts only — nothing here is hours, a
// total or a status of work. Wide, the seven days side by side with their headings held in
// view; narrow, one day at a time, chosen from seven day buttons. The employee filter reaches
// any one person without scrolling the people, at every width. A shift card opens the shift;
// a cell's own button adds one there. Three queries — the people and the jobs for the
// pickers, `shift.week` for the grid — and every write through the drawers
// (shift-dialog.tsx, copy-dialog.tsx), which the server judges (api shifts/).
//
// Moving, changing or removing a shift nobody has started is drawn at once and sent at
// once (optimistic.ts), with Undo offered in a toast for a few seconds. A refusal puts the
// week back and is said in words from the answer's own code. Everything else here waits
// for the server.
import { addDays, mondayOf } from "@trader/api/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import controls from "../../controls.module.css";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { Field } from "../../field";
import { Note } from "../../note";
import { PageHeader } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import { StatusBadge } from "../../status-badge";
import { Toast } from "../../toast";
import { useTRPC } from "../../trpc";
import { useAsked, useUrlFilters } from "../../use-url-filters";
import { CopyWeek } from "./copy-dialog";
import styles from "./schedule.module.css";
import {
  byEmployee,
  byJobsite,
  hoursOf,
  nowIn,
  peopleOn,
  refusalText,
  SCHEDULE_FILTERS,
  scheduleOf,
  weekFilter,
  type Refusal,
  type Row,
  type View,
  type Week,
  type WeekShift,
} from "./schedule-view";
import {
  attempt,
  inverse,
  said,
  type Change,
  type Outcome,
  type WeekCache,
} from "./optimistic";
import { AddShift, EditShift } from "./shift-dialog";

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern. Only where the screen opens: no rule reads it.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

type Panel =
  | { kind: "add"; userId?: string; day?: string }
  | { kind: "edit"; shiftId: string }
  | { kind: "copy" }
  | null;

function ShiftCard({
  shift,
  view,
  busy,
  onOpen,
}: {
  shift: WeekShift;
  view: View;
  busy: boolean;
  onOpen: () => void;
}) {
  const { t, f } = useStrings();
  const s = t.schedule;
  return (
    <button
      type="button"
      className={styles.card}
      data-shift={shift.id}
      disabled={busy}
      onClick={onOpen}
    >
      {/* Its name is what it shows, then whose shift and which day. */}
      <span className={`compact ${styles.cardName}`}>
        {view === "employee" ? shift.job.name : shift.worker.name}
      </span>
      <span className={`secondary ${styles.hours}`}>{hoursOf(shift, f)}</span>
      <span className="visually-hidden">
        {`, ${view === "employee" ? shift.worker.name : shift.job.name}, ${f.weekDay(shift.workDate)}`}
      </span>
      {shift.locked && <StatusBadge tone="active" label={s.locked} />}
    </button>
  );
}

function Grid({
  week,
  rows,
  view,
  selected,
  today: todayDay,
  busy,
  onOpen,
  onAdd,
}: {
  week: Week;
  rows: Row[];
  view: View;
  // The one day shown when narrow.
  selected: string;
  // Today on the company's clock: its column's Add is a named button, one click to a
  // shift for today.
  today: string;
  // The week before, shown while the one asked for loads: nothing in it opens or adds.
  busy: boolean;
  onOpen: (shiftId: string) => void;
  onAdd: (userId: string, day: string) => void;
}) {
  const { t, f } = useStrings();
  const s = t.schedule;
  return (
    // `data-keys`: the keys move through the grid's cards and cells (keyboard-rows.tsx).
    <table
      className={busy ? `${styles.grid} ${styles.stale}` : styles.grid}
      data-keys
      aria-busy={busy || undefined}
    >
      <thead>
        <tr>
          <th scope="col" className="label">
            {view === "employee" ? s.person : s.jobsite}
          </th>
          {week.days.map((day) => (
            <th
              key={day}
              scope="col"
              className="label"
              data-day
              data-selected={day === selected ? "" : undefined}
              // A grid's column is "Mon 16": the range above says the month.
            >
              {f.weekColumn(day)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" className="body-strong">
              {row.name}
              {/* No add on a deactivated person's row: the badge says why. */}
              {view === "employee" && row.active === false && (
                <>
                  {" "}
                  <StatusBadge tone="neutral" label={t.deactivated} />
                </>
              )}
            </th>
            {week.days.map((day) => {
              const shifts = row.days.get(day) ?? [];
              return (
                <td key={day} data-day data-selected={day === selected ? "" : undefined}>
                  {view === "jobsite" && shifts.length > 0 && (
                    <p className={`secondary ${styles.count}`}>
                      {s.people(peopleOn(row, day))}
                    </p>
                  )}
                  {shifts.map((shift) => (
                    <ShiftCard
                      key={shift.id}
                      shift={shift}
                      view={view}
                      busy={busy}
                      onOpen={() => onOpen(shift.id)}
                    />
                  ))}
                  {view === "employee" && row.active !== false && (
                    <button
                      type="button"
                      className={
                        day === todayDay
                          ? `${styles.addCell} ${styles.addToday}`
                          : styles.addCell
                      }
                      aria-label={s.addShiftFor(row.name, f.weekDay(day))}
                      disabled={busy}
                      onClick={() => onAdd(row.id, day)}
                    >
                      {day === todayDay ? `+ ${s.addToday}` : "+"}
                    </button>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScheduleScreen({ signInHref }: { signInHref: string }) {
  const { t, f } = useStrings();
  const s = t.schedule;
  const trpc = useTRPC();
  // The week, the day shown when narrow, the view and the person live in the address.
  const [filters, setFilters] = useUrlFilters(SCHEDULE_FILTERS);
  const { weekStart, selected, view, only } = scheduleOf(filters, today());
  const [opened, setPanel] = useState<Panel>(null);
  // The command menu's New shift asks for the Add panel by the address.
  const [asked, clearAsked] = useAsked("shift");
  const panel: Panel = opened ?? (asked ? { kind: "add" } : null);
  const [note, setNote] = useState<string | null>(null);

  const listed = useQuery(trpc.people.list.queryOptions());
  const jobs = useQuery(trpc.job.list.queryOptions());
  const week = useQuery(
    trpc.shift.week.queryOptions(
      { weekStart },
      // The week before stays on screen while the next one loads.
      { placeholderData: (previous) => previous },
    ),
  );
  const queryClient = useQueryClient();
  const update = useMutation(trpc.shift.update.mutationOptions());
  const remove = useMutation(trpc.shift.remove.mutationOptions());
  const create = useMutation(trpc.shift.create.mutationOptions());
  // What went wrong with a change shown at once, and the toast that offers its Undo.
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    text: string;
    // None once the undo has its answer: the toast then says what came of it.
    undo?: () => void;
    // Undo pressed, its answer not yet come.
    busy?: boolean;
    // The undo was refused: said where the toast was, until closed.
    refused?: boolean;
  } | null>(null);
  const toasts = useRef(0);
  const dismiss = useCallback(() => setToast(null), []);

  // One change, sent: every answer in one shape, a refusal carrying the server's code.
  type Sent = { result: string } & Partial<Refusal>;
  const send = async (change: Change): Promise<Sent> => {
    if (change.kind === "update")
      return update.mutateAsync({ shiftId: change.shift.id, ...change.to });
    if (change.kind === "remove") return remove.mutateAsync({ shiftId: change.shift.id });
    // Planned again under its own id: the same shift, not a new one.
    const { shift } = change;
    const answer = await create.mutateAsync({
      userId: shift.worker.id,
      jobId: shift.job.id,
      expectedStart: shift.expectedStart,
      expectedEnd: shift.expectedEnd,
      days: [{ id: shift.id, workDate: shift.workDate }],
    });
    if (answer.result === "rejected") return answer;
    const day = answer.days[0];
    return day === undefined || day.result === "rejected"
      ? { ...day, result: "rejected" }
      : { result: day.result };
  };
  const change = (asked: Change, shown: Week) => {
    const key = trpc.shift.week.queryKey({ weekStart });
    const cache: WeekCache = {
      read: () => queryClient.getQueryData(key),
      write: (next) => queryClient.setQueryData(key, next),
      hold: () => queryClient.cancelQueries({ queryKey: key }),
      refresh: () => queryClient.invalidateQueries(trpc.shift.pathFilter()),
    };
    const label = (id: string) => {
      const shift = shown.shifts.find((x) => x.id === id);
      return shift === undefined || shift.id === asked.shift.id
        ? s.thisShift
        : `${shift.job.name} ${hoursOf(shift, f)}`;
    };
    const why = (result: Outcome<Sent>) =>
      result.outcome === "refused"
        ? refusalText(s, result.answer as Refusal, label, f)
        : t.requestFailed;
    const name = asked.shift.worker.name;
    const what = said(asked);
    const id = (toasts.current += 1);
    setPanel(null);
    setNote(null);
    setProblem(null);
    const sent = attempt(cache, asked, () => send(asked));
    setToast({
      id,
      text:
        asked.kind === "update"
          ? what === "moved"
            ? s.did.moved(name, f.weekDay(asked.to.workDate))
            : s.did.changed(name, f.span(asked.to.expectedStart, asked.to.expectedEnd))
          : s.did.removed(name, f.weekDay(asked.shift.workDate)),
      // Undo waits for the first answer: a change the server refused has nothing to undo.
      // The toast stays, busy, until the undo's answer, and then says it where it was.
      undo: () => {
        setToast((now) => (now?.id === id ? { ...now, busy: true } : now));
        void sent.then(async (first) => {
          if (first.outcome !== "done") return;
          const back = inverse(asked);
          const undone = await attempt(cache, back, () => send(back));
          if (undone.outcome === "done") {
            setToast({ id, text: s.undoneChange });
            // The focus on the shift that came back.
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(`[data-shift="${asked.shift.id}"]`)
                ?.focus(),
            );
          } else {
            setToast({ id, text: s.notUndone(why(undone)), refused: true });
          }
        });
      },
    });
    void sent.then((first) => {
      if (first.outcome === "done") return;
      // The week is already back as it was; the refusal is said where its toast was, and
      // stays until closed.
      setToast({ id, text: s.notDone(why(first)), refused: true });
    });
  };

  // The week before, on screen while the one asked for loads: nothing in it, and nothing
  // from the header, may open or add.
  const stale = week.isPlaceholderData;
  // A refresh that fails keeps the rows (and an open drawer) under one line; only a read
  // with nothing to show, or a refused session, replaces the screen.
  const failed = blocking([listed, jobs, week]);
  const ready =
    listed.data !== undefined && jobs.data !== undefined && week.data !== undefined;

  const show = (monday: string) => {
    setNote(null);
    setProblem(null);
    setFilters({ week: weekFilter(monday, today()), day: "" });
  };
  // A drawer closed: what it did is said beneath the week bar.
  const closed = (result: string | null) => {
    setPanel(null);
    clearAsked();
    setProblem(null);
    if (result !== null) setNote(result);
  };

  const header = (
    <PageHeader
      title={s.title}
      actions={
        ready ? (
          <>
            <button
              type="button"
              className={controls.secondary}
              disabled={stale}
              onClick={() => setPanel({ kind: "copy" })}
            >
              {s.copyLastWeek}
            </button>
            <button
              type="button"
              className={controls.primary}
              disabled={stale}
              onClick={() => setPanel({ kind: "add" })}
            >
              {s.addShift}
            </button>
          </>
        ) : undefined
      }
    />
  );
  if (listed.isPending || jobs.isPending || week.isPending) {
    return (
      <>
        {header}
        <LoadingRows rows={6} />
      </>
    );
  }
  if (failed !== undefined || !ready) {
    return (
      <>
        {header}
        <Failure
          error={failed?.error}
          signInHref={signInHref}
          onRetry={() => void failed?.refetch()}
        />
      </>
    );
  }

  // The week drawn: the one asked for once it has come, the one before until then.
  const drawn = week.data.days[0] ?? weekStart;
  const people = listed.data.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.deactivatedAt === null,
  }));
  const all =
    view === "employee"
      ? byEmployee(week.data.shifts, people)
      : byJobsite(week.data.shifts);
  // A person the address names but the week does not list is no filter: the Show choice
  // would say everyone while every row was hidden.
  const person = all.some((row) => row.id === only) ? only : "";
  const rows =
    view === "employee" && person !== "" ? all.filter((row) => row.id === person) : all;
  const editing =
    panel?.kind === "edit"
      ? week.data.shifts.find((shift) => shift.id === panel.shiftId)
      : undefined;
  return (
    <>
      {header}
      <p className={`secondary ${styles.explain}`}>{s.explain}</p>
      <RefreshFailed reads={[listed, jobs, week]} />
      <div className={styles.bar}>
        <div className={styles.weekSteps}>
          <button
            type="button"
            className={controls.secondary}
            aria-label={s.previousWeek}
            onClick={() => show(addDays(weekStart, -7))}
          >
            {s.previous}
          </button>
          <button
            type="button"
            className={controls.secondary}
            disabled={weekStart === mondayOf(today())}
            onClick={() => show(mondayOf(today()))}
          >
            {s.thisWeek}
          </button>
          <button
            type="button"
            className={controls.secondary}
            aria-label={s.nextWeek}
            onClick={() => show(addDays(weekStart, 7))}
          >
            {s.next}
          </button>
        </div>
        <p className={`body-strong ${styles.range}`} aria-live="polite">
          {s.weekOf(f.day(drawn), f.day(addDays(drawn, 6)))}
        </p>
        <div className={styles.choices}>
          <fieldset className={styles.view}>
            <legend className="label">{s.view}</legend>
            {(["employee", "jobsite"] as const).map((v) => (
              <label key={v} className={controls.check}>
                <input
                  type="radio"
                  name="schedule-view"
                  checked={view === v}
                  onChange={() => setFilters({ view: v })}
                />
                <span>{v === "employee" ? s.byPerson : s.byJobsite}</span>
              </label>
            ))}
          </fieldset>
          {view === "employee" && (
            <Field id="schedule-only" label={s.showPerson}>
              <select
                id="schedule-only"
                className={controls.select}
                value={person}
                onChange={(e) => setFilters({ who: e.target.value })}
              >
                <option value="">{s.everyone}</option>
                {all.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {/* Narrow only: the day the grid shows. */}
        <div className={styles.dayTabs} role="group" aria-label={s.day}>
          {week.data.days.map((day) => (
            <button
              key={day}
              type="button"
              className={styles.dayTab}
              aria-pressed={day === selected}
              onClick={() => setFilters({ day })}
            >
              {f.weekColumn(day)}
            </button>
          ))}
        </div>
      </div>
      <Note text={note} tone="saved" />
      <Note text={problem} tone="error" />
      {rows.length === 0 ? (
        <p className={`body ${controls.empty}`}>{s.noShifts}</p>
      ) : (
        <Grid
          week={week.data}
          rows={rows}
          view={view}
          selected={week.data.days.includes(selected) ? selected : drawn}
          today={nowIn(week.data.timezone).day}
          busy={stale}
          onOpen={(shiftId) => setPanel({ kind: "edit", shiftId })}
          onAdd={(userId, day) => setPanel({ kind: "add", userId, day })}
        />
      )}
      {panel?.kind === "add" && (
        <AddShift
          week={week.data}
          people={people.filter((p) => p.active)}
          jobs={jobs.data.filter((j) => j.status !== "archived")}
          first={{ userId: panel.userId, day: panel.day }}
          onClose={closed}
        />
      )}
      {editing !== undefined && (
        <EditShift
          key={editing.id}
          shift={editing}
          week={week.data}
          jobs={jobs.data.filter((j) => j.status !== "archived")}
          onClose={closed}
          onChange={(asked) => change(asked, week.data)}
        />
      )}
      {toast !== null && (
        <Toast
          key={toast.id}
          text={toast.text}
          action={toast.refused ? t.close : toast.undo === undefined ? undefined : s.undo}
          onAction={toast.refused ? dismiss : toast.undo}
          busy={toast.busy}
          stays={toast.refused}
          onDone={dismiss}
        />
      )}
      {panel?.kind === "copy" && (
        <CopyWeek week={week.data} signInHref={signInHref} onClose={closed} />
      )}
    </>
  );
}
