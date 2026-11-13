// The one place these tests read .env, resolved from this file so it holds whatever the cwd
// is; the repository root is three levels up. No .env in CI: the job sets the variables.
import { fileURLToPath } from "node:url";

import { assertLocalDatabase } from "@trader/db";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// The suites never reach Clerk: a session is a fake handed to the adapter
// (clerk-identity.test.ts). The owner's .env may hold real keys, so they are dropped here and
// a test that wants Clerk configured stubs its own.
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.CLERK_SECRET_KEY;
delete process.env.CLERK_AUTHORIZED_PARTIES;

// After .env is loaded: the suites commit rows and create databases (env.ts).
assertLocalDatabase(process.env, "tests");
