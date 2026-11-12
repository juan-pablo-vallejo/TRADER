"use client";

// One job's page (PRD, Office review and job cost: job cost to date is approved labor at the
// rate in force on each work date plus priced materials, shown per job with what is still
// pending or unpriced beside it, never folded in; DESIGN, Job cost). Read-only. Every hour
// and amount here is a field of `job.cost`'s answer, formatted and never added, rounded or
// multiplied in the browser: the total, its labor and material parts, the lines, and each
// figure that stands beside the total (cost-view.ts). Amounts in two currencies are listed
// one under the other, never summed.
//
// Two queries: `job.cost`, and the jobs list for the job's customer and crew. Consumed by
// page.tsx.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import controls from "../../controls.module.css";
import { codeOf, EmptyState, Failure } from "../../failure";
import { hours, money, weekDay } from "../../format";
import { PageHeader } from "../../page-header";
import { strings } from "../../strings";
import table from "../../table.module.css";
import { useTRPC } from "../../trpc";
import { apartFrom, nothingRecorded, type Apart, type JobCost } from "./cost-view";
import styles from "./job-detail.module.css";

type Amounts = JobCost["total"];

// Amounts by currency, each whole: "$120.00" or "$120.00 and €40.00". Listed, never added.
const amounts = (totals: Amounts) =>
  totals.map((t) => money(t.cents, t.currency)).join(" and ");

function sentence(line: Apart): string {
  switch (line.kind) {
    case "unrated":
      return strings.apartUnrated(hours(line.hundredths), line.lines);
    case "pendingLabor":
      return (
        strings.apartPendingLabor(hours(line.hundredths), line.sessions) +
        (line.totals.length > 0 ? strings.apartWouldAdd(amounts(line.totals)) : "") +
        (line.unratedHundredths > 0
          ? strings.apartPendingUnrated(hours(line.unratedHundredths))
          : "")
      );
    case "rejectedSessions":
      return strings.apartRejectedSessions(line.count);
    case "openSessions":
      return strings.apartOpenSessions(line.count);
    case "unpricedReceipts":
      return strings.apartUnpricedReceipts(line.count);
    case "pendingReceipts":
      return (
        strings.apartPendingReceipts(line.receipts) +
        (line.totals.length > 0 ? strings.apartPendingPriced(amounts(line.totals)) : "") +
        (line.unpriced > 0 ? strings.apartPendingUnpriced(line.unpriced) : "")
      );
    case "rejectedReceipts":
      return strings.apartRejectedReceipts(line.count);
    case "voidedReceipts":
      return strings.apartVoidedReceipts(line.count);
  }
}

export function JobDetailScreen({
  jobId,
  devSignIn,
}: {
  jobId: string;
  devSignIn: boolean;
}) {
  const trpc = useTRPC();
  const cost = useQuery(trpc.job.cost.queryOptions({ jobId }));
  const jobs = useQuery(trpc.job.list.queryOptions());
  const failed = [cost, jobs].find((q) => q.isError);
  return (
    <>
      <Link href="/jobs" className={styles.back}>
        {strings.backToJobs}
      </Link>
      <PageHeader title={cost.data?.job.name ?? strings.job} />
      {cost.isPending || jobs.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : failed !== undefined ? (
        // An id the server will not read as one names no job: say so, as the 404 screen does.
        codeOf(failed.error) === "BAD_REQUEST" ? (
          <EmptyState text={strings.noSuchJob} />
        ) : (
          <Failure
            error={failed.error}
            devSignIn={devSignIn}
            onRetry={() => void failed.refetch()}
          />
        )
      ) : (
        <JobCostView cost={cost.data!} job={jobs.data!.find((j) => j.id === jobId)} />
      )}
    </>
  );
}

function JobCostView({
  cost,
  job,
}: {
  cost: JobCost;
  // The job as the list has it: its customer and crew. Absent only if the two reads met
  // different moments; the cost is shown either way.
  job: { customer: { name: string }; crew: { name: string } | null } | undefined;
}) {
  const apart = apartFrom(cost);
  const { labor, materials } = cost;
  return (
    <>
      <p className={`secondary ${styles.line}`}>
        {[
          job?.customer.name,
          job === undefined ? null : (job.crew?.name ?? strings.unassigned),
          strings.jobStatus[cost.job.status],
          strings.closeoutZone(cost.timezone),
        ]
          .filter((part) => part !== null && part !== undefined)
          .join(" · ")}
      </p>
      {nothingRecorded(cost) ? (
        <EmptyState text={strings.emptyJobCost} />
      ) : (
        <>
          <section className={styles.section} aria-labelledby="job-cost">
            <h2 id="job-cost" className="heading">
              {strings.jobCostToDate}
            </h2>
            <p className={`secondary ${styles.explain}`}>{strings.jobCostExplain}</p>
            <div className={controls.card}>
              {cost.total.length === 0 ? (
                <p className={`body ${styles.total}`}>{strings.noCostYet}</p>
              ) : (
                cost.total.map((t) => (
                  <p key={t.currency} className={`title ${styles.total}`}>
                    {money(t.cents, t.currency)}
                  </p>
                ))
              )}
              <dl className={`secondary ${styles.parts}`}>
                <dt>{strings.costLabor(hours(labor.approvedHundredths))}</dt>
                <dd>
                  {labor.totals.length === 0 ? strings.noAmount : amounts(labor.totals)}
                </dd>
                <dt>{strings.costMaterials(materials.receipts)}</dt>
                <dd>
                  {materials.totals.length === 0
                    ? strings.noAmount
                    : amounts(materials.totals)}
                </dd>
              </dl>
            </div>
          </section>
          {apart.length > 0 && (
            <section className={styles.section} aria-labelledby="job-apart">
              <h2 id="job-apart" className="heading">
                {strings.notInTotal}
              </h2>
              <ul className={`body ${styles.apart}`}>
                {apart.map((line) => (
                  <li key={line.kind}>{sentence(line)}</li>
                ))}
              </ul>
            </section>
          )}
          {labor.lines.length > 0 && (
            <section className={styles.section} aria-labelledby="job-labor">
              <h2 id="job-labor" className="heading">
                {strings.laborByDay}
              </h2>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">{strings.date}</th>
                    <th scope="col">{strings.person}</th>
                    <th scope="col" className={table.number}>
                      {strings.hours}
                    </th>
                    <th scope="col" className={table.number}>
                      {strings.rate}
                    </th>
                    <th scope="col" className={table.number}>
                      {strings.cost}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {labor.lines.map((line) => (
                    <tr key={`${line.workDate}-${line.worker.id}`}>
                      <td data-label={strings.date} className="body-strong">
                        {weekDay(line.workDate)}
                      </td>
                      <td data-label={strings.person}>{line.worker.name}</td>
                      <td data-label={strings.hours} className={table.number}>
                        {hours(line.hundredths)}
                      </td>
                      {line.rate === null || line.cents === null ? (
                        <>
                          {/* The pill says it whole, so the narrow row adds no label. */}
                          <td data-label="" className={table.number}>
                            <span className={table.pillPending}>{strings.noRate}</span>
                          </td>
                          <td
                            data-label={strings.cost}
                            data-empty=""
                            className={table.number}
                          >
                            {strings.noAmount}
                          </td>
                        </>
                      ) : (
                        <>
                          <td data-label={strings.rate} className={table.number}>
                            {strings.ratePerHour(
                              money(line.rate.hourlyRateCents, line.rate.currency),
                            )}
                          </td>
                          <td data-label={strings.cost} className={table.number}>
                            {money(line.cents, line.rate.currency)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </>
  );
}
