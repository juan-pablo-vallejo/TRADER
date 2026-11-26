"use client";

// The customers screen, on the shared table. The list is one query; every mutation
// invalidates it. The page header's action opens the create form. A customer's name opens
// them in the side panel, and which customer is in the address: the fields with Save and,
// last, the deactivation. A `rejected` answer reads beneath the control it came from.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";

import controls from "../../controls.module.css";
import { DataTable, type Column } from "../../data-table";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { Field } from "../../field";
import { Note } from "../../note";
import { DestructiveAction, EditorFooter, EditorSection } from "../../row-editor";
import { SidePanel } from "../../side-panel";
import { StatusBadge } from "../../status-badge";
import { JobsTabs } from "../../jobs-tabs";
import { PageHeader, CREATE_FORM_ID } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import { useUrlFilters } from "../../use-url-filters";
import styles from "./customers.module.css";
import { WriteButton } from "../../write-button";
import { uuidv7 } from "../../uuidv7";

type Rows = NonNullable<ReturnType<typeof useCustomers>["data"]>;
type Row = Rows[number];

// What the forms hold: every optional field as text, blank meaning none.
type Fields = {
  name: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
};
const EMPTY: Fields = { name: "", address: "", phone: "", email: "", notes: "" };
const fieldsOf = (row: Row): Fields => ({
  name: row.name,
  address: row.address ?? "",
  phone: row.phone ?? "",
  email: row.email ?? "",
  notes: row.notes ?? "",
});

function useCustomers() {
  const trpc = useTRPC();
  return useQuery(trpc.customer.list.queryOptions());
}

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.customer.pathFilter());
}

// The customer whose panel is open, in the address.
const CUSTOMER_FILTERS = { customer: "" };

export function CustomersScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const list = useCustomers();
  const [adding, setAdding] = useState(false);
  // What the last add made, said under the title once its form has closed.
  const [added, setAdded] = useState<string | null>(null);
  const [filters, setFilters] = useUrlFilters(CUSTOMER_FILTERS);
  const opened = list.data?.find((row) => row.id === filters.customer);
  const ready = list.isSuccess;
  return (
    <>
      <JobsTabs />
      <PageHeader
        title={t.customers}
        action={
          ready
            ? {
                label: t.addCustomer,
                open: adding,
                onToggle: () => {
                  setAdding((a) => !a);
                  setAdded(null);
                },
              }
            : undefined
        }
      />
      <Note text={added} tone="saved" />
      <RefreshFailed reads={[list]} />
      {list.isPending ? (
        <LoadingRows />
      ) : blocking([list]) !== undefined || list.data === undefined ? (
        <Failure
          error={list.error}
          signInHref={signInHref}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          {adding && (
            <CreateForm
              onDone={(name) => {
                setAdding(false);
                setAdded(t.customerAdded(name));
              }}
            />
          )}
          <CustomersTable
            rows={list.data}
            onOpen={(id) => setFilters({ customer: id })}
          />
          {opened !== undefined && (
            <SidePanel
              title={opened.name}
              onClose={() => setFilters({ customer: "" })}
              returnTo={opened.id}
            >
              <Editor key={opened.id} row={opened} />
            </SidePanel>
          )}
        </>
      )}
    </>
  );
}

