// Entry point for `pnpm db:seed`, so it reads .env, by the same cwd-relative path as
// drizzle.config.ts (`pnpm --filter @trader/db` runs in packages/db). Shell variables win over
// .env, so `DATABASE_URL= POSTGRES_DB=x pnpm db:seed` seeds x. The connection is the
// migrator's: the same env contract (env.ts), and the owner.
import { createDb } from "./client";
import { assertLocalDatabase } from "./env";
import { seed } from "./seed";

try {
  process.loadEnvFile("../../.env");
} catch (error) {
  // No .env in CI: the variables are set directly. Anything else is a real failure.
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

async function main() {
  // A development and CI fixture; the pilot's company is onboarded by its own task.
  assertLocalDatabase(process.env, "the seed");
  const db = createDb();
  try {
    // One transaction: a refusal or a failed statement leaves nothing behind.
    const r = await db.transaction((tx) => seed(tx));
    console.log(
      `seeded as ${r.currentUser}: companies ${r.companies}, ` +
        `invoice_counters ${r.invoiceCounters}, users ${r.users}`,
    );
  } finally {
    await db.$client.end();
  }
}

// Not top-level await: tsx runs a package without "type": "module" as CommonJS.
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
