"use client";

// The shift drawer of the Weekly Schedule (DESIGN, Shift card, Overlap override): one shift
// opened to change its day and hours or remove it, or a new shift for one employee at one
// jobsite on several days of the week. A shift that would overlap another of that person's
// day is blocked with the hours both cover until an admin overrides it — which shift holds
// the shared time, and why — and the day is shown as it would stand before anything is
// saved. What cannot stand cannot be saved from here; the server judges every save again
// (api assignments/write.ts). A locked shift opens read-only.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { uuidv7 } from "../closeout/uuidv7";
import controls from "../controls.module.css";
import { Field } from "../field";
import { stamp, weekDay } from "../format";
import { Note } from "../note";
import { DestructiveAction } from "../row-editor";
import { strings } from "../strings";
import { useTRPC } from "../trpc";
import { Drawer } from "./drawer";
import styles from "./schedule.module.css";
import {
  type Decision,
  hoursOf,
  issueText,
  overlapsWith,
  previewDay,
  refusalText,
  type Refusal,
  type Week,
  type WeekOverride,
  type WeekShift,
} from "./schedule-view";

const s = strings.schedule;

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.assignment.pathFilter());
}

// What the admin has said about one overlap so far.
type Choice = { holder: "this" | "other" | null; reason: string };
type Choices = Record<string, Choice>;

type Overlap = {
  other: WeekShift;
  start: string;
  end: string;
  // The decision already saved between the two, when there is one.
  existing: WeekOverride | undefined;
};

const overrideBetween = (overrides: WeekOverride[], a: string, b: string) =>
  overrides.find(
    (o) =>
      (o.holderId === a && o.yieldingId === b) ||
      (o.holderId === b && o.yieldingId === a),
  );

const labelOf = (shift: WeekShift) => `${shift.job.name} ${hoursOf(shift)}`;

// For one shift at given hours on one day: its overlaps, what must still be decided, the
// decisions to send, and the day as it would stand.
function judge(
  shift: { id: string; jobId: string; start: string; end: string },
  dayShifts: WeekShift[],
  overrides: WeekOverride[],
  choices: Choices,
  // Whether the saved decisions of this shift still apply: not when it moves to another day.
  keepSaved: boolean,
) {
  const overlaps: Overlap[] = overlapsWith(shift, dayShifts).map((o) => ({
    ...o,
    existing: keepSaved ? overrideBetween(overrides, shift.id, o.other.id) : undefined,
  }));
  const decisions: Decision[] = [];
  const standing: { holderId: string; yieldingId: string }[] = overrides
    .filter((o) => o.holderId !== shift.id && o.yieldingId !== shift.id)
    .filter(
      (o) =>
        dayShifts.some((d) => d.id === o.holderId) &&
        dayShifts.some((d) => d.id === o.yieldingId),
    );
  let undecided = false;
  let unexplained = false;
  for (const { other, existing } of overlaps) {
    const choice = choices[other.id];
    if (choice?.holder != null) {
      const holderId = choice.holder === "this" ? shift.id : other.id;
      standing.push({
        holderId,
        yieldingId: holderId === shift.id ? other.id : shift.id,
      });
      if (choice.reason.trim() === "") unexplained = true;
      decisions.push({
        overrideId: existing?.id ?? uuidv7(),
        otherId: other.id,
        holder: choice.holder,
        reason: choice.reason.trim(),
      });
    } else if (existing !== undefined) {
      standing.push(existing);
    } else {
      undecided = true;
    }
  }
  const preview = previewDay(shift, dayShifts, standing);
  return { overlaps, decisions, preview, undecided, unexplained };
}

