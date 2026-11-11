// The one place tests read .env. Resolved from this file's location so it holds whatever the
// cwd is; the repository root is three levels up. src/env.ts stays pure and only validates.
import { fileURLToPath } from "node:url";

import { assertLocalDatabase } from "@trader/db";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  // No .env in CI: the job sets the variables directly. Anything else is a real failure.
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// After .env is loaded: the suites commit rows and create databases (env.ts).
assertLocalDatabase(process.env, "tests");
