"use client";

// The job page: one page that says where a job stands, from `job.read` in one call.
//
// A row of four steps, each derived by the server and never stored: Scheduled, Hours
// recorded, Invoiced, Paid. The first step not reached carries the page's one main
// action, where there is one for the office to take: Schedule, or Create invoice. Hours
// are the crew's to record and a payment is noted on the invoice itself.
//
// Then the people of the job (scheduled this week, on it now, their hours on it, a link
// that dials, a link to their week in Hours), the job's invoices with their state, and
// the details: customer, address, notes, location, status, with the way to edit them.
// Every figure is the server's. Consumed by page.tsx.
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import controls from "../../../controls.module.css";
import { DataTable, type Column } from "../../../data-table";
import { EmptyState, Failure, codeOf } from "../../../failure";
import { hours } from "../../../format";
import { useStrings } from "../../../i18n";
import { LoadingRows } from "../../../loading-rows";
import { Note } from "../../../note";
import { StatusBadge, type Tone } from "../../../status-badge";
import { useTRPC } from "../../../trpc";
import { uuidv7 } from "../../../uuidv7";
import { locationText } from "../location";
import { STATUS_TONES } from "../../invoices/invoices-screen";
import styles from "./job.module.css";
import { WriteButton } from "../../../write-button";

const STEPS = ["scheduled", "hoursRecorded", "invoiced", "paid"] as const;
type Step = (typeof STEPS)[number];
const JOB_TONES: Record<"open" | "complete" | "archived", Tone> = {
  open: "active",
  complete: "done",
  archived: "neutral",
};

