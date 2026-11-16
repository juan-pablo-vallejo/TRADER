"use client";

// The developer console (DESIGN, Developer console; PRD, Office review and job cost):
// read-only, for an admin. How the deployment stands — the commit and environment, readiness,
// the sync mode and minimum builds, whether the schedule is enforced, the database role, the
// newest refused entries — as a table of name and value. No control here changes anything.
// Two reads: `developer.get`, and the readiness check every monitor asks (`/api/ready`),
// whose status is all that is shown.
import { useQuery } from "@tanstack/react-query";

import { Failure } from "../failure";
import { stamp } from "../format";
import { PageHeader } from "../page-header";
import { strings } from "../strings";
import table from "../table.module.css";
import { useTRPC } from "../trpc";
import styles from "./developer.module.css";

const s = strings.developer;

function useReadiness() {
  return useQuery({
    queryKey: ["api-ready"],
    queryFn: async () => (await fetch("/api/ready", { cache: "no-store" })).status,
    staleTime: 0,
    retry: false,
  });
}

export function DeveloperScreen({
  signInHref,
  commit,
  environment,
}: {
  signInHref: string;
  commit: string | null;
  environment: string | null;
}) {
  const trpc = useTRPC();
  const read = useQuery(trpc.developer.get.queryOptions());
  const ready = useReadiness();
  if (read.isPending) {
    return (
      <>
        <PageHeader title={s.title} />
        <p className="body">{strings.loading}</p>
      </>
    );
  }
  if (read.isError) {
    return (
      <>
        <PageHeader title={s.title} />
        <Failure
          error={read.error}
          signInHref={signInHref}
          onRetry={() => void read.refetch()}
        />
      </>
    );
  }
  const d = read.data;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const build = (n: number | null) => (n === null ? s.unreadable : String(n));
  const facts: [string, string][] = [
    [s.commit, commit ?? s.notDeployed],
    [s.environment, environment ?? s.unknown],
    [
      s.readiness,
      ready.isPending
        ? strings.loading
        : ready.data === 200
          ? s.ready
          : s.notReady(ready.data ?? 0),
    ],
    [s.syncMode, d.sync.mode === null ? s.modeUnreadable : s.modes[d.sync.mode]],
    [s.minimumIos, build(d.sync.minimumBuilds.ios)],
    [s.minimumAndroid, build(d.sync.minimumBuilds.android)],
    [s.protocol, s.protocolRange(d.sync.protocol.min, d.sync.protocol.max)],
    [s.enforcement, d.scheduleEnforced ? s.on : s.off],
    [s.databaseRole, d.databaseRole],
    [s.refusedRetained, String(d.refusals.retained)],
    [s.refusedLastDay, String(d.refusals.lastDay)],
  ];
  return (
    <>
      <PageHeader title={s.title} />
      <p className={`secondary ${styles.explain}`}>{s.explain}</p>
      <table className={`${table.table} ${styles.facts}`}>
        <tbody>
          {facts.map(([name, value]) => (
            <tr key={name}>
              <th scope="row" className="secondary">
                {name}
              </th>
              <td className="body">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className={`heading ${styles.heading}`}>{s.recentRefusals}</h2>
      {d.refusals.recent.length === 0 ? (
        <p className="body">{s.noRefusals}</p>
      ) : (
        <ul className={styles.lines}>
          {d.refusals.recent.map((line, i) => (
            <li key={`${line.at.toISOString()}-${i}`} className="secondary">
              {stamp(line.at, zone)} · {line.employee ?? s.nobody} ·{" "}
              {line.recordKind ?? s.wholeRequest} · {line.outcome} · {line.code}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
