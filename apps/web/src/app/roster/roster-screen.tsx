"use client";

// The roster screen (PRD, Target users: the admin's roster; DESIGN, Data table). The list is
// one query; every mutation invalidates it, so the table refetches and nothing is edited in
// the cache by hand. The page header's action opens the invite form. Each row is text plus one
// Edit toggle; the editor row beneath holds the role, the pay rate and, last, the deactivation. A `rejected` answer reads beneath the form it came
// from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { cents, day, looksLikeSignInPhone, money, signInPhone } from "../format";
import { Field } from "../field";
import { Note } from "../note";
import {
  DestructiveAction,
  EditorFooter,
  EditorRow,
  EditorSection,
  RowToggle,
} from "../row-editor";
import { PageHeader, CREATE_FORM_ID } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./roster.module.css";

type Roles = keyof typeof strings.roles;
const ROLES = ["worker", "foreman", "admin"] as const satisfies readonly Roles[];

type Rows = NonNullable<ReturnType<typeof useRoster>["data"]>;
type Row = Rows[number];

function useRoster() {
  const trpc = useTRPC();
  return useQuery(trpc.roster.list.queryOptions());
}

// The invalidation every writer runs: the list, and the open editor's rate history.
function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.roster.pathFilter());
}

export function RosterScreen({ devSignIn }: { devSignIn: boolean }) {
  const list = useRoster();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title={strings.roster}
        action={
          list.isSuccess
            ? {
                label: strings.addPerson,
                open: adding,
                onToggle: () => setAdding((a) => !a),
              }
            : undefined
        }
      />
      {list.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure
          error={list.error}
          devSignIn={devSignIn}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          {adding && <InviteForm onDone={() => setAdding(false)} />}
          {list.data.length === 0 ? (
            <EmptyState text={strings.emptyRoster} />
          ) : (
            <RosterTable rows={list.data} />
          )}
        </>
      )}
    </>
  );
}

const statusOf = (row: Row) =>
  row.deactivatedAt !== null
    ? strings.deactivated
    : row.invited
      ? strings.invited
      : strings.active;

function InviteForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Roles>("worker");
  // A note reads under the field it is about.
  const [note, setNote] = useState<{ under: "phone" | "email"; text: string } | null>(
    null,
  );
  const invite = useMutation(
    trpc.roster.invite.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(
            answer.code === "phone_taken"
              ? { under: "phone", text: strings.phoneTaken }
              : { under: "email", text: strings.emailTaken },
          );
          return;
        }
        setPhone("");
        setEmail("");
        setName("");
        setRole("worker");
        setNote(null);
        await refresh();
        onDone();
      },
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    // An empty field is an address not given, never an empty address. One is needed, and a
    // number the server would refuse is said here, with no request made.
    const typedPhone = phone.trim();
    const typedEmail = email.trim();
    if (typedPhone === "" && typedEmail === "") {
      setNote({ under: "phone", text: strings.signInAddressNeeded });
      return;
    }
    if (typedPhone !== "" && !looksLikeSignInPhone(typedPhone)) {
      setNote({ under: "phone", text: strings.mobileNumberInvalid });
      return;
    }
    invite.mutate({
      ...(typedPhone !== "" && { phone: typedPhone }),
      ...(typedEmail !== "" && { email: typedEmail }),
      name,
      role,
    });
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.addPerson}
      className={controls.card}
      onSubmit={submit}
    >
      <div className={styles.inviteGrid}>
        <Field id="invite-phone" label={strings.mobileNumber}>
          <input
            id="invite-phone"
            autoFocus
            className={controls.input}
            type="tel"
            autoComplete="off"
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Note text={note?.under === "phone" ? note.text : null} />
        </Field>
        <Field id="invite-email" label={strings.email}>
          <input
            id="invite-email"
            className={controls.input}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Note text={note?.under === "email" ? note.text : null} />
        </Field>
        <Field id="invite-name" label={strings.name}>
          <input
            id="invite-name"
            className={controls.input}
            type="text"
            autoComplete="off"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="invite-role" label={strings.role}>
          <select
            id="invite-role"
            className={controls.select}
            value={role}
            onChange={(e) => setRole(e.target.value as Roles)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {strings.roles[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className={`secondary ${controls.caption}`}>{strings.inviteAddressHint}</p>
      {invite.isError && <Note text={strings.requestFailed} />}
      <button type="submit" className={controls.primary} disabled={invite.isPending}>
        {strings.addToRoster}
      </button>
    </form>
  );
}

function RosterTable({ rows }: { rows: Rows }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.name}</th>
          <th scope="col">{strings.signInAddress}</th>
          <th scope="col">{strings.role}</th>
          <th scope="col">{strings.status}</th>
          <th scope="col" className={table.number}>
            {strings.hourlyRate}
          </th>
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
                <td data-label={strings.name} className="body-strong">
                  {row.name}
                </td>
                <td data-label={strings.signInAddress}>
                  {row.signInPhone !== null && (
                    <span className={styles.address}>{signInPhone(row.signInPhone)}</span>
                  )}
                  {row.email !== null && (
                    <span className={styles.address}>{row.email}</span>
                  )}
                </td>
                <td data-label={strings.role}>{strings.roles[row.role]}</td>
                <td data-label={strings.status} className={table.status}>
                  {statusOf(row) === strings.invited ? (
                    <span className={`label ${table.pillPending}`}>
                      {strings.invited}
                    </span>
                  ) : (
                    statusOf(row)
                  )}
                </td>
                <td
                  data-label={strings.hourlyRate}
                  className={table.number}
                  data-empty={row.currentRate === null ? "" : undefined}
                >
                  {row.currentRate === null
                    ? strings.unpriced
                    : money(row.currentRate.hourlyRateCents, row.currentRate.currency)}
                </td>
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row.id)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={6}>
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
  return (
    <>
      <div className={styles.editorGrid}>
        <Role row={row} />
        <Rates row={row} />
      </div>
      <EditorFooter>
        <Access row={row} />
      </EditorFooter>
    </>
  );
}

