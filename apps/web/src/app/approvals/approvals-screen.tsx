"use client";

// The approval queue (PRD, Office approval; DESIGN, Approval row). Everything that waits for
// the office, oldest first: labor entries, receipts and material corrections, each with the
// reasons it is here in the ledger's words. An entry flagged `clock skew` shows the time its
// phone recorded and the time the server received it, labelled, side by side; nothing edits
// a time in place. Approve is one press; Reject says what it will do first, because a
// decision is never changed. What the caller may decide is the server's answer (`ownEntry`,
// and `own_entry` again at the write), never this screen's.
//
// The list is a snapshot: it is read when the screen opens and when more is asked for, and
// not again behind the office's back, so a decided row stays where it was with its result
// beneath its buttons and leaves on the next visit. Times are shown in the zone the server
// names. One query per page of 50 and `approval.decide`. Consumed by page.tsx.
import { useMutation, useQueries } from "@tanstack/react-query";
import { useState } from "react";

import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import controls from "../controls.module.css";
import { codeOf, EmptyState, Failure } from "../failure";
import { duration, materialFacts as facts, stamp } from "../format";
import { Note } from "../note";
import { PageHeader } from "../page-header";
import { DestructiveAction } from "../row-editor";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./approvals.module.css";

type Item = inferRouterOutputs<AppRouter>["approval"]["queue"]["items"][number];

const PAGE = 50;

function entryOf(item: Item): string {
  const s = item.subject;
  if (s.kind === "labor_event") {
    const type = strings.entryTypes[s.type];
    if (s.effect === "superseded") return `${type} (${strings.entryReplaced})`;
    if (s.effect === "void") return `${type} (${strings.entryVoids})`;
    return type;
  }
  if (s.kind === "material") {
    const text = strings.materialEntry(facts(s.effective));
    return s.effective.voided ? `${text} (${strings.materialVoided})` : text;
  }
  const change =
    s.correction.kind === "void"
      ? strings.correctionVoid(facts(s.original))
      : strings.correctionAmend(facts(s.original), facts(s.correction));
  return s.note === null ? change : `${change}. ${strings.correctionNote(s.note)}`;
}

function whoOf(item: Item): string {
  const s = item.subject;
  if (s.kind === "material") return s.loggedBy.name;
  if (s.kind === "material_correction") return s.submittedBy.name;
  return s.initiator.id === s.worker.id
    ? s.worker.name
    : strings.whoEnteredBy(s.worker.name, s.initiator.name);
}

// The times of an entry, each labelled. A `clock skew` entry carries both the time its phone
// recorded and the time the server received it.
function timesOf(item: Item, zone: string): string[] {
  const s = item.subject;
  const skewed = item.reasons.includes("clock_skewed");
  if (s.kind === "labor_event") {
    const recorded = strings.recordedAt(stamp(s.clientTimestamp, zone));
    return skewed
      ? [recorded, strings.receivedWhen(stamp(s.serverTimestamp, zone))]
      : [recorded];
  }
  if (s.kind === "material") {
    const logged = strings.loggedWhen(stamp(s.loggedAt, zone));
    return skewed ? [logged, strings.receivedWhen(stamp(s.receivedAt, zone))] : [logged];
  }
  return [strings.submittedWhen(stamp(s.serverTimestamp, zone))];
}

function rejectEffectOf(item: Item): string {
  const s = item.subject;
  if (s.kind !== "labor_event") return strings.rejectEffect[s.kind];
  if (s.effect === "void") return strings.rejectEffect.void;
  if (s.effect === "superseded") return strings.rejectEffect.superseded;
  return strings.rejectEffect.labor;
}

