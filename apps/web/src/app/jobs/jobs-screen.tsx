"use client";

// The jobs screen (PRD, Jobs and location: jobs belong to a customer and are assigned to a
// crew; DESIGN, Data table). Three queries — jobs, customers and crews, the last two for the
// selects; every mutation invalidates the jobs. A status filter, open by default, narrows the
// table on the client. The page header's action opens the create form; the location waits
// behind a disclosure. Each row is text plus one Edit toggle; the editor row beneath holds the
// details with Save, the crew with Assign, and the status with Set status — three procedures,
// three sections, three answers. A `rejected` answer reads beneath the control it came from. Consumed by
// page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { Field } from "../field";
import { Note } from "../note";
import { EditorRow, EditorSection, RowToggle } from "../row-editor";
import { PageHeader, CREATE_FORM_ID } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./jobs.module.css";

type Rows = NonNullable<ReturnType<typeof useJobs>["data"]>;
type Row = Rows[number];
type Customers = NonNullable<ReturnType<typeof useCustomers>["data"]>;
type Crews = NonNullable<ReturnType<typeof useCrews>["data"]>;
type Status = Row["status"];
const STATUSES = ["open", "complete", "archived"] as const satisfies readonly Status[];

// What the facts form holds: text throughout, blank meaning none.
type Facts = {
  customerId: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  radiusM: string;
};
const EMPTY: Facts = {
  customerId: "",
  name: "",
  address: "",
  lat: "",
  lng: "",
  radiusM: "",
};
const factsOf = (row: Row): Facts => ({
  customerId: row.customer.id,
  name: row.name,
  address: row.address ?? "",
  lat: row.location === null ? "" : String(row.location.lat),
  lng: row.location === null ? "" : String(row.location.lng),
  radiusM: row.location === null ? "" : String(row.location.radiusM),
});

// The three location fields to the API's shape: all or none, else null — the caller refuses
// a partial set. Coordinates are floats by design (jobs.ts); the radius is a whole number.
function locationOf(
  f: Facts,
): { lat: number; lng: number; radiusM: number } | null | "partial" {
  const given = [f.lat, f.lng, f.radiusM].map((v) => v.trim() !== "");
  if (given.every((g) => !g)) return null;
  if (!given.every((g) => g)) return "partial";
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d+$/.test(f.radiusM.trim())) {
    return "partial";
  }
  return { lat, lng, radiusM: Number.parseInt(f.radiusM, 10) };
}

function useJobs() {
  const trpc = useTRPC();
  return useQuery(trpc.job.list.queryOptions());
}
function useCustomers() {
  const trpc = useTRPC();
  return useQuery(trpc.customer.list.queryOptions());
}
function useCrews() {
  const trpc = useTRPC();
  return useQuery(trpc.crew.list.queryOptions());
}

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.job.pathFilter());
}

export function JobsScreen({ devSignIn }: { devSignIn: boolean }) {
  const list = useJobs();
  const customers = useCustomers();
  const crews = useCrews();
  const [filter, setFilter] = useState<Status | "all">("open");
  const [adding, setAdding] = useState(false);
  const failed = [list, customers, crews].find((q) => q.isError);
  const ready = list.isSuccess && customers.isSuccess && crews.isSuccess;
  return (
    <>
      <PageHeader
        title={strings.jobs}
        action={
          ready
            ? {
                label: strings.addJob,
                open: adding,
                onToggle: () => setAdding((a) => !a),
              }
            : undefined
        }
      />
      {list.isPending || customers.isPending || crews.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : failed !== undefined ? (
        <Failure
          error={failed.error}
          devSignIn={devSignIn}
          onRetry={() => void failed.refetch()}
        />
      ) : (
        <>
          {adding && (
            <CreateForm
              customers={customers.data!}
              crews={crews.data!}
              onDone={() => setAdding(false)}
            />
          )}
          <Field id="jobs-filter" label={strings.show} className={styles.filter}>
            <select
              id="jobs-filter"
              className={controls.select}
              value={filter}
              onChange={(e) => setFilter(e.target.value as Status | "all")}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {strings.jobStatus[s]}
                </option>
              ))}
              <option value="all">{strings.allJobs}</option>
            </select>
          </Field>
          <JobsTable
            rows={list.data!}
            filter={filter}
            customers={customers.data!}
            crews={crews.data!}
          />
        </>
      )}
    </>
  );
}

