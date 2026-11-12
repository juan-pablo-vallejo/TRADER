"use client";

// Material cost entry (PRD, Office review and job cost: the office enters what a logged
// material cost; DESIGN, Material cost). The company's receipts, newest first — those nobody
// has priced by default — each with its job, who logged it and when, and one editor: the
// receipt total. A cost is entered, replaced or cleared at any time, on a closed-out day too;
// nothing else about a receipt is changed here (a closed-out receipt is corrected from the
// field, an entry the crew never logged is a later task). A receipt that waits for approval,
// was rejected or was voided is priced like another and says which it is: whether it counts
// is not this screen's rule.
//
// The list is a snapshot, as the approval queue's: read when the screen opens, when a filter
// changes and when more is asked for, never behind the office's back, so a receipt priced
// under "Not priced" stays where it was with its new cost and leaves on the next read.
// `material.list` 50 at a time, `job.list` for the filter, `material.setCost`. Consumed by
// page.tsx.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import controls from "../controls.module.css";
import { codeOf, EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { amount, cents, materialFacts, money, stamp } from "../format";
import { Note } from "../note";
import { PageHeader } from "../page-header";
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
import styles from "./materials.module.css";

type Item = inferRouterOutputs<AppRouter>["material"]["list"]["items"][number];
type Cost = Item["cost"];
type Show = "unpriced" | "all";

const PAGE = 50;
// The currency a new cost is entered in. One company, one currency until a company states
// its own; a receipt already priced keeps the currency it has.
const CURRENCY = "USD";

export function MaterialsScreen({ devSignIn }: { devSignIn: boolean }) {
  const trpc = useTRPC();
  const [jobId, setJobId] = useState("");
  const [show, setShow] = useState<Show>("unpriced");
  // The cursor each page was asked with; the first has none.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  // What this visit saved, by receipt: shown over the snapshot it was read in.
  const [saved, setSaved] = useState<Record<string, Cost>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const jobs = useQuery(trpc.job.list.queryOptions());
  const pages = useQueries({
    queries: cursors.map((after) =>
      trpc.material.list.queryOptions(
        {
          show,
          limit: PAGE,
          ...(jobId === "" ? {} : { jobId }),
          ...(after === undefined ? {} : { after }),
        },
        // A snapshot (see the header): never refetched under a priced row, never reused from
        // an earlier visit.
        { staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false },
      ),
    ),
  });
  const first = pages[0]!;
  const last = pages.at(-1)!;
  const items = pages.flatMap((page) => page.data?.items ?? []);
  const next = last.data?.next ?? null;

  // A new filter is a new read from its first page.
  const filter = (change: () => void) => {
    change();
    setCursors([undefined]);
    setSaved({});
    setEditing(null);
  };

  return (
    <>
      <PageHeader title={strings.materials} />
      <p className={`secondary ${styles.explain}`}>{strings.materialsExplain}</p>
      <div className={styles.filters}>
        <Field id="materials-job" label={strings.job}>
          <select
            id="materials-job"
            className={controls.select}
            value={jobId}
            onChange={(e) => filter(() => setJobId(e.target.value))}
          >
            <option value="">{strings.allJobsOption}</option>
            {(jobs.data ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.status === "archived" ? strings.jobOptionArchived(j.name) : j.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="materials-show" label={strings.show}>
          <select
            id="materials-show"
            className={controls.select}
            value={show}
            onChange={(e) => filter(() => setShow(e.target.value as Show))}
          >
            <option value="unpriced">{strings.showUnpriced}</option>
            <option value="all">{strings.showAllReceipts}</option>
          </select>
        </Field>
      </div>
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
          <p className={`secondary ${styles.zone}`}>
            {strings.closeoutZone(first.data.timezone)}
          </p>
          {items.length === 0 ? (
            <EmptyState
              text={show === "unpriced" ? strings.emptyUnpriced : strings.emptyMaterials}
            />
          ) : (
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">{strings.material}</th>
                  <th scope="col">{strings.job}</th>
                  <th scope="col">{strings.loggedBy}</th>
                  <th scope="col">{strings.loggedAt}</th>
                  <th scope="col" className={table.number}>
                    {strings.cost}
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{strings.edit}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const open = editing === item.id;
                  const cost = item.id in saved ? saved[item.id]! : item.cost;
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td data-label={strings.material} className="body-strong">
                          {materialFacts(item.effective)}{" "}
                          {item.accounting !== "eligible" && (
                            <span
                              className={`label ${
                                item.accounting === "pending"
                                  ? table.pillPending
                                  : table.pillAttention
                              } ${styles.pill}`}
                            >
                              {strings.materialStanding[item.accounting]}
                            </span>
                          )}
                        </td>
                        <td data-label={strings.job}>{item.job.name}</td>
                        <td data-label={strings.loggedBy}>
                          {strings.loggedByName(item.loggedBy.name)}
                        </td>
                        <td data-label={strings.loggedAt}>
                          <span className={styles.when}>
                            {stamp(item.loggedAt, first.data.timezone)}
                          </span>
                        </td>
                        <td data-label={strings.cost} className={table.number}>
                          <span className={styles.cost}>
                            {cost === null
                              ? strings.notPriced
                              : money(cost.cents, cost.currency)}
                          </span>
                        </td>
                        <RowToggle
                          rowId={item.id}
                          open={open}
                          onToggle={() => setEditing(open ? null : item.id)}
                        />
                      </tr>
                      {open ? (
                        <EditorRow rowId={item.id} colSpan={6}>
                          <CostEditor
                            item={item}
                            cost={cost}
                            onSaved={(stored) =>
                              setSaved((all) => ({ ...all, [item.id]: stored }))
                            }
                          />
                        </EditorRow>
                      ) : null}
                    </Fragment>
                  );
                })}
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

// One receipt's cost: the total as typed, Save, and — last and alone, once there is a cost —
// the way back to "not priced". What the note says is the server's answer.
function CostEditor({
  item,
  cost,
  onSaved,
}: {
  item: Item;
  cost: Cost;
  onSaved: (stored: Cost) => void;
}) {
  const trpc = useTRPC();
  const [typed, setTyped] = useState(cost === null ? "" : amount(cost.cents));
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(trpc.material.setCost.mutationOptions());

  const send = (wanted: Cost) => {
    setNote(null);
    save.mutate(
      { materialId: item.id, cost: wanted },
      {
        onSuccess: (answer) => {
          onSaved(answer.cost);
          setTyped(answer.cost === null ? "" : amount(answer.cost.cents));
          setNote(answer.result === "saved" ? strings.saved : strings.unchanged);
        },
        // Unanswered or refused: nothing is known to be written, and sending the same cost
        // again is answered as itself.
        onError: (error) =>
          setNote(
            codeOf(error) === "FORBIDDEN" ? strings.notPermitted : strings.requestFailed,
          ),
      },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = cents(typed);
    if (value === null) {
      setNote(strings.badAmount);
      return;
    }
    send({ cents: value, currency: cost?.currency ?? CURRENCY });
  };

  const inputId = `cost-${item.id}`;
  return (
    <>
      <EditorSection>
        <form onSubmit={submit} className={styles.costForm}>
          <Field id={inputId} label={strings.receiptTotal}>
            <input
              id={inputId}
              className={controls.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              placeholder="89.99"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <Note text={note} />
          </Field>
          <button
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={save.isPending}
          >
            {strings.saveCost}
          </button>
        </form>
      </EditorSection>
      {cost !== null && (
        <EditorFooter>
          <DestructiveAction
            label={strings.clearCost}
            effect={strings.clearCostEffect}
            disabled={save.isPending}
            onConfirm={() => send(null)}
          />
        </EditorFooter>
      )}
    </>
  );
}
