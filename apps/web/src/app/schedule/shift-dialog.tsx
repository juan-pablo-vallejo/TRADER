"use client";

// The shift drawer of the Weekly Schedule: one shift opened to change its day and hours or
// remove it, or a new shift for one employee at one jobsite on several days of the week. A
// shift that would overlap another of that person's day cannot be saved: the hours both
// cover are shown, and the server refuses it again (api assignments/write.ts). A locked
// shift opens read-only.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { uuidv7 } from "../uuidv7";
import controls from "../controls.module.css";
import { Field } from "../field";
import { weekDay } from "../format";
import { Note } from "../note";
import { DestructiveAction } from "../row-editor";
import { strings } from "../strings";
import { useTRPC } from "../trpc";
import { Drawer } from "./drawer";
import styles from "./schedule.module.css";
import {
  hoursOf,
  overlapsWith,
  refusalText,
  type Refusal,
  type Week,
  type WeekShift,
} from "./schedule-view";

const s = strings.schedule;

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.assignment.pathFilter());
}

const labelOf = (shift: WeekShift) => `${shift.job.name} ${hoursOf(shift)}`;

type Overlap = ReturnType<typeof overlapsWith>[number];

// The shifts this one would overlap, and why it cannot be saved while it does.
function Overlaps({ overlaps }: { overlaps: Overlap[] }) {
  if (overlaps.length === 0) return null;
  return (
    <section className={styles.overlaps} aria-label={s.overlapsHeading}>
      {overlaps.map(({ other, start, end }) => (
        <p key={other.id} className="body">
          {s.overlap(labelOf(other), `${start}–${end}`)}
        </p>
      ))}
      {/* Why the save is disabled, said where a screen reader hears it change. */}
      <p className={`secondary ${controls.note} ${controls.error}`} role="status">
        {s.cannotSave} {s.overlapRefused}
      </p>
    </section>
  );
}

export function EditShift({
  shift,
  week,
  onClose,
}: {
  shift: WeekShift;
  week: Week;
  onClose: (note: string | null) => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const formId = useId();
  const [workDate, setWorkDate] = useState(shift.workDate);
  const [start, setStart] = useState(shift.expectedStart);
  const [end, setEnd] = useState(shift.expectedEnd);
  const [note, setNote] = useState<string | null>(null);
  const [removeNote, setRemoveNote] = useState<string | null>(null);

  const dayShifts = week.shifts.filter(
    (other) => other.worker.id === shift.worker.id && other.workDate === workDate,
  );
  const overlaps =
    end > start ? overlapsWith({ id: shift.id, start, end }, dayShifts) : [];
  const label = (id: string) => {
    if (id === shift.id) return s.thisShift;
    const other = week.shifts.find((x) => x.id === id);
    return other === undefined ? s.thisShift : labelOf(other);
  };

  const update = useMutation(
    trpc.assignment.update.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(refusalText(answer as Refusal, label));
          return;
        }
        await refresh();
        onClose(answer.result === "unchanged" ? strings.unchanged : s.saved);
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const remove = useMutation(
    trpc.assignment.remove.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setRemoveNote(refusalText(answer as Refusal, label));
          return;
        }
        await refresh();
        onClose(s.removed);
      },
      onError: () => setRemoveNote(strings.requestFailed),
    }),
  );
  const busy = update.isPending || remove.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (end <= start) {
      setNote(s.endAfterStart);
      return;
    }
    update.mutate({
      assignmentId: shift.id,
      workDate,
      expectedStart: start,
      expectedEnd: end,
    });
  };
  const title = s.shiftOf(shift.worker.name);

  if (shift.locked) {
    return (
      <Drawer title={title} onClose={() => onClose(null)}>
        <p className="body-strong">{shift.job.name}</p>
        <p className={`body ${styles.hours}`}>
          {weekDay(shift.workDate)} · {hoursOf(shift)}
        </p>
        <p className="secondary">{s.lockedExplain}</p>
        <p className={styles.link}>
          <Link href="/hours#entries">{s.correctInLabor}</Link>
        </p>
      </Drawer>
    );
  }
  return (
    <Drawer title={title} onClose={() => onClose(null)}>
      <p className="body-strong">{shift.job.name}</p>
      <form onSubmit={submit} className={styles.form}>
        <Field id={`${formId}-day`} label={s.day}>
          <select
            id={`${formId}-day`}
            className={controls.select}
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          >
            {week.days.map((day) => (
              <option key={day} value={day}>
                {weekDay(day)}
              </option>
            ))}
          </select>
        </Field>
        <div className={styles.times}>
          <Field id={`${formId}-start`} label={s.start}>
            <input
              id={`${formId}-start`}
              className={controls.input}
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field id={`${formId}-end`} label={s.end}>
            <input
              id={`${formId}-end`}
              className={controls.input}
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Overlaps overlaps={overlaps} />
        <div className={controls.actions}>
          <button
            type="submit"
            className={controls.primary}
            disabled={busy || overlaps.length > 0}
          >
            {s.save}
          </button>
        </div>
        <Note text={note} tone={note === s.saved ? "saved" : undefined} />
      </form>
      <div className={styles.remove}>
        <DestructiveAction
          label={s.remove}
          effect={s.removeEffect(
            shift.worker.name,
            shift.job.name,
            weekDay(shift.workDate),
          )}
          disabled={busy}
          onConfirm={() => {
            setRemoveNote(null);
            remove.mutate({ assignmentId: shift.id });
          }}
        />
        <Note text={removeNote} />
      </div>
    </Drawer>
  );
}

