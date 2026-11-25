"use client";

// Today, where the office opens. Three bands in a fixed order, rows and counts, no charts.
//
// Needs attention: sessions left open from an earlier day, each with Fix, which opens that
// day's panel in Hours; and people late for a shift, each with Call. Ten rows at most,
// then how many more. Only a thing with an action is here, and nothing to show is a good
// state that says so in one line.
//
// On the clock now: who, where, since when. Then who is expected, and who is done.
//
// Money: what customers owe, how many drafts wait, how many complete jobs have no invoice.
// Each links to its list.
//
// It reads `overview.today` (api overview/today.ts) and names a person's status with the
// function the phone's Crew tab uses (today-view.ts). Every figure is the server's. It is
// read again each minute while the page is open.
import { minuteIn } from "@trader/api/contract";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { PasskeyBand } from "../../clerk-passkeys";
import controls from "../../controls.module.css";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { useStrings } from "../../i18n";
import { LoadingRows } from "../../loading-rows";
import { PageHeader } from "../../page-header";
import { useClerkOn } from "../../providers";
import { StatusBadge } from "../../status-badge";
import { useTRPC } from "../../trpc";
import {
  attention,
  ATTENTION_ROWS,
  bands,
  fixHref,
  nextShift,
  type Person,
  type Today,
} from "./today-view";
import styles from "./today.module.css";

const REFRESH_MS = 60_000;

export function TodayScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const clerkOn = useClerkOn();
  const read = useQuery(
    trpc.overview.today.queryOptions(undefined, { refetchInterval: REFRESH_MS }),
  );
  // The minute moves a person from expected to late without a new answer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <PageHeader title={t.todayScreen.title} />
      {clerkOn && <PasskeyBand />}
      {read.isPending ? (
        <LoadingRows />
      ) : blocking([read]) !== undefined || read.data === undefined ? (
        <Failure
          error={read.error}
          signInHref={signInHref}
          onRetry={() => void read.refetch()}
        />
      ) : (
        <>
          <RefreshFailed reads={[read]} />
          <Shown today={read.data} now={now} />
        </>
      )}
    </>
  );
}

