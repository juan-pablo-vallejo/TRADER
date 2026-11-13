// Entry point for `pnpm --filter @trader/db onboard` (README.md, Onboarding). The owner runs
// it from a terminal with DATABASE_URL set in the shell to the direct endpoint, as the
// database's owner; shell variables win over .env. It is the one writer meant for a deployed
// database, so it does not call assertLocalDatabase. Without --apply every statement runs
// and is rolled back. It prints the database's name and the ids, never the connection.
import { parseArgs } from "node:util";

import { createDb } from "./client";
import { onboardingFaults, runOnboarding, type Onboarding } from "./onboard";

try {
  process.loadEnvFile("../../.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const USAGE =
  "usage: onboard --company <name> --timezone <IANA zone> --next-invoice <n> " +
  "--next-credit-memo <n> --admin-name <name> --admin-phone <+1XXXXXXXXXX> " +
  "[--admin-email <address>] [--apply]";

async function main() {
  const { values } = parseArgs({
    options: {
      company: { type: "string" },
      timezone: { type: "string" },
      "next-invoice": { type: "string" },
      "next-credit-memo": { type: "string" },
      "admin-name": { type: "string" },
      "admin-phone": { type: "string" },
      "admin-email": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const input = {
    companyName: values.company,
    timezone: values.timezone,
    nextInvoiceNumber: values["next-invoice"],
    nextCreditMemoNumber: values["next-credit-memo"],
    adminName: values["admin-name"],
    adminPhone: values["admin-phone"],
    ...(values["admin-email"] !== undefined && { adminEmail: values["admin-email"] }),
  };
  const faults = onboardingFaults(input);
  if (faults.length > 0) {
    console.error(`invalid or missing: ${faults.join(", ")}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const db = createDb();
  try {
    const r = await runOnboarding(db, input as Onboarding, { apply: values.apply });
    console.log(
      `${r.applied ? "onboarded" : "dry run, rolled back"} as ${r.currentUser} ` +
        `in database ${r.database}: company ${r.companyId}, admin ${r.adminId}` +
        (r.applied ? "" : "\nnothing was written; run again with --apply"),
    );
  } finally {
    await db.$client.end();
  }
}

// Not top-level await: tsx runs a package without "type": "module" as CommonJS.
main().catch((error: unknown) => {
  // The message of a refusal is ours and names no value; a driver error's message can hold
  // the statement and its parameters (MEMORY), so only its class and SQLSTATE are printed.
  if (error instanceof Error && error.message.startsWith("refusing to onboard")) {
    console.error(error.message);
  } else {
    const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause;
    const name = error instanceof Error ? error.name : "unknown error";
    console.error(
      `onboard failed: ${name} ${typeof cause?.code === "string" ? cause.code : ""}`,
    );
  }
  process.exitCode = 1;
});
