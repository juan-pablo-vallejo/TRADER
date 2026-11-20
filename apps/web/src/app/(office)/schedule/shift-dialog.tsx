"use client";

// The shift drawer of the Weekly Schedule: one shift opened to change its day and hours or
// remove it, or a new shift for one employee at one jobsite on several days of the week. A
// shift that would overlap another of that person's day cannot be saved: the hours both
// cover are shown, and the server refuses it again (api assignments/write.ts). That
// person's week stands beside the form, so an overlap is seen before saving.
//
// A shift someone has clocked in on is started: its day and start are fixed, and it is
// not read-only. It can end early, and the person can be moved to another jobsite from
// the time now (api assignments/move.ts); each says what it will do before it does it.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { uuidv7 } from "../../uuidv7";
import controls from "../../controls.module.css";
import { Field } from "../../field";
import { Note } from "../../note";
import { DestructiveAction } from "../../row-editor";
import { useStrings } from "../../i18n";
import { StatusBadge } from "../../status-badge";
import { useTRPC } from "../../trpc";
import { Drawer } from "./drawer";
import styles from "./schedule.module.css";
import {
  hoursOf,
  nowIn,
  offeredTimes,
  overlapsWith,
  personWeek,
  refusalText,
  type Refusal,
  type Week,
  type WeekShift,
} from "./schedule-view";
import { sameAs, type Change } from "./optimistic";

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.assignment.pathFilter());
}

const labelOf = (shift: WeekShift) => `${shift.job.name} ${hoursOf(shift)}`;

type Overlap = ReturnType<typeof overlapsWith>[number];

// That person's week, beside the form: every shift of theirs, day by day, with the one
// being changed marked. Read-only: it is there to be looked at while the hours are typed.
function PersonWeek({
  week,
  userId,
  name,
  current,
}: {
  week: Week;
  userId: string;
  name: string;
  current?: string;
}) {
  const { t, f } = useStrings();
  const s = t.schedule;
  const days = personWeek(week, userId);
  return (
    <aside className={styles.personWeek} aria-label={s.personWeek(name)}>
      <h3 className="label">{s.personWeek(name)}</h3>
      {days.every((d) => d.shifts.length === 0) ? (
        <p className="secondary">{s.personWeekEmpty}</p>
      ) : (
        <dl>
          {days
            .filter((d) => d.shifts.length > 0)
            .map(({ day, shifts }) => (
              <div key={day}>
                <dt className="secondary">{f.weekDay(day)}</dt>
                {shifts.map((shift) => (
                  <dd
                    key={shift.id}
                    className={shift.id === current ? "body-strong" : "body"}
                    aria-current={shift.id === current ? "true" : undefined}
                  >
                    <span className={styles.hours}>{hoursOf(shift)}</span>{" "}
                    {shift.job.name}
                    {shift.locked && <StatusBadge tone="active" label={s.locked} />}
                  </dd>
                ))}
              </div>
            ))}
        </dl>
      )}
    </aside>
  );
}