function FactsFields({
  id,
  customers,
  value,
  onChange,
}: {
  id: string;
  customers: Customers;
  value: Facts;
  onChange: (next: Facts) => void;
}) {
  const set =
    (key: keyof Facts) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: e.target.value });
  const input = (
    key: keyof Facts,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <Field id={`${id}-${key}`} label={label}>
      <input
        id={`${id}-${key}`}
        className={controls.input}
        autoComplete="off"
        value={value[key]}
        onChange={set(key)}
        {...props}
      />
    </Field>
  );
  // The location is optional and technical, so it waits behind a disclosure, open when the
  // job already has one or the person has typed into it.
  const located = [value.lat, value.lng, value.radiusM].some((v) => v !== "");
  // Active customers, plus the job's own even if deactivated, so the select shows the truth.
  const options = customers.filter(
    (c) => c.deactivatedAt === null || c.id === value.customerId,
  );
  return (
    <div className={styles.formGrid}>
      <Field id={`${id}-customerId`} label={strings.customer}>
        <select
          id={`${id}-customerId`}
          autoFocus={id === "new-job"}
          className={controls.select}
          required
          value={value.customerId}
          onChange={set("customerId")}
        >
          <option value="">{strings.chooseCustomer}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {input("name", strings.job, { type: "text", required: true, maxLength: 200 })}
      <div className={styles.wide}>
        {input("address", strings.address, { type: "text", maxLength: 500 })}
      </div>
      <details className={`${styles.location} ${styles.wide}`} open={located}>
        <summary className="label">{strings.location}</summary>
        <div className={styles.locationGrid}>
          {input("lat", strings.latitude, { type: "text", inputMode: "decimal" })}
          {input("lng", strings.longitude, { type: "text", inputMode: "decimal" })}
          {input("radiusM", strings.radiusM, { type: "text", inputMode: "numeric" })}
        </div>
      </details>
    </div>
  );
}

function CrewSelect({
  id,
  crews,
  value,
  onChange,
}: {
  id: string;
  crews: Crews;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = crews.filter((c) => c.deactivatedAt === null || c.id === value);
  return (
    <Field id={id} label={strings.crew}>
      <select
        id={id}
        className={controls.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{strings.unassigned}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.deactivatedAt !== null && ` (${strings.deactivated.toLowerCase()})`}
          </option>
        ))}
      </select>
    </Field>
  );
}

// What a `rejected` answer says, by its code and the control it came from.
const reason = (code: string, on: "facts" | "assign" | "status") =>
  code === "customer_inactive"
    ? on === "status"
      ? strings.customerInactiveOnStatus
      : strings.customerInactive
    : code === "crew_inactive"
      ? on === "status"
        ? strings.crewInactiveOnStatus
        : strings.crewInactive
      : code === "has_invoices"
        ? strings.hasInvoices
        : strings.requestFailed;

function CreateForm({
  customers,
  crews,
  onDone,
}: {
  customers: Customers;
  crews: Crews;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [facts, setFacts] = useState<Facts>(EMPTY);
  const [crewId, setCrewId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.job.create.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(reason(answer.code, "facts"));
          return;
        }
        setFacts(EMPTY);
        setCrewId("");
        setNote(null);
        await refresh();
        onDone();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const location = locationOf(facts);
    if (location === "partial") {
      setNote(strings.locationAllOrNone);
      return;
    }
    setNote(null);
    create.mutate({
      customerId: facts.customerId,
      name: facts.name,
      address: facts.address,
      location,
      crewId: crewId === "" ? null : crewId,
    });
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.addJob}
      className={controls.card}
      onSubmit={submit}
    >
      <FactsFields id="new-job" customers={customers} value={facts} onChange={setFacts} />
      <CrewSelect id="new-job-crew" crews={crews} value={crewId} onChange={setCrewId} />
      <Note text={note} />
      <button type="submit" className={controls.primary} disabled={create.isPending}>
        {strings.addJob}
      </button>
    </form>
  );
}

