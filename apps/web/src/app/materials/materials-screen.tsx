"use client";

// Material cost entry (PRD, Office review and job cost: the office enters what a logged
// material cost; DESIGN, Material cost). The company's receipts, newest first — those nobody
// has priced by default — each with its job, who logged it and when, and one editor: the
// receipt total. A cost is entered, replaced or cleared at any time, on a closed-out day too;
// nothing else about a receipt is changed here (a closed-out receipt is corrected from the
// field). A receipt that waits for approval, was rejected or was voided is priced like
// another and says which it is: whether it counts is not this screen's rule.
//
// Material entry (PRD: the office adds a material entry the crew never logged; DESIGN,
// Material entry; V1-D09). The header's one action opens the form: job, date, description,
// quantity, unit, an optional receipt total. The entry is sent under an id minted here and
// kept until it is answered, so a resend is the same entry. It is saved as the office's,
// under the signed-in admin, and reads "Entered by the office" with their name; the day it
// names is shown without a time, because nobody recorded one. On a closed-out day the note
// says it waits for another admin.
//
// The list is a snapshot, as the approval queue's: read when the screen opens, when a filter
// changes and when more is asked for, never behind the office's back, so a receipt priced
// under "Not priced" stays where it was with its new cost and leaves on the next read. A
// saved entry is such a moment: the list is read again from its first page.
// `material.list` 50 at a time, `job.list` for the filter and the form, `material.setCost`,
// `material.create`. Consumed by page.tsx.
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import controls from "../controls.module.css";
import { codeOf, EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { uuidv7 } from "../closeout/uuidv7";
import { amount, cents, dayIn, materialFacts, money, stamp } from "../format";
import { Note } from "../note";
import { CREATE_FORM_ID, PageHeader } from "../page-header";
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
import { instantToWall } from "../zoned";
import styles from "./materials.module.css";

type Outputs = inferRouterOutputs<AppRouter>;
type Jobs = Outputs["job"]["list"];
type Created = Outputs["material"]["create"];
type RejectedCode = Extract<Created, { result: "rejected" }>["code"];

// Every refusal has a sentence: a code the server adds fails to compile until it has one.
const REJECTED: Record<RejectedCode, string> = strings.receiptRejected;

// numeric(12,3), as the server reads a quantity (api materials/quantity.ts), above zero.
const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;

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
  const [adding, setAdding] = useState(false);
  // What the last saved entry answered: its form is gone by then.
  const [listNote, setListNote] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
    setListNote(null);
    setCursors([undefined]);
    setSaved({});
    setEditing(null);
  };
  // A saved entry: the form closes and the list is read again from its first page.
  const entered = async (note: string) => {
    setAdding(false);
    setCursors([undefined]);
    setSaved({});
    setEditing(null);
    setListNote(note);
    await queryClient.invalidateQueries(trpc.material.list.pathFilter());
  };
  const ready = jobs.isSuccess && first.isSuccess;

  return (
    <>
      <PageHeader
        title={strings.materials}
        action={
          ready
            ? {
                label: strings.addReceipt,
                open: adding,
                onToggle: () => {
                  setListNote(null);
                  setAdding((a) => !a);
                },
              }
            : undefined
        }
      />
      <p className={`secondary ${styles.explain}`}>{strings.materialsExplain}</p>
      {ready && adding && (
        <ReceiptForm
          jobs={jobs.data}
          timeZone={first.data.timezone}
          onDone={(note) => void entered(note)}
        />
      )}
      {listNote !== null && (
        <div className={styles.listNote}>
          <Note text={listNote} tone="saved" />
        </div>
      )}
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
                          {item.enteredByOffice
                            ? strings.enteredByOfficeName(item.loggedBy.name)
                            : strings.loggedByName(item.loggedBy.name)}
                        </td>
                        <td data-label={strings.loggedAt}>
                          <span className={styles.when}>
                            {/* The office names a day, not a moment. */}
                            {item.enteredByOffice
                              ? dayIn(item.loggedAt, first.data.timezone)
                              : stamp(item.loggedAt, first.data.timezone)}
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

// The office's form for a receipt the crew never logged. Each field's refusal sits under
// that field; what the server answers sits under the button. The id is minted at the first
// send and kept until an answer comes, so a resend after a lost response is answered as the
// same entry; an `id_conflict` takes a new one.
function ReceiptForm({
  jobs,
  timeZone,
  onDone,
}: {
  jobs: Jobs;
  timeZone: string;
  onDone: (note: string) => void;
}) {
  const trpc = useTRPC();
  // Today on the company's calendar, which is the last day an entry may name.
  const today = instantToWall(new Date(), timeZone).slice(0, 10);
  const [jobId, setJobId] = useState("");
  const [workDate, setWorkDate] = useState(today);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [total, setTotal] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [note, setNote] = useState<string | null>(null);
  // The id the entry was last sent under, until it is answered or the entry changes.
  const [sentId, setSentId] = useState<string | null>(null);
  const create = useMutation(
    trpc.material.create.mutationOptions({
      onSuccess: (answer) => {
        if (answer.result === "rejected") {
          setSentId(null);
          if (answer.code === "date_in_future") {
            setErrors({ workDate: REJECTED[answer.code] });
          } else {
            setNote(REJECTED[answer.code]);
          }
          return;
        }
        setSentId(null);
        onDone(
          answer.entry.reasons.includes("after_closeout")
            ? strings.receiptSavedPending
            : strings.receiptSaved,
        );
      },
      // Unanswered or refused: the id is kept, so sending the same entry again is answered
      // as itself.
      onError: (error) =>
        setNote(
          codeOf(error) === "FORBIDDEN" ? strings.notPermitted : strings.requestFailed,
        ),
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    const found: Partial<Record<FieldName, string>> = {};
    const cost = total.trim() === "" ? null : cents(total);
    if (jobId === "") found.jobId = strings.fillThisIn;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) found.workDate = strings.fillThisIn;
    else if (workDate > today) found.workDate = strings.receiptRejected.date_in_future;
    if (description.trim() === "") found.description = strings.fillThisIn;
    if (!QUANTITY.test(quantity.trim()) || Number(quantity) === 0) {
      found.quantity = strings.badQuantity;
    }
    if (unit.trim() === "") found.unit = strings.fillThisIn;
    if (total.trim() !== "" && cost === null) found.total = strings.badAmount;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const id = sentId ?? uuidv7();
    setSentId(id);
    create.mutate({
      id,
      jobId,
      workDate,
      description: description.trim(),
      quantity: quantity.trim(),
      unit: unit.trim(),
      cost: cost === null ? null : { cents: cost, currency: CURRENCY },
    });
  };
  // A changed field is a different entry: it is sent under a new id.
  const edit = (set: (value: string) => void) => (value: string) => {
    setSentId(null);
    set(value);
  };
  const invalid = (name: FieldName) =>
    errors[name] === undefined
      ? {}
      : { "aria-invalid": true, "aria-describedby": `receipt-${name}-error` };
  const refusal = (name: FieldName) =>
    errors[name] === undefined ? null : (
      <p
        id={`receipt-${name}-error`}
        className={`secondary ${controls.error}`}
        role="alert"
      >
        {errors[name]}
      </p>
    );

  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.addReceipt}
      className={controls.card}
      noValidate
      onSubmit={submit}
    >
      <p className={`secondary ${styles.explain}`}>{strings.addReceiptExplain}</p>
      <div className={styles.receiptGrid}>
        <Field id="receipt-jobId" label={strings.job}>
          <select
            id="receipt-jobId"
            className={controls.select}
            required
            autoFocus
            value={jobId}
            onChange={(e) => edit(setJobId)(e.target.value)}
            {...invalid("jobId")}
          >
            <option value="">{strings.chooseJob}</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.status === "archived" ? strings.jobOptionArchived(j.name) : j.name}
              </option>
            ))}
          </select>
          {refusal("jobId")}
        </Field>
        <Field id="receipt-workDate" label={strings.date}>
          <input
            id="receipt-workDate"
            className={controls.input}
            type="date"
            required
            max={today}
            value={workDate}
            onChange={(e) => edit(setWorkDate)(e.target.value)}
            {...invalid("workDate")}
          />
          {refusal("workDate")}
        </Field>
        <Field id="receipt-description" label={strings.receiptDescription}>
          <input
            id="receipt-description"
            className={controls.input}
            type="text"
            required
            maxLength={2000}
            autoComplete="off"
            value={description}
            onChange={(e) => edit(setDescription)(e.target.value)}
            {...invalid("description")}
          />
          {refusal("description")}
        </Field>
        <div className={styles.pair}>
          <Field id="receipt-quantity" label={strings.quantity}>
            <input
              id="receipt-quantity"
              className={controls.input}
              type="text"
              inputMode="decimal"
              required
              autoComplete="off"
              placeholder="2.5"
              value={quantity}
              onChange={(e) => edit(setQuantity)(e.target.value)}
              {...invalid("quantity")}
            />
            {refusal("quantity")}
          </Field>
          <Field id="receipt-unit" label={strings.receiptUnit}>
            <input
              id="receipt-unit"
              className={controls.input}
              type="text"
              required
              maxLength={40}
              autoComplete="off"
              placeholder="gal"
              value={unit}
              onChange={(e) => edit(setUnit)(e.target.value)}
              {...invalid("unit")}
            />
            {refusal("unit")}
          </Field>
        </div>
        <Field id="receipt-total" label={strings.receiptTotalOptional}>
          <input
            id="receipt-total"
            className={controls.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="89.99"
            value={total}
            onChange={(e) => edit(setTotal)(e.target.value)}
            {...invalid("total")}
          />
          {refusal("total")}
        </Field>
      </div>
      <button type="submit" className={controls.primary} disabled={create.isPending}>
        {strings.saveReceipt}
      </button>
      <Note text={note} />
    </form>
  );
}

type FieldName = "jobId" | "workDate" | "description" | "quantity" | "unit" | "total";

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
