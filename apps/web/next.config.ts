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
  // `next dev` would write an AGENTS.md into this app; the document set is fixed (RULES).
  agentRules: false,
  // The monorepo root: the lockfile lives there, and so does assets/brand, which a route
  // reads at request time and the deployment must therefore trace (next.config.ts, Stage 4).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/favicon.ico": ["../../assets/brand/logo.png"],
  },
  // No framework banner on responses.
  poweredByHeader: false,
  // Baseline response headers for every route of a built app: no MIME sniffing, no framing by
  // another site, and no path or query sent to another origin. Built apps only: a development
  // server is never exposed, and nothing there needs them. Transport security: two years,
  // subdomains included, not preloaded (ARCHITECTURE, 2026-11-13 policy and transport
  // security); a browser ignores it over plain HTTP, so a local `next start` is unaffected.
  // The content security policy carries a per-request nonce and is set in proxy.ts.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default config;
