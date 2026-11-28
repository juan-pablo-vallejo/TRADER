// The look harness on this machine: `pnpm --filter @trader/web look`, which rebuilds the
// demo database `trader_demo_look` first. Every catalogue entry (screens.ts) at 390, 768
// and 1280 in English and Spanish, as pictures and a contact sheet in LOOK_DIR. Two
// passes, because Next allows one `next dev` a project at a time: the office and the
// public pages under the development identity, then (LOOK_PASS=frame) sign-in's frame on
// a server with neither Clerk nor the development identity. It is not a test of anything:
// out of `check`, CI and the deploy.
import { defineConfig, devices } from "@playwright/test";

const ORIGIN = "http://localhost:3000";
const frame = process.env.LOOK_PASS === "frame";

export default defineConfig({
  testDir: ".",
  testMatch: "look.shots.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  globalSetup: frame ? undefined : "./look-prepare.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 3_600_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: ORIGIN,
    trace: "off",
    video: "off",
    screenshot: "off",
    // A step that cannot be taken is a miss, said in the contact sheet, not a hang.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // A transition caught half way is no picture of the screen.
    reducedMotion: "reduce",
  },
  webServer: {
    command: "pnpm exec next dev --webpack -H 127.0.0.1 -p 3000",
    cwd: process.cwd(),
    url: `${ORIGIN}/api/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      POSTGRES_DB: "trader_demo_look",
      DATABASE_URL: "",
      TRADER_DEV_IDENTITY: frame ? "" : "enabled",
      ...(frame ? { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "" } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