function Overlaps({
  idPrefix,
  shiftId,
  selfName,
  judged,
  dayShifts,
  choices,
  onChoose,
  timeZone,
}: {
  idPrefix: string;
  shiftId: string;
  // The jobsite of the shift being written, as the day's preview names it.
  selfName: string;
  judged: ReturnType<typeof judge>;
  dayShifts: WeekShift[];
  choices: Choices;
  onChoose: (otherId: string, choice: Choice | null) => void;
  timeZone: string;
}) {
  const { overlaps, preview, undecided, unexplained } = judged;
  if (overlaps.length === 0) return null;
  const nameOf = (id: string) => {
    if (id === shiftId) return s.thisShift;
    const other = dayShifts.find((d) => d.id === id);
    return other === undefined ? s.thisShift : labelOf(other);
  };
  const jobOf = new Map(dayShifts.map((d) => [d.id, d.job.name]));
  return (
    <section className={styles.overlaps} aria-label={s.overlapsHeading}>
      {overlaps.map(({ other, start, end, existing }) => {
        const choice = choices[other.id];
        const hours = `${start}–${end}`;
        const name = `${idPrefix}-holder-${other.id}`;
        return (
          <div key={other.id} className={styles.overlap}>
            <p className="body">{s.overlap(labelOf(other), hours)}</p>
            {existing !== undefined && choice === undefined && (
              <>
                <p className="secondary">
                  {s.holds(nameOf(existing.holderId), hours)} {existing.reason}
                </p>
                <p className={`secondary ${styles.meta}`}>
                  {s.decidedBy(existing.by, stamp(existing.at, timeZone))}
                </p>
                <button
                  type="button"
                  className={controls.secondary}
                  onClick={() =>
                    onChoose(other.id, {
                      holder: existing.holderId === shiftId ? "this" : "other",
                      reason: existing.reason,
                    })
                  }
                >
                  {s.changeDecision}
                </button>
              </>
            )}
            {existing === undefined && choice === undefined && (
              <button
                type="button"
                className={controls.secondary}
                onClick={() => onChoose(other.id, { holder: null, reason: "" })}
              >
                {s.overrideAsAdmin}
              </button>
            )}
            {choice !== undefined && (
              <>
                <fieldset className={styles.holder}>
                  <legend className="label">{s.whoHolds(hours)}</legend>
                  {(["this", "other"] as const).map((holder) => (
                    <label key={holder} className={controls.check}>
                      <input
                        type="radio"
                        name={name}
                        checked={choice.holder === holder}
                        onChange={() => onChoose(other.id, { ...choice, holder })}
                      />
                      <span>
                        {holder === "this" ? s.thisShift : s.otherShift(labelOf(other))}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Field id={`${name}-reason`} label={s.reason}>
                  <input
                    id={`${name}-reason`}
                    className={controls.input}
                    maxLength={500}
                    required
                    value={choice.reason}
                    onChange={(e) =>
                      onChoose(other.id, { ...choice, reason: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
          </div>
        );
      })}
      {!undecided && preview.ok && (
        <div className={styles.preview}>
          <p className="label">{s.dayPreview}</p>
          <ul>
            {preview.timeline.map((segment) => (
              <li key={`${segment.start}-${segment.shiftId}`} className="secondary">
                {s.previewLine(
                  `${segment.start}–${segment.end}`,
                  segment.shiftId === shiftId
                    ? selfName
                    : (jobOf.get(segment.shiftId) ?? ""),
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Why the save is disabled, said where a screen reader hears it change. */}
      <p className={`secondary ${controls.note} ${controls.error}`} role="status">
        {undecided
          ? ""
          : !preview.ok
            ? `${s.cannotSave} ${preview.issues.map((i) => issueText(i, nameOf)).join(" ")}`
            : unexplained
              ? s.reasonRequired
              : ""}
      </p>
    </section>
  );
}

const blocked = (j: ReturnType<typeof judge>) =>
  j.undecided || j.unexplained || !j.preview.ok;

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
  const [choices, setChoices] = useState<Choices>({});
  const [note, setNote] = useState<string | null>(null);
  const [removeNote, setRemoveNote] = useState<string | null>(null);

  const dayShifts = week.shifts.filter(
    (other) => other.worker.id === shift.worker.id && other.workDate === workDate,
  );
  const judged = judge(
    { id: shift.id, jobId: shift.job.id, start, end },
    dayShifts,
    week.overrides,
    choices,
    workDate === shift.workDate,
  );
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
      decisions: judged.decisions,
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
          <Link href="/ledger">{s.correctInLabor}</Link>
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
            onChange={(e) => {
              setWorkDate(e.target.value);
              setChoices({});
            }}
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
        <Overlaps
          idPrefix={formId}
          shiftId={shift.id}
          selfName={shift.job.name}
          judged={judged}
          dayShifts={dayShifts}
          choices={choices}
          onChoose={(otherId, choice) =>
            setChoices((c) => {
              const next = { ...c };
              if (choice === null) delete next[otherId];
              else next[otherId] = choice;
              return next;
            })
          }
          timeZone={week.timezone}
        />
        <div className={controls.actions}>
          <button
            type="submit"
            className={controls.primary}
            disabled={busy || blocked(judged)}
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
  // One set of choices per day: the same hours may overlap different shifts on each.
  const [choices, setChoices] = useState<Record<string, Choices>>({});
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
    const id = idFor(day);
    return {
      day,
      id,
      dayShifts,
      judged: judge(
        { id, jobId, start, end },
        dayShifts,
        week.overrides,
        choices[day] ?? {},
        true,
      ),
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
      days: perDay.map(({ day, id, judged }) => ({
        id,
        workDate: day,
        decisions: judged.decisions,
      })),
    });
  };
  const cannot = perDay.some(({ judged }) => blocked(judged));
  return (
    <Drawer title={s.addShift} onClose={() => onClose(null)}>
      <form onSubmit={submit} className={styles.form}>
        <Field id={`${formId}-person`} label={s.employee}>
          <select
            id={`${formId}-person`}
            className={controls.select}
            required
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setChoices({});
            }}
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
        {end > start &&
          perDay
            .filter(({ judged }) => judged.overlaps.length > 0)
            .map(({ day, id, dayShifts, judged }) => (
              <div key={day}>
                <p className="label">{weekDay(day)}</p>
                <Overlaps
                  idPrefix={`${formId}-${day}`}
                  shiftId={id}
                  selfName={jobs.find((j) => j.id === jobId)?.name ?? s.thisShift}
                  judged={judged}
                  dayShifts={dayShifts}
                  choices={choices[day] ?? {}}
                  onChoose={(otherId, choice) =>
                    setChoices((all) => {
                      const next = { ...(all[day] ?? {}) };
                      if (choice === null) delete next[otherId];
                      else next[otherId] = choice;
                      return { ...all, [day]: next };
                    })
                  }
                  timeZone={week.timezone}
                />
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
