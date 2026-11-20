"use client";

// One person's entries: the office picks a person and up to 31 days and reads their sessions
// by work date as the server derives them, each with every entry behind it and its flags:
// the entries in effect, the ones a correction replaced, and a void. Times are shown in the
// zone the work dates were judged in, never the browser's.
//
// It is also where the office fixes a mistake, with a correcting entry. A session opens an
// editor beneath it: change the time of an entry in effect or the job of its clock in, add
// entries that are missing, or void the session; above the days, hours nobody recorded are
// added whole. Each save is one `labor.repair` set (repair-set.ts), written all or nothing,
// and it takes effect at once; what it wrote is read back from the server, so the screen
// never shows a correction the server has not confirmed.
//
// The roster for the picker, `labor.ledger` once a lookup is asked for, and the jobs a
// correction may name. Consumed by page.tsx.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import controls from "../../controls.module.css";
import { codeOf, EmptyState, Failure } from "../../failure";
import { Field } from "../../field";
import { addDays } from "../../format";
import { Note } from "../../note";
import { DestructiveAction, EditorFooter, EditorSection } from "../../row-editor";
import { useStrings } from "../../i18n";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import styles from "./entries.module.css";
import {
  createMinter,
  draftOf,
  inEffect,
  missingHours,
  sessionOperations,
  voidOperation,
  type AddedType,
  type LedgerSession,
  type RepairInput,
  type SessionDraft,
  type Unminted,
} from "./repair-set";

type Lookup = { workerId: string; from: string; to: string };

// The longest range the server reads at once (labor/ledger.ts).
const MAX_RANGE_DAYS = 31;

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

// Every answer `labor.repair` refuses with has a sentence: a code added on the server fails
// to compile here until it has one.
type RepairCode = Extract<
  inferRouterOutputs<AppRouter>["labor"]["repair"],
  { result: "rejected" }
>["code"];
// Held to the catalog: `repairRejected` must have a sentence for each.
type Rejected = Record<RepairCode, string>;

// The editor for hours nobody recorded has no session to hang from.
const MISSING = "missing";

// The button that opens an editor: focus goes back to it when its repair is written.
const toggleId = (key: string) => `repair-toggle-${key}`;

type JobOption = { id: string; name: string; archived: boolean };
// What a repair did, said beneath the control that opened its editor.
type Notice = { key: string; text: string; ok: boolean };
type Outcome = "saved" | "changed";

