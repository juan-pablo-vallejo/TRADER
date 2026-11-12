"use client";

// The office's day closeout (PRD, Day closeout: the foreman of the job's crew, or an admin,
// reviews the day's labor and materials, sets job status and a note, and submits; DESIGN,
// Closeout: review first, then one primary button to submit what was reviewed). The office
// picks a job — any of the company's, archived or on no crew included (V1-D08) — and a work
// date, reads the day as the server derives it, and submits that review's fingerprint.
//
// A submission carries an id minted here once and kept until the server answers: a request
// that fails is sent again unchanged, the form held as it was, so a closeout that did land is
// answered as a duplicate and never recorded twice. A day already closed out shows that, and
// no form: the record is locked, and what is listed is the day as it stands now, not a copy of
// what was submitted. Times are shown in the zone the review was judged in, never the
// browser's. Two queries — the jobs for the picker, `closeout.review` once a day is asked
// for — and one mutation. Consumed by page.tsx.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { day as formatDay } from "../format";
import { Note } from "../note";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./closeout.module.css";
import { uuidv7 } from "./uuidv7";

type Asked = { jobId: string; workDate: string };
type Status = "open" | "complete";
type Rejection = keyof typeof strings.closeoutRejected;

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

const clock = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);

const stamp = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(at);

// Whole minutes from integer milliseconds, rounded down: a display, not the hours figure pay
// is built from.
const duration = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  return strings.duration(Math.floor(minutes / 60), minutes % 60);
};

