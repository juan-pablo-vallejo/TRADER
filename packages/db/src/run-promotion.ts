// Entry point for staging's promotion workflow (.github/workflows/promote-staging.yml) and
// nothing else. It is given connection strings in named environment variables and prints
// counts, migration tags and flags — never a connection, a host or a row. Like the
// migrator and run-onboard.ts it is meant for a deployed database, so it does not call
// assertLocalDatabase, and it reads no .env.
//   state                  the plan: what is pending, what to rehearse, whether to migrate;
//                          first, each string held to the endpoint stated for it
//   expect-current <VAR>   exit 1 unless the database at $VAR holds the journal exactly
//   fingerprint [<VAR>]    the schema's lines; with no VAR, the local POSTGRES_* database
import { appendFileSync } from "node:fs";

import { Client } from "pg";

import { databaseConnection } from "./env";
import { endpointFaults } from "./promotion/endpoints";
import { schemaFingerprint } from "./promotion/fingerprint";
import { readJournal } from "./promotion/journal";
import {
  approvalCode,
  isCommit,
  planPromotion,
  type PromotionRequest,
} from "./promotion/plan";

// cwd-relative on purpose, as drizzle.config.ts is: every `pnpm --filter @trader/db`
// script runs in packages/db.
const MIGRATIONS = "./migrations";

function urlFrom(name: string): string {
  const value = process.env[name] ?? "";
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || value === "") {
    throw new Error(`refusing to run: ${name} is not set`);
  }
  return value;
}

async function withClient<T>(
  connection: ConstructorParameters<typeof Client>[0],
  body: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(connection);
  await client.connect();
  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

// A database never migrated has no bookkeeping table: it has applied nothing.
const applied = (name: string) =>
  withClient({ connectionString: urlFrom(name) }, async (client) => {
    const table = await client.query<{ present: boolean }>(
      `select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
    );
    if (table.rows[0]?.present !== true) return [];
    const { rows } = await client.query<{ hash: string }>(
      `select hash from drizzle.__drizzle_migrations order by created_at, id`,
    );
    return rows.map((row) => row.hash);
  });

function requestFromEnv(): PromotionRequest {
  if (process.env.PROMOTION_EVENT !== "workflow_dispatch") return { kind: "merge" };
  const named = (process.env.PROMOTION_AUTHORIZE_THROUGH ?? "").trim();
  return {
    kind: "dispatch",
    mode: process.env.PROMOTION_MODE === "promote" ? "promote" : "rehearse-only",
    byOwner: process.env.PROMOTION_BY_OWNER === "true",
    authorizeThrough: named === "" ? null : named,
  };
}

const output = (pairs: Record<string, string>) => {
  const file = process.env.GITHUB_OUTPUT;
  const text = Object.entries(pairs)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (file !== undefined && file !== "") appendFileSync(file, text);
  else process.stdout.write(text);
};

const summary = (markdown: string) => {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file !== undefined && file !== "") appendFileSync(file, `${markdown}\n`);
  console.log(markdown);
};

async function state() {
  const commit = process.env.PROMOTION_COMMIT ?? "";
  if (!isCommit(commit))
    throw new Error("refusing to run: PROMOTION_COMMIT is not a commit");
  // Before any connection: each string is on the endpoint the owner stated for it.
  const faults = endpointFaults({
    stagingUrl: urlFrom("STAGING_MIGRATOR_URL"),
    rehearsalUrl: urlFrom("REHEARSAL_MIGRATOR_URL"),
    stagingEndpoint: process.env.STAGING_ENDPOINT_ID ?? "",
    rehearsalEndpoint: process.env.REHEARSAL_ENDPOINT_ID ?? "",
  });
  if (faults.length > 0) {
    summary(
      [
        `### Migrations`,
        `- **stopped before any database was reached:** ${faults.map((f) => `\`${f}\``).join(", ")}`,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  const journal = readJournal(MIGRATIONS);
  const [staging, rehearsal] = [
    await applied("STAGING_MIGRATOR_URL"),
    await applied("REHEARSAL_MIGRATOR_URL"),
  ];
  const plan = planPromotion({
    journal,
    staging,
    rehearsal,
    commit,
    request: requestFromEnv(),
  });
  const head = [
    `### Migrations`,
    `- commit: \`${commit}\``,
    `- journal: ${journal.length}; staging: ${staging.length}; rehearsal branch: ${rehearsal.length}`,
  ];
  if (!plan.ok) {
    summary(
      [...head, `- **stopped before staging changed:** \`${plan.problem}\``].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  const rows = plan.pending.map(
    (entry) =>
      `| \`${entry.tag}\` | \`${entry.hash}\` | ${entry.flags.join(", ") || "none"} |`,
  );
  summary(
    [
      ...head,
      `- to rehearse: ${plan.toRehearse.length}; pending on staging: ${plan.pending.length}`,
      `- staging migration: **${plan.migrate}**` +
        (plan.withheld.length > 0 ? ` (${plan.withheld.join(", ")})` : ""),
      ...(rows.length > 0
        ? ["", "| pending | content (sha256) | flags |", "| --- | --- | --- |", ...rows]
        : []),
    ].join("\n"),
  );
  output({
    pending: String(plan.pending.length),
    rehearse: String(plan.toRehearse.length > 0),
    migrate: plan.migrate,
    withheld: plan.withheld.join(","),
    // What the owner's dispatch must carry for this commit and this pending set. The
    // workflow prints it only once the rehearsal branch is verified.
    approval_code: approvalCode(commit, plan.pending) ?? "",
  });
}

async function expectCurrent(name: string) {
  const journal = readJournal(MIGRATIONS);
  const hashes = await applied(name);
  const same =
    hashes.length === journal.length && hashes.every((h, i) => journal[i]?.hash === h);
  console.log(`${name}: ${hashes.length} applied of ${journal.length}`);
  if (!same) process.exitCode = 1;
}

async function fingerprint(name: string | undefined) {
  const connection =
    name === undefined ? databaseConnection() : { connectionString: urlFrom(name) };
  const lines = await withClient(connection, (client) =>
    schemaFingerprint((text) => client.query(text)),
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === "state") return state();
  if (command === "expect-current" && argument !== undefined)
    return expectCurrent(argument);
  if (command === "fingerprint") return fingerprint(argument);
  console.error(
    "usage: run-promotion state | expect-current <VAR> | fingerprint [<VAR>]",
  );
  process.exitCode = 64;
}

// Not top-level await: tsx runs a package without "type": "module" as CommonJS.
main().catch((error: unknown) => {
  // A driver error's message can hold the connection's host: print a short token only.
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const ours = typeof message === "string" && message.startsWith("refusing to run");
  const token =
    typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "error";
  console.error(ours ? message : `run-promotion failed: ${token}`);
  process.exitCode = 1;
});
