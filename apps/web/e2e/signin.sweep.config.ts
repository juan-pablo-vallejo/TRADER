// The sweep's sign-in cells: the office's sign-in against Clerk's development instance, on
// this Mac, through `scripts/staging.sh sweep-signin <folder>`, which hands this process the
// instance's two keys and the suite's admin number and nothing else of `.env.staging`.
// Sign-in's frame runs with the web cells (sweep.config.ts); what needs Clerk runs here: the
// code step, a refused code, a new code sent, and an address no company added. At 390 and
// 1280, in both languages. Out of `check`, CI and the deploy.
import { defineConfig, devices } from "@playwright/test";

const ORIGIN = "http://localhost:3000";

for (const name of [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "E2E_ADMIN_PHONE",
]) {
  if ((process.env[name] ?? "") === "") {
    throw new Error(
      `${name} is not set: run this through scripts/staging.sh sweep-signin`,
    );
  }
}
if (!/^sk_test_/.test(process.env.CLERK_SECRET_KEY ?? "")) {
  throw new Error("CLERK_SECRET_KEY is not a development instance's key");
}

export default defineConfig({
  testDir: ".",
  testMatch: "signin.sweep.ts",
  // The suite's admin, added by a company, as the Clerk suite has it (clerk-fixtures.ts).
  globalSetup: "./clerk-fixtures.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 1_800_000,
  use: {
    baseURL: ORIGIN,
    trace: "off",
    video: "off",
    screenshot: "off",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    reducedMotion: "reduce",
  },
  webServer: {
    // As clerk.config.ts: `localhost`, and `--webpack`.
    command: "pnpm exec next dev --webpack -H localhost -p 3000",
    cwd: process.cwd(),
    url: `${ORIGIN}/api/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      POSTGRES_DB: "trader_demo_clerk",
      DATABASE_URL: "",
      TRADER_DEV_IDENTITY: "",
      CLERK_AUTHORIZED_PARTIES: ORIGIN,
    },
  },
  projects: [390, 1280].map((width) => ({
    name: `chromium-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: width < 768 ? 844 : 900 },
      // As clerk.config.ts: a browser that says it is driven is no browser to Clerk.
      launchOptions: { args: ["--disable-blink-features=AutomationControlled"] },
    },
  })),
});
