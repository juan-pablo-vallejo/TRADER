"use client";

// The customers screen. The
// list is one query; every mutation invalidates it. The page header's action opens the create
// form. Each row is text plus one Edit toggle; the editor row beneath holds the fields with
// Save and, last, the deactivation. A `rejected` answer reads
// beneath the control it came from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { EmptyState, Failure } from "../../failure";
import { Field } from "../../field";
import { Note } from "../../note";
import {
  DestructiveAction,
  EditorFooter,
  EditorRow,
  EditorSection,
  RowToggle,
} from "../../row-editor";
import { JobsTabs } from "../../jobs-tabs";
import { PageHeader, CREATE_FORM_ID } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import styles from "./customers.module.css";

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

export function CustomersScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const list = useCustomers();
  const [adding, setAdding] = useState(false);
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
                onToggle: () => setAdding((a) => !a),
              }
            : undefined
        }
      />
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <Failure
          error={list.error}
          signInHref={signInHref}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          {adding && <CreateForm onDone={() => setAdding(false)} />}
          {list.data.length === 0 ? (
            <EmptyState text={t.emptyCustomers} />
          ) : (
            <CustomersTable rows={list.data} />
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

function CreateForm({ onDone }: { onDone: () => void }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [value, setValue] = useState<Fields>(EMPTY);
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.customer.create.mutationOptions({
      onSuccess: async () => {
        setValue(EMPTY);
        setNote(null);
        await refresh();
        onDone();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    create.mutate(value);
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
      <button type="submit" className={controls.primary} disabled={create.isPending}>
        {t.addCustomer}
      </button>
    </form>
  );
}

function CustomersTable({ rows }: { rows: Rows }) {
  const { t } = useStrings();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{t.name}</th>
          <th scope="col">{t.address}</th>
          <th scope="col">{t.phone}</th>
          <th scope="col">{t.email}</th>
          <th scope="col" className={table.number}>
            {t.jobs}
          </th>
          <th scope="col">{t.status}</th>
          <th scope="col">
            <span className="visually-hidden">{t.edit}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = editing === row.id;
          return (
            <Fragment key={row.id}>
              <tr>
                <td data-label={t.name} className="body-strong">
                  {row.name}
                </td>
                <td
                  data-label={t.address}
                  data-empty={row.address === null ? "" : undefined}
                >
                  {row.address ?? t.none}
                </td>
                <td data-label={t.phone} data-empty={row.phone === null ? "" : undefined}>
                  {row.phone ?? t.none}
                </td>
                <td data-label={t.email} data-empty={row.email === null ? "" : undefined}>
                  {row.email ?? t.none}
                </td>
                <td data-label={t.jobs} className={table.number}>
                  {row.unarchivedJobs}
                </td>
                <td data-label={t.status} className={table.status}>
                  {row.deactivatedAt === null ? t.active : t.deactivated}
                </td>
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row.id)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={7}>
                  <Editor row={row} />
                </EditorRow>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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
          <button
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
          >
            {t.save}
          </button>
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
          <button
            type="button"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
            onClick={() => reactivate.mutate({ customerId: row.id })}
          >
            {t.reactivate}
          </button>
        )}
        <Note text={stateNote} />
      </EditorFooter>
    </>
  );
}
