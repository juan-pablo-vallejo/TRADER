"use client";

// The People screen: the admin's people, on the shared table. The list is one query; every
// mutation invalidates it, so the table refetches and nothing is edited in the cache by
// hand. The page header's action opens the invite form. A row's name opens the person in
// the side panel, and which person is in the address: their role (making an admin asks
// first), whether their taps are stamped with a location, their numbers as links that
// dial, their week in Hours, the invitation and where it stands, and, last and alone,
// Deactivate. A `rejected` answer reads beneath the control it came from.
//
// The invitation goes two ways. By text, from the admin's own phone (invitation.ts):
// TRADER writes the words, sends nothing, and notes that the admin took them to send. By
// email, from TRADER (people.sendInvitation). Each is recorded, and People answers
// where the invitation stands: not sent, sent and not verified, or verified once the
// person has signed in.
//
// A worker's sign-in addresses are changed here, each asked about first: whoever has the
// new address can sign in as that person, and the person is signed out everywhere. An
// admin's are shown and not changed.
import { whatsAppLink } from "@trader/api/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { looksLikeSignInPhone, signInPhone } from "../../format";
import { Field } from "../../field";
import { Note } from "../../note";
import { DataTable, type Column } from "../../data-table";
import { DestructiveAction, EditorFooter, EditorSection } from "../../row-editor";
import { PageHeader, CREATE_FORM_ID } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import type { Catalog } from "../../i18n/en";
import { SidePanel } from "../../side-panel";
import { StatusBadge, type Tone } from "../../status-badge";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import { useAsked, useUrlFilters } from "../../use-url-filters";
import { uuidv7 } from "../../uuidv7";
import { invitationText } from "./invitation";
import styles from "./people.module.css";
import { WriteButton } from "../../write-button";

type Roles = keyof Catalog["roles"];
const ROLES = ["worker", "admin"] as const satisfies readonly Roles[];

type Rows = NonNullable<ReturnType<typeof usePeople>["data"]>;
type Row = Rows[number];

function usePeople() {
  const trpc = useTRPC();
  return useQuery(trpc.people.list.queryOptions());
}

// The invalidation every writer runs: the list.
function useRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.people.pathFilter());
}

// The person whose panel is open, in the address: a panel can be linked and reloaded.
const PERSON_FILTERS = { person: "" };

export function PeopleScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const list = usePeople();
  const [addingHere, setAdding] = useState(false);
  // The command menu's Invite a person asks for the same form by the address.
  const [asked, clearAsked] = useAsked("invite");
  const adding = addingHere || asked;
  // Who was just invited: the next thing to do is tell them where to get the app.
  const [invited, setInvited] = useState<string | null>(null);
  const [filters, setFilters] = useUrlFilters(PERSON_FILTERS);
  const opened = list.data?.find((row) => row.id === filters.person);
  const justInvited = list.data?.find((row) => row.id === invited);
  return (
    <>
      <PageHeader
        title={t.people}
        action={
          list.isSuccess
            ? {
                label: t.addPerson,
                open: adding,
                onToggle: () => {
                  setAdding(!adding);
                  clearAsked();
                },
              }
            : undefined
        }
      />
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
            <InviteForm
              onDone={(userId) => {
                setAdding(false);
                clearAsked();
                setInvited(userId);
              }}
            />
          )}
          {justInvited !== undefined && justInvited.invited && (
            <div className={controls.card} role="status">
              <p className="body-strong">{t.personPanel.invitedNote(justInvited.name)}</p>
              <Invitation row={justInvited} />
            </div>
          )}
          <PeopleTable
            rows={list.data}
            onOpen={(id) => setFilters({ person: id })}
            empty={t.emptyPeople}
          />
          {opened !== undefined && (
            <PersonPanel
              key={opened.id}
              row={opened}
              onClose={() => setFilters({ person: "" })}
            />
          )}
        </>
      )}
    </>
  );
}