// The five fields, shared by the create form and the editor; `id` keeps labels unique per row.
function CustomerFields({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Fields;
  onChange: (next: Fields) => void;
}) {
  const { t } = useStrings();
  const field = (
    key: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    className = "",
  ) => (
    <Field id={`${id}-${key}`} label={label} className={className}>
      <input
        id={`${id}-${key}`}
        className={controls.input}
        autoComplete="off"
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        {...props}
      />
    </Field>
  );
  return (
    <div className={styles.formGrid}>
      {field("name", t.name, {
        type: "text",
        required: true,
        maxLength: 200,
        autoFocus: id === "new-customer",
      })}
      {field("address", t.address, { type: "text", maxLength: 500 })}
      {field("phone", t.phone, { type: "tel", maxLength: 32 })}
      {field("email", t.email, { type: "email", maxLength: 254 })}
      <Field id={`${id}-notes`} label={t.notes} className={styles.wide}>
        <textarea
          id={`${id}-notes`}
          className={`${controls.input} ${styles.notes}`}
          maxLength={2000}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: (name: string) => void }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [value, setValue] = useState<Fields>(EMPTY);
  const [note, setNote] = useState<string | null>(null);
  // The new customer's id: made for what the form holds and kept while it holds the same, so
  // a retry after a lost answer is the same customer; a conflict takes a new one.
  const minted = useRef<{ key: string; id: string } | null>(null);
  const create = useMutation(trpc.customer.create.mutationOptions());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    const key = JSON.stringify(value);
    if (minted.current?.key !== key) minted.current = { key, id: uuidv7() };
    create.mutate(
      { id: minted.current.id, ...value },
      {
        onSuccess: (answer, asked) => {
          // Answered: the next customer takes a new id, and so does a retry after a conflict.
          minted.current = null;
          if (answer.result === "rejected") return setNote(t.requestFailed);
          setValue(EMPTY);
          void refresh().then(() => onDone(asked.name));
        },
        onError: () => setNote(t.requestFailed),
      },
    );
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={t.addCustomer}
      className={controls.card}
      onSubmit={submit}
    >
      <CustomerFields id="new-customer" value={value} onChange={setValue} />
      <Note text={note} />
      <WriteButton type="submit" className={controls.primary} pending={create.isPending}>
        {t.addCustomer}
      </WriteButton>
    </form>
  );
}

function CustomersTable({
  rows,
  onOpen,
}: {
  rows: Rows;
  onOpen: (customerId: string) => void;
}) {
  const { t } = useStrings();
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t.name,
      cell: (row) => row.name,
      open: (row) => ({ label: t.jobForm.open(row.name), onOpen: () => onOpen(row.id) }),
    },
    {
      key: "address",
      header: t.address,
      empty: (row) => row.address === null,
      cell: (row) => row.address ?? "",
    },
    {
      key: "phone",
      header: t.phone,
      empty: (row) => row.phone === null,
      // A phone number is read whole: never broken at its hyphen in a narrow column.
      cell: (row) => <span style={{ whiteSpace: "nowrap" }}>{row.phone ?? ""}</span>,
    },
    {
      key: "email",
      header: t.email,
      empty: (row) => row.email === null,
      cell: (row) => row.email ?? "",
    },
    { key: "jobs", header: t.jobs, number: true, cell: (row) => row.unarchivedJobs },
    {
      key: "status",
      header: t.status,
      cell: (row) =>
        row.deactivatedAt === null ? (
          <StatusBadge tone="done" label={t.active} />
        ) : (
          <StatusBadge tone="neutral" label={t.deactivated} />
        ),
    },
  ];
  return (
    <DataTable
      caption={t.customers}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={t.emptyCustomers}
    />
  );
}

function Editor({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [value, setValue] = useState<Fields>(fieldsOf(row));
  const [note, setNote] = useState<string | null>(null);
  const [stateNote, setStateNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.customer.update.mutationOptions({
      onSuccess: async () => {
        setNote(t.saved);
        await refresh();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const answered = async (answer: { result: string; unarchivedJobs?: number }) => {
    setStateNote(
      answer.result === "rejected"
        ? t.jobsUnarchived(answer.unarchivedJobs ?? 0)
        : answer.result === "unchanged"
          ? t.unchanged
          : t.saved,
    );
    await refresh();
  };
  const failed = () => setStateNote(t.requestFailed);
  const deactivate = useMutation(
    trpc.customer.deactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const reactivate = useMutation(
    trpc.customer.reactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const busy = save.isPending || deactivate.isPending || reactivate.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    save.mutate({ customerId: row.id, ...value });
  };
  return (
    <>
      <EditorSection>
        <form onSubmit={submit}>
          <CustomerFields id={`customer-${row.id}`} value={value} onChange={setValue} />
          <WriteButton
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            pending={busy}
          >
            {t.save}
          </WriteButton>
          <Note text={note} />
        </form>
      </EditorSection>
      <EditorFooter>
        {row.deactivatedAt === null ? (
          <DestructiveAction
            label={t.deactivate}
            effect={t.deactivateCustomerEffect}
            disabled={busy}
            onConfirm={() => deactivate.mutate({ customerId: row.id })}
          />
        ) : (
          <WriteButton
            type="button"
            className={`${controls.secondary} ${table.stretch}`}
            pending={busy}
            onClick={() => reactivate.mutate({ customerId: row.id })}
          >
            {t.reactivate}
          </WriteButton>
        )}
        <Note text={stateNote} />
      </EditorFooter>
    </>
  );
}
