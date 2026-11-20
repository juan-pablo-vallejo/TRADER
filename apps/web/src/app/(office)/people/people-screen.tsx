"use client";

// The People screen: the admin's roster. The list is
// one query; every mutation invalidates it, so the table refetches and nothing is edited in
// the cache by hand. The page header's action opens the invite form. Each row is text plus one
// Edit toggle; the editor row beneath holds the role and, last, the deactivation. A
// `rejected` answer reads beneath the form it came from. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { EmptyState, Failure } from "../../failure";
import { looksLikeSignInPhone, signInPhone } from "../../format";
import { Field } from "../../field";
import { Note } from "../../note";
import {
  DestructiveAction,
  EditorFooter,
  EditorRow,
  EditorSection,
  RowToggle,
} from "../../row-editor";
import { PageHeader, CREATE_FORM_ID } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import type { Catalog } from "../../i18n/en";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import styles from "./people.module.css";

type Roles = keyof Catalog["roles"];
const ROLES = ["worker", "admin"] as const satisfies readonly Roles[];

type Rows = NonNullable<ReturnType<typeof useRoster>["data"]>;
type Row = Rows[number];

function useRoster() {
  const trpc = useTRPC();
  return useQuery(trpc.roster.list.queryOptions());
}

// The invalidation every writer runs: the list.
function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.roster.pathFilter());
}

export function PeopleScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const list = useRoster();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title={t.roster}
        action={
          list.isSuccess
            ? {
                label: t.addPerson,
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
          {adding && <InviteForm onDone={() => setAdding(false)} />}
          {list.data.length === 0 ? (
            <EmptyState text={t.emptyRoster} />
          ) : (
            <RosterTable rows={list.data} />
          )}
        </>
      )}
    </>
  );
}

const statusOf = (t: Catalog, row: Row) =>
  row.deactivatedAt !== null ? t.deactivated : row.invited ? t.invited : t.active;

function InviteForm({ onDone }: { onDone: () => void }) {
  const { t } = useStrings();
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
            answer.code === "company_closed"
              ? { under: "phone", text: t.companyClosed }
              : answer.code === "phone_taken"
                ? { under: "phone", text: t.phoneTaken }
                : { under: "email", text: t.emailTaken },
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
    // An empty email is an address not given, never an empty address. The number is needed
    // of everyone, and one the server would refuse is said here, with no request made.
    const typedPhone = phone.trim();
    const typedEmail = email.trim();
    if (typedPhone === "") {
      setNote({ under: "phone", text: t.mobileNumberNeeded });
      return;
    }
    if (!looksLikeSignInPhone(typedPhone)) {
      setNote({ under: "phone", text: t.mobileNumberInvalid });
      return;
    }
    invite.mutate({
      phone: typedPhone,
      ...(typedEmail !== "" && { email: typedEmail }),
      name,
      role,
    });
  };
  return (
    <form
      id={CREATE_FORM_ID}
      aria-label={t.addPerson}
      className={controls.card}
      onSubmit={submit}
    >
      <div className={styles.inviteGrid}>
        <Field id="invite-phone" label={t.mobileNumber}>
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
        <Field id="invite-email" label={t.email}>
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
        <Field id="invite-name" label={t.name}>
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
        <Field id="invite-role" label={t.role}>
          <select
            id="invite-role"
            className={controls.select}
            value={role}
            onChange={(e) => setRole(e.target.value as Roles)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className={`secondary ${controls.caption}`}>{t.inviteAddressHint}</p>
      {invite.isError && <Note text={t.requestFailed} />}
      <button type="submit" className={controls.primary} disabled={invite.isPending}>
        {t.addToRoster}
      </button>
    </form>
  );
}

function RosterTable({ rows }: { rows: Rows }) {
  const { t } = useStrings();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">{t.name}</th>
          <th scope="col">{t.signInAddress}</th>
          <th scope="col">{t.role}</th>
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
                <td data-label={t.signInAddress}>
                  {row.signInPhone !== null && (
                    <span className={styles.address}>{signInPhone(row.signInPhone)}</span>
                  )}
                  {row.email !== null && (
                    <span className={styles.address}>{row.email}</span>
                  )}
                </td>
                <td data-label={t.role}>{t.roles[row.role]}</td>
                <td data-label={t.status} className={table.status}>
                  {statusOf(t, row) === t.invited ? (
                    <span className={`label ${table.pillPending}`}>{t.invited}</span>
                  ) : (
                    statusOf(t, row)
                  )}
                </td>
                <RowToggle
                  rowId={row.id}
                  open={open}
                  onToggle={() => setEditing(open ? null : row.id)}
                />
              </tr>
              {open ? (
                <EditorRow key={`${row.id}-editor`} rowId={row.id} colSpan={5}>
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
      </div>
      <EditorFooter>
        <Access row={row} />
      </EditorFooter>
    </>
  );
}

// What a role or an access answer says: the last admin is refused, a no-op is "No change.".
const noteOf = (t: Catalog, answer: { result: string }) =>
  answer.result === "rejected"
    ? t.lastAdmin
    : answer.result === "unchanged"
      ? t.unchanged
      : t.saved;

function Role({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [role, setRole] = useState<Roles>(row.role);
  const [note, setNote] = useState<string | null>(null);
  const setRoleCall = useMutation(
    trpc.roster.setRole.mutationOptions({
      onSuccess: async (answer) => {
        setNote(noteOf(t, answer));
        await refresh();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const roleId = `role-${row.id}`;
  return (
    <EditorSection>
      <Field id={roleId} label={t.role}>
        <select
          id={roleId}
          className={controls.select}
          value={role}
          onChange={(e) => setRole(e.target.value as Roles)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
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
        {t.saveRole}
      </button>
      <Note text={note} />
    </EditorSection>
  );
}

// Deactivation, last and alone in the editor's footer; reactivation in its place.
function Access({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [note, setNote] = useState<string | null>(null);
  const answered = async (answer: { result: string }) => {
    setNote(noteOf(t, answer));
    await refresh();
  };
  const failed = () => setNote(t.requestFailed);
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
          label={t.deactivate}
          effect={t.deactivatePersonEffect(row.name)}
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
          {t.reactivate}
        </button>
      )}
      <Note text={note} />
    </>
  );
}
