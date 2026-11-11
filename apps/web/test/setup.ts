// The one place these tests read .env, resolved from this file so it holds whatever the cwd
// is; the repository root is three levels up. No .env in CI: the job sets the variables.
import { fileURLToPath } from "node:url";

import { assertLocalDatabase } from "@trader/db";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// After .env is loaded: the suites commit rows and create databases (env.ts).
assertLocalDatabase(process.env, "tests");