export function ApprovalsScreen({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  // The cursor each page was asked with; the first has none.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const pages = useQueries({
    queries: cursors.map((after) =>
      trpc.approval.queue.queryOptions(
        { limit: PAGE, ...(after === undefined ? {} : { after }) },
        // A snapshot (see the header): never refetched under a decided row, never reused
        // from an earlier visit.
        { staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false },
      ),
    ),
  });
  const first = pages[0]!;
  const last = pages.at(-1)!;
  const items = pages.flatMap((page) => page.data?.items ?? []);
  const next = last.data?.next ?? null;

  return (
    <>
      <PageHeader title={strings.approvals} />
      {first.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : first.isError ? (
        <Failure
          error={first.error}
          devSignIn={devSignIn}
          onRetry={() => void first.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{strings.approvalsExplain}</p>
          <p className={`secondary ${styles.zone}`}>
            {strings.closeoutZone(first.data.timezone)}
          </p>
          {items.length === 0 ? (
            <EmptyState text={strings.emptyApprovals} />
          ) : (
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">{strings.entry}</th>
                  <th scope="col">{strings.who}</th>
                  <th scope="col">{strings.job}</th>
                  <th scope="col">{strings.time}</th>
                  <th scope="col" className={table.number}>
                    {strings.hours}
                  </th>
                  <th scope="col">{strings.flags}</th>
                  <th scope="col">{strings.decision}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Row key={item.approvalId} item={item} zone={first.data.timezone} />
                ))}
              </tbody>
            </table>
          )}
          {cursors.length > 1 && last.isPending && (
            <p className="body">{strings.loading}</p>
          )}
          {cursors.length > 1 && last.isError && (
            <Failure
              error={last.error}
              devSignIn={devSignIn}
              onRetry={() => void last.refetch()}
            />
          )}
          {next !== null && (
            <button
              type="button"
              className={`${controls.secondary} ${styles.more}`}
              onClick={() => setCursors((asked) => [...asked, next])}
            >
              {strings.showMore}
            </button>
          )}
        </>
      )}
    </>
  );
}

type Outcome = { text: string; ok: boolean; settled: boolean };

function Row({ item, zone }: { item: Item; zone: string }) {
  const trpc = useTRPC();
  const decide = useMutation(trpc.approval.decide.mutationOptions());
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const s = item.subject;
  const times = timesOf(item, zone);

  const send = (decision: "approved" | "rejected") => {
    setOutcome(null);
    decide.mutate(
      { approvalId: item.approvalId, decision },
      {
        onSuccess: (answer) => {
          if (answer.result === "rejected") {
            setOutcome({
              text:
                answer.code === "own_entry"
                  ? strings.ownEntry
                  : strings.alreadyDecided[answer.standing.decision],
              ok: false,
              settled: true,
            });
          } else {
            // `duplicate` is this decision, recorded by an earlier send that went unanswered.
            setOutcome({
              text: strings[answer.approval.decision],
              ok: true,
              settled: true,
            });
          }
        },
        // Unanswered or refused: nothing is known to be written, and sending the same
        // decision again is answered as itself.
        onError: (error) =>
          setOutcome({
            text:
              codeOf(error) === "FORBIDDEN"
                ? strings.notPermitted
                : strings.requestFailed,
            ok: false,
            settled: false,
          }),
      },
    );
  };

  return (
    <tr>
      <td data-label={strings.entry} className="body-strong">
        {entryOf(item)}
      </td>
      <td data-label={strings.who}>{whoOf(item)}</td>
      <td data-label={strings.job}>{s.job.name}</td>
      <td data-label={strings.time}>
        {times.map((time, i) => (
          <span key={time}>
            {i > 0 && " · "}
            <span className={styles.when}>{time}</span>
          </span>
        ))}
      </td>
      {s.kind === "labor_event" ? (
        <td data-label={strings.hours} className={table.number}>
          <span className={styles.when}>{duration(s.session.structuralWorkedMs)}</span>
          {!s.session.complete && (
            <span className={`${table.pillAttention} ${styles.pill}`}>
              {strings.stillOpen}
            </span>
          )}
        </td>
      ) : (
        <td data-label={strings.hours} className={table.number} data-empty="" />
      )}
      <td data-label={strings.flags}>
        {item.reasons.map((reason) => strings.reasonTags[reason]).join(", ")}
      </td>
      <td className={table.act}>
        {item.ownEntry ? (
          <p className="secondary">{strings.ownEntry}</p>
        ) : (
          <>
            {outcome?.settled !== true && (
              <div className={controls.actions}>
                <button
                  type="button"
                  className={controls.secondary}
                  disabled={decide.isPending}
                  onClick={() => send("approved")}
                >
                  {strings.approve}
                </button>
                <DestructiveAction
                  label={strings.reject}
                  effect={rejectEffectOf(item)}
                  disabled={decide.isPending}
                  onConfirm={() => send("rejected")}
                />
              </div>
            )}
            <Note
              text={outcome?.text ?? null}
              tone={outcome?.ok === true ? "saved" : "error"}
            />
          </>
        )}
      </td>
    </tr>
  );
}
