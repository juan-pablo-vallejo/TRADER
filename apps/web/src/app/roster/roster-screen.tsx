"use client";

// The roster screen (PRD, Target users: the admin's roster; DESIGN, Data table). The list is
// one query; every mutation invalidates it, so the table refetches and nothing is edited in
// the cache by hand. Each row is text plus one Edit toggle; the editor row beneath holds the
// role, the deactivation and the rates. A `rejected` answer reads beneath the form it came
// from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { cents, day, money } from "../format";
import { strings } from "../strings";
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
  return (
    <>
      <h1 className="title">{strings.roster}</h1>
      {list.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure error={list.error} devSignIn={devSignIn} />
      ) : (
        <>
          <InviteForm />
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

function InviteForm() {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Roles>("worker");
  const [note, setNote] = useState<string | null>(null);
  const invite = useMutation(
    trpc.roster.invite.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(strings.emailTaken);
          return;
        }
        setEmail("");
        setName("");
        setRole("worker");
        setNote(null);
        await refresh();
      },
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    invite.mutate({ email, name, role });
  };
  return (
    <form className={controls.card} onSubmit={submit}>
      <h2 className="heading">{strings.addPerson}</h2>
      <div className={styles.inviteGrid}>
        <div className={controls.field}>
          <label className="label" htmlFor="invite-email">
            {strings.email}
          </label>
          <input
            id="invite-email"
            className={controls.input}
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
        </div>
        <div className={controls.field}>
          <label className="label" htmlFor="invite-name">
            {strings.name}
          </label>
          <input
            id="invite-name"
            className={controls.input}
            type="text"
            autoComplete="off"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={controls.field}>
          <label className="label" htmlFor="invite-role">
            {strings.role}
          </label>
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
        </div>
      </div>
      {invite.isError && (
        <p className={`secondary ${controls.error}`}>{strings.requestFailed}</p>
      )}
      <button type="submit" className={controls.primary} disabled={invite.isPending}>
        {strings.addToRoster}
      </button>
    </form>
  );
}

function RosterTable({ rows }: { rows: Rows }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{strings.name}</th>
          <th scope="col">{strings.email}</th>
          <th scope="col">{strings.role}</th>
          <th scope="col">{strings.status}</th>
          <th scope="col" className={styles.number}>
            {strings.hourlyRate}
          </th>
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
              <td data-label={strings.email}>{row.email}</td>
              <td data-label={strings.role}>{strings.roles[row.role]}</td>
              <td data-label={strings.status} className={styles.status}>
                {statusOf(row)}
              </td>
              <td data-label={strings.hourlyRate} className={styles.number}>
                {row.currentRate === null
                  ? strings.unpriced
                  : money(row.currentRate.hourlyRateCents, row.currentRate.currency)}
              </td>
              <td className={styles.toggle}>
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
                className={styles.editor}
                id={`editor-${row.id}`}
              >
                <td colSpan={6}>
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
  return (
    <div className={styles.editorGrid}>
      <RoleAndState row={row} />
      <Rates row={row} />
    </div>
  );
}

function RoleAndState({ row }: { row: Row }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [role, setRole] = useState<Roles>(row.role);
  const [note, setNote] = useState<string | null>(null);
  const answered = async (answer: { result: string }) => {
    setNote(
      answer.result === "rejected"
        ? strings.lastAdmin
        : answer.result === "unchanged"
          ? strings.unchanged
          : null,
    );
    await refresh();
  };
  const failed = () => setNote(strings.requestFailed);
  const setRoleCall = useMutation(
    trpc.roster.setRole.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const deactivate = useMutation(
    trpc.roster.deactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const reactivate = useMutation(
    trpc.roster.reactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const busy = setRoleCall.isPending || deactivate.isPending || reactivate.isPending;
  const roleId = `role-${row.id}`;
  return (
    <div>
      <div className={controls.field}>
        <label className="label" htmlFor={roleId}>
          {strings.role}
        </label>
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
      </div>
      <div className={controls.actions}>
        <button
          type="button"
          className={controls.secondary}
          disabled={busy}
          onClick={() => setRoleCall.mutate({ userId: row.id, role })}
        >
          {strings.saveRole}
        </button>
        {row.deactivatedAt === null ? (
          <button
            type="button"
            className={controls.destructive}
            disabled={busy}
            onClick={() => deactivate.mutate({ userId: row.id })}
          >
            {strings.deactivate}
          </button>
        ) : (
          <button
            type="button"
            className={controls.secondary}
            disabled={busy}
            onClick={() => reactivate.mutate({ userId: row.id })}
          >
            {strings.reactivate}
          </button>
        )}
      </div>
      {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
    </div>
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
        setNote(null);
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
    <div>
      <form onSubmit={submit}>
        <div className={controls.field}>
          <label className="label" htmlFor={dateId}>
            {strings.effectiveFrom}
          </label>
          <input
            id={dateId}
            className={controls.input}
            type="date"
            required
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <div className={controls.field}>
          <label className="label" htmlFor={amountId}>
            {strings.hourlyRate}
          </label>
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
          {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
        </div>
        <button type="submit" className={controls.secondary} disabled={add.isPending}>
          {strings.addRate}
        </button>
      </form>
      <h3 className="label">{strings.rateHistory}</h3>
      {history.isPending ? (
        <p className="secondary">{strings.loading}</p>
      ) : history.isError ? (
        <p className={`secondary ${controls.error}`}>{strings.requestFailed}</p>
      ) : history.data.length === 0 ? (
        <p className="secondary">{strings.noRates}</p>
      ) : (
        <ul className={styles.history}>
          {history.data.map((rate) => (
            <li key={rate.id}>
              <span>{day(rate.effectiveFrom)}</span>
              <span className={styles.number}>
                {money(rate.hourlyRateCents, rate.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
