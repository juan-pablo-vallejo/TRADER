"use client";

// The Jobs screen: jobs belong to a customer, and each stands with its status, the hours
// recorded on it this week and to date (`job.list` answers them from the one labor
// derivation; nothing is added here), and its address. Open, Complete and Archived are
// presets in the address, open by default. A job's name goes to its own page; Edit opens
// it in the side panel, and which job is in the address: its details with Save, and its
// status with Set status, two procedures and two answers.
//
// The create form picks a customer or adds one in place: the customer is made first, then
// the job under it. A job's notes are one field, said to be what the crew sees on their
// phones. Its location is one field that takes a pasted pair of coordinates or a maps
// address that carries them (location.ts), with the radius beside it; an admin can also
// set it from the phone's Crew tab, standing at the jobsite. A `rejected` answer reads
// beneath the control it came from.
import { JOBSITE_RADIUS_M } from "@trader/api/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import controls from "../../controls.module.css";
import { DataTable, type Column } from "../../data-table";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { Field } from "../../field";
import { hours } from "../../format";
import { useStrings } from "../../i18n";
import type { Catalog } from "../../i18n/en";
import { JobsTabs } from "../../jobs-tabs";
import { LoadingRows } from "../../loading-rows";
import { Note } from "../../note";
import { PageHeader, CREATE_FORM_ID } from "../../page-header";
import { DestructiveAction, EditorSection } from "../../row-editor";
import { SidePanel } from "../../side-panel";
import { StatusBadge, type Tone } from "../../status-badge";
import { useTRPC } from "../../trpc";
import { useUrlFilters } from "../../use-url-filters";
import styles from "./jobs.module.css";
import {
  locationText,
  parseLocation,
  parseRadius,
  type ParsedLocation,
} from "./location";
import { WriteButton } from "../../write-button";
import table from "../../table.module.css";
import { uuidv7 } from "../../uuidv7";

type Rows = NonNullable<ReturnType<typeof useJobs>["data"]>;
type Row = Rows[number];
type Customers = NonNullable<ReturnType<typeof useCustomers>["data"]>;
type Status = Row["status"];
const STATUSES = ["open", "complete", "archived"] as const satisfies readonly Status[];
const TONES: Record<Status, Tone> = {
  open: "active",
  complete: "done",
  archived: "neutral",
};

// The status shown and the job whose panel is open, in the address.
const JOBS_FILTERS = { status: "open", job: "" };

// The customer select's own value for "add one here".
const NEW_CUSTOMER = "new";

// What the facts form holds: text throughout, blank meaning none.
type Facts = {
  customerId: string;
  newCustomer: string;
  name: string;
  address: string;
  notes: string;
  location: string;
  radiusM: string;
};
const EMPTY: Facts = {
  customerId: "",
  newCustomer: "",
  name: "",
  address: "",
  notes: "",
  location: "",
  radiusM: String(JOBSITE_RADIUS_M),
};
const factsOf = (row: Row): Facts => ({
  customerId: row.customer.id,
  newCustomer: "",
  name: row.name,
  address: row.address ?? "",
  notes: row.notes ?? "",
  location: locationText(row.location),
  radiusM: String(row.location?.radiusM ?? JOBSITE_RADIUS_M),
});

type LocationProblem = Exclude<ParsedLocation, { ok: true }>["problem"] | "radius";

// The location field and its radius to the API's shape: none when the field is empty.
function locationOf(
  f: Facts,
):
  | { ok: true; location: { lat: number; lng: number; radiusM: number } | null }
  | { ok: false; problem: LocationProblem } {
  const parsed = parseLocation(f.location);
  if (!parsed.ok) {
    return parsed.problem === "empty"
      ? { ok: true, location: null }
      : { ok: false, problem: parsed.problem };
  }
  const radiusM = parseRadius(f.radiusM);
  if (radiusM === null) return { ok: false, problem: "radius" };
  return { ok: true, location: { lat: parsed.lat, lng: parsed.lng, radiusM } };
}

const locationProblem = (t: Catalog, problem: LocationProblem): string =>
  problem === "radius" ? t.jobForm.badRadius : t.jobForm.locationProblem[problem];

function useJobs() {
  const trpc = useTRPC();
  return useQuery(trpc.job.list.queryOptions());
}
function useCustomers() {
  const trpc = useTRPC();
  return useQuery(trpc.customer.list.queryOptions());
}
function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.job.pathFilter());
}

