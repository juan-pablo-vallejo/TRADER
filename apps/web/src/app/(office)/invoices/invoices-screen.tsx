"use client";

// The invoice list, on the shared table: number, customer, job, the day issued, the day
// due, the balance and the status as a badge (contract/invoice-status.ts names it; the
// server answers it). Drafts, Outstanding, Overdue and Paid are presets in the address.
// Above it one line of three figures, the server's. Issued ones by number, newest first,
// each number a link to the invoice. The header's action starts a
// draft for a jobsite — its customer is the jobsite's — under an id minted here, so a start
// sent again is the same draft, and opens it.
import { OUTSTANDING, type InvoiceStatus } from "@trader/api/contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { uuidv7 } from "../../uuidv7";
import controls from "../../controls.module.css";
import { DataTable, type Column } from "../../data-table";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { Field } from "../../field";
import { Note } from "../../note";
import { CREATE_FORM_ID, PageHeader } from "../../page-header";
import { LoadingRows } from "../../loading-rows";
import { useStrings } from "../../i18n";
import { StatusBadge, type Tone } from "../../status-badge";
import { useTRPC } from "../../trpc";
import { useAsked, useUrlFilters } from "../../use-url-filters";
import styles from "./invoices.module.css";
import { WriteButton } from "../../write-button";

function NewDraft({ jobs }: { jobs: { id: string; name: string }[] }) {
  const { t } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const router = useRouter();
  const [id] = useState(() => uuidv7());
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.invoice.create.mutationOptions({
      onSuccess: (answer) => {
        if (answer.result === "rejected") setNote(t.requestFailed);
        else router.push(`/invoices/${id}`);
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    create.mutate({ id, jobId, currency: "USD" });
  };
  return (
    <form
      id={CREATE_FORM_ID}
      className={controls.card}
      onSubmit={submit}
      aria-label={s.newDraft}
    >
      <Field id="invoice-job" label={s.job}>
        <select
          id="invoice-job"
          className={controls.select}
          required
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        >
          <option value="" />
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      <div className={controls.actions}>
        <WriteButton
          type="submit"
          className={controls.primary}
          pending={create.isPending}
        >
          {s.start}
        </WriteButton>
      </div>
      <Note text={note} />
    </form>
  );
}

type Rows = NonNullable<ReturnType<typeof useInvoices>["data"]>["items"];
type Row = Rows[number];

function useInvoices() {
  const trpc = useTRPC();
  return useQuery(trpc.invoice.list.queryOptions());
}

// Which invoices are shown, in the address.
const INVOICE_FILTERS = { show: "all" };
const PRESETS = ["all", "drafts", "outstanding", "overdue", "paid"] as const;
type Preset = (typeof PRESETS)[number];

const shows = (preset: Preset, row: Row): boolean =>
  preset === "all"
    ? true
    : preset === "drafts"
      ? row.status === "draft"
      : preset === "outstanding"
        ? OUTSTANDING.includes(row.status)
        : row.status === preset;

export const STATUS_TONES: Record<InvoiceStatus, Tone> = {
  draft: "attention",
  issued: "active",
  partly_paid: "active",
  paid: "done",
  overdue: "problem",
  void: "neutral",
};

// Three figures above the list, each the server's (`invoice.totals`): what is outstanding,
// the overdue part of it, and what was paid this month. A currency is never added to
// another, so each figure is one amount per currency.
function Figures() {
  const { t, f } = useStrings();
  const s = t.invoices.figures;
  const trpc = useTRPC();
  const totals = useQuery(trpc.invoice.totals.queryOptions());
  if (!totals.isSuccess) return null;
  const said = (rows: { currency: string; cents: number }[]) =>
    rows.map((r) => f.money(r.cents, r.currency)).join(" + ");
  const { outstanding, overdue, paidThisMonth } = totals.data;
  const parts = [
    outstanding.length > 0 ? s.outstanding(said(outstanding)) : null,
    overdue.length > 0 ? s.overdue(said(overdue)) : null,
    paidThisMonth.length > 0 ? s.paidThisMonth(said(paidThisMonth)) : null,
  ].filter((part) => part !== null);
  return (
    <p className={`body-strong ${styles.figures}`} data-figures>
      {parts.length === 0 ? s.nothing : parts.join(" · ")}
    </p>
  );
}

export function InvoicesScreen({ signInHref }: { signInHref: string }) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const list = useInvoices();
  const jobs = useQuery(trpc.job.list.queryOptions());
  const [addingHere, setAdding] = useState(false);
  // The command menu's New invoice asks for the same form by the address.
  const [asked, clearAsked] = useAsked("invoice");
  const adding = addingHere || asked;
  const [filters, setFilters] = useUrlFilters(INVOICE_FILTERS);
  const preset: Preset = (PRESETS as readonly string[]).includes(filters.show)
    ? (filters.show as Preset)
    : "all";
  const ready = list.data !== undefined && jobs.data !== undefined;
  const failed = blocking([list, jobs]);
  const columns: Column<Row>[] = [
    {
      key: "number",
      header: s.number,
      cell: (i) => (
        <Link href={`/invoices/${i.id}`}>
          {i.number === null ? s.states.draft : s.invoiceNo(i.number)}
        </Link>
      ),
    },
    { key: "customer", header: s.customer, cell: (i) => i.customer.name },
    {
      key: "job",
      header: s.job,
      cell: (i) => <Link href={`/jobs/${i.job.id}`}>{i.job.name}</Link>,
    },
    {
      key: "issued",
      header: s.issuedOn,
      // As a number: stacked on a phone, a day is then read with its column's name.
      number: true,
      empty: (i) => i.issuedAt === null,
      cell: (i) => (i.issuedAt === null ? "" : f.dayOf(i.issuedAt)),
    },
    {
      key: "due",
      header: s.due,
      number: true,
      empty: (i) => i.dueOn === null,
      cell: (i) => (i.dueOn === null ? "" : f.day(i.dueOn)),
    },
    {
      key: "balance",
      header: s.balance,
      number: true,
      // A draft and a void invoice owe nothing: what a draft would come to is its total.
      cell: (i) => f.money(i.state === "draft" ? i.totalCents : i.owedCents, i.currency),
    },
    {
      key: "status",
      header: s.statusHeader,
      cell: (i) => (
        <StatusBadge tone={STATUS_TONES[i.status]} label={s.status[i.status]} />
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={s.title}
        action={
          ready
            ? {
                label: s.newDraft,
                open: adding,
                onToggle: () => {
                  setAdding(!adding);
                  clearAsked();
                },
              }
            : undefined
        }
      />
      <RefreshFailed reads={[list, jobs]} />
      {list.isPending || jobs.isPending ? (
        <LoadingRows />
      ) : failed !== undefined || !ready ? (
        <Failure
          error={failed?.error}
          signInHref={signInHref}
          onRetry={() => void failed?.refetch()}
        />
      ) : (
        <>
          <p className={`secondary ${styles.explain}`}>{s.explain}</p>
          {adding && <NewDraft jobs={jobs.data} />}
          <Figures />
          <div className={styles.presets} role="group" aria-label={t.show}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={controls.secondary}
                aria-pressed={preset === p}
                onClick={() => setFilters({ show: p })}
              >
                {s.presets[p]}
              </button>
            ))}
          </div>
          {list.data.truncated && <Note text={s.truncated(list.data.items.length)} />}
          <DataTable
            caption={s.title}
            columns={columns}
            rows={list.data.items.filter((row) => shows(preset, row))}
            rowKey={(i) => i.id}
            empty={list.data.items.length === 0 ? s.none : s.noneHere}
          />
        </>
      )}
    </>
  );
}