function Shown({ today, now }: { today: Today; now: number }) {
  const { t, f } = useStrings();
  const s = t.todayScreen;
  const zone = today.timezone;
  const minute = minuteIn(new Date(now), zone);
  const jobName = new Map(today.jobs.map((j) => [j.id, j.name]));
  const job = (id: string) => jobName.get(id) ?? "";
  // A sentence that names a job, with the name a link to the job's page. The catalog's
  // sentence is kept whole, in either language: the name is found in it and only it links.
  const withJob = (sentence: string, id: string) => {
    const name = job(id);
    const at = name === "" ? -1 : sentence.indexOf(name);
    if (at < 0) return sentence;
    return (
      <>
        {sentence.slice(0, at)}
        <Link href={`/jobs/${id}`}>{name}</Link>
        {sentence.slice(at + name.length)}
      </>
    );
  };
  const rows = attention(today, minute);
  const shown = rows.slice(0, ATTENTION_ROWS);
  const more = rows.length - shown.length;
  const { working, expected, done } = bands(today, minute);
  const dial = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

  const person = (p: Person, line: ReactNode) => (
    <li key={p.person.id}>
      <span className="body-strong">{p.person.name}</span>
      <span className="secondary">{line}</span>
    </li>
  );

  return (
    <>
      <p className={`secondary ${styles.asOf}`}>
        {f.weekDay(today.today)} · {s.asOf(f.clock(today.asOf, zone))}
      </p>

      <section className={styles.band} aria-labelledby="today-attention">
        <h2 id="today-attention" className="heading">
          {s.attention}
        </h2>
        {rows.length === 0 ? (
          <p className={`body ${styles.clear}`} data-clear>
            <StatusBadge tone="done" label={s.attentionClear} />
          </p>
        ) : (
          <ul className={styles.rows}>
            {shown.map((row) =>
              row.kind === "open" ? (
                <li key={row.key} data-kind="open">
                  <StatusBadge tone="problem" label={t.stillOpen} />
                  <span className={`body ${styles.grow}`}>
                    {withJob(
                      s.stillOpen(
                        row.person.name,
                        job(row.jobId),
                        f.weekDay(row.sinceDay),
                      ),
                      row.jobId,
                    )}
                  </span>
                  <Link
                    className={controls.secondary}
                    href={fixHref(row)}
                    aria-label={s.fixOf(row.person.name)}
                  >
                    {s.fix}
                  </Link>
                </li>
              ) : (
                <li key={row.key} data-kind="late">
                  <StatusBadge tone="attention" label={t.crewStatus.late} />
                  <span className={`body ${styles.grow}`}>
                    {withJob(
                      s.late(row.person.name, job(row.jobId), f.wall(row.start)),
                      row.jobId,
                    )}
                  </span>
                  {row.person.phone === null ? (
                    <span className="secondary">{s.noNumber}</span>
                  ) : (
                    <a
                      className={controls.secondary}
                      href={dial(row.person.phone)}
                      aria-label={s.callOf(row.person.name)}
                    >
                      {s.call}
                    </a>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
        {more > 0 && (
          <p className={styles.more}>
            <Link
              href={
                rows.slice(ATTENTION_ROWS).some((r) => r.kind === "open")
                  ? "/hours"
                  : "/schedule"
              }
            >
              {s.more(more)}
            </Link>
          </p>
        )}
      </section>

      <section className={styles.band} aria-labelledby="today-clock">
        <h2 id="today-clock" className="heading">
          {s.onTheClock} <span className={styles.count}>{working.length}</span>
        </h2>
        {working.length === 0 ? (
          <p className="secondary">{s.nobodyWorking}</p>
        ) : (
          <ul className={styles.people}>
            {working.map((p) =>
              p.clock.status === "off" ? null : (
                <li key={p.person.id} data-kind={p.clock.status}>
                  <span className="body-strong">{p.person.name}</span>
                  <span className="secondary">
                    {withJob(
                      (p.clock.status === "paused" ? s.onBreakAt : s.at)(
                        job(p.clock.jobId),
                        p.clock.sinceDay === today.today
                          ? f.clock(p.clock.since, zone)
                          : f.stamp(p.clock.since, zone),
                      ),
                      p.clock.jobId,
                    )}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
        {expected.length > 0 && (
          <>
            <h3 className="body-strong">
              {s.expected} <span className={styles.count}>{expected.length}</span>
            </h3>
            <ul className={styles.people}>
              {expected.map((p) => {
                const shift = nextShift(p);
                return person(
                  p,
                  shift === null
                    ? ""
                    : withJob(
                        s.expectedAt(job(shift.jobId), f.wall(shift.start)),
                        shift.jobId,
                      ),
                );
              })}
            </ul>
          </>
        )}
        {done.length > 0 && (
          <>
            <h3 className="body-strong">
              {s.done} <span className={styles.count}>{done.length}</span>
            </h3>
            <ul className={styles.people}>
              {done.map((p) => person(p, s.worked(f.duration(p.workedMs))))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.band} aria-labelledby="today-money">
        <h2 id="today-money" className="heading">
          {s.money}
        </h2>
        <ul className={styles.money}>
          {today.money.owed.length === 0 ? (
            <li data-kind="owed">
              <span className="body">{s.nothingOwed}</span>
              <Link href="/invoices">{s.toInvoices}</Link>
            </li>
          ) : (
            today.money.owed.map((o) => (
              <li key={o.currency} data-kind="owed">
                <span className="body">
                  <strong>{s.owed(f.money(o.cents, o.currency))}</strong>{" "}
                  {s.owedInvoices(o.invoices)}
                </span>
                <Link href="/invoices?show=outstanding">{s.toInvoices}</Link>
              </li>
            ))
          )}
          {today.money.overdue.map((o) => (
            <li key={`overdue-${o.currency}`} data-kind="overdue">
              <span className="body">
                <StatusBadge
                  tone="problem"
                  label={s.overdue(f.money(o.cents, o.currency))}
                />{" "}
                {s.owedInvoices(o.invoices)}
              </span>
              <Link href="/invoices?show=overdue">{s.toInvoices}</Link>
            </li>
          ))}
          <li data-kind="drafts">
            <span className="body">{s.drafts(today.money.drafts)}</span>
            <Link href="/invoices?show=drafts">{s.toInvoices}</Link>
          </li>
          <li data-kind="not-invoiced">
            <span className="body">
              {s.notInvoiced(today.money.completeJobsNotInvoiced)}
            </span>
            {/* Complete jobs: the ones counted here are among them. */}
            <Link href="/jobs?status=complete">{s.toJobs}</Link>
          </li>
        </ul>
      </section>
    </>
  );
}