export function AddShift({
  week,
  people,
  jobs,
  first,
  onClose,
}: {
  week: Week;
  people: { id: string; name: string }[];
  jobs: { id: string; name: string }[];
  // The employee and the day the form opens on, when a cell's own button opened it.
  first: { userId?: string; day?: string };
  onClose: (note: string | null) => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const formId = useId();
  const [userId, setUserId] = useState(first.userId ?? "");
  const [jobId, setJobId] = useState("");
  const [days, setDays] = useState<string[]>(first.day === undefined ? [] : [first.day]);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("15:30");
  const [note, setNote] = useState<string | null>(null);
  // What was added reads as done; anything else in the note is a refusal.
  const [noteTone, setNoteTone] = useState<"saved" | "error">("error");
  const [refusals, setRefusals] = useState<string[]>([]);
  // One id per day of the week, minted when the form opens and kept while it is open: a
  // save sent again is the same shifts.
  const [ids] = useState(() => new Map(week.days.map((day) => [day, uuidv7()])));
  const idFor = (day: string) => ids.get(day) ?? "";

  const perDay = [...days].sort().map((day) => {
    const dayShifts = week.shifts.filter(
      (other) => other.worker.id === userId && other.workDate === day,
    );
    return {
      day,
      id: idFor(day),
      overlaps:
        end > start ? overlapsWith({ id: idFor(day), start, end }, dayShifts) : [],
    };
  });
  const label = (id: string) => {
    const other = week.shifts.find((x) => x.id === id);
    return other === undefined ? s.thisShift : labelOf(other);
  };

  const create = useMutation(
    trpc.assignment.create.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(refusalText(answer, label));
          return;
        }
        await refresh();
        const count = (result: string) =>
          answer.days.filter((d) => d.result === result).length;
        const refused = answer.days.flatMap((d) =>
          d.result === "rejected"
            ? [s.notAdded(weekDay(d.workDate), refusalText(d as Refusal, label))]
            : [],
        );
        const done =
          s.added(count("created")) +
          (count("duplicate") === 0 ? "" : s.alreadyThere(count("duplicate")));
        if (refused.length === 0) {
          onClose(done);
          return;
        }
        // The days that were added are done with; the refused ones stay to be decided.
        const added = new Set(
          answer.days.filter((d) => d.result !== "rejected").map((d) => d.workDate),
        );
        setDays((current) => current.filter((day) => !added.has(day)));
        setRefusals(refused);
        setNoteTone("saved");
        setNote(count("created") + count("duplicate") === 0 ? null : done);
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    setNoteTone("error");
    setRefusals([]);
    if (days.length === 0) {
      setNote(s.pickDay);
      return;
    }
    if (end <= start) {
      setNote(s.endAfterStart);
      return;
    }
    create.mutate({
      userId,
      jobId,
      expectedStart: start,
      expectedEnd: end,
      days: perDay.map(({ day, id }) => ({ id, workDate: day })),
    });
  };
  const cannot = perDay.some(({ overlaps }) => overlaps.length > 0);
  return (
    <Drawer title={s.addShift} onClose={() => onClose(null)}>
      <form onSubmit={submit} className={styles.form}>
        <Field id={`${formId}-person`} label={s.employee}>
          <select
            id={`${formId}-person`}
            className={controls.select}
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="" />
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${formId}-job`} label={s.jobsite}>
          <select
            id={`${formId}-job`}
            className={controls.select}
            required
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="" />
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className={styles.days}>
          <legend className="label">{s.days}</legend>
          {week.days.map((day) => (
            <label key={day} className={controls.check}>
              <input
                type="checkbox"
                checked={days.includes(day)}
                onChange={(e) =>
                  setDays((current) =>
                    e.target.checked
                      ? [...current, day]
                      : current.filter((d) => d !== day),
                  )
                }
              />
              <span>{weekDay(day)}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.times}>
          <Field id={`${formId}-start`} label={s.start}>
            <input
              id={`${formId}-start`}
              className={controls.input}
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field id={`${formId}-end`} label={s.end}>
            <input
              id={`${formId}-end`}
              className={controls.input}
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        {perDay
          .filter(({ overlaps }) => overlaps.length > 0)
          .map(({ day, overlaps }) => (
            <div key={day}>
              <p className="label">{weekDay(day)}</p>
              <Overlaps overlaps={overlaps} />
            </div>
          ))}
        <div className={controls.actions}>
          <button
            type="submit"
            className={controls.primary}
            disabled={create.isPending || cannot}
          >
            {days.length === 0 ? s.add : s.addShifts(days.length)}
          </button>
        </div>
        <Note text={note} tone={noteTone} />
        {refusals.length > 0 && (
          <ul className={styles.refusals} role="alert">
            {refusals.map((line) => (
              <li key={line} className={`secondary ${controls.error}`}>
                {line}
              </li>
            ))}
          </ul>
        )}
      </form>
    </Drawer>
  );
}
