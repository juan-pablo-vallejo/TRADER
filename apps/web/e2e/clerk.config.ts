// The office's sign-in against Clerk's development instance, on this machine: run by
// `scripts/staging.sh local`, which resets `trader_demo_clerk` first, hands this process the
// instance's two keys and the suite's two numbers, and nothing else of `.env.staging`. It
// starts its own `next dev` on loopback with Clerk as the identity, so nothing else may hold
// port 3000. Not part of `check` or of CI: its file's name keeps it out of the staging suite,
// which loads `*.spec.ts`. It shows before a push what only staging could show before.
import { defineConfig, devices } from "@playwright/test";

// By name, not by number: the server tells a browser's own requests from another site's by
// their `Origin` (server/edge.ts), and the sign-in sends every other host to the first
// origin CLERK_AUTHORIZED_PARTIES names (server/addresses.ts).
const ORIGIN = "http://localhost:3000";

for (const name of [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "E2E_ADMIN_PHONE",
]) {
  if ((process.env[name] ?? "") === "") {
    throw new Error(`${name} is not set: run this through scripts/staging.sh local`);
  }
}
// A development instance only: production's keys never reach this machine's runs.
if (!/^sk_test_/.test(process.env.CLERK_SECRET_KEY ?? "")) {
  throw new Error("CLERK_SECRET_KEY is not a development instance's key");
}

export default defineConfig({
  testDir: ".",
  testMatch: "clerk.local.ts",
  globalSetup: "./clerk-fixtures.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  // One browser, in order: the tests share a database, a server and Clerk's logins.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // `next dev` compiles a screen the first time it is asked for.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: ORIGIN,
    // No trace and no video: either would store a session.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    // `--webpack`, as everywhere else here: the default bundler has looped on a first load.
    // `localhost`, not 127.0.0.1: Clerk passes a request on by rewriting it to its own URL
    // (@clerk/nextjs 7.9.25, decorateRequest), and a host other than the one Next is bound
    // to makes Next proxy that rewrite as an outside address, to itself, until it hangs up.
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
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A browser driven by Playwright says so (`navigator.webdriver`), and Clerk then
        // treats it as no browser at all (@clerk/shared 4.45.1, isValidBrowser): no passkey
        // can be added or used, and the sign-in field's passkey offer never starts, so the
        // form would be tested in a state no person's browser is in.
        launchOptions: { args: ["--disable-blink-features=AutomationControlled"] },
      },
    },
  ],
});
