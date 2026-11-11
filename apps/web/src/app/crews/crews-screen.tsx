"use client";

// The crews screen (PRD, Jobs and location: a crew has a foreman; DESIGN, Data table). The
// list is one query, the roster another (for the foreman and member selects); every mutation
// invalidates the crews. The page header's action opens the create form. Each row is text plus
// one Edit toggle; the editor row beneath holds the name, the foreman, the members and, last,
// the deactivation. A deactivated crew takes no foreman
// change or new member: those controls are disabled with the reason. A `rejected` answer reads
// beneath the control it came from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { EmptyState, Failure } from "../failure";
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
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title={strings.crews}
        action={
          list.isSuccess && people.isSuccess
            ? {
                label: strings.addCrew,
                open: adding,
                onToggle: () => setAdding((a) => !a),
              }
            : undefined
        }
      />
      {list.isPending || people.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : list.isError ? (
        <Failure
          error={list.error}
          devSignIn={devSignIn}
          onRetry={() => void list.refetch()}
        />
      ) : people.isError ? (
        <Failure
          error={people.error}
          devSignIn={devSignIn}
          onRetry={() => void people.refetch()}
        />
      ) : (
        <>
          {adding && <CreateForm people={people.data} onDone={() => setAdding(false)} />}
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
    <Field id={id} label={label}>
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
    </Field>
  );
}

function CreateForm({ people, onDone }: { people: People; onDone: () => void }) {
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
        onDone();
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
    <form
      id={CREATE_FORM_ID}
      aria-label={strings.addCrew}
      className={controls.card}
      onSubmit={submit}
    >
      <div className={styles.formGrid}>
        <Field id="new-crew-name" label={strings.name}>
          <input
            id="new-crew-name"
            autoFocus
            className={controls.input}
            type="text"
            autoComplete="off"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <PersonSelect
          id="new-crew-foreman"
          label={strings.foreman}
          options={activeForemen(people)}
          value={foremanUserId}
          onChange={setForeman}
          placeholder={strings.chooseForeman}
        />
      </div>
      <Note text={note} />
      <button
        type="submit"
        className={controls.primary}
        disabled={create.isPending || foremanUserId === ""}
      >
        {strings.addCrew}
      </button>
      {foremanUserId === "" && (
        <p className={`secondary ${controls.caption}`}>{strings.chooseForemanFirst}</p>
      )}
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
                <td data-label={strings.crew} className="body-strong">
                  {row.name}
                </td>
                <td data-label={strings.foreman}>
                  {row.foreman.available ? (
                    row.foreman.name
                  ) : (
                    <span className={`label ${table.pillAttention}`}>
                      {strings.needsForeman}
                    </span>
                  )}
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
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row.id)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={6}>
                  <Editor row={row} people={people} />
                </EditorRow>
              ) : null}
            </Fragment>
          );
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
  const [foremanNote, setForemanNote] = useState<string | null>(null);
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
  // One answer shape for the foreman change and the two state writers; each writes the note
  // beneath its own control.
  const noteOf = (answer: { result: string; code?: string; jobCount?: number }) =>
    answer.result === "rejected"
      ? answer.code === "jobs_assigned"
        ? strings.jobsAssigned(answer.jobCount ?? 0)
        : reason(answer.code ?? "")
      : answer.result === "unchanged"
        ? strings.unchanged
        : strings.saved;
  const answering =
    (set: (note: string | null) => void) =>
    async (answer: { result: string; code?: string; jobCount?: number }) => {
      set(noteOf(answer));
      await refresh();
    };
  const changeForeman = useMutation(
    trpc.crew.setForeman.mutationOptions({
      onSuccess: answering(setForemanNote),
      onError: () => setForemanNote(strings.requestFailed),
    }),
  );
  const state = {
    onSuccess: answering(setStateNote),
    onError: () => setStateNote(strings.requestFailed),
  };
  const deactivate = useMutation(trpc.crew.deactivate.mutationOptions(state));
  const reactivate = useMutation(trpc.crew.reactivate.mutationOptions(state));
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
      <EditorSection>
        <form onSubmit={submit}>
          <Field id={nameId} label={strings.name}>
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
          </Field>
          <button
            type="submit"
            className={`${controls.secondary} ${table.stretch}`}
            disabled={busy}
          >
            {strings.save}
          </button>
          <Note text={note} />
        </form>
      </EditorSection>
      <EditorSection>
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
        <button
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          disabled={busy || inactive || foremanUserId === ""}
          onClick={() => changeForeman.mutate({ crewId: row.id, userId: foremanUserId })}
        >
          {strings.changeForeman}
        </button>
        <Note text={foremanNote} />
      </EditorSection>
      <EditorFooter>
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
          <DestructiveAction
            label={strings.deactivateCrew}
            effect={strings.deactivateCrewEffect}
            disabled={busy}
            onConfirm={() => deactivate.mutate({ crewId: row.id })}
          />
        )}
        <Note text={stateNote} />
      </EditorFooter>
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
          : strings.saved,
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
    <EditorSection heading={strings.members}>
      <ul className={styles.members}>
        {row.members.map((m) => {
          const isForeman = m.id === row.foreman.id;
          return (
            <li key={m.id}>
              <span>
                {m.name}
                <span className={`secondary ${styles.caption}`}>
                  {" · "}
                  {isForeman ? strings.leadsCrew : strings.roles[m.role]}
                  {m.deactivatedAt !== null && ` · ${strings.deactivated}`}
                </span>
              </span>
              {/* The foreman leaves by a foreman change, so their row offers no removal. */}
              {!isForeman && (
                <DestructiveAction
                  quiet
                  label={strings.remove}
                  effect={strings.removeMemberEffect(m.name)}
                  disabled={busy}
                  onConfirm={() => remove.mutate({ crewId: row.id, userId: m.id })}
                />
              )}
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
      <Note text={note} />
    </EditorSection>
  );
}