// Where a person stands: deactivated, or where their invitation is.
const STANDING: Record<Row["invitation"]["status"], Tone> = {
  not_sent: "neutral",
  sent: "attention",
  verified: "done",
};
const statusOf = (t: Catalog, row: Row) =>
  row.deactivatedAt !== null ? t.deactivated : t.invitationStatus[row.invitation.status];

function Standing({ row }: { row: Row }) {
  const { t } = useStrings();
  return row.deactivatedAt !== null ? (
    <StatusBadge tone="neutral" label={t.deactivated} />
  ) : (
    <StatusBadge
      tone={STANDING[row.invitation.status]}
      label={t.invitationStatus[row.invitation.status]}
    />
  );
}

function InviteForm({ onDone }: { onDone: (userId: string) => void }) {
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
  // The invitation's id: the same invitation sent again keeps it, so a send whose
  // answer was lost is answered "invited" and not "taken"; anything changed is a new one.
  const minted = useRef<{ key: string; id: string } | null>(null);
  const invite = useMutation(trpc.people.invite.mutationOptions());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    // An empty field is an address not given, never an empty address. One of the two is
    // needed, and a number the server would refuse is said here, with no request made.
    const typedPhone = phone.trim();
    const typedEmail = email.trim();
    if (typedPhone === "" && typedEmail === "") {
      setNote({ under: "phone", text: t.addressNeeded });
      return;
    }
    if (typedPhone !== "" && !looksLikeSignInPhone(typedPhone)) {
      setNote({ under: "phone", text: t.mobileNumberInvalid });
      return;
    }
    const invitation = {
      ...(typedPhone !== "" && { phone: typedPhone }),
      ...(typedEmail !== "" && { email: typedEmail }),
      name,
      role,
    };
    const key = JSON.stringify(invitation);
    if (minted.current?.key !== key) minted.current = { key, id: uuidv7() };
    invite.mutate(
      { id: minted.current.id, ...invitation },
      {
        onSuccess: (answer) => {
          if (answer.result === "rejected") {
            // The id is held elsewhere: nothing was written, and the next send takes a new one.
            if (answer.code === "id_conflict") {
              minted.current = null;
              setNote({ under: "phone", text: t.requestFailed });
              return;
            }
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
          minted.current = null;
          void refresh().then(() => onDone(answer.user.id));
        },
      },
    );
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
      <WriteButton type="submit" className={controls.primary} pending={invite.isPending}>
        {t.invite}
      </WriteButton>
    </form>
  );
}

function PeopleTable({
  rows,
  onOpen,
  empty,
}: {
  rows: Rows;
  onOpen: (userId: string) => void;
  empty: string;
}) {
  const { t } = useStrings();
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t.name,
      cell: (row) => row.name,
      open: (row) => ({
        label: t.personPanel.open(row.name),
        onOpen: () => onOpen(row.id),
      }),
    },
    {
      key: "address",
      header: t.signInAddress,
      empty: (row) => row.signInPhone === null && row.email === null,
      cell: (row) => (
        <>
          {row.signInPhone !== null && (
            <span className={styles.address}>{signInPhone(row.signInPhone)}</span>
          )}
          {row.email !== null && <span className={styles.address}>{row.email}</span>}
        </>
      ),
    },
    { key: "role", header: t.role, cell: (row) => t.roles[row.role] },
    {
      key: "status",
      header: t.status,
      cell: (row) => <Standing row={row} />,
    },
  ];
  return (
    <DataTable
      caption={t.people}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={empty}
    />
  );
}

