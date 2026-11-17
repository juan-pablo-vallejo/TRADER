"use client";

// The invoice list (DESIGN, Data table; PRD, Invoicing and exports): every invoice, issued
// ones by number, newest first, each row a link to the invoice. The header's action starts a
// draft for a jobsite — its customer is the jobsite's — under an id minted here, so a start
// sent again is the same draft, and opens it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { uuidv7 } from "../uuidv7";
import controls from "../controls.module.css";
import { Failure } from "../failure";
import { Field } from "../field";
import { money } from "../format";
import { Note } from "../note";
import { CREATE_FORM_ID, PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./invoices.module.css";

const s = strings.invoices;

function NewDraft({ jobs }: { jobs: { id: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [id] = useState(() => uuidv7());
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation(
    trpc.invoice.create.mutationOptions({
      onSuccess: (answer) => {
        if (answer.result === "rejected") setNote(strings.requestFailed);
        else router.push(`/invoices/${id}`);
      },
      onError: () => setNote(strings.requestFailed),
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
        <button type="submit" className={controls.primary} disabled={create.isPending}>
          {s.start}
        </button>
      </div>
      <Note text={note} />
    </form>
  );
}

// The plain list of issued invoices (DESIGN, Invoice CSV): its own named button, what the
// file holds beneath it. Asked for when pressed and saved as it came.
function InvoicesFile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    setNote(null);
    setSaved(false);
    try {
      const file = await queryClient.fetchQuery(
        trpc.invoice.exportCsv.queryOptions(undefined, { staleTime: 0, gcTime: 0 }),
      );
      const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setSaved(true);
      setNote(s.csvSaved(file.filename));
    } catch {
      setNote(strings.requestFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={controls.secondary}
        disabled={busy}
        onClick={() => void save()}
      >
        {s.csv}
      </button>
      <p className={`secondary ${styles.explain}`}>{s.csvExplain}</p>
      <Note text={note} tone={saved ? "saved" : undefined} />
    </div>
  );
}

export function InvoicesScreen({ signInHref }: { signInHref: string }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.invoice.list.queryOptions());
  const jobs = useQuery(trpc.job.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const ready = list.isSuccess && jobs.isSuccess;
  const failed = [list, jobs].find((q) => q.isError);
  return (
    <>
      <PageHeader
        title={s.title}
        action={
          ready
            ? { label: s.newDraft, open: adding, onToggle: () => setAdding((a) => !a) }
            : undefined
        }
      />
      {list.isPending || jobs.isPending ? (
        <p className="body">{strings.loading}</p>
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
          {list.data.length === 0 ? (
            <p className={`body ${controls.empty}`}>{s.none}</p>
          ) : (
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">{s.number}</th>
                  <th scope="col">{s.customer}</th>
                  <th scope="col">{s.job}</th>
                  <th scope="col">{s.state}</th>
                  <th scope="col" className={table.number}>
                    {s.total}
                  </th>
                  <th scope="col" className={table.number}>
                    {s.owed}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((i) => (
                  <tr key={i.id}>
                    <td className={table.rowLink}>
                      <Link href={`/invoices/${i.id}`}>
                        {i.number === null ? s.states.draft : s.invoiceNo(i.number)}
                      </Link>
                    </td>
                    <td>{i.customer.name}</td>
                    <td>{i.job.name}</td>
                    <td className={table.status}>{s.states[i.state]}</td>
                    <td className={table.number}>{money(i.totalCents, i.currency)}</td>
                    <td className={table.number}>
                      {i.state === "issued" ? money(i.owedCents, i.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.data.some((i) => i.number !== null) && <InvoicesFile />}
        </>
      )}
    </>
  );
}
