"use client";

// The crews screen (PRD, Jobs and location: a crew has a foreman; DESIGN, Data table). The
// list is one query, the roster another (for the foreman and member selects); every mutation
// invalidates the crews. Each row is text plus one Edit toggle; the editor row beneath holds
// the name, the foreman, the members and the deactivation. A deactivated crew takes no foreman
// change or new member: those controls are disabled with the reason. A `rejected` answer reads
// beneath the control it came from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./crews.module.css";

type Rows = NonNullable<ReturnType<typeof useCrews>["data"]>;
type Row = Rows[number];
type People = NonNullable<ReturnType<typeof useRoster>["data"]>;

function useCrews() {
  const trpc = useTRPC();
  return useQuery(trpc.crew.list.queryOptions());
}

// Active people for the selects; the roster is the admin's to read.
function useRoster() {
  const trpc = useTRPC();
  return useQuery(trpc.roster.list.queryOptions());
}

function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.crew.pathFilter());
}

const activeForemen = (people: People) =>
  people.filter((p) => p.deactivatedAt === null && p.role === "foreman");

// What a `rejected` answer says, by its code.
const reason = (code: string) =>
  code === "user_inactive"
    ? strings.userInactive
    : code === "not_a_foreman"
      ? strings.notAForeman
      : code === "crew_inactive"
        ? strings.reactivateCrewFirst
        : code === "is_foreman"
          ? strings.changeForemanFirst
          : strings.requestFailed;

export function CrewsScreen({ devSignIn }: { devSignIn: boolean }) {
  const list = useCrews();
  const people = useRoster();
  return (
    <>
      <h1 className="title">{strings.crews}</h1>
      {list.isPending || people.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure error={list.error} devSignIn={devSignIn} />
      ) : people.isError ? (
        <Failure error={people.error} devSignIn={devSignIn} />
      ) : (
        <>
          <CreateForm people={people.data} />
          {list.data.length === 0 ? (
            <EmptyState text={strings.emptyCrews} />
          ) : (
            <CrewsTable rows={list.data} people={people.data} />
          )}
        </>
      )}
    </>
  );
}

function PersonSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <div className={controls.field}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={controls.select}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function CreateForm({ people }: { people: People }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [foremanUserId, setForeman] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.crew.create.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(reason(answer.code));
          return;
        }
        setName("");
        setForeman("");
        setNote(null);
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    create.mutate({ name, foremanUserId });
  };
  return (
    <form className={controls.card} onSubmit={submit}>
      <h2 className="heading">{strings.addCrew}</h2>
      <div className={styles.formGrid}>
        <div className={controls.field}>
          <label className="label" htmlFor="new-crew-name">
            {strings.name}
          </label>
          <input
            id="new-crew-name"
            className={controls.input}
            type="text"
            autoComplete="off"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <PersonSelect
          id="new-crew-foreman"
          label={strings.foreman}
          options={activeForemen(people)}
          value={foremanUserId}
          onChange={setForeman}
          placeholder={strings.chooseForeman}
        />
      </div>
      {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
      <button
        type="submit"
        className={controls.primary}
        disabled={create.isPending || foremanUserId === ""}
      >
        {strings.addCrew}
      </button>
    </form>
  );
}

function CrewsTable({ rows, people }: { rows: Rows; people: People }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{strings.crew}</th>
          <th scope="col">{strings.foreman}</th>
          <th scope="col" className={table.number}>
            {strings.members}
          </th>
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
              <td data-label={strings.crew} className="body-strong">
                {row.name}
              </td>
              <td
                data-label={strings.foreman}
                className={row.foreman.available ? undefined : table.attention}
              >
                {row.foreman.available ? row.foreman.name : strings.needsForeman}
              </td>
              <td data-label={strings.members} className={table.number}>
                {row.members.length}
              </td>
              <td data-label={strings.jobs} className={table.number}>
                {row.jobCount}
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
                <td colSpan={6}>
                  <Editor row={row} people={people} />
                </td>
              </tr>
            ) : null,
          ];
        })}
      </tbody>
    </table>
  );
}

function Editor({ row, people }: { row: Row; people: People }) {
  return (
    <div className={styles.editorGrid}>
      <NameAndForeman row={row} people={people} />
      <Members row={row} people={people} />
    </div>
  );
}