function PersonPanel({ row, onClose }: { row: Row; onClose: () => void }) {
  const { t } = useStrings();
  return (
    <SidePanel title={row.name} onClose={onClose} returnTo={row.id}>
      <p className={`secondary ${styles.line}`}>
        {t.roles[row.role]} · {statusOf(t, row)}
      </p>
      <Numbers row={row} />
      <p className={styles.line}>
        <Link href={`/hours?person=${row.id}`}>{t.personPanel.theirWeek}</Link>
      </p>
      <EditorSection heading={t.personPanel.invitation}>
        <p className={styles.standing}>
          <Standing row={row} />
        </p>
        {row.invited && row.deactivatedAt === null && (
          <>
            <p className="secondary">{t.personPanel.invitationExplain}</p>
            <Invitation row={row} />
          </>
        )}
        <Sends row={row} />
      </EditorSection>
      <Addresses row={row} />
      <Role row={row} />
      <Location row={row} />
      <EditorFooter>
        <Access row={row} />
      </EditorFooter>
    </SidePanel>
  );
}

// Their numbers as links that dial: the one they sign in with, and the contact phone they
// gave themselves when it is another.
function Numbers({ row }: { row: Row }) {
  const { t } = useStrings();
  const contact = row.phone !== null && row.phone !== row.signInPhone ? row.phone : null;
  return (
    <EditorSection heading={t.personPanel.numbers}>
      {row.signInPhone === null && contact === null ? (
        <p className="secondary">{t.personPanel.noNumber}</p>
      ) : (
        <ul className={styles.numbers}>
          {row.signInPhone !== null && (
            <li>
              <a
                href={whatsAppLink(row.signInPhone) ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                {t.personPanel.signInNumber(signInPhone(row.signInPhone))}
              </a>
            </li>
          )}
          {contact !== null && (
            <li>
              <a
                href={whatsAppLink(contact) ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                {t.personPanel.contactNumber(contact)}
              </a>
            </li>
          )}
        </ul>
      )}
      {row.email !== null && <p className="secondary">{row.email}</p>}
    </EditorSection>
  );
}

// The page's address does not change under it.
const unchanging = () => () => undefined;

// The invitation by WhatsApp or by email. By WhatsApp the admin sends the ready message from
// their own phone: Send by WhatsApp opens it, Copy takes the words. Each is noted with who
// and when, and the invitation stays Not sent until the admin presses I sent it: TRADER
// cannot see a message leave the admin's phone. By email TRADER sends the same words
// itself, and says how that went.
function Invitation({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const company = useQuery(trpc.company.get.queryOptions());
  const origin = useSyncExternalStore(
    unchanging,
    () => window.location.origin,
    () => null,
  );
  const [note, setNote] = useState<{ text: string; saved: boolean } | null>(null);
  // What the admin did with the words: noted, and the list says where that leaves it. A
  // copy or an opening that is not noted costs the record and nothing else, so it fails
  // quietly; "I sent it" is what makes the invitation sent, so its failure is said.
  const noted = useMutation(
    trpc.people.noteInvitation.mutationOptions({
      onSuccess: (answer, input) => {
        if (input.act === "sent" && answer.result === "rejected")
          setNote({ saved: false, text: t.personPanel.refused[answer.code] });
        return refresh();
      },
      onError: (_error, input) => {
        if (input.act === "sent") setNote({ saved: false, text: t.requestFailed });
      },
    }),
  );
  // An emailed send keeps its id until it is answered, so a retry is the same send.
  const [emailId, setEmailId] = useState(() => uuidv7());
  const emailed = useMutation(
    trpc.people.sendInvitation.mutationOptions({
      onSuccess: async (answer) => {
        setEmailId(uuidv7());
        const went =
          answer.result === "sent" ||
          (answer.result === "duplicate" && answer.outcome === "sent");
        setNote({
          saved: went,
          text: went
            ? t.personPanel.emailed(row.email ?? "")
            : answer.result === "failed"
              ? t.invoices.sendFailures[answer.failure]
              : answer.result === "rejected"
                ? t.personPanel.refused[answer.code]
                : t.invoices.sendFailed,
        });
        await refresh();
      },
      onError: () => setNote({ saved: false, text: t.requestFailed }),
    }),
  );
  if (origin === null || company.data === undefined) return null;
  const text =
    row.signInPhone === null
      ? null
      : invitationText({
          name: row.name,
          company: company.data.name,
          url: `${origin}/get`,
        });
  const did = (act: "copied" | "opened" | "sent") =>
    noted.mutate({ id: uuidv7(), userId: row.id, act });
  // The last WhatsApp note was a copy or an opening: say whether it went.
  const last = row.invitation.sends.find((send) => send.channel === "whatsapp");
  const asks =
    row.invitation.status === "not_sent" &&
    last !== undefined &&
    (last.outcome === "copied" || last.outcome === "opened");
  const link =
    row.signInPhone === null || text === null
      ? null
      : whatsAppLink(row.signInPhone, text);
  return (
    <>
      {text !== null && (
        <p className={`secondary ${styles.message}`} data-invitation>
          {text}
        </p>
      )}
      {row.email !== null && (
        <p className="secondary">{t.personPanel.emailGoesTo(row.email)}</p>
      )}
      <div className={controls.actions}>
        {link !== null && text !== null && (
          <>
            <a
              className={controls.primary}
              href={link}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                setNote({ saved: true, text: t.personPanel.opened });
                did("opened");
              }}
            >
              {t.personPanel.sendByWhatsApp}
            </a>
            <button
              type="button"
              className={controls.secondary}
              onClick={() =>
                void navigator.clipboard.writeText(text).then(
                  () => {
                    setNote({ saved: true, text: t.personPanel.copied });
                    did("copied");
                  },
                  () => setNote({ saved: false, text: t.requestFailed }),
                )
              }
            >
              {t.personPanel.copyInvitation}
            </button>
          </>
        )}
        {asks && (
          <WriteButton
            type="button"
            className={controls.secondary}
            pending={noted.isPending}
            onClick={() => {
              setNote(null);
              did("sent");
            }}
          >
            {t.personPanel.sentIt}
          </WriteButton>
        )}
        {row.email !== null && (
          <WriteButton
            type="button"
            className={controls.secondary}
            pending={emailed.isPending}
            onClick={() => {
              setNote(null);
              emailed.mutate({ id: emailId, userId: row.id });
            }}
          >
            {t.personPanel.sendByEmail}
          </WriteButton>
        )}
      </div>
      <Note text={note?.text ?? null} tone={note?.saved ? "saved" : undefined} />
    </>
  );
}

// When the office invited them, and each time the invitation went out, newest first.
function Sends({ row }: { row: Row }) {
  const { t, f } = useStrings();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const p = t.personPanel;
  const failures: Record<string, string | undefined> = t.invoices.sendFailures;
  return (
    <ul className={styles.sends}>
      {row.invitation.sends.map((send) => {
        const at = f.stamp(send.at, zone);
        return (
          <li key={send.id} className="secondary">
            {send.channel === "whatsapp"
              ? send.outcome === "copied"
                ? p.copiedBy(send.by, at)
                : send.outcome === "opened"
                  ? p.openedBy(send.by, at)
                  : p.byWhatsApp(send.by, at)
              : send.outcome === "sent"
                ? p.byEmail(send.by, at)
                : [p.emailNotSent(send.by, at), failures[send.failure ?? ""]]
                    .filter((part) => part !== undefined)
                    .join(". ")}
          </li>
        );
      })}
      <li className="secondary">{p.invitedOn(f.dayOf(row.invitedAt))}</li>
    </ul>
  );
}

// The addresses a person signs in with. A worker's are changed here, one at a time; an
// admin's are the owner's to change; a deactivated person's are left as they are.
function Addresses({ row }: { row: Row }) {
  const { t } = useStrings();
  const p = t.personPanel;
  return (
    <EditorSection heading={p.addresses}>
      {row.role === "admin" ? (
        <p className="secondary">{p.adminAddresses}</p>
      ) : (
        row.deactivatedAt === null && (
          <>
            <p className="secondary">{p.addressesExplain}</p>
            <Address row={row} kind="email" />
            <Address row={row} kind="sign_in_phone" />
          </>
        )
      )}
      <AddressChanges row={row} />
    </EditorSection>
  );
}

type AddressKind = "email" | "sign_in_phone";

// One address: the field, and the change, which asks first and says who will be able to
// sign in. An empty field takes the address away. Saving what is already there is allowed:
// it is how a change that stopped half-way at the provider is finished.
function Address({ row, kind }: { row: Row; kind: AddressKind }) {
  const { t } = useStrings();
  const p = t.personPanel;
  const trpc = useTRPC();
  const refresh = useRefresh();
  const shown = (value: string | null) =>
    value === null ? "" : kind === "email" ? value : signInPhone(value);
  const current = kind === "email" ? row.email : row.signInPhone;
  const [typed, setTyped] = useState(shown(current));
  const [note, setNote] = useState<{ text: string; saved: boolean } | null>(null);
  type Answer =
    | { result: "changed" | "unchanged" | "matched"; user: Row }
    | { result: "rejected"; code: keyof typeof p.addressRefused };
  const answered = async (answer: Answer) => {
    if (answer.result === "rejected") {
      setNote({ saved: false, text: p.addressRefused[answer.code] });
      return;
    }
    setTyped(shown(kind === "email" ? answer.user.email : answer.user.signInPhone));
    setNote({
      saved: true,
      text:
        answer.result === "changed"
          ? p.addressChanged
          : answer.result === "matched"
            ? p.addressMatched
            : t.unchanged,
    });
    await refresh();
  };
  // An address the server would not read is said under the field; anything else failed.
  const failed = (error: { data?: { code?: string } | null }) =>
    setNote({
      saved: false,
      text:
        error.data?.code === "BAD_REQUEST"
          ? kind === "email"
            ? p.emailInvalid
            : t.mobileNumberInvalid
          : t.requestFailed,
    });
  const setEmail = useMutation(
    trpc.people.setEmail.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const setNumber = useMutation(
    trpc.people.setSignInPhone.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const value = typed.trim() === "" ? null : typed.trim();
  const save = () => {
    setNote(null);
    if (kind === "email") setEmail.mutate({ userId: row.id, email: value });
    else setNumber.mutate({ userId: row.id, phone: value });
  };
  const id = `address-${kind}-${row.id}`;
  return (
    <div className={styles.addressField}>
      <Field id={id} label={kind === "email" ? t.email : p.signInNumberField}>
        <input
          id={id}
          className={controls.input}
          type={kind === "email" ? "email" : "tel"}
          autoComplete="off"
          maxLength={kind === "email" ? 254 : 32}
          value={typed}
          onChange={(e) => {
            setNote(null);
            setTyped(e.target.value);
          }}
        />
      </Field>
      <DestructiveAction
        label={kind === "email" ? p.changeEmail : p.changeNumber}
        effect={
          value === null
            ? p.removeEffect(row.name, shown(current))
            : p.changeEffect(row.name, value)
        }
        disabled={setEmail.isPending || setNumber.isPending}
        onConfirm={save}
      />
      <Note text={note?.text ?? null} tone={note?.saved ? "saved" : undefined} />
    </div>
  );
}

// Each time the office changed one of their addresses, newest first.
function AddressChanges({ row }: { row: Row }) {
  const { t, f } = useStrings();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (row.addressChanges.length === 0) return null;
  return (
    <ul className={styles.sends}>
      {row.addressChanges.map((change) => {
        const words = t.personPanel.addressWas[change.field];
        const at = f.stamp(change.at, zone);
        const shown = (value: string) =>
          change.field === "email" ? value : signInPhone(value);
        return (
          <li key={change.id} className="secondary">
            {change.from === null
              ? words.given(shown(change.to ?? ""), change.by, at)
              : change.to === null
                ? words.removed(shown(change.from), change.by, at)
                : words.changed(shown(change.from), shown(change.to), change.by, at)}
          </li>
        );
      })}
    </ul>
  );
}

// What a role or an access answer says: the last admin is refused, a no-op is "No change.".
const noteOf = (t: Catalog, answer: { result: string }) =>
  answer.result === "rejected"
    ? t.lastAdmin
    : answer.result === "unchanged"
      ? t.unchanged
      : t.saved;

// The role: the other one is offered. Making an admin says what that gives before it does
// it; making a worker of an admin is refused by the server for the last one.
function Role({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [note, setNote] = useState<string | null>(null);
  // The signed-in admin's own row: their own role is not changed from here, so nobody
  // takes away their own office by a press.
  const me = useQuery(trpc.me.get.queryOptions());
  const own = me.data?.id === row.id;
  const setRoleCall = useMutation(
    trpc.people.setRole.mutationOptions({
      onSuccess: async (answer) => {
        setNote(noteOf(t, answer));
        await refresh();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const other: Roles = ROLES.find((r) => r !== row.role) ?? "worker";
  return (
    <EditorSection heading={t.role}>
      <p className="body">{t.roles[row.role]}</p>
      {other === "admin" ? (
        <DestructiveAction
          label={t.personPanel.makeAdmin}
          effect={t.personPanel.makeAdminEffect(row.name)}
          disabled={setRoleCall.isPending || row.deactivatedAt !== null}
          onConfirm={() => setRoleCall.mutate({ userId: row.id, role: "admin" })}
        />
      ) : own ? (
        <p className="secondary">{t.personPanel.ownRole}</p>
      ) : (
        // It takes the office away: asked first, as making an admin is.
        <DestructiveAction
          label={t.personPanel.makeWorker}
          effect={t.personPanel.makeWorkerEffect(row.name)}
          disabled={setRoleCall.isPending}
          onConfirm={() => setRoleCall.mutate({ userId: row.id, role: "worker" })}
        />
      )}
      <Note text={note} />
    </EditorSection>
  );
}

const LOCATION = ["company", "on", "off"] as const;
type LocationChoice = (typeof LOCATION)[number];
const choiceOf = (stamps: boolean | null): LocationChoice =>
  stamps === null ? "company" : stamps ? "on" : "off";

// Whether this person's taps are stamped with a location: as the company, on, or off.
function Location({ row }: { row: Row }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const refresh = useRefresh();
  const [choice, setChoice] = useState<LocationChoice>(choiceOf(row.locationStamps));
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.people.setLocationStamps.mutationOptions({
      onSuccess: async (answer) => {
        setNote(answer.result === "unchanged" ? t.unchanged : t.saved);
        await refresh();
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const id = `location-${row.id}`;
  return (
    <EditorSection heading={t.personPanel.location}>
      <p className="secondary">{t.personPanel.locationExplain}</p>
      <Field id={id} label={t.personPanel.location}>
        <select
          id={id}
          className={controls.select}
          value={choice}
          onChange={(e) => {
            setNote(null);
            setChoice(e.target.value as LocationChoice);
          }}
        >
          {LOCATION.map((c) => (
            <option key={c} value={c}>
              {t.personPanel.locationAs[c]}
            </option>
          ))}
        </select>
      </Field>
      <WriteButton
        type="button"
        className={controls.secondary}
        pending={save.isPending}
        onClick={() =>
          save.mutate({
            userId: row.id,
            locationStamps: choice === "company" ? null : choice === "on",
          })
        }
      >
        {t.personPanel.saveLocation}
      </WriteButton>
      <Note text={note} />
    </EditorSection>
  );
}

// Deactivation, last and alone in the panel's footer; reactivation in its place.
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
    trpc.people.deactivate.mutationOptions({ onSuccess: answered, onError: failed }),
  );
  const reactivate = useMutation(
    trpc.people.reactivate.mutationOptions({ onSuccess: answered, onError: failed }),
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
        <WriteButton
          type="button"
          className={`${controls.secondary} ${table.stretch}`}
          pending={busy}
          onClick={() => reactivate.mutate({ userId: row.id })}
        >
          {t.reactivate}
        </WriteButton>
      )}
      <Note text={note} />
    </>
  );
}
