// The office web app and the API host (ARCHITECTURE, apps/web). Next loads only this app's
// own .env files; the environment contract has one home, the repository-root .env
// (.env.example), so it is loaded here, in the server process at startup, the way
// run-seed.ts loads it. Shell variables win over it. No .env exists in CI or on Vercel.
import path from "node:path";

import type { NextConfig } from "next";

try {
  process.loadEnvFile(path.join(__dirname, "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config: NextConfig = {
  // The monorepo root: the lockfile lives there, and so does assets/brand, which a route
  // reads at request time and the deployment must therefore trace (next.config.ts, Stage 4).
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default config;
