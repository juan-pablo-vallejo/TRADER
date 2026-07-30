import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

/**
 * The environment contract has one home: the repository-root `.env` (see
 * `.env.example`). Next only auto-loads a `.env` beside the app, so without this
 * the web app would need a second copy of `DATABASE_URL` — two files holding one
 * fact, which is exactly how they drift apart. `packages/db`'s `seed.ts` and
 * `migrate.ts` reach for the same file the same way.
 *
 * This runs in the Next server process at startup, so it populates `process.env`
 * for the route handler. It deliberately does not `override` — a variable already
 * exported in the shell, or injected by a host, wins.
 */
loadEnv({ path: "../../.env" });

const config: NextConfig = {
  /**
   * The workspace packages ship raw TypeScript — `@trader/api` and `@trader/db`
   * both point `main` at `src/index.ts` and neither has a build step. Next must
   * therefore compile them itself; without this the build fails on the first
   * `import` of a `.ts` file it considers a node_modules dependency.
   */
  transpilePackages: ["@trader/api", "@trader/db"],
};

export default config;
