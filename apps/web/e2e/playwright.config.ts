// The staging browser suite's configuration. It runs against one deployment of the
// staging project: staging's public host, from the deploy job after each
// deployment, with no secret; or a protected preview, from a machine that holds Vercel's
// automation bypass secret. It is never part of `pnpm check` or the `check` job. Its values
// come from the environment of the one command that runs it and are never read from a
// file.
import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(stagingUrl)) {
  throw new Error(
    "STAGING_URL must be the preview's origin: https, a host, nothing after it",
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
  // CI's log is public: the list, and nothing that could hold a session.
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
