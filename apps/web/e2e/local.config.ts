// The office in a real browser against the demo data, on this machine: `pnpm e2e:local`,
// which rebuilds the demo database `trader_demo_browser` first. It starts its own
// `next dev` on loopback with the development sign-in, so nothing else may hold port 3000,
// and it reaches no deployed service. Not part of `check` or of CI: its file's name keeps
// it out of the staging suite, which loads `*.spec.ts`. It catches before a push what the
// staging smoke test can only catch after a deploy.
import { defineConfig, devices } from "@playwright/test";

// By name, not by number: the server tells a browser's own requests from another site's
// by their `Origin` (server/edge.ts), and `next dev` knows itself as `localhost` whatever
// address it is bound to. A browser at `127.0.0.1` is refused every change with a 403.
const ORIGIN = "http://localhost:3000";
// The empty company screens.local.ts opens, written beside the demo (look-prepare.ts).
process.env.PREPARE_DB = "trader_demo_browser";

export default defineConfig({
  testDir: ".",
  testMatch: ["office.local.ts", "screens.local.ts"],
  globalSetup: "./look-prepare.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  // One browser, in order: the tests share a database and a server.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // `next dev` compiles a screen the first time it is asked for.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: ORIGIN,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    // `--webpack`, as everywhere else here: the default bundler has looped on a first load.
    command: "pnpm exec next dev --webpack -H 127.0.0.1 -p 3000",
    cwd: process.cwd(),
    url: `${ORIGIN}/api/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      POSTGRES_DB: "trader_demo_browser",
      DATABASE_URL: "",
      TRADER_DEV_IDENTITY: "enabled",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
