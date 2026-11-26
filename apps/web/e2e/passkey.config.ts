// The passkey test of the Clerk suite (clerk.local.ts), against staging: `scripts/staging.sh
// passkey` and nothing else runs this, after a push that deploys. It signs in once, by the
// admin's single-use ticket the script makes, then by the passkey it adds and removes. Never
// part of `check` or the deploy job; its file's name keeps it out of the staging suite,
// which loads `*.spec.ts`. Values come from the environment of that one command.
import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.APP_URL ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(stagingUrl)) {
  throw new Error("APP_URL must be staging's origin: https, a host, nothing after it");
}

export default defineConfig({
  testDir: ".",
  testMatch: "clerk.local.ts",
  grep: /passkey/,
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: stagingUrl,
    // No trace and no video: either would store the session.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // As in clerk.config.ts: Clerk offers no passkey to a browser that says it is driven.
        launchOptions: { args: ["--disable-blink-features=AutomationControlled"] },
      },
    },
  ],
});
