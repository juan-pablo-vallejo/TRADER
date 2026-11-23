// One person onto staging's roster: `scripts/staging.sh invite <number> <name>` and
// nothing else runs this. It is not a test of anything and is never part of `check` or
// the deploy job; its file's name keeps it out of the staging suite, which loads
// `*.spec.ts`. Values come from the environment of that one command.
import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(stagingUrl)) {
  throw new Error(
    "STAGING_URL must be staging's origin: https, a host, nothing after it",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "invite.run.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: stagingUrl,
    // No trace and no video: either would store the session, and the number.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