export function JobScreen({ jobId, signInHref }: { jobId: string; signInHref: string }) {
  const { t, f } = useStrings();
  const s = t.jobPage;
  const trpc = useTRPC();
  const router = useRouter();
  const read = useQuery(trpc.job.read.queryOptions({ jobId }));
  const [note, setNote] = useState<string | null>(null);
  // The draft's id, kept while the page is open: a press sent again is the same draft.
  const [draftId] = useState(uuidv7);
  const draft = useMutation(
    trpc.invoice.create.mutationOptions({
      onSuccess: (answer) =>
        answer.result === "rejected"
          ? setNote(t.requestFailed)
          : router.push(`/invoices/${draftId}`),
      onError: () => setNote(t.requestFailed),
    }),
  );
  const back = (
    <p className={styles.back}>
      <Link href="/jobs">{s.back}</Link>
    </p>
  );
  if (read.isPending) {
    return (
      <>
        {back}
        <LoadingRows />
      </>
    );
  }
  if (read.isError) {
    return (
      <>
        {back}
        {codeOf(read.error) === "FORBIDDEN" ? (
          <EmptyState text={s.gone} />
        ) : (
          <Failure
            error={read.error}
            signInHref={signInHref}
            onRetry={() => void read.refetch()}
          />
        )}
      </>
    );
  }
  const page = read.data;
  const job = page.job;
  const first = STEPS.find((step) => !page.steps[step]) ?? null;
  type Person = (typeof page.people)[number];
  type Invoice = (typeof page.invoices)[number];
  const dial = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

  const people: Column<Person>[] = [
    { key: "name", header: t.name, cell: (p) => p.person.name },
    {
      key: "state",
      header: t.status,
      empty: (p) => !p.onItNow && !p.scheduledThisWeek,
      cell: (p) => (
        <span className={styles.badges}>
          {p.onItNow && <StatusBadge tone="active" label={s.onItNow} />}
          {p.scheduledThisWeek && (
            <StatusBadge tone="neutral" label={s.scheduledThisWeek} />
          )}
        </span>
      ),
    },
    {
      key: "week",
      header: t.jobForm.hoursWeek,
      number: true,
      cell: (p) => hours(p.hours.week),
    },
    {
      key: "toDate",
      header: t.jobForm.hoursToDate,
      number: true,
      cell: (p) => hours(p.hours.toDate),
    },
    {
      key: "call",
      header: t.todayScreen.call,
      empty: (p) => p.person.phone === null,
      cell: (p) =>
        p.person.phone === null ? (
          ""
        ) : (
          <a href={dial(p.person.phone)} aria-label={t.todayScreen.callOf(p.person.name)}>
            {p.person.phone}
          </a>
        ),
    },
    {
      key: "week-link",
      header: t.nav.hours,
      cell: (p) => (
        <Link href={`/hours?person=${p.person.id}`}>{t.personPanel.theirWeek}</Link>
      ),
    },
  ];
  const invoices: Column<Invoice>[] = [
    {
      key: "number",
      header: t.invoices.number,
      cell: (i) => (
        <Link href={`/invoices/${i.id}`}>
          {i.number === null ? t.invoices.states.draft : t.invoices.invoiceNo(i.number)}
        </Link>
      ),
    },
    {
      key: "state",
      header: t.invoices.statusHeader,
      cell: (i) => (
        <StatusBadge tone={STATUS_TONES[i.status]} label={t.invoices.status[i.status]} />
      ),
    },
    {
      key: "total",
      header: t.invoices.total,
      number: true,
      cell: (i) => f.money(i.totalCents, i.currency),
    },
    {
      key: "owed",
      header: t.invoices.owed,
      number: true,
      empty: (i) => i.state !== "issued",
      cell: (i) => (i.state === "issued" ? f.money(i.owedCents, i.currency) : ""),
    },
  ];

  return (
    <>
      {back}
      <div className={styles.head}>
        <h1 className="title">{job.name}</h1>
        <StatusBadge tone={JOB_TONES[job.status]} label={t.jobStatus[job.status]} />
      </div>
      <p className={`secondary ${styles.line}`}>{job.customer.name}</p>

      <section aria-labelledby="job-steps" className={styles.part}>
        <h2 id="job-steps" className="visually-hidden">
          {s.steps}
        </h2>
        <ol className={styles.steps}>
          {STEPS.map((step: Step) => (
            <li
              key={step}
              data-step={step}
              data-reached={page.steps[step] ? "yes" : "no"}
            >
              <StatusBadge
                tone={page.steps[step] ? "done" : "neutral"}
                label={page.steps[step] ? s.step[step] : s.notYet(s.step[step])}
              />
            </li>
          ))}
        </ol>
        {first === "scheduled" && (
          <p className={styles.action}>
            <Link className={controls.primary} href="/schedule">
              {s.schedule}
            </Link>
          </p>
        )}
        {first === "invoiced" && (
          <p className={styles.action}>
            <WriteButton
              type="button"
              className={controls.primary}
              pending={draft.isPending}
              onClick={() => {
                setNote(null);
                draft.mutate({ id: draftId, jobId: job.id, currency: "USD" });
              }}
            >
              {s.createInvoice}
            </WriteButton>
          </p>
        )}
        {first === "hoursRecorded" && <p className="secondary">{s.waitingForHours}</p>}
        {first === "paid" && <p className="secondary">{s.waitingForPayment}</p>}
        <Note text={note} />
      </section>

      <section aria-labelledby="job-people" className={styles.part}>
        <h2 id="job-people" className="heading">
          {s.people}
        </h2>
        <p className={`secondary ${styles.line}`}>
          {s.hoursLine(hours(page.hours.week), hours(page.hours.toDate))}
        </p>
        <DataTable
          caption={s.people}
          columns={people}
          rows={page.people}
          rowKey={(p) => p.person.id}
          empty={s.noPeople}
        />
      </section>

      <section aria-labelledby="job-invoices" className={styles.part}>
        <h2 id="job-invoices" className="heading">
          {t.invoices.title}
        </h2>
        <DataTable
          caption={t.invoices.title}
          columns={invoices}
          rows={page.invoices}
          rowKey={(i) => i.id}
          empty={s.noInvoices}
        />
      </section>

      <section aria-labelledby="job-details" className={styles.part}>
        <h2 id="job-details" className="heading">
          {t.details}
        </h2>
        <dl className={styles.details}>
          <dt>{t.customer}</dt>
          <dd>{job.customer.name}</dd>
          <dt>{t.address}</dt>
          <dd>{job.address ?? s.none}</dd>
          <dt>{t.jobForm.notes}</dt>
          <dd className={styles.notes}>{job.notes ?? s.none}</dd>
          <dt>{s.location}</dt>
          <dd>
            {job.location === null
              ? s.none
              : s.locationIs(locationText(job.location), job.location.radiusM)}
          </dd>
          <dt>{t.status}</dt>
          <dd>{t.jobStatus[job.status]}</dd>
        </dl>
        <p className={styles.action}>
          <Link className={controls.secondary} href={`/jobs?status=all&job=${job.id}`}>
            {s.edit}
          </Link>
        </p>
      </section>
    </>
  );
}
