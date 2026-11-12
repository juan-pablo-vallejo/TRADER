"use client";

// The assignments screen (PRD, Jobs and location: a dated assignment plans a person's day and
// never authorizes work; DESIGN, Assignment row). The office picks a week, optionally one
// person or one job, and reads who is planned where; "Plan work" plans one person on one job
// for a run of days in one go, and a row's editor moves its day and times or removes it. A
// plan whose person could not clock in on that job as things stand says so and says why —
// and is saved all the same: the plan is not what lets anyone clock in.
//
// Days and times are shown exactly as written, from their text, never through a Date in the
// browser's zone. Three queries — the roster and the jobs for the pickers, `assignment.list`
// for the week — and every write refetches the list. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { codeOf, EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { addDays, daysThrough, weekDay } from "../format";
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
import styles from "./assignments.module.css";

// What `assignment.create` takes at once (api assignments/write.ts, MAX_DAYS).
const MAX_DAYS = 14;

function useRoster() {
  const trpc = useTRPC();
  return useQuery(trpc.roster.list.queryOptions());
}
function useJobs() {
  const trpc = useTRPC();
  return useQuery(trpc.job.list.queryOptions());
}
type Filter = { weekOf: string; userId: string; jobId: string };
function usePlans(filter: Filter) {
  const trpc = useTRPC();
  return useQuery(
    trpc.assignment.list.queryOptions(
      {
        from: filter.weekOf,
        to: addDays(filter.weekOf, 6),
        userId: filter.userId === "" ? undefined : filter.userId,
        jobId: filter.jobId === "" ? undefined : filter.jobId,
      },
      // The week before stays on screen while the next one loads.
      { placeholderData: (previous) => previous },
    ),
  );
}

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.assignment.pathFilter());
}

type People = NonNullable<ReturnType<typeof useRoster>["data"]>;
type Jobs = NonNullable<ReturnType<typeof useJobs>["data"]>;
type Rows = NonNullable<ReturnType<typeof usePlans>["data"]>;
type Row = Rows[number];

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern. Only where the week bar starts: no rule reads it.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const reason = (code: string): string =>
  ({
    user_inactive: strings.userInactive,
    job_archived: strings.jobArchived,
    already_planned: strings.alreadyPlanned,
  })[code] ?? strings.requestFailed;

const byDayThenStart = (a: Row, b: Row) =>
  a.workDate.localeCompare(b.workDate) ||
  a.expectedStart.localeCompare(b.expectedStart) ||
  a.worker.name.localeCompare(b.worker.name) ||
  a.id.localeCompare(b.id);