// What a role or an access answer says: the last admin is refused, a no-op is "No change.".
const noteOf = (answer: { result: string }) =>
  answer.result === "rejected"
    ? strings.lastAdmin
    : answer.result === "unchanged"
      ? strings.unchanged
      : strings.saved;

function Role({ row }: { row: Row }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [role, setRole] = useState<Roles>(row.role);
  const [note, setNote] = useState<string | null>(null);
  const setRoleCall = useMutation(
    trpc.roster.setRole.mutationOptions({
      onSuccess: async (answer) => {
        setNote(noteOf(answer));
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const roleId = `role-${row.id}`;
  return (
    <EditorSection>
      <Field id={roleId} label={strings.role}>
        <select
          id={roleId}
          className={controls.select}
          value={role}
          onChange={(e) => setRole(e.target.value as Roles)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {strings.roles[r]}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        className={`${controls.secondary} ${table.stretch}`}
        disabled={setRoleCall.isPending}
        onClick={() => setRoleCall.mutate({ userId: row.id, role })}
      >
        {strings.saveRole}
      </button>
      <Note text={note} />
    </EditorSection>
  );
}

// Deactivation, last and alone in the editor's footer; reactivation in its place.
function Access({ row }: { row: Row }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [note, setNote] = useState<string | null>(null);
  const answered = async (answer: { result: string }) => {
    setNote(noteOf(answer));
    await refresh();
  };
  const failed = () => setNote(strings.requestFailed);
  const deactivate = useMutation(
    trpc.roster.deactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const reactivate = useMutation(
    trpc.roster.reactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const busy = deactivate.isPending || reactivate.isPending;
  return (
    <>
      {row.deactivatedAt === null ? (
        <DestructiveAction
          label={strings.deactivate}
          effect={strings.deactivatePersonEffect(row.name)}
          disabled={busy}
          onConfirm={() => deactivate.mutate({ userId: row.id })}
        />
      ) : (
        <button
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy}
          onClick={() => reactivate.mutate({ userId: row.id })}
        >
          {strings.reactivate}
        </button>
      )}
      <Note text={note} />
    </>
  );
}

function Rates({ row }: { row: Row }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const history = useQuery(trpc.roster.payRates.queryOptions({ userId: row.id }));
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const add = useMutation(
    trpc.roster.setPayRate.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(strings.rateExists);
          return;
        }
        setEffectiveFrom("");
        setAmount("");
        setNote(strings.saved);
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const hourlyRateCents = cents(amount);
    if (hourlyRateCents === null) {
      setNote(strings.badAmount);
      return;
    }
    setNote(null);
    add.mutate({ userId: row.id, effectiveFrom, hourlyRateCents });
  };
  const dateId = `rate-from-${row.id}`;
  const amountId = `rate-amount-${row.id}`;
  return (
    <EditorSection heading={strings.payRate}>
      <form onSubmit={submit}>
        <Field id={dateId} label={strings.effectiveFrom}>
          <input
            id={dateId}
            className={controls.input}
            type="date"
            required
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </Field>
        <Field id={amountId} label={strings.hourlyRate}>
          <input
            id={amountId}
            className={controls.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder="25.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Note text={note} />
        </Field>
        <button
          type="submit"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={add.isPending}
        >
          {strings.addRate}
        </button>
      </form>
      <h3 className="label">{strings.rateHistory}</h3>
      {history.isPending ? (
        <p className="secondary">{strings.loading}</p>
      ) : history.isError ? (
        <Note text={strings.requestFailed} />
      ) : history.data.length === 0 ? (
        <p className="secondary">{strings.noRates}</p>
      ) : (
        <ul className={styles.history}>
          {history.data.map((rate) => (
            <li key={rate.id}>
              <span>{day(rate.effectiveFrom)}</span>
              <span className={table.number}>
                {money(rate.hourlyRateCents, rate.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </EditorSection>
  );
}