export function JobsScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const list = useJobs();
  const customers = useCustomers();
  const [filters, setFilters] = useUrlFilters(JOBS_FILTERS);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const failed = blocking([list, customers]);
  const ready = list.data !== undefined && customers.data !== undefined;
  const shown: Status | "all" =
    filters.status === "all" || (STATUSES as readonly string[]).includes(filters.status)
      ? (filters.status as Status | "all")
      : "open";
  const opened = list.data?.find((row) => row.id === filters.job);
  // The job whose panel is open stays in the table whatever the preset says: a status
  // change under "Open" would otherwise take its row away behind the panel.
  const rows = (list.data ?? []).filter(
    (j) => shown === "all" || j.status === shown || j.id === filters.job,
  );
  return (
    <>
      <PageHeader
        above={<JobsTabs />}
        title={t.jobs}
        action={
          ready
            ? {
                label: t.addJob,
                open: adding,
                onToggle: () => {
                  setNote(null);
                  setAdding((a) => !a);
                },
              }
            : undefined
        }
      />
      <RefreshFailed reads={[list, customers]} />
      {list.isPending || customers.isPending ? (
        <LoadingRows />
      ) : failed !== undefined ? (
        <Failure
          error={failed.error}
          signInHref={signInHref}
          onRetry={() => void failed.refetch()}
        />
      ) : (
        <>
          {adding && (
            <CreateForm
              customers={customers.data!}
              onDone={(name) => {
                setAdding(false);
                setNote(t.jobForm.added(name));
              }}
            />
          )}
          <Note text={note} tone="saved" />
          <div className={controls.presets} role="group" aria-label={t.show}>
            {[...STATUSES, "all" as const].map((s) => (
              <button
                key={s}
                type="button"
                className={controls.secondary}
                aria-pressed={shown === s}
                onClick={() => setFilters({ status: s })}
              >
                {s === "all" ? t.allJobs : t.jobStatus[s]}
              </button>
            ))}
          </div>
          <JobsTable rows={rows} onOpen={(id) => setFilters({ job: id })} />
          {opened !== undefined && (
            <SidePanel
              title={opened.name}
              onClose={() => setFilters({ job: "" })}
              returnTo={opened.id}
              wide
            >
              <EditorSection heading={t.details}>
                <FactsEditor key={opened.id} row={opened} customers={customers.data!} />
              </EditorSection>
              <StatusEditor key={`${opened.id}-status`} row={opened} />
            </SidePanel>
          )}
        </>
      )}
    </>
  );
}

function JobsTable({ rows, onOpen }: { rows: Rows; onOpen: (jobId: string) => void }) {
  const { t } = useStrings();
  const columns: Column<Row>[] = [
    {
      key: "job",
      header: t.job,
      // A job's name, anywhere in the office, goes to its own page.
      cell: (row) => (
        <Link
          className={table.rowLink}
          href={`/jobs/${row.id}`}
          aria-label={t.jobPage.openJob(row.name)}
        >
          {row.name}
        </Link>
      ),
    },
    { key: "customer", header: t.customer, cell: (row) => row.customer.name },
    {
      key: "status",
      header: t.status,
      cell: (row) => (
        <StatusBadge tone={TONES[row.status]} label={t.jobStatus[row.status]} />
      ),
    },
    {
      key: "week",
      header: t.jobForm.hoursWeek,
      number: true,
      cell: (row) => hours(row.hours.week),
    },
    {
      key: "toDate",
      header: t.jobForm.hoursToDate,
      number: true,
      cell: (row) => hours(row.hours.toDate),
    },
    {
      key: "address",
      header: t.address,
      empty: (row) => row.address === null,
      cell: (row) => row.address ?? "",
    },
    {
      key: "edit",
      header: t.jobPage.edit,
      cell: () => t.jobForm.editShort,
      // Named "Edit, <job>": the word it shows, then whose.
      open: (row) => ({ label: row.name, onOpen: () => onOpen(row.id) }),
      action: true,
    },
  ];
  return (
    <DataTable
      caption={t.jobs}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={t.emptyJobs}
    />
  );
}