// A started shift: what can still be done with it. Ending it early trims its end and
// nothing else; moving the person ends it at the time now and starts a shift on the other
// jobsite that runs to the end this one had. Neither writes a clock entry: the person
// clocks out, or switches, on their own phone.
function Started({
  shift,
  week,
  jobs,
  onClose,
}: {
  shift: WeekShift;
  week: Week;
  jobs: { id: string; name: string }[];
  onClose: (note: string | null) => void;
}) {
  const { t } = useStrings();
  const s = t.schedule;
  const trpc = useTRPC();
  const refresh = useRefresh();
  const formId = useId();
  const now = nowIn(week.timezone);
  // Under way: today, and the time now inside its hours. Only then can someone be moved.
  const underWay =
    shift.workDate === now.day &&
    shift.expectedStart <= now.minute &&
    now.minute < shift.expectedEnd;
  const [endAt, setEndAt] = useState(underWay ? now.minute : shift.expectedEnd);
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // The new shift's id, kept while the drawer is open: a move sent again is the same move.
  const [moveId] = useState(uuidv7);
  const label = (id: string) => {
    const other = week.shifts.find((x) => x.id === id);
    return other === undefined || id === shift.id ? s.thisShift : labelOf(other);
  };
  const said = (answer: { result: string; code?: string }): string =>
    answer.code === "not_earlier"
      ? s.notEarlier
      : answer.code === "same_job"
        ? s.sameJob
        : answer.code === "schedule" || answer.code === "authorization"
          ? refusalText(s, answer as Refusal, label)
          : answer.code === "user_inactive" || answer.code === "job_archived"
            ? refusalText(s, answer as Refusal, label)
            : s.refused.stale;

  const endEarly = useMutation(
    trpc.assignment.endEarly.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") return setNote(said(answer));
        await refresh();
        onClose(answer.result === "unchanged" ? t.unchanged : s.endedEarly);
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const move = useMutation(
    trpc.assignment.moveToday.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") return setNote(said(answer));
        await refresh();
        onClose(s.moved);
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const busy = endEarly.isPending || move.isPending;
  const endProblem =
    endAt === ""
      ? s.notEarlier
      : endAt >= shift.expectedEnd
        ? s.notEarlier
        : endAt <= shift.expectedStart
          ? s.notAfterStart
          : null;
  const others = jobs.filter((j) => j.id !== shift.job.id);
  const target = others.find((j) => j.id === jobId);

  return (
    <>
      <p className="secondary">{s.lockedExplain}</p>
      <section className={styles.started} aria-label={s.endEarly}>
        <Field id={`${formId}-end`} label={s.endEarlyAt}>
          <input
            id={`${formId}-end`}
            className={controls.input}
            type="time"
            required
            value={endAt}
            max={shift.expectedEnd}
            onChange={(e) => {
              setNote(null);
              setEndAt(e.target.value);
            }}
          />
        </Field>
        {endProblem !== null && endAt !== shift.expectedEnd && (
          <p className={`secondary ${controls.error}`} role="alert">
            {endProblem}
          </p>
        )}
        <DestructiveAction
          label={s.endEarly}
          effect={s.endEarlyEffect(
            shift.worker.name,
            shift.job.name,
            shift.expectedEnd,
            endAt,
          )}
          disabled={busy || endProblem !== null}
          onConfirm={() => {
            setNote(null);
            endEarly.mutate({ assignmentId: shift.id, expectedEnd: endAt });
          }}
        />
      </section>
      <section className={styles.started} aria-label={s.move}>
        <h3 className="body-strong">{s.move}</h3>
        {!underWay ? (
          <p className="secondary">{s.moveNotNow}</p>
        ) : (
          <>
            <p className="secondary">{s.moveNow(now.minute)}</p>
            <Field id={`${formId}-job`} label={s.moveTo}>
              <select
                id={`${formId}-job`}
                className={controls.select}
                value={jobId}
                onChange={(e) => {
                  setNote(null);
                  setJobId(e.target.value);
                }}
              >
                <option value="" />
                {others.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </Field>
            <DestructiveAction
              label={s.move}
              effect={s.moveEffect(
                shift.worker.name,
                shift.job.name,
                target?.name ?? "",
                now.minute,
                shift.expectedEnd,
              )}
              disabled={busy || target === undefined}
              onConfirm={() => {
                setNote(null);
                // The minute is read at the press, and the end always goes with it: the
                // shift under way gives its own, and with none covering that minute by
                // then the server still has one to use (`end_required` otherwise).
                const at = nowIn(week.timezone).minute;
                move.mutate({
                  id: moveId,
                  userId: shift.worker.id,
                  jobId,
                  at,
                  expectedEnd: shift.expectedEnd > at ? shift.expectedEnd : "23:59",
                });
              }}
            />
          </>
        )}
      </section>
      <Note text={note} />
      <p className={styles.link}>
        <Link href="/hours">{s.correctInLabor}</Link>
      </p>
    </>
  );
}

// The shifts this one would overlap, and why it cannot be saved while it does.
function Overlaps({ overlaps }: { overlaps: Overlap[] }) {
  const { t } = useStrings();
  const s = t.schedule;
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
  jobs,
  onClose,
  onChange,
}: {
  shift: WeekShift;
  week: Week;
  // The jobsites a started shift's person can be moved to.
  jobs: { id: string; name: string }[];
  onClose: (note: string | null) => void;
  // A change to a shift nobody has started: the screen draws it at once, sends it and
  // offers Undo (optimistic.ts). This dialog only says what is wanted, and closes.
  onChange: (change: Change) => void;
}) {
  const { t, f } = useStrings();
  const s = t.schedule;
  const formId = useId();
  const [workDate, setWorkDate] = useState(shift.workDate);
  const [start, setStart] = useState(shift.expectedStart);
  const [end, setEnd] = useState(shift.expectedEnd);
  const [note, setNote] = useState<string | null>(null);

  const dayShifts = week.shifts.filter(
    (other) => other.worker.id === shift.worker.id && other.workDate === workDate,
  );
  const overlaps =
    end > start ? overlapsWith({ id: shift.id, start, end }, dayShifts) : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    if (end <= start) {
      setNote(s.endAfterStart);
      return;
    }
    const to = { workDate, expectedStart: start, expectedEnd: end };
    if (sameAs(shift, to)) return onClose(t.unchanged);
    onChange({ kind: "update", shift, to });
  };
  const title = s.shiftOf(shift.worker.name);

  if (shift.locked) {
    return (
      <Drawer title={title} onClose={() => onClose(null)} wide>
        <div className={styles.beside}>
          <div>
            <p className="body-strong">{shift.job.name}</p>
            <p className={`body ${styles.hours}`}>
              {f.weekDay(shift.workDate)} · {hoursOf(shift)}{" "}
              <StatusBadge tone="active" label={s.locked} />
            </p>
            <Started shift={shift} week={week} jobs={jobs} onClose={onClose} />
          </div>
          <PersonWeek
            week={week}
            userId={shift.worker.id}
            name={shift.worker.name}
            current={shift.id}
          />
        </div>
      </Drawer>
    );
  }
  return (
    <Drawer title={title} onClose={() => onClose(null)} wide>
      <div className={styles.beside}>
        <div>
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
                    {f.weekDay(day)}
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
                disabled={overlaps.length > 0}
              >
                {s.save}
              </button>
            </div>
            <Note text={note} />
          </form>
          <div className={styles.remove}>
            <DestructiveAction
              label={s.remove}
              effect={s.removeEffect(
                shift.worker.name,
                shift.job.name,
                f.weekDay(shift.workDate),
              )}
              disabled={false}
              onConfirm={() => onChange({ kind: "remove", shift })}
            />
          </div>
        </div>
        <PersonWeek
          week={week}
          userId={shift.worker.id}
          name={shift.worker.name}
          current={shift.id}
        />
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
  const { t, f } = useStrings();
  const s = t.schedule;
  const trpc = useTRPC();
  const refresh = useRefresh();
  const formId = useId();
  const [userId, setUserId] = useState(first.userId ?? "");
  const [jobId, setJobId] = useState("");
  const [days, setDays] = useState<string[]>(first.day === undefined ? [] : [first.day]);
  // A shift opened from today's column starts from the time now, not from this morning.
  const [offered] = useState(() => offeredTimes(first.day ?? "", nowIn(week.timezone)));
  const [start, setStart] = useState(offered.start);
  const [end, setEnd] = useState(offered.end);
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
          setNote(refusalText(s, answer, label));
          return;
        }
        await refresh();
        const count = (result: string) =>
          answer.days.filter((d) => d.result === result).length;
        const refused = answer.days.flatMap((d) =>
          d.result === "rejected"
            ? [s.notAdded(f.weekDay(d.workDate), refusalText(s, d as Refusal, label))]
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
      onError: () => setNote(t.requestFailed),
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
    <Drawer title={s.addShift} onClose={() => onClose(null)} wide={userId !== ""}>
      <div className={userId === "" ? undefined : styles.beside}>
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
              // Opened from a person's cell, the person and the day are already said: the
              // jobsite is the one thing left to choose.
              data-autofocus={first.userId !== undefined ? "" : undefined}
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
                <span>{f.weekDay(day)}</span>
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
                <p className="label">{f.weekDay(day)}</p>
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
        {userId !== "" && (
          <PersonWeek
            week={week}
            userId={userId}
            name={people.find((p) => p.id === userId)?.name ?? ""}
          />
        )}
      </div>
    </Drawer>
  );
}
