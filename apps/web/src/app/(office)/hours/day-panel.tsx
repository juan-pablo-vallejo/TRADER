"use client";

// A person's day, in the side panel a cell of the Hours week opens: each session of that
// work date as the server derives it, and under it each entry with its time, who recorded
// it and its flags. A correction stands beside the entry it replaced, both values shown:
// nothing here is erased. Times are in the zone the work dates were judged in, never the
// browser's.
//
// It is also where the office fixes a mistake, and the action is named Correct, never
// Edit: nothing is edited. A session opens its editor inside the panel: change the time
// of an entry in effect or the job of its clock in, add entries that are missing, or void
// the session; above the sessions, hours nobody recorded are added whole. As the times
// are typed the hours they would give are shown, a preview only (correction-set.ts). Each save
// is one `labor.correct` set, written all or nothing, taking effect at once; what it wrote
// is read back from the server, so the panel never shows a correction the server has not
// confirmed, and the week behind it is read again.
//
// Which person and day is the address's to say (hours-view.ts, DAY_FILTERS), so a panel
// can be linked.
import { instantToWall } from "@trader/api/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import controls from "../../controls.module.css";
import { blocking, codeOf, EmptyState, Failure, RefreshFailed } from "../../failure";
import { LoadingRows } from "../../loading-rows";
import { Field } from "../../field";
import { Note } from "../../note";
import { DestructiveAction, EditorFooter, EditorSection } from "../../row-editor";
import { useStrings } from "../../i18n";
import { SidePanel } from "../../side-panel";
import { StatusBadge } from "../../status-badge";
import { useTRPC } from "../../trpc";
import styles from "./day-panel.module.css";
import {
  createMinter,
  draftOf,
  inEffect,
  missingHours,
  missingPreview,
  sessionOperations,
  sessionPreview,
  voidOperation,
  type AddedType,
  type LedgerEvent,
  type LedgerSession,
  type Preview,
  type CorrectionInput,
  type SessionDraft,
  type Unminted,
} from "./correction-set";

type Lookup = { workerId: string; from: string; to: string };

// Every answer `labor.correct` refuses with has a sentence: a code added on the server fails
// to compile here until it has one.
type CorrectionCode = Extract<
  inferRouterOutputs<AppRouter>["labor"]["correct"],
  { result: "rejected" }
>["code"];
// Held to the catalog: `correctionRejected` must have a sentence for each.
type Rejected = Record<CorrectionCode, string>;

// The server's refusal of a correction: it names the entries, not one field, so the
// sentence itself takes the focus (read at once, scrolled to), and the focus stays in the
// editor rather than falling to the page.
function Refusal({ text }: { text: string | null }) {
  const at = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (text !== null) at.current?.focus();
  }, [text]);
  return (
    <div ref={at} tabIndex={-1} className={styles.refusal}>
      <Note text={text} />
    </div>
  );
}

// The editor for hours nobody recorded has no session to hang from.
const MISSING = "missing";

// The button that opens an editor: focus goes back to it when its correction is written.
const toggleId = (key: string) => `correct-toggle-${key}`;

type JobOption = { id: string; name: string; archived: boolean };
// What a correction did, said beneath the control that opened its editor.
type Notice = { key: string; text: string; ok: boolean };
type Outcome = "saved" | "changed";

// Two instants on the same calendar day in the company's zone.
const sameDay = (a: string | Date, b: string | Date, zone: string): boolean =>
  instantToWall(new Date(a), zone).slice(0, 10) ===
  instantToWall(new Date(b), zone).slice(0, 10);