export function CloseoutScreen({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  const jobs = useQuery(trpc.job.list.queryOptions());
  const [jobId, setJobId] = useState("");
  const [workDate, setWorkDate] = useState(today);
  const [asked, setAsked] = useState<Asked | null>(null);
  // A new key per lookup, so a day asked for again starts with an empty form.
  const [round, setRound] = useState(0);
  const lookUp = (e: FormEvent) => {
    e.preventDefault();
    if (jobId === "" || workDate === "") return;
    setAsked({ jobId, workDate });
    setRound((n) => n + 1);
  };
  return (
    <>
      <PageHeader title={strings.closeout} />
      {jobs.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : jobs.isError ? (
        <Failure
          error={jobs.error}
          devSignIn={devSignIn}
          onRetry={() => void jobs.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{strings.closeoutExplain}</p>
          <form aria-label={strings.closeout} className={controls.card} onSubmit={lookUp}>
            <div className={styles.lookupGrid}>
              <Field id="closeout-job" label={strings.job}>
                <select
                  id="closeout-job"
                  className={controls.select}
                  required
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  <option value="">{strings.chooseJob}</option>
                  {jobs.data.map((job) => (
                    <option key={job.id} value={job.id}>
                      {[
                        job.name,
                        job.status === "archived"
                          ? strings.jobStatus.archived.toLowerCase()
                          : null,
                        job.crew?.active === true ? null : strings.noCrewOption,
                      ]
                        .filter((part) => part !== null)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="closeout-day" label={strings.workDate}>
                <input
                  id="closeout-day"
                  className={controls.input}
                  type="date"
                  required
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </Field>
            </div>
            <button type="submit" className={controls.secondary}>
              {strings.reviewDay}
            </button>
          </form>
          {asked !== null && (
            <Day
              key={round}
              asked={asked}
              noCrew={jobs.data.find((j) => j.id === asked.jobId)?.crew?.active !== true}
              devSignIn={devSignIn}
            />
          )}
        </>
      )}
    </>
  );
}

// One job's day: the review, then the form that submits it.
function Day({
  asked,
  noCrew,
  devSignIn,
}: {
  asked: Asked;
  noCrew: boolean;
  devSignIn: boolean;
}) {
  const trpc = useTRPC();
  // Never served from a cache: what is submitted is the fingerprint of what is on screen.
  const review = useQuery(
    trpc.closeout.review.queryOptions(asked, { staleTime: 0, gcTime: 0, retry: false }),
  );
  const submit = useMutation(trpc.closeout.submit.mutationOptions());
  const [status, setStatus] = useState<Status>("open");
  const [note, setNote] = useState("");
  // The submission in flight or unanswered, exactly as first sent.
  const [unsent, setUnsent] = useState<Parameters<typeof submit.mutate>[0] | null>(null);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);

  if (review.isPending) return <p className="body">{strings.loading}</p>;
  if (review.isError) {
    return (
      <Failure
        error={review.error}
        devSignIn={devSignIn}
        onRetry={() => void review.refetch()}
      />
    );
  }
  const r = review.data;
  const zone = r.timeZone;
  const sessions = r.workers.flatMap((w) =>
    w.sessions.map((s) => ({ ...s, who: w.name })),
  );
  const open = sessions.filter((s) => !s.complete).length;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    const input = unsent ?? {
      id: uuidv7(),
      jobId: r.jobId,
      workDate: r.workDate,
      jobStatus: status,
      note: trimmed === "" ? null : trimmed,
      clientTimestamp: new Date(),
      reviewFingerprint: r.fingerprint,
    };
    setUnsent(input);
    setResult(null);
    submit.mutate(input, {
      onSuccess: (answer) => {
        setUnsent(null);
        if (answer.result === "rejected") {
          setResult({
            text: strings.closeoutRejected[answer.code as Rejection],
            ok: false,
          });
        } else {
          setResult({
            text: answer.closeout.jobStatusApplied
              ? strings.closedOut
              : strings.closedOutStatusKept,
            ok: true,
          });
        }
        // The day as it now stands: closed out, or changed since the review.
        void review.refetch();
      },
      // Unanswered: the same submission stays ready to send again.
      onError: () => setResult({ text: strings.closeoutUnsent, ok: false }),
    });
  };

  return (
    <section aria-label={`${r.job.name}, ${formatDay(r.workDate)}`}>
      <h2 className={`heading ${styles.heading}`}>
        {r.job.name} · {formatDay(r.workDate)}
      </h2>
      <p className={`secondary ${styles.line}`}>
        {strings.jobStatus[r.job.status]} · {strings.closeoutZone(zone)}
      </p>
      {r.job.status === "archived" && (
        <p className={`secondary ${styles.line}`}>{strings.closeoutArchived}</p>
      )}
      {noCrew && <p className={`secondary ${styles.line}`}>{strings.closeoutNoCrew}</p>}
      {r.closeout !== null && (
        <p className={`body-strong ${styles.line}`}>
          {strings.closedOutAt(stamp(r.closeout.serverTimestamp, zone))}
        </p>
      )}
      {sessions.length === 0 && r.materials.length === 0 && r.closeout === null && (
        <p className={`secondary ${styles.line}`}>{strings.closeoutEmptyDay}</p>
      )}

      <div className={styles.section}>
        <h3 className="body-strong">{strings.closeoutLabor}</h3>
        {sessions.length === 0 ? (
          <EmptyState text={strings.closeoutNoLabor} />
        ) : (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">{strings.person}</th>
                <th scope="col">{strings.started}</th>
                <th scope="col">{strings.ended}</th>
                <th scope="col" className={table.number}>
                  {strings.worked}
                </th>
                <th scope="col" className={table.number}>
                  {strings.breaks}
                </th>
                <th scope="col">{strings.sessionNotes}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.rootEventId}>
                  <td data-label={strings.person} className="body-strong">
                    {s.who}
                  </td>
                  <td data-label={strings.started}>{clock(s.startedAt, zone)}</td>
                  <td data-label={strings.ended}>
                    {s.endedAt === null ? "" : clock(s.endedAt, zone)}
                  </td>
                  <td data-label={strings.worked} className={table.number}>
                    {duration(s.workedMs)}
                  </td>
                  <td data-label={strings.breaks} className={table.number}>
                    {s.breakMs === 0 ? "" : duration(s.breakMs)}
                  </td>
                  {/* Empty when there is nothing to say, so the narrow row omits it. */}
                  <td data-label={strings.sessionNotes}>
                    {(!s.complete || s.voided || s.corrected) && (
                      <span className={styles.flags}>
                        {!s.complete && (
                          <span className={table.pillAttention}>{strings.stillOpen}</span>
                        )}
                        {s.voided && (
                          <span className={table.pillPending}>
                            {strings.sessionVoided}
                          </span>
                        )}
                        {s.corrected && (
                          <span className={table.pillPending}>
                            {strings.sessionEdited}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <h3 className="body-strong">{strings.closeoutMaterials}</h3>
        {r.materials.length === 0 ? (
          <EmptyState text={strings.closeoutNoMaterials} />
        ) : (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">{strings.material}</th>
                <th scope="col" className={table.number}>
                  {strings.quantity}
                </th>
                <th scope="col">{strings.loggedBy}</th>
                <th scope="col">{strings.loggedAt}</th>
              </tr>
            </thead>
            <tbody>
              {r.materials.map((m) => (
                <tr key={m.id}>
                  <td data-label={strings.material} className="body-strong">
                    {m.description}
                  </td>
                  <td data-label={strings.quantity} className={table.number}>
                    {m.quantity} {m.unit}
                  </td>
                  <td data-label={strings.loggedBy}>{m.loggedByName}</td>
                  <td data-label={strings.loggedAt}>{clock(m.loggedAt, zone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {r.closeout === null ? (
        <form
          aria-label={strings.submitCloseout}
          className={controls.card}
          onSubmit={send}
        >
          <Field id="closeout-status" label={strings.statusAfter}>
            <select
              id="closeout-status"
              className={controls.select}
              value={status}
              disabled={unsent !== null}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              <option value="open">{strings.jobStatus.open}</option>
              <option value="complete">{strings.jobStatus.complete}</option>
            </select>
          </Field>
          <Field id="closeout-note" label={strings.closeoutNote}>
            <textarea
              id="closeout-note"
              className={`${controls.input} ${styles.note}`}
              maxLength={2000}
              value={note}
              readOnly={unsent !== null}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            className={controls.primary}
            disabled={open > 0 || submit.isPending || review.isFetching}
            aria-describedby={open > 0 ? "closeout-blocked" : undefined}
          >
            {unsent !== null && !submit.isPending
              ? strings.tryAgain
              : strings.submitCloseout}
          </button>
          {open > 0 && (
            <p id="closeout-blocked" className={`secondary ${styles.reason}`}>
              {strings.sessionsOpenReason(open)}
            </p>
          )}
          <Note text={result?.text ?? null} tone={result?.ok ? "saved" : "error"} />
        </form>
      ) : (
        <Note text={result?.text ?? null} tone={result?.ok ? "saved" : "error"} />
      )}
      <button
        type="button"
        className={controls.secondary}
        disabled={review.isFetching || submit.isPending}
        onClick={() => void review.refetch()}
      >
        {strings.reviewAgain}
      </button>
    </section>
  );
}
