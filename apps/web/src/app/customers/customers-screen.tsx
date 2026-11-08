"use client";

// The customers screen (PRD, Target users: the admin's customers; DESIGN, Data table). The
// list is one query; every mutation invalidates it. Each row is text plus one Edit toggle; the
// editor row beneath holds the fields, Save and the deactivation. A `rejected` answer reads
// beneath the control it came from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
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

export function CustomersScreen({ devSignIn }: { devSignIn: boolean }) {
  const list = useCustomers();
  return (
    <>
      <h1 className="title">{strings.customers}</h1>
      {list.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure error={list.error} devSignIn={devSignIn} />
      ) : (
        <>
          <CreateForm />
          {list.data.length === 0 ? (
            <EmptyState text={strings.emptyCustomers} />
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
  const field = (
    key: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    className = "",
  ) => (
    <div className={`${controls.field} ${className}`}>
      <label className="label" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className={controls.input}
        autoComplete="off"
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <div className={styles.formGrid}>
      {field("name", strings.name, { type: "text", required: true, maxLength: 200 })}
      {field("address", strings.address, { type: "text", maxLength: 500 })}
      {field("phone", strings.phone, { type: "tel", maxLength: 32 })}
      {field("email", strings.email, { type: "email", maxLength: 254 })}
      <div className={`${controls.field} ${styles.wide}`}>
        <label className="label" htmlFor={`${id}-notes`}>
          {strings.notes}
        </label>
        <textarea
          id={`${id}-notes`}
          className={`${controls.input} ${styles.notes}`}
          maxLength={2000}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function CreateForm() {
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
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    create.mutate(value);
  };
  return (
    <form className={controls.card} onSubmit={submit}>
      <h2 className="heading">{strings.addCustomer}</h2>
      <CustomerFields id="new-customer" value={value} onChange={setValue} />
      {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
      <button type="submit" className={controls.primary} disabled={create.isPending}>
        {strings.addCustomer}
      </button>
    </form>
  );
}

function CustomersTable({ rows }: { rows: Rows }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.name}</th>
          <th scope="col">{strings.address}</th>
          <th scope="col">{strings.phone}</th>
          <th scope="col">{strings.email}</th>
          <th scope="col" className={table.number}>
            {strings.jobs}
          </th>
          <th scope="col">{strings.status}</th>
          <th scope="col">
            <span className="label">{strings.edit}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = editing === row.id;
          return [
            <tr key={row.id}>
              <td data-label={strings.name} className="body-strong">
                {row.name}
              </td>
              <td data-label={strings.address}>{row.address ?? strings.none}</td>
              <td data-label={strings.phone}>{row.phone ?? strings.none}</td>
              <td data-label={strings.email}>{row.email ?? strings.none}</td>
              <td data-label={strings.jobs} className={table.number}>
                {row.unarchivedJobs}
              </td>
              <td data-label={strings.status} className={table.status}>
                {row.deactivatedAt === null ? strings.active : strings.deactivated}
              </td>
              <td className={table.toggle}>
                <button
                  type="button"
                  className={controls.textAction}
                  aria-expanded={open}
                  aria-controls={`editor-${row.id}`}
                  onClick={() => setEditing(open ? null : row.id)}
                >
                  {open ? strings.close : strings.edit}
                </button>
              </td>
            </tr>,
            open ? (
              <tr
                key={`${row.id}-editor`}
                className={table.editor}
                id={`editor-${row.id}`}
              >
                <td colSpan={7}>
                  <Editor row={row} />
                </td>
              </tr>
            ) : null,
          ];
        })}
      </tbody>
    </table>
  );
}

function Editor({ row }: { row: Row }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [value, setValue] = useState<Fields>(fieldsOf(row));
  const [note, setNote] = useState<string | null>(null);
  const [stateNote, setStateNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.customer.update.mutationOptions({
      onSuccess: async () => {
        setNote(strings.saved);
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const answered = async (answer: { result: string; unarchivedJobs?: number }) => {
    setStateNote(
      answer.result === "rejected"
        ? strings.jobsUnarchived(answer.unarchivedJobs ?? 0)
        : answer.result === "unchanged"
          ? strings.unchanged
          : null,
    );
    await refresh();
  };
  const failed = () => setStateNote(strings.requestFailed);
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
    <div>
      <form onSubmit={submit}>
        <CustomerFields id={`customer-${row.id}`} value={value} onChange={setValue} />
        {note !== null && (
          <p className={`secondary ${note === strings.saved ? "" : controls.error}`}>
            {note}
          </p>
        )}
        <div className={controls.actions}>
          <button
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
          >
            {strings.save}
          </button>
          {row.deactivatedAt === null ? (
            <button
              type="button"
              className={controls.destructive}
              disabled={busy}
              onClick={() => deactivate.mutate({ customerId: row.id })}
            >
              {strings.deactivate}
            </button>
          ) : (
            <button
              type="button"
              className={`${controls.secondary} ${table.stretch}`}
              disabled={busy}
              onClick={() => reactivate.mutate({ customerId: row.id })}
            >
              {strings.reactivate}
            </button>
          )}
        </div>
        {stateNote !== null && (
          <p className={`secondary ${controls.error}`}>{stateNote}</p>
        )}
      </form>
    </div>
  );
}