function FactsFields({
  id,
  customers,
  value,
  onChange,
  mayAddCustomer,
}: {
  id: string;
  customers: Customers;
  value: Facts;
  onChange: (next: Facts) => void;
  // The create form adds a customer in place; a job's editor only moves it between them.
  mayAddCustomer: boolean;
}) {
  const { t } = useStrings();
  const set =
    (key: keyof Facts) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...value, [key]: e.target.value });
  // Active customers, plus the job's own even if deactivated, so the select shows the truth.
  const options = customers.filter(
    (c) => c.deactivatedAt === null || c.id === value.customerId,
  );
  return (
    <div className={styles.formGrid}>
      <Field id={`${id}-customerId`} label={t.customer}>
        <select
          id={`${id}-customerId`}
          data-autofocus={mayAddCustomer ? "" : undefined}
          className={controls.select}
          required
          value={value.customerId}
          onChange={set("customerId")}
        >
          <option value="">{t.chooseCustomer}</option>
          {mayAddCustomer && (
            <option value={NEW_CUSTOMER}>{t.jobForm.newCustomer}</option>
          )}
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {value.customerId === NEW_CUSTOMER && (
        <Field id={`${id}-newCustomer`} label={t.jobForm.newCustomerName}>
          <input
            id={`${id}-newCustomer`}
            className={controls.input}
            type="text"
            required
            maxLength={200}
            autoComplete="off"
            value={value.newCustomer}
            onChange={set("newCustomer")}
          />
        </Field>
      )}
      <Field id={`${id}-name`} label={t.job}>
        <input
          id={`${id}-name`}
          className={controls.input}
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          value={value.name}
          onChange={set("name")}
        />
      </Field>
      <div className={styles.wide}>
        <Field id={`${id}-address`} label={t.address}>
          <input
            id={`${id}-address`}
            className={controls.input}
            type="text"
            maxLength={500}
            autoComplete="off"
            value={value.address}
            onChange={set("address")}
          />
        </Field>
      </div>
      <div className={styles.wide}>
        <Field id={`${id}-notes`} label={t.jobForm.notes}>
          <textarea
            id={`${id}-notes`}
            className={controls.input}
            rows={3}
            maxLength={2000}
            aria-describedby={`${id}-notes-hint`}
            value={value.notes}
            onChange={set("notes")}
          />
          <p id={`${id}-notes-hint`} className={`secondary ${controls.caption}`}>
            {t.jobForm.notesHint}
          </p>
        </Field>
      </div>
      <div className={styles.wide}>
        <div className={styles.locationGrid}>
          <Field id={`${id}-location`} label={t.jobForm.location}>
            <input
              id={`${id}-location`}
              className={controls.input}
              type="text"
              autoComplete="off"
              aria-describedby={`${id}-location-hint`}
              value={value.location}
              onChange={set("location")}
            />
          </Field>
          <Field id={`${id}-radiusM`} label={t.radiusM}>
            <input
              id={`${id}-radiusM`}
              className={controls.input}
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={value.radiusM}
              onChange={set("radiusM")}
            />
          </Field>
        </div>
        <p id={`${id}-location-hint`} className={`secondary ${controls.caption}`}>
          {t.jobForm.locationHint} {t.jobForm.locationFromCrew}
        </p>
      </div>
    </div>
  );
}

// What a `rejected` answer says, by its code and the control it came from.
const reason = (t: Catalog, code: string, on: "facts" | "status") =>
  code === "customer_inactive"
    ? on === "status"
      ? t.customerInactiveOnStatus
      : t.customerInactive
    : code === "has_invoices"
      ? t.hasInvoices
      : t.requestFailed;