export function EntriesSection({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const roster = useQuery(trpc.roster.list.queryOptions());
  const [workerId, setWorkerId] = useState("");
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => addDays(today(), -6));
  const [asked, setAsked] = useState<Lookup | null>(null);
  const [rangeError, setRangeError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (workerId === "" || from === "" || to === "") return;
    const bad = from > to || to > addDays(from, MAX_RANGE_DAYS - 1);
    setRangeError(bad);
    if (!bad) setAsked({ workerId, from, to });
  };
  return (
    <section id="entries" aria-labelledby="entries-heading">
      <h2 id="entries-heading" className="heading">
        {t.ledger}
      </h2>
      {roster.isPending ? (
        <p className="body">{t.loading}</p>
      ) : roster.isError ? (
        <Failure
          error={roster.error}
          signInHref={signInHref}
          onRetry={() => void roster.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{t.ledgerExplain}</p>
          <form aria-label={t.ledger} className={controls.card} onSubmit={submit}>
            <div className={styles.lookupGrid}>
              <Field id="ledger-person" label={t.person}>
                <select
                  id="ledger-person"
                  className={controls.select}
                  required
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                >
                  <option value="">{t.choosePerson}</option>
                  {roster.data.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.deactivatedAt === null
                        ? person.name
                        : `${person.name} · ${t.deactivated.toLowerCase()}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ledger-from" label={t.planFrom}>
                <input
                  id="ledger-from"
                  className={controls.input}
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field id="ledger-to" label={t.planThrough}>
                <input
                  id="ledger-to"
                  className={controls.input}
                  type="date"
                  required
                  value={to}
                  aria-invalid={rangeError}
                  aria-describedby={rangeError ? "ledger-range" : undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
                {rangeError && (
                  <p
                    id="ledger-range"
                    className={`secondary ${controls.error}`}
                    role="alert"
                  >
                    {t.ledgerRange}
                  </p>
                )}
              </Field>
            </div>
            <button type="submit" className={controls.primary}>
              {t.showLedger}
            </button>
          </form>
          {asked !== null && <Ledger asked={asked} signInHref={signInHref} />}
        </>
      )}
    </section>
  );
}

function Ledger({ asked, signInHref }: { asked: Lookup; signInHref: string }) {
  const { t, f } = useStrings();
  const trpc = useTRPC();
  // Not refetched behind an open editor: a repair is built from what is on screen, and the
  // server refuses one built from an entry that is no longer in effect.
  const ledger = useQuery(
    trpc.labor.ledger.queryOptions(asked, { refetchOnWindowFocus: false }),
  );
  const jobs = useQuery(trpc.job.list.queryOptions());
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (ledger.isPending) return <p className="body">{t.loading}</p>;
  if (ledger.isError) {
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
  const days = [...new Set(r.sessions.map((s) => s.workDate))];
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
  // A repair that was written closes its editor and hands focus back to what opened it; one
  // the ledger had moved under stays open on the ledger as it is now. Either way the ledger
  // is read again: what is shown is the server's.
  const settle = (key: string) => (outcome: Outcome) => {
    const written = outcome !== "changed";
    setNotice({
      key,
      text: outcome === "saved" ? t.repairSaved : t.repairChanged,
      ok: written,
    });
    if (written) {
      setOpen(null);
      document.getElementById(toggleId(key))?.focus();
    }
    void ledger.refetch();
  };
  const noteFor = (key: string) => (
    <Note
      text={notice?.key === key ? notice.text : null}
      tone={notice?.ok === true ? "saved" : "error"}
    />
  );

  return (
    <section aria-label={r.worker.name}>
      <h2 className={`heading ${styles.heading}`}>{r.worker.name}</h2>
      <p className={`secondary ${styles.line}`}>
        {[
          t.roles[r.worker.role],
          r.worker.active ? null : t.deactivated,
          `${f.day(asked.from)} – ${f.day(asked.to)}`,
          t.timesIn(zone),
        ]
          .filter((part) => part !== null)
          .join(" · ")}
      </p>
      {openElsewhere && r.openSession !== null && (
        <div className={controls.banner} role="status">
          <p className="body-strong">
            {t.ledgerOpenSession(f.day(r.openSession.workDate))}
          </p>
        </div>
      )}
      <div className={styles.actions}>
        <button
          id={toggleId(MISSING)}
          type="button"
          className={controls.secondary}
          aria-expanded={open === MISSING}
          aria-controls={`repair-${MISSING}`}
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
        <EmptyState text={t.emptyLedger} />
      ) : (
        days.map((workDate) => (
          <div key={workDate} className={styles.day}>
            <h3 className="heading">{f.weekDay(workDate)}</h3>
            {r.sessions
              .filter((s) => s.workDate === workDate)
              .map((s) => (
                <div key={s.rootEventId} className={styles.session}>
                  <h4 className="body-strong">
                    {s.job.name} · {f.clock(s.startedAt, zone)} –{" "}
                    {s.endedAt === null ? "" : f.clock(s.endedAt, zone)}
                  </h4>
                  <p className={`secondary ${styles.line} ${styles.flags}`}>
                    <span>
                      {[
                        `${t.worked} ${f.duration(s.structuralWorkedMs)}`,
                        s.breakMs === 0 ? null : `${t.breaks} ${f.duration(s.breakMs)}`,
                        s.job.status === "archived" ? t.jobStatus.archived : null,
                        s.corrected ? t.sessionEdited : null,
                        t.sessionCounts[s.accounting],
                      ]
                        .filter((part) => part !== null)
                        .join(" · ")}
                    </span>
                    {!s.complete && (
                      <span className={table.pillAttention}>{t.stillOpen}</span>
                    )}
                  </p>
                  <table className={table.table}>
                    <thead>
                      <tr>
                        <th scope="col">{t.entry}</th>
                        <th scope="col" className={table.number}>
                          {t.recorded}
                        </th>
                        <th scope="col" className={table.number}>
                          {t.receivedAt}
                        </th>
                        <th scope="col">{t.enteredBy}</th>
                        <th scope="col">{t.flags}</th>
                        <th scope="col">{t.entryId}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.events.map((e) => {
                        const by =
                          e.initiator.id === r.worker.id
                            ? ""
                            : t.enteredByName(e.initiator.name);
                        const flags = e.flags
                          .map((reason) => t.reasonTags[reason])
                          .join(", ");
                        const empty = (text: string) =>
                          text === "" ? { "data-empty": "" } : {};
                        return (
                          <tr
                            key={e.id}
                            className={
                              e.effect === "superseded" ? styles.replaced : undefined
                            }
                          >
                            <td data-label={t.entry} className="body-strong">
                              {t.entryTypes[e.type]}
                              {e.effect === "superseded" && ` (${t.entryReplaced})`}
                              {e.effect === "void" && ` (${t.entryVoids})`}
                            </td>
                            <td data-label={t.recorded} className={table.number}>
                              {f.stamp(e.clientTimestamp, zone)}
                            </td>
                            <td data-label={t.receivedAt} className={table.number}>
                              {f.stamp(e.serverTimestamp, zone)}
                            </td>
                            <td data-label={t.enteredBy} {...empty(by)}>
                              {by}
                            </td>
                            <td data-label={t.flags} {...empty(flags)}>
                              {flags}
                            </td>
                            <td data-label={t.entryId}>{e.id.slice(0, 8)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className={styles.actions}>
                    <button
                      id={toggleId(s.rootEventId)}
                      type="button"
                      className={controls.textAction}
                      aria-expanded={open === s.rootEventId}
                      aria-controls={`repair-${s.rootEventId}`}
                      aria-label={t.repairOf(s.job.name, f.stamp(s.startedAt, zone))}
                      onClick={() => toggle(s.rootEventId)}
                    >
                      {t.repair}
                    </button>
                    {noteFor(s.rootEventId)}
                  </div>
                  {open === s.rootEventId && (
                    <SessionRepair
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
              ))}
          </div>
        ))
      )}
    </section>
  );
}

// Sends one repair set and sorts its answer. `accepted` and `duplicate` are both the set as
// written; `repair_stale` is a ledger that moved, and the screen reads it again; any other
// refusal wrote nothing and is said in the editor, which stays as the office left it. The
// set keeps its ids for as long as it is unchanged (repair-set.ts), so sending again after
// no answer cannot record it twice.
function useRepair(workerId: string, onDone: (outcome: Outcome) => void) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const repair = useMutation(trpc.labor.repair.mutationOptions());
  const minter = useRef(createMinter());
  const [refusal, setRefusal] = useState<string | null>(null);
  const send = (operations: Unminted[]) => {
    setRefusal(null);
    const input: RepairInput = minter.current(workerId, operations);
    repair.mutate(input, {
      onSuccess: (answer) => {
        if (answer.result !== "rejected") return onDone("saved");
        if (answer.code === "repair_stale") return onDone("changed");
        // The ids are taken: the same set goes again under new ones.
        if (answer.code === "id_conflict") minter.current = createMinter();
        setRefusal((t.repairRejected satisfies Rejected)[answer.code]);
      },
      onError: (error) =>
        setRefusal(codeOf(error) === "FORBIDDEN" ? t.notPermitted : t.repairUnsent),
    });
  };
  return { send, sending: repair.isPending, refusal, setRefusal };
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
          {t.repairBadTime}
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

// One session's repair: every entry in effect with its time, the clock in's job, entries to
// add, and — last and alone — the void. One Save is one set, because some repairs are only
// legal together: a break is its start and its end, and a session moved later is its clock
// in and its clock out.
function SessionRepair({
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
  const { send, sending, refusal, setRefusal } = useRepair(workerId, onDone);
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
      } else setRefusal(t.repairTooMany);
      return;
    }
    if (built.operations.length === 0) return setRefusal(t.unchanged);
    send(built.operations);
  };

  return (
    <form
      id={`repair-${id}`}
      className={`${controls.card} ${styles.editor}`}
      aria-label={t.repairOf(session.job.name, f.stamp(session.startedAt, zone))}
      noValidate
      onSubmit={save}
    >
      <p className="secondary">{t.repairExplain}</p>
      <EditorSection heading={t.repairTimes}>
        <div className={styles.fields}>
          {inEffect(session).map((e) => (
            <TimeField
              key={e.id}
              id={`repair-${id}-${e.id}`}
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
            id={`repair-${id}-job`}
            value={draft.jobId}
            jobs={options}
            onChange={(jobId) => change({ ...draft, jobId })}
          />
        </div>
      </EditorSection>
      <EditorSection heading={t.repairAdded}>
        {draft.added.map((added, i) => {
          const set = (patch: Partial<SessionDraft["added"][number]>) =>
            change({
              ...draft,
              added: draft.added.map((a, n) => (n === i ? { ...a, ...patch } : a)),
            });
          return (
            // By position: the rows have no identity of their own until they are saved.
            <div key={i} className={styles.added}>
              <Field id={`repair-${id}-added-${i}-type`} label={t.addedEntryType(i + 1)}>
                <select
                  id={`repair-${id}-added-${i}-type`}
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
                id={`repair-${id}-added-${i}`}
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
          {t.saveRepair}
        </button>
        <Note text={refusal} />
      </EditorSection>
      {!voided && (
        <EditorFooter>
          <DestructiveAction
            label={t.voidSession}
            effect={t.voidSessionEffect}
            disabled={sending}
            onConfirm={() => send([voidOperation(session)])}
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
  const { send, sending, refusal, setRefusal } = useRepair(workerId, onDone);
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
      id={`repair-${MISSING}`}
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
      <button
        type="submit"
        className={controls.secondary}
        disabled={sending || draft.jobId === ""}
      >
        {t.addHours}
      </button>
      <Note text={refusal} />
    </form>
  );
}