function JobsTable({
  rows: all,
  filter,
  customers,
  crews,
}: {
  rows: Rows;
  filter: Status | "all";
  customers: Customers;
  crews: Crews;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // The row whose editor is open stays whatever the filter says: a status change under the
  // default "Open" filter would otherwise take the row, its editor and the result note away
  // in the same instant, leaving nothing to say it worked. It leaves when its editor closes.
  const rows = all.filter(
    (j) => filter === "all" || j.status === filter || j.id === editing,
  );
  if (rows.length === 0) return <EmptyState text={strings.emptyJobs} />;
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.job}</th>
          <th scope="col">{strings.customer}</th>
          <th scope="col">{strings.crew}</th>
          <th scope="col">{strings.status}</th>
          <th scope="col">{strings.address}</th>
          <th scope="col">
            <span className="visually-hidden">{strings.edit}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = editing === row.id;
          return (
            <Fragment key={row.id}>
              <tr>
                <td data-label={strings.job} className="body-strong">
                  {row.name}
                </td>
                <td data-label={strings.customer}>{row.customer.name}</td>
                <td
                  data-label={strings.crew}
                  className={
                    row.crew !== null && !row.crew.active ? table.attention : undefined
                  }
                >
                  {row.crew === null
                    ? strings.unassigned
                    : row.crew.active
                      ? row.crew.name
                      : `${row.crew.name} (${strings.deactivated.toLowerCase()})`}
                </td>
                <td data-label={strings.status} className={table.status}>
                  {strings.jobStatus[row.status]}
                </td>
                <td
                  data-label={strings.address}
                  data-empty={row.address === null ? "" : undefined}
                >
                  {row.address ?? strings.none}
                </td>
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row.id)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={6}>
                  <Editor row={row} customers={customers} crews={crews} />
                </EditorRow>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Editor({
  row,
  customers,
  crews,
}: {
  row: Row;
  customers: Customers;
  crews: Crews;
}) {
  return (
    <div className={styles.editorGrid}>
      <EditorSection heading={strings.details}>
        <FactsEditor row={row} customers={customers} />
      </EditorSection>
      <CrewAndStatus row={row} crews={crews} />
    </div>
  );
}

function FactsEditor({ row, customers }: { row: Row; customers: Customers }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [facts, setFacts] = useState<Facts>(factsOf(row));
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.job.update.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(reason(answer.code, "facts"));
          return;
        }
        setNote(strings.saved);
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const location = locationOf(facts);
    if (location === "partial") {
      setNote(strings.locationAllOrNone);
      return;
    }
    setNote(null);
    save.mutate({
      jobId: row.id,
      customerId: facts.customerId,
      name: facts.name,
      address: facts.address,
      location,
    });
  };
  return (
    <form onSubmit={submit}>
      <FactsFields
        id={`job-${row.id}`}
        customers={customers}
        value={facts}
        onChange={setFacts}
      />
      <button
        type="submit"
        className={`${controls.secondary} ${table.stretch}`}
        disabled={save.isPending}
      >
        {strings.saveDetails}
      </button>
      <Note text={note} />
    </form>
  );
}

function CrewAndStatus({ row, crews }: { row: Row; crews: Crews }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [crewId, setCrewId] = useState(row.crew?.id ?? "");
  const [status, setStatus] = useState<Status>(row.status);
  const [crewNote, setCrewNote] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const assign = useMutation(
    trpc.job.assign.mutationOptions({
      onSuccess: async (answer) => {
        setCrewNote(
          answer.result === "rejected"
            ? reason(answer.code, "assign")
            : answer.result === "unchanged"
              ? strings.unchanged
              : strings.saved,
        );
        await refresh();
      },
      onError: () => setCrewNote(strings.requestFailed),
    }),
  );
  const setStatusCall = useMutation(
    trpc.job.setStatus.mutationOptions({
      onSuccess: async (answer) => {
        setStatusNote(
          answer.result === "rejected"
            ? reason(answer.code, "status")
            : answer.result === "unchanged"
              ? strings.unchanged
              : answer.job.status === "archived"
                ? strings.archivedNote
                : strings.saved,
        );
        await refresh();
      },
      onError: () => setStatusNote(strings.requestFailed),
    }),
  );
  const busy = assign.isPending || setStatusCall.isPending;
  const statusId = `job-status-${row.id}`;
  return (
    <div>
      <EditorSection>
        <CrewSelect
          id={`job-crew-${row.id}`}
          crews={crews}
          value={crewId}
          onChange={setCrewId}
        />
        <button
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy}
          onClick={() =>
            assign.mutate({ jobId: row.id, crewId: crewId === "" ? null : crewId })
          }
        >
          {strings.assign}
        </button>
        <Note text={crewNote} />
      </EditorSection>
      <EditorSection>
        <Field id={statusId} label={strings.status}>
          <select
            id={statusId}
            className={controls.select}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {strings.jobStatus[s]}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy}
          onClick={() => setStatusCall.mutate({ jobId: row.id, status })}
        >
          {strings.setStatus}
        </button>
        <Note
          text={statusNote}
          tone={statusNote === strings.archivedNote ? "info" : undefined}
        />
      </EditorSection>
    </div>
  );
}