function CreateForm({
  customers,
  onDone,
}: {
  customers: Customers;
  onDone: (name: string) => void;
}) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [facts, setFacts] = useState<Facts>(EMPTY);
  const [note, setNote] = useState<string | null>(null);
  // A customer made by a first press and kept: if the job is then refused, a second press
  // does not make the customer twice.
  const [made, setMade] = useState<{ name: string; id: string } | null>(null);
  // Each new record's id: made for what the form holds and kept while it holds the same, so a
  // retry after a lost answer is the same record; a conflict takes a new one.
  const minted = useRef<Record<"customer" | "job", { key: string; id: string } | null>>({
    customer: null,
    job: null,
  });
  const idFor = (which: "customer" | "job", contents: unknown) => {
    const key = JSON.stringify(contents);
    const held = minted.current[which];
    if (held?.key === key) return held.id;
    const id = uuidv7();
    minted.current[which] = { key, id };
    return id;
  };
  const addCustomer = useMutation(trpc.customer.create.mutationOptions());
  const create = useMutation(trpc.job.create.mutationOptions());
  const busy = addCustomer.isPending || create.isPending;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const located = locationOf(facts);
    if (!located.ok) return setNote(locationProblem(t, located.problem));
    setNote(null);
    try {
      let customerId = facts.customerId;
      if (customerId === NEW_CUSTOMER) {
        const name = facts.newCustomer.trim();
        if (made !== null && made.name === name) customerId = made.id;
        else {
          const contact = { name, address: null, phone: null, email: null, notes: null };
          const answer = await addCustomer.mutateAsync({
            id: idFor("customer", contact),
            ...contact,
          });
          if (answer.result === "rejected") {
            minted.current.customer = null;
            return setNote(t.requestFailed);
          }
          customerId = answer.customer.id;
          setMade({ name, id: customerId });
          await queryClient.invalidateQueries(trpc.customer.pathFilter());
        }
      }
      const sent = {
        customerId,
        name: facts.name,
        address: facts.address,
        notes: facts.notes,
        location: located.location,
      };
      const answer = await create.mutateAsync({ id: idFor("job", sent), ...sent });
      if (answer.result === "rejected") {
        if (answer.code === "id_conflict") minted.current.job = null;
        return setNote(reason(t, answer.code, "facts"));
      }
      minted.current.job = null;
      await queryClient.invalidateQueries(trpc.job.pathFilter());
      setFacts(EMPTY);
      onDone(answer.job.name);
    } catch {
      setNote(t.requestFailed);
    }
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={t.addJob}
      className={controls.card}
      onSubmit={(e) => void submit(e)}
    >
      <FactsFields
        id="new-job"
        customers={customers}
        value={facts}
        onChange={setFacts}
        mayAddCustomer
      />
      <Note text={note} />
      <WriteButton type="submit" className={controls.primary} pending={busy}>
        {t.addJob}
      </WriteButton>
    </form>
  );
}

function FactsEditor({ row, customers }: { row: Row; customers: Customers }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [facts, setFacts] = useState<Facts>(factsOf(row));
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.job.update.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(reason(t, answer.code, "facts"));
          return;
        }
        setNote(t.saved);
        await refresh();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const located = locationOf(facts);
    if (!located.ok) return setNote(locationProblem(t, located.problem));
    setNote(null);
    save.mutate({
      jobId: row.id,
      customerId: facts.customerId,
      name: facts.name,
      address: facts.address,
      // Sent with every save: `job.update` replaces the record whole, and a save without
      // them would clear what the crew reads on their phones.
      notes: facts.notes,
      location: located.location,
    });
  };
  return (
    <form onSubmit={submit}>
      <FactsFields
        id={`job-${row.id}`}
        customers={customers}
        value={facts}
        onChange={setFacts}
        mayAddCustomer={false}
      />
      <WriteButton type="submit" className={controls.secondary} pending={save.isPending}>
        {t.saveDetails}
      </WriteButton>
      <Note text={note} />
    </form>
  );
}

function StatusEditor({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [status, setStatus] = useState<Status>(row.status);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const setStatusCall = useMutation(
    trpc.job.setStatus.mutationOptions({
      onSuccess: async (answer) => {
        setStatusNote(
          answer.result === "rejected"
            ? reason(t, answer.code, "status")
            : answer.result === "unchanged"
              ? t.unchanged
              : answer.job.status === "archived"
                ? t.archivedNote
                : t.saved,
        );
        await refresh();
      },
      onError: () => setStatusNote(t.requestFailed),
    }),
  );
  const statusId = `job-status-${row.id}`;
  return (
    <EditorSection>
      <Field id={statusId} label={t.status}>
        <select
          id={statusId}
          className={controls.select}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.jobStatus[s]}
            </option>
          ))}
        </select>
      </Field>
      {status === "archived" && row.status !== "archived" ? (
        // Archiving takes the job off every phone: asked first, as deactivating a
        // customer is.
        <DestructiveAction
          plain
          label={t.setStatus}
          effect={t.archiveJobEffect}
          disabled={setStatusCall.isPending}
          onConfirm={() => setStatusCall.mutate({ jobId: row.id, status })}
        />
      ) : (
        <WriteButton
          type="button"
          className={controls.secondary}
          pending={setStatusCall.isPending}
          onClick={() => setStatusCall.mutate({ jobId: row.id, status })}
        >
          {t.setStatus}
        </WriteButton>
      )}
      <Note text={statusNote} tone={statusNote === t.archivedNote ? "info" : undefined} />
    </EditorSection>
  );
}