export function AssignmentsScreen({ devSignIn }: { devSignIn: boolean }) {
  const roster = useRoster();
  const jobs = useJobs();
  const [filter, setFilter] = useState<Filter>(() => ({
    weekOf: today(),
    userId: "",
    jobId: "",
  }));
  const plans = usePlans(filter);
  const [adding, setAdding] = useState(false);
  // What the last create or removal answered: its form or its row is gone by then.
  const [listNote, setListNote] = useState<string | null>(null);
  const failed = [roster, jobs, plans].find((q) => q.isError);
  const ready = roster.isSuccess && jobs.isSuccess && plans.isSuccess;
  const week = (weekOf: string) => {
    if (DAY.test(weekOf)) setFilter((f) => ({ ...f, weekOf }));
  };
  return (
    <>
      <PageHeader
        title={strings.assignments}
        action={
          ready
            ? {
                label: strings.planWork,
                open: adding,
                onToggle: () => {
                  setListNote(null);
                  setAdding((a) => !a);
                },
              }
            : undefined
        }
      />
      {roster.isPending || jobs.isPending || plans.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : failed !== undefined ? (
        <Failure
          error={failed.error}
          devSignIn={devSignIn}
          onRetry={() => void failed.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{strings.assignmentsExplain}</p>
          {adding && (
            <PlanForm
              people={roster.data!}
              jobs={jobs.data!}
              firstDay={filter.weekOf}
              onDone={(note, from) => {
                setAdding(false);
                setListNote(note);
                // The days just planned are the ones to look at.
                week(from);
              }}
            />
          )}
          <div className={styles.weekBar}>
            <Field id="plans-week" label={strings.weekOf}>
              <input
                id="plans-week"
                className={controls.input}
                type="date"
                required
                value={filter.weekOf}
                onChange={(e) => week(e.target.value)}
              />
            </Field>
            <Field id="plans-person" label={strings.person}>
              <select
                id="plans-person"
                className={controls.select}
                value={filter.userId}
                onChange={(e) => setFilter((f) => ({ ...f, userId: e.target.value }))}
              >
                <option value="">{strings.allPeople}</option>
                {roster.data!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="plans-job" label={strings.job}>
              <select
                id="plans-job"
                className={controls.select}
                value={filter.jobId}
                onChange={(e) => setFilter((f) => ({ ...f, jobId: e.target.value }))}
              >
                <option value="">{strings.everyJob}</option>
                {jobs.data!.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className={styles.weekSteps}>
            <button
              type="button"
              className={controls.secondary}
              onClick={() => week(addDays(filter.weekOf, -7))}
            >
              {strings.previousWeek}
            </button>
            <button
              type="button"
              className={controls.secondary}
              onClick={() => week(addDays(filter.weekOf, 7))}
            >
              {strings.nextWeek}
            </button>
          </div>
          <Note text={listNote} tone="saved" />
          <PlansTable
            rows={plans.data!}
            onRemoved={() => setListNote(strings.planRemoved)}
          />
        </>
      )}
    </>
  );
}

function PlanForm({
  people,
  jobs,
  firstDay,
  onDone,
}: {
  people: People;
  jobs: Jobs;
  firstDay: string;
  onDone: (note: string, from: string) => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [userId, setUserId] = useState("");
  const [jobId, setJobId] = useState("");
  const [from, setFrom] = useState(firstDay);
  const [through, setThrough] = useState(firstDay);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.assignment.create.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(reason(answer.code));
          return;
        }
        if (answer.result === "unchanged") {
          setNote(strings.alreadyPlannedAll);
          return;
        }
        await refresh();
        onDone(strings.plannedDays(answer.created, answer.existing), from);
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const days = DAY.test(from) && DAY.test(through) ? daysThrough(from, through) : [];
  const tooMany = days.length > MAX_DAYS;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (days.length === 0) {
      setNote(strings.throughAfterFrom);
      return;
    }
    if (end <= start) {
      setNote(strings.endAfterStart);
      return;
    }
    create.mutate({
      userId,
      jobId,
      workDates: days,
      expectedStart: start,
      expectedEnd: end,
    });
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.planWork}
      className={controls.card}
      onSubmit={submit}
    >
      <div className={styles.formGrid}>
        <Field id="plan-person" label={strings.person}>
          <select
            id="plan-person"
            className={controls.select}
            required
            autoFocus
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">{strings.choosePerson}</option>
            {people
              .filter((p) => p.deactivatedAt === null)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field id="plan-job" label={strings.job}>
          <select
            id="plan-job"
            className={controls.select}
            required
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="">{strings.chooseJob}</option>
            {jobs
              .filter((j) => j.status !== "archived")
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
          </select>
        </Field>
        <Field id="plan-from" label={strings.planFrom}>
          <input
            id="plan-from"
            className={controls.input}
            type="date"
            required
            value={from}
            onChange={(e) => {
              // The last day follows the first until it is set apart.
              if (through === from || through < e.target.value)
                setThrough(e.target.value);
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field id="plan-through" label={strings.planThrough}>
          <input
            id="plan-through"
            className={controls.input}
            type="date"
            required
            min={from}
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </Field>
      </div>
      <div className={styles.times}>
        <Field id="plan-start" label={strings.expectedStart}>
          <input
            id="plan-start"
            className={controls.input}
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field id="plan-end" label={strings.expectedEnd}>
          <input
            id="plan-end"
            className={controls.input}
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <button
        type="submit"
        className={controls.primary}
        disabled={create.isPending || tooMany}
      >
        {strings.savePlan}
      </button>
      {tooMany && (
        <p className={`secondary ${controls.caption}`}>{strings.tooManyDays}</p>
      )}
      <Note text={note} />
    </form>
  );
}

// What stands between a planned person and a clock-in on that job, or nothing. The crew is the
// one the office can settle from here, so it alone is a pill; an archived job and a
// deactivated person are states, in words.
function ClockIn({ row }: { row: Row }) {
  if (row.blockedBy === null) return null;
  if (row.blockedBy === "crew") {
    return (
      <>
        <span className={`label ${table.pillAttention}`}>{strings.notOnCrew}</span>
        <span className={`secondary ${styles.help}`}>{strings.notOnCrewHelp}</span>
      </>
    );
  }
  return (
    <>
      <span className={table.status}>
        {row.blockedBy === "job_archived"
          ? strings.jobStatus.archived
          : strings.deactivated}
      </span>
      <span className={`secondary ${styles.help}`}>
        {row.blockedBy === "job_archived"
          ? strings.jobArchivedHelp
          : strings.workerInactiveHelp}
      </span>
    </>
  );
}

function PlansTable({ rows, onRemoved }: { rows: Rows; onRemoved: () => void }) {
  // The row whose editor is open, as last known: an edit that moves its day out of the week
  // on screen, or a filter change, would otherwise take the row, its editor and the result
  // note away (DESIGN, Result note).
  const [editing, setEditing] = useState<Row | null>(null);
  const listed = rows.some((r) => r.id === editing?.id);
  const shown =
    editing === null || listed ? rows : [...rows, editing].sort(byDayThenStart);
  if (shown.length === 0) return <EmptyState text={strings.emptyAssignments} />;
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.person}</th>
          <th scope="col">{strings.date}</th>
          <th scope="col">{strings.job}</th>
          <th scope="col">{strings.planned}</th>
          <th scope="col">{strings.clockIn}</th>
          <th scope="col">
            <span className="visually-hidden">{strings.edit}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => {
          const open = editing?.id === row.id;
          return (
            <Fragment key={row.id}>
              <tr>
                <td data-label={strings.person} className="body-strong">
                  {row.worker.name}
                </td>
                <td data-label={strings.date} className={styles.date}>
                  {weekDay(row.workDate)}
                </td>
                <td data-label={strings.job}>{row.job.name}</td>
                <td data-label={strings.planned} className={styles.planned}>
                  <span className={styles.plannedLabel}>{strings.planned}</span>{" "}
                  {row.expectedStart}–{row.expectedEnd}
                </td>
                <td
                  data-label={strings.clockIn}
                  data-empty={row.blockedBy === null ? "" : undefined}
                  className={styles.clockIn}
                >
                  <ClockIn row={row} />
                </td>
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={6}>
                  <Editor
                    row={row}
                    onMoved={(moved) => setEditing(moved)}
                    onRemoved={() => {
                      setEditing(null);
                      onRemoved();
                    }}
                  />
                </EditorRow>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Editor({
  row,
  onMoved,
  onRemoved,
}: {
  row: Row;
  onMoved: (row: Row) => void;
  onRemoved: () => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [workDate, setWorkDate] = useState(row.workDate);
  const [start, setStart] = useState(row.expectedStart);
  const [end, setEnd] = useState(row.expectedEnd);
  const [note, setNote] = useState<string | null>(null);
  const [removeNote, setRemoveNote] = useState<string | null>(null);
  // A plan another admin removed meanwhile answers FORBIDDEN, as any id that is not there.
  const failure = (error: unknown) =>
    codeOf(error) === "FORBIDDEN" ? strings.planGone : strings.requestFailed;
  const update = useMutation(
    trpc.assignment.update.mutationOptions({
      onSuccess: async (answer, sent) => {
        if (answer.result === "rejected") {
          setNote(reason(answer.code));
          return;
        }
        setNote(answer.result === "unchanged" ? strings.unchanged : strings.saved);
        onMoved({
          ...row,
          workDate: sent.workDate,
          expectedStart: sent.expectedStart,
          expectedEnd: sent.expectedEnd,
        });
        await refresh();
      },
      onError: (error) => setNote(failure(error)),
    }),
  );
  const remove = useMutation(
    trpc.assignment.remove.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onRemoved();
      },
      onError: () => setRemoveNote(strings.requestFailed),
    }),
  );
  const busy = update.isPending || remove.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (end <= start) {
      setNote(strings.endAfterStart);
      return;
    }
    update.mutate({
      assignmentId: row.id,
      workDate,
      expectedStart: start,
      expectedEnd: end,
    });
  };
  return (
    <>
      <EditorSection heading={`${row.worker.name} · ${row.job.name}`}>
        <form onSubmit={submit}>
          <div className={styles.editorGrid}>
            <Field id={`plan-date-${row.id}`} label={strings.date}>
              <input
                id={`plan-date-${row.id}`}
                className={controls.input}
                type="date"
                required
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </Field>
            <div className={styles.times}>
              <Field id={`plan-start-${row.id}`} label={strings.expectedStart}>
                <input
                  id={`plan-start-${row.id}`}
                  className={controls.input}
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field id={`plan-end-${row.id}`} label={strings.expectedEnd}>
                <input
                  id={`plan-end-${row.id}`}
                  className={controls.input}
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <button
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
          >
            {strings.save}
          </button>
          <Note text={note} />
        </form>
      </EditorSection>
      <EditorFooter>
        <DestructiveAction
          label={strings.removePlan}
          effect={strings.removePlanEffect(row.worker.name, row.job.name)}
          disabled={busy}
          onConfirm={() => {
            setRemoveNote(null);
            remove.mutate({ assignmentId: row.id });
          }}
        />
        <Note text={removeNote} />
      </EditorFooter>
    </>
  );
}
