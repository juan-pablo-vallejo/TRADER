// The sweep's web cells (sweep.shots.ts): every catalogue entry (screens.ts) in both
// languages, in Chromium at 390, 768 and 1280 and at the zoom cells, 640, 384 and 320 CSS
// px at device scale 2 (1280 and 768 at 200%, and WCAG's reflow floor), and in WebKit at
// 390 and 320. SWEEP_BROWSERS picks the engines a machine runs: Chromium on the
// workstation, WebKit on this Mac (`scripts/trader-ws sweep`). Like the look harness, two
// passes: the office and the public pages under the development identity, then
// (SWEEP_PASS=frame) sign-in's frame on a server with neither Clerk nor that identity.
// Its own demo database, `trader_demo_websweep`. Out of `check`, CI and the deploy.
import { defineConfig, devices } from "@playwright/test";

const ORIGIN = "http://localhost:3000";
const frame = process.env.SWEEP_PASS === "frame";
const browsers = (process.env.SWEEP_BROWSERS ?? "chromium webkit").split(/\s+/);
process.env.PREPARE_DB = "trader_demo_websweep";

// One cell a project: its name is the cell's, less the language.
const CELLS = [
  { name: "chromium-390", browser: "chromium", width: 390, scale: 1 },
  { name: "chromium-768", browser: "chromium", width: 768, scale: 1 },
  { name: "chromium-1280", browser: "chromium", width: 1280, scale: 1 },
  { name: "chromium-640z", browser: "chromium", width: 640, scale: 2 },
  { name: "chromium-384z", browser: "chromium", width: 384, scale: 2 },
  { name: "chromium-320z", browser: "chromium", width: 320, scale: 2 },
  { name: "webkit-390", browser: "webkit", width: 390, scale: 1 },
  { name: "webkit-320", browser: "webkit", width: 320, scale: 1 },
];

export default defineConfig({
  testDir: ".",
  testMatch: "sweep.shots.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./test-results",
  globalSetup: frame ? undefined : "./look-prepare.ts",
  fullyParallel: true,
  workers: Number(process.env.SWEEP_WORKERS ?? 4),
  retries: 0,
  reporter: "list",
  timeout: 5_400_000,
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
    command: "pnpm exec next dev --webpack -H 127.0.0.1 -p 3000",
    cwd: process.cwd(),
    url: `${ORIGIN}/api/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      POSTGRES_DB: "trader_demo_websweep",
      DATABASE_URL: "",
      TRADER_DEV_IDENTITY: frame ? "" : "enabled",
      ...(frame ? { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "" } : {}),
    },
  },
  projects: CELLS.filter((c) => browsers.includes(c.browser)).map((c) => ({
    name: c.name,
    use: {
      ...(c.browser === "webkit" ? devices["Desktop Safari"] : devices["Desktop Chrome"]),
      viewport: { width: c.width, height: c.width < 768 ? 844 : 900 },
      deviceScaleFactor: c.scale,
    },
  })),
});
