// Screenshots of staging's office for a session to look at: `scripts/staging.sh look
// <path>...` and nothing else runs this. It is not a test of anything and is never part of
// `check` or the deploy job; its file's name keeps it out of the staging suite, which
// loads `*.spec.ts`. Values come from the environment of that one command.
import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.APP_URL ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(stagingUrl)) {
  throw new Error("APP_URL must be staging's origin: https, a host, nothing after it");
}

export default defineConfig({
  testDir: ".",
  testMatch: "look.shots.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 180_000,
  use: {
    baseURL: stagingUrl,
    // No trace and no video: either would store the session beside the screenshots.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
