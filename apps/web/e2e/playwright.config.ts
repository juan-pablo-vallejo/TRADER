// The staging browser suite's configuration (RULES, Toolbox; ARCHITECTURE, 2026-11-14 staging
// browser suite). It runs against one protected preview, on demand, from a machine that
// holds Vercel's automation bypass secret; it is never part of `pnpm check` or CI. Both
// values come from the environment of the one command that runs it and are never read from
// a file. Consumed by the `e2e:staging` script.
import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(stagingUrl)) {
  throw new Error(
    "STAGING_URL must be the preview's origin: https, a host, nothing after it",
  );
}
if ((process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "") === "") {
  throw new Error(
    "VERCEL_AUTOMATION_BYPASS_SECRET is required to reach a protected preview",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // Outside the repository when the caller says where; ignored by git otherwise.
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  // One browser, one flow, in order: the steps share a database and a sign-in.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: stagingUrl,
    // No trace and no video: either would store the bypass cookie beside the screenshots.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