export function DayPanel({
  workerId,
  day,
  signInHref,
  onClose,
}: {
  workerId: string;
  day: string;
  signInHref: string;
  onClose: () => void;
}) {
  const { t, f } = useStrings();
  const trpc = useTRPC();
  const asked: Lookup = { workerId, from: day, to: day };
  // The same read the ledger below makes: here only for the person's name in the title.
  const ledger = useQuery(
    trpc.labor.ledger.queryOptions(asked, {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  );
  const title =
    ledger.data === undefined
      ? f.weekDay(day)
      : t.dayOf(ledger.data.worker.name, f.weekDay(day));
  return (
    <SidePanel title={title} onClose={onClose} wide>
      <Ledger asked={asked} signInHref={signInHref} />
    </SidePanel>
  );
}

// An entry's flags as badges. A `location` flag says which it is: no stamp was recorded,
// or one was and it is off the jobsite.
function EntryFlags({ entry }: { entry: LedgerEvent }) {
  const { t } = useStrings();
  if (entry.flags.length === 0) return null;
  return (
    <span className={styles.badges}>
      {entry.flags.map((flag) => (
        <StatusBadge
          key={flag}
          tone="attention"
          label={
            flag === "location"
              ? entry.hasLocation
                ? t.offSite
                : t.noLocation
              : t.reasonTags[flag]
          }
        />
      ))}
    </span>
  );
}

// A session's entries: one line per entry in effect, in the order they happened, and
// under each the entries a correction replaced, with what they said. A void is a line of
// its own, last.
function Entries({ session, zone }: { session: LedgerSession; zone: string }) {
  const { t, f } = useStrings();
  const byRoot = new Map<string, LedgerEvent[]>();
  const voids: LedgerEvent[] = [];
  for (const e of session.events) {
    if (e.type === "voided") voids.push(e);
    else {
      const root = e.correctsEventId ?? e.id;
      byRoot.set(root, [...(byRoot.get(root) ?? []), e]);
    }
  }
  const rows = [...byRoot.values()]
    .map((list) => ({
      now: list.find((e) => e.effect === "in_effect") ?? list.at(-1)!,
      before: list.filter((e) => e.effect === "superseded"),
    }))
    .sort((a, b) => a.now.clientTimestamp.getTime() - b.now.clientTimestamp.getTime());
  const by = (e: LedgerEvent) =>
    `${t.entryBy(e.initiator.name)} · ${t.entryReceived(f.stamp(e.serverTimestamp, zone))}`;
  return (
    <ul className={styles.entries}>
      {rows.map(({ now, before }) => (
        <li key={now.id}>
          <p className={styles.entry}>
            <span className="body-strong">{t.entryTypes[now.type]}</span>
            <span className={styles.time}>{f.stamp(now.clientTimestamp, zone)}</span>
            <EntryFlags entry={now} />
          </p>
          {before.map((was) => (
            <p key={was.id} className={`secondary ${styles.was}`}>
              <span>
                {t.entryWas(f.stamp(was.clientTimestamp, zone))}
                {was.job.id !== now.job.id && ` · ${was.job.name}`}
              </span>
              <EntryFlags entry={was} />
              <span>{by(was)}</span>
            </p>
          ))}
          <p className="secondary">{by(now)}</p>
        </li>
      ))}
      {voids.map((e) => (
        <li key={e.id}>
          <p className={styles.entry}>
            <span className="body-strong">{t.entryVoids}</span>
            <span className={styles.time}>{f.stamp(e.serverTimestamp, zone)}</span>
          </p>
          <p className="secondary">{t.entryBy(e.initiator.name)}</p>
        </li>
      ))}
    </ul>
  );
}

// The hours a draft would give, said beneath its times as they are typed.
function PreviewLine({ preview }: { preview: Preview }) {
  const { t, f } = useStrings();
  return (
    <p className={`secondary ${styles.preview}`} role="status">
      {preview === null
        ? t.previewNone
        : preview.open
          ? t.previewOpen(f.duration(preview.workedMs))
          : t.previewWorked(f.duration(preview.workedMs))}
    </p>
  );
}

function Ledger({ asked, signInHref }: { asked: Lookup; signInHref: string }) {
  const { t, f } = useStrings();
  const trpc = useTRPC();
  // Not refetched behind an open editor, on focus or on reconnect: a new answer would
  // remount the editor and lose what is typed, and a correction is built from what is on
  // screen; the server refuses one built from an entry no longer in effect.
  const ledger = useQuery(
    trpc.labor.ledger.queryOptions(asked, {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  );
  const jobs = useQuery(trpc.job.list.queryOptions());
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (ledger.isPending) return <LoadingRows rows={3} />;
  if (blocking([ledger]) !== undefined || ledger.data === undefined) {
    return (
      <Failure
        error={ledger.error}
        signInHref={signInHref}
        onRetry={() => void ledger.refetch()}
      />
    );
  }
  const r = ledger.data;
  const zone = r.timezone;
  const openElsewhere =
    r.openSession !== null &&
    !r.sessions.some((s) => s.rootEventId === r.openSession?.rootEventId);
  const jobOptions: JobOption[] = (jobs.data ?? []).map((j) => ({
    id: j.id,
    name: j.name,
    archived: j.status === "archived",
  }));

  const toggle = (key: string) => {
    setNotice(null);
    setOpen((was) => (was === key ? null : key));
  };
  // A correction that was written closes its editor and hands focus back to what opened it; one
  // the ledger had moved under stays open on the ledger as it is now. Either way the ledger
  // is read again: what is shown is the server's.
  const settle = (key: string) => (outcome: Outcome) => {
    const written = outcome !== "changed";
    setNotice({
      key,
      text: outcome === "saved" ? t.correctionSaved : t.correctionChanged,
      ok: written,
    });
    if (written) {
      setOpen(null);
      document.getElementById(toggleId(key))?.focus();
    }
    void ledger.refetch();
    // The week behind the panel shows the hours as they are now.
    void queryClient.invalidateQueries(trpc.labor.hours.queryFilter());
  };
  const noteFor = (key: string) => (
    <Note
      text={notice?.key === key ? notice.text : null}
      tone={notice?.ok === true ? "saved" : "error"}
    />
  );

  return (
    <section aria-label={r.worker.name}>
      <RefreshFailed reads={[ledger]} />
      <p className={`secondary ${styles.line}`}>
        {[t.roles[r.worker.role], r.worker.active ? null : t.deactivated, t.timesIn(zone)]
          .filter((part) => part !== null)
          .join(" · ")}
      </p>
      {openElsewhere && r.openSession !== null && (
        <div className={controls.banner} role="status">
          <p className="body-strong">{t.hoursOpenSince(f.day(r.openSession.workDate))}</p>
        </div>
      )}
      <div className={styles.actions}>
        <button
          id={toggleId(MISSING)}
          type="button"
          className={controls.secondary}
          aria-expanded={open === MISSING}
          aria-controls={`correct-${MISSING}`}
          onClick={() => toggle(MISSING)}
        >
          {t.addMissingHours}
        </button>
        {noteFor(MISSING)}
      </div>
      {open === MISSING && (
        <MissingHours
          workerId={r.worker.id}
          zone={zone}
          jobs={jobOptions}
          onDone={settle(MISSING)}
        />
      )}
      {r.sessions.length === 0 ? (
        <EmptyState text={t.emptyHours} />
      ) : (
        r.sessions.map((s) => (
          <div key={s.rootEventId} className={styles.session}>
            <h3 className="body-strong">
              {s.job.name} · {f.clock(s.startedAt, zone)}–
              {s.endedAt === null
                ? ""
                : // An end on another day than the start says its date.
                  sameDay(s.startedAt, s.endedAt, zone)
                  ? f.clock(s.endedAt, zone)
                  : f.stamp(s.endedAt, zone)}
            </h3>
            <p className={`secondary ${styles.line} ${styles.flags}`}>
              <span>
                {[
                  `${t.worked} ${f.duration(s.structuralWorkedMs)}`,
                  s.breakMs === 0 ? null : `${t.breaks} ${f.duration(s.breakMs)}`,
                  s.job.status === "archived" ? t.jobStatus.archived : null,
                  s.corrected ? t.timeCorrected : null,
                  t.sessionCounts[s.accounting],
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </span>
              {!s.complete && <StatusBadge tone="active" label={t.stillOpen} />}
            </p>
            <Entries session={s} zone={zone} />
            <div className={styles.actions}>
              <button
                id={toggleId(s.rootEventId)}
                type="button"
                className={controls.textAction}
                aria-expanded={open === s.rootEventId}
                aria-controls={`correct-${s.rootEventId}`}
                onClick={() => toggle(s.rootEventId)}
              >
                {t.correct}
                <span className="visually-hidden">{`: ${s.job.name}, ${f.stamp(s.startedAt, zone)}`}</span>
              </button>
              {noteFor(s.rootEventId)}
            </div>
            {open === s.rootEventId && (
              <SessionCorrection
                // A ledger read again is a new draft: the entries in effect may differ.
                key={ledger.dataUpdatedAt}
                session={s}
                workerId={r.worker.id}
                zone={zone}
                jobs={jobOptions}
                onDone={settle(s.rootEventId)}
              />
            )}
          </div>
        ))
      )}
    </section>
  );
}

// Sends one correction set and sorts its answer. `accepted` and `duplicate` are both the set as
// written; `correction_stale` is a ledger that moved, and the screen reads it again; any other
// refusal wrote nothing and is said in the editor, which stays as the office left it. The
// set keeps its ids for as long as it is unchanged (correction-set.ts), so sending again after
// no answer cannot record it twice.
function useCorrection(workerId: string, onDone: (outcome: Outcome) => void) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const correct = useMutation(trpc.labor.correct.mutationOptions());
  const minter = useRef(createMinter());
  const [refusal, setRefusal] = useState<string | null>(null);
  const send = (operations: Unminted[]) => {
    setRefusal(null);
    const input: CorrectionInput = minter.current(workerId, operations);
    correct.mutate(input, {
      onSuccess: (answer) => {
        if (answer.result !== "rejected") return onDone("saved");
        if (answer.code === "correction_stale") return onDone("changed");
        // The ids are taken: the same set goes again under new ones.
        if (answer.code === "id_conflict") minter.current = createMinter();
        setRefusal((t.correctionRejected satisfies Rejected)[answer.code]);
      },
      onError: (error) =>
        setRefusal(codeOf(error) === "FORBIDDEN" ? t.notPermitted : t.correctionUnsent),
    });
  };
  return { send, sending: correct.isPending, refusal, setRefusal };
}

// An editor as it opens: brought into view inside the panel, which at phone width opens it
// below the screen, and its first field given the focus.
function useRevealed() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (form === null) return;
    form.scrollIntoView({ block: "nearest" });
    form
      .querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")
      ?.focus({ preventScroll: true });
  }, []);
  return ref;
}

// A date and time as the company's clock read it. The control has no zone of its own; the
// screen says which one above the days.
function TimeField({
  id,
  label,
  value,
  required,
  bad,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  required: boolean;
  bad: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useStrings();
  return (
    <Field id={id} label={label}>
      <input
        id={id}
        className={controls.input}
        type="datetime-local"
        required={required}
        value={value}
        aria-invalid={bad}
        aria-describedby={bad ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {bad && (
        <p id={`${id}-error`} className={`secondary ${controls.error}`} role="alert">
          {t.correctionBadTime}
        </p>
      )}
    </Field>
  );
}

function JobSelect({
  id,
  value,
  jobs,
  onChange,
}: {
  id: string;
  value: string;
  jobs: JobOption[];
  onChange: (value: string) => void;
}) {
  const { t } = useStrings();
  return (
    <Field id={id} label={t.job}>
      <select
        id={id}
        className={controls.select}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {value === "" && <option value="">{t.chooseJob}</option>}
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.archived ? t.jobOptionArchived(j.name) : j.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const ADDED_TYPES: AddedType[] = ["paused", "resumed", "ended"];

// One session's correction: every entry in effect with its time, the clock in's job, entries to
// add, and — last and alone — the void. One Save is one set, because some corrections are only
// legal together: a break is its start and its end, and a session moved later is its clock
// in and its clock out.
function SessionCorrection({
  session,
  workerId,
  zone,
  jobs,
  onDone,
}: {
  session: LedgerSession;
  workerId: string;
  zone: string;
  jobs: JobOption[];
  onDone: (outcome: Outcome) => void;
}) {
  const { t, f } = useStrings();
  const id = session.rootEventId;
  const [draft, setDraft] = useState<SessionDraft>(() => draftOf(session, zone));
  const [badField, setBadField] = useState<string | null>(null);
  const { send, sending, refusal, setRefusal } = useCorrection(workerId, onDone);
  const revealed = useRevealed();
  const voided = session.events.some((e) => e.effect === "void");
  // The session's own job is always offered, listed or not.
  const options = jobs.some((j) => j.id === session.job.id)
    ? jobs
    : [
        {
          id: session.job.id,
          name: session.job.name,
          archived: session.job.status === "archived",
        },
        ...jobs,
      ];
  const change = (next: SessionDraft) => {
    setBadField(null);
    setRefusal(null);
    setDraft(next);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    setBadField(null);
    const built = sessionOperations(session, draft, zone);
    if (!built.ok) {
      if (built.problem === "bad_time") {
        setRefusal(null);
        setBadField(built.field);
      } else setRefusal(t.correctionTooMany);
      return;
    }
    if (built.operations.length === 0) return setRefusal(t.unchanged);
    send(built.operations);
  };

  return (
    <form
      ref={revealed}
      id={`correct-${id}`}
      className={`${controls.card} ${styles.editor}`}
      aria-label={t.correctionOf(session.job.name, f.stamp(session.startedAt, zone))}
      noValidate
      onSubmit={save}
    >
      <p className="secondary">{t.correctionExplain}</p>
      <EditorSection heading={t.correctionTimes}>
        <div className={styles.fields}>
          {inEffect(session).map((e) => (
            <TimeField
              key={e.id}
              id={`correct-${id}-${e.id}`}
              label={t.entryTypes[e.type]}
              value={draft.times[e.id] ?? ""}
              required
              bad={badField === e.id}
              onChange={(at) =>
                change({ ...draft, times: { ...draft.times, [e.id]: at } })
              }
            />
          ))}
          <JobSelect
            id={`correct-${id}-job`}
            value={draft.jobId}
            jobs={options}
            onChange={(jobId) => change({ ...draft, jobId })}
          />
        </div>
      </EditorSection>
      <PreviewLine preview={sessionPreview(session, draft, zone)} />
      <EditorSection heading={t.correctionAdded}>
        {draft.added.map((added, i) => {
          const set = (patch: Partial<SessionDraft["added"][number]>) =>
            change({
              ...draft,
              added: draft.added.map((a, n) => (n === i ? { ...a, ...patch } : a)),
            });
          return (
            // By position: the rows have no identity of their own until they are saved.
            <div key={i} className={styles.added}>
              <Field id={`correct-${id}-added-${i}-type`} label={t.addedEntryType(i + 1)}>
                <select
                  id={`correct-${id}-added-${i}-type`}
                  className={controls.select}
                  value={added.type}
                  onChange={(e) => set({ type: e.target.value as AddedType })}
                >
                  {ADDED_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t.entryTypes[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <TimeField
                id={`correct-${id}-added-${i}`}
                label={t.addedEntryTime(i + 1)}
                value={added.at}
                required
                bad={badField === `added-${i}`}
                onChange={(at) => set({ at })}
              />
              <button
                type="button"
                className={controls.quiet}
                onClick={() =>
                  change({ ...draft, added: draft.added.filter((_, n) => n !== i) })
                }
              >
                {t.remove}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={controls.secondary}
          onClick={() =>
            change({ ...draft, added: [...draft.added, { type: "ended", at: "" }] })
          }
        >
          {t.addEntry}
        </button>
      </EditorSection>
      <EditorSection>
        <button type="submit" className={controls.secondary} disabled={sending}>
          {t.saveCorrection}
        </button>
        <Refusal text={refusal} />
      </EditorSection>
      {!voided && (
        <EditorFooter>
          <DestructiveAction
            label={t.voidSession}
            effect={t.voidSessionEffect}
            disabled={sending}
            onConfirm={() => send(voidOperation(session))}
          />
        </EditorFooter>
      )}
    </form>
  );
}

// Hours nobody recorded — a phone that never sent them, or an entry the server refused as
// timed in the future: a clock in and, when known, the clock out, as one set.
function MissingHours({
  workerId,
  zone,
  jobs,
  onDone,
}: {
  workerId: string;
  zone: string;
  jobs: JobOption[];
  onDone: (outcome: Outcome) => void;
}) {
  const { t } = useStrings();
  const [draft, setDraft] = useState({ jobId: "", start: "", end: "" });
  const [badField, setBadField] = useState<string | null>(null);
  const { send, sending, refusal, setRefusal } = useCorrection(workerId, onDone);
  const revealed = useRevealed();
  const change = (patch: Partial<typeof draft>) => {
    setBadField(null);
    setRefusal(null);
    setDraft({ ...draft, ...patch });
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    setBadField(null);
    if (draft.jobId === "") return;
    const built = missingHours(draft, zone);
    if (!built.ok) {
      setRefusal(null);
      return setBadField(built.problem === "bad_time" ? built.field : null);
    }
    send(built.operations);
  };
  return (
    <form
      ref={revealed}
      id={`correct-${MISSING}`}
      className={`${controls.card} ${styles.editor}`}
      aria-label={t.addMissingHours}
      noValidate
      onSubmit={save}
    >
      <p className="secondary">{t.missingHoursExplain}</p>
      <div className={styles.fields}>
        <JobSelect
          id="missing-job"
          value={draft.jobId}
          jobs={jobs}
          onChange={(jobId) => change({ jobId })}
        />
        <TimeField
          id="missing-start"
          label={t.missingClockIn}
          value={draft.start}
          required
          bad={badField === "start"}
          onChange={(start) => change({ start })}
        />
        <TimeField
          id="missing-end"
          label={t.missingClockOut}
          value={draft.end}
          required={false}
          bad={badField === "end"}
          onChange={(end) => change({ end })}
        />
      </div>
      <PreviewLine preview={missingPreview(draft, zone)} />
      <button
        type="submit"
        className={controls.secondary}
        disabled={sending || draft.jobId === ""}
      >
        {t.addHours}
      </button>
      <Refusal text={refusal} />
    </form>
  );
}
