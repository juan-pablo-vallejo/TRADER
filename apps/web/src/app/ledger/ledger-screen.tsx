"use client";

// The labor ledger (PRD, Office review: the office sees any worker's recorded day — sessions,
// the events behind them, what is pending and why; DESIGN, Worker ledger). The office picks a
// person and up to 31 days and reads their sessions by work date as the server derives them,
// each with every entry behind it: the entries in effect, the ones a correction replaced, and
// a void. Read-only: nothing here approves, rejects or repairs. Times are shown in the zone
// the work dates were judged in, never the browser's. Two queries — the roster for the picker
// and `labor.ledger` once a lookup is asked for. Consumed by page.tsx.
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { addDays, day as formatDay, weekDay } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./ledger.module.css";

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

const clock = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);

// With its day: a correction or a void is often recorded on a later day than its session.
const stamp = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);

// Whole minutes from integer milliseconds, rounded down: a display, not the hours figure pay
// is built from.
const duration = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  return strings.duration(Math.floor(minutes / 60), minutes % 60);
};

export function LedgerScreen({ devSignIn }: { devSignIn: boolean }) {
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
    <>
      <PageHeader title={strings.ledger} />
      {roster.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : roster.isError ? (
        <Failure
          error={roster.error}
          devSignIn={devSignIn}
          onRetry={() => void roster.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{strings.ledgerExplain}</p>
          <form aria-label={strings.ledger} className={controls.card} onSubmit={submit}>
            <div className={styles.lookupGrid}>
              <Field id="ledger-person" label={strings.person}>
                <select
                  id="ledger-person"
                  className={controls.select}
                  required
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                >
                  <option value="">{strings.choosePerson}</option>
                  {roster.data.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.deactivatedAt === null
                        ? person.name
                        : `${person.name} · ${strings.deactivated.toLowerCase()}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ledger-from" label={strings.planFrom}>
                <input
                  id="ledger-from"
                  className={controls.input}
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field id="ledger-to" label={strings.planThrough}>
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
                    {strings.ledgerRange}
                  </p>
                )}
              </Field>
            </div>
            <button type="submit" className={controls.primary}>
              {strings.showLedger}
            </button>
          </form>
          {asked !== null && <Ledger asked={asked} devSignIn={devSignIn} />}
        </>
      )}
    </>
  );
}

function Ledger({ asked, devSignIn }: { asked: Lookup; devSignIn: boolean }) {
  const trpc = useTRPC();
  const ledger = useQuery(trpc.labor.ledger.queryOptions(asked));
  if (ledger.isPending) return <p className="body">{strings.loading}</p>;
  if (ledger.isError) {
    return (
      <Failure
        error={ledger.error}
        devSignIn={devSignIn}
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

  return (
    <section aria-label={r.worker.name}>
      <h2 className={`heading ${styles.heading}`}>{r.worker.name}</h2>
      <p className={`secondary ${styles.line}`}>
        {[
          strings.roles[r.worker.role],
          r.worker.active ? null : strings.deactivated,
          `${formatDay(asked.from)} – ${formatDay(asked.to)}`,
          strings.closeoutZone(zone),
        ]
          .filter((part) => part !== null)
          .join(" · ")}
      </p>
      {openElsewhere && r.openSession !== null && (
        <div className={controls.banner} role="status">
          <p className="body-strong">
            {strings.ledgerOpenSession(formatDay(r.openSession.workDate))}
          </p>
        </div>
      )}
      {r.sessions.length === 0 ? (
        <EmptyState text={strings.emptyLedger} />
      ) : (
        days.map((workDate) => (
          <div key={workDate} className={styles.day}>
            <h3 className="heading">{weekDay(workDate)}</h3>
            {r.sessions
              .filter((s) => s.workDate === workDate)
              .map((s) => (
                <div key={s.rootEventId} className={styles.session}>
                  <h4 className="body-strong">
                    {s.job.name} · {clock(s.startedAt, zone)} –{" "}
                    {s.endedAt === null ? "" : clock(s.endedAt, zone)}
                  </h4>
                  <p className={`secondary ${styles.line} ${styles.flags}`}>
                    <span>
                      {[
                        `${strings.worked} ${duration(s.structuralWorkedMs)}`,
                        s.breakMs === 0
                          ? null
                          : `${strings.breaks} ${duration(s.breakMs)}`,
                        s.job.status === "archived" ? strings.jobStatus.archived : null,
                        s.closedOut ? strings.sessionClosedOut : null,
                        s.corrected ? strings.sessionEdited : null,
                        s.accounting === "eligible" || s.accounting === "voided"
                          ? strings.sessionCounts[s.accounting]
                          : null,
                      ]
                        .filter((part) => part !== null)
                        .join(" · ")}
                    </span>
                    {!s.complete && (
                      <span className={table.pillAttention}>{strings.stillOpen}</span>
                    )}
                    {s.accounting === "pending" && (
                      <span className={table.pillPending}>
                        {strings.sessionCounts.pending}
                      </span>
                    )}
                    {s.accounting === "rejected" && (
                      <span className={table.pillAttention}>
                        {strings.sessionCounts.rejected}
                      </span>
                    )}
                  </p>
                  <table className={table.table}>
                    <thead>
                      <tr>
                        <th scope="col">{strings.entry}</th>
                        <th scope="col" className={table.number}>
                          {strings.recorded}
                        </th>
                        <th scope="col" className={table.number}>
                          {strings.receivedAt}
                        </th>
                        <th scope="col">{strings.enteredBy}</th>
                        <th scope="col">{strings.flags}</th>
                        <th scope="col">{strings.approval}</th>
                        <th scope="col">{strings.entryId}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.events.map((e) => {
                        const by =
                          e.initiator.id === r.worker.id
                            ? ""
                            : strings.enteredByName(e.initiator.name);
                        const flags = (e.approval?.reasons ?? [])
                          .map((reason) => strings.reasonTags[reason])
                          .join(", ");
                        const a = e.approval;
                        const approval =
                          a === null
                            ? strings.approvedByDefault
                            : a.decision === "pending"
                              ? strings.approvalWaiting
                              : a.decision === "approved"
                                ? strings.approvedBy(a.decidedBy?.name ?? "")
                                : strings.rejectedBy(a.decidedBy?.name ?? "");
                        const empty = (text: string) =>
                          text === "" ? { "data-empty": "" } : {};
                        return (
                          <tr
                            key={e.id}
                            className={
                              e.effect === "superseded" ? styles.replaced : undefined
                            }
                          >
                            <td data-label={strings.entry} className="body-strong">
                              {strings.entryTypes[e.type]}
                              {e.effect === "superseded" && ` (${strings.entryReplaced})`}
                              {e.effect === "void" && ` (${strings.entryVoids})`}
                            </td>
                            <td data-label={strings.recorded} className={table.number}>
                              {stamp(e.clientTimestamp, zone)}
                            </td>
                            <td data-label={strings.receivedAt} className={table.number}>
                              {stamp(e.serverTimestamp, zone)}
                            </td>
                            <td data-label={strings.enteredBy} {...empty(by)}>
                              {by}
                            </td>
                            <td data-label={strings.flags} {...empty(flags)}>
                              {flags}
                            </td>
                            <td data-label={strings.approval}>{approval}</td>
                            <td data-label={strings.entryId}>{e.id.slice(0, 8)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        ))
      )}
    </section>
  );
}