function NameAndForeman({ row, people }: { row: Row; people: People }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [name, setName] = useState(row.name);
  const [foremanUserId, setForeman] = useState(row.foreman.id);
  const [note, setNote] = useState<string | null>(null);
  const [stateNote, setStateNote] = useState<string | null>(null);
  const inactive = row.deactivatedAt !== null;
  const rename = useMutation(
    trpc.crew.update.mutationOptions({
      onSuccess: async () => {
        setNote(strings.saved);
        await refresh();
      },
      onError: () => setNote(strings.requestFailed),
    }),
  );
  const answered = async (answer: {
    result: string;
    code?: string;
    jobCount?: number;
  }) => {
    setStateNote(
      answer.result === "rejected"
        ? answer.code === "jobs_assigned"
          ? strings.jobsAssigned(answer.jobCount ?? 0)
          : reason(answer.code ?? "")
        : answer.result === "unchanged"
          ? strings.unchanged
          : null,
    );
    await refresh();
  };
  const failed = () => setStateNote(strings.requestFailed);
  const changeForeman = useMutation(
    trpc.crew.setForeman.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const deactivate = useMutation(
    trpc.crew.deactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const reactivate = useMutation(
    trpc.crew.reactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const busy =
    rename.isPending ||
    changeForeman.isPending ||
    deactivate.isPending ||
    reactivate.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    rename.mutate({ crewId: row.id, name });
  };
  const nameId = `crew-name-${row.id}`;
  return (
    <div>
      <form onSubmit={submit}>
        <div className={controls.field}>
          <label className="label" htmlFor={nameId}>
            {strings.name}
          </label>
          <input
            id={nameId}
            className={controls.input}
            type="text"
            autoComplete="off"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {note !== null && (
            <p className={`secondary ${note === strings.saved ? "" : controls.error}`}>
              {note}
            </p>
          )}
        </div>
        <button
          type="submit"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy}
        >
          {strings.save}
        </button>
      </form>
      <PersonSelect
        id={`crew-foreman-${row.id}`}
        label={strings.foreman}
        options={activeForemen(people)}
        value={foremanUserId}
        onChange={setForeman}
        disabled={inactive}
        placeholder={strings.chooseForeman}
      />
      {inactive && (
        <p className={`secondary ${controls.caption}`}>{strings.reactivateCrewFirst}</p>
      )}
      <div className={controls.actions}>
        <button
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy || inactive || foremanUserId === ""}
          onClick={() => changeForeman.mutate({ crewId: row.id, userId: foremanUserId })}
        >
          {strings.changeForeman}
        </button>
        {inactive ? (
          <button
            type="button"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
            onClick={() => reactivate.mutate({ crewId: row.id })}
          >
            {strings.reactivate}
          </button>
        ) : (
          <button
            type="button"
            className={controls.destructive}
            disabled={busy}
            onClick={() => deactivate.mutate({ crewId: row.id })}
          >
            {strings.deactivateCrew}
          </button>
        )}
      </div>
      {stateNote !== null && <p className={`secondary ${controls.error}`}>{stateNote}</p>}
    </div>
  );
}

function Members({ row, people }: { row: Row; people: People }) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const inactive = row.deactivatedAt !== null;
  const answered = async (answer: { result: string; code?: string }) => {
    setNote(
      answer.result === "rejected"
        ? reason(answer.code ?? "")
        : answer.result === "unchanged"
          ? strings.unchanged
          : null,
    );
    if (answer.result === "added") setUserId("");
    await refresh();
  };
  const failed = () => setNote(strings.requestFailed);
  const add = useMutation(
    trpc.crew.addMember.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const remove = useMutation(
    trpc.crew.removeMember.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const busy = add.isPending || remove.isPending;
  const memberIds = new Set(row.members.map((m) => m.id));
  const candidates = people.filter(
    (p) => p.deactivatedAt === null && !memberIds.has(p.id),
  );
  return (
    <div>
      <h3 className="label">{strings.members}</h3>
      <ul className={styles.members}>
        {row.members.map((m) => {
          const isForeman = m.id === row.foreman.id;
          return (
            <li key={m.id}>
              <span>
                {m.name}
                <span className={`secondary ${styles.caption}`}>
                  {" · "}
                  {strings.roles[m.role]}
                  {m.deactivatedAt !== null && ` · ${strings.deactivated}`}
                  {isForeman && ` · ${strings.changeForemanFirst}`}
                </span>
              </span>
              <button
                type="button"
                className={controls.destructive}
                disabled={busy || isForeman}
                onClick={() => remove.mutate({ crewId: row.id, userId: m.id })}
              >
                {strings.remove}
              </button>
            </li>
          );
        })}
      </ul>
      <PersonSelect
        id={`crew-member-${row.id}`}
        label={strings.addMember}
        options={candidates}
        value={userId}
        onChange={setUserId}
        disabled={inactive}
        placeholder={strings.choosePerson}
      />
      {inactive && (
        <p className={`secondary ${controls.caption}`}>{strings.reactivateCrewFirst}</p>
      )}
      <button
        type="button"
        className={`${controls.secondary} ${table.stretch}`}
        disabled={busy || inactive || userId === ""}
        onClick={() => add.mutate({ crewId: row.id, userId })}
      >
        {strings.addMember}
      </button>
      {note !== null && <p className={`secondary ${controls.error}`}>{note}</p>}
    </div>
  );
}
