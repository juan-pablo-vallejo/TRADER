"use client";

// The refused-entries screen (PRD, Offline and sync: the server's short-lived note that an
// entry was refused; DESIGN, Refused entries). The office picks who sent the entries and the
// day the server received them, and reads what was refused or left unprocessed. Read-only:
// nothing here repairs an entry; hours are re-entered through the repair the office already
// has. Two queries, the roster for the picker and `diagnostic.list` once a lookup is asked
// for. Consumed by page.tsx.
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./refusals.module.css";

type Lookup = { userId: string; day: string };

// Today as the browser's calendar day, YYYY-MM-DD, built from parts: `toISOString` is UTC,
// which is tomorrow in the evening in Eastern.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

const time = (at: Date) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);

const kindOf = (kind: string | null) =>
  kind === null
    ? strings.refusalKinds.unknown
    : ((strings.refusalKinds as Record<string, string>)[kind] ?? kind);

export function RefusalsScreen({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  const roster = useQuery(trpc.roster.list.queryOptions());
  const [userId, setUserId] = useState("");
  const [day, setDay] = useState(today);
  const [asked, setAsked] = useState<Lookup | null>(null);
  const found = useQuery(
    trpc.diagnostic.list.queryOptions(asked ?? { userId: "", day: "" }, {
      enabled: asked !== null,
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (userId !== "" && day !== "") setAsked({ userId, day });
  };
  return (
    <>
      <PageHeader title={strings.refusals} />
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
          <p className={`secondary ${styles.explain}`}>{strings.refusalsExplain}</p>
          <form aria-label={strings.refusals} className={controls.card} onSubmit={submit}>
            <div className={styles.lookupGrid}>
              <Field id="refusals-person" label={strings.sentBy}>
                <select
                  id="refusals-person"
                  className={controls.select}
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">{strings.choosePerson}</option>
                  {roster.data.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="refusals-day" label={strings.receivedOn}>
                <input
                  id="refusals-day"
                  className={controls.input}
                  type="date"
                  required
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </Field>
            </div>
            <button type="submit" className={controls.primary}>
              {strings.findRefusals}
            </button>
          </form>
          {asked === null ? null : found.isPending ? (
            <p className="body">{strings.loading}</p>
          ) : found.isError ? (
            <Failure
              error={found.error}
              devSignIn={devSignIn}
              onRetry={() => void found.refetch()}
            />
          ) : found.data.length === 0 ? (
            <EmptyState text={strings.emptyRefusals} />
          ) : (
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">{strings.refusalResult}</th>
                  <th scope="col">{strings.refusalKind}</th>
                  <th scope="col">{strings.refusalCode}</th>
                  <th scope="col">{strings.receivedAt}</th>
                  <th scope="col">{strings.requestId}</th>
                </tr>
              </thead>
              <tbody>
                {found.data.map((line, i) => (
                  <tr key={`${line.requestId}-${line.recordId ?? i}-${line.code}`}>
                    <td data-label={strings.refusalResult} className="body-strong">
                      {strings.refusalOutcomes[line.outcome]}
                    </td>
                    <td data-label={strings.refusalKind}>{kindOf(line.recordKind)}</td>
                    <td data-label={strings.refusalCode}>{line.code}</td>
                    <td data-label={strings.receivedAt}>{time(line.receivedAt)}</td>
                    <td data-label={strings.requestId}>{line.requestId.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
