// The office web app and the API host. Next loads only this app's
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

// The `dev` script in package.json passes --webpack. The default bundler (Turbopack, Next
// 16.4.5) loops on "Fast Refresh rebuilding" at the first page load: /schedule reloaded
// 1,133 times in 30 seconds and never left "Loading…", against 3 loads under webpack.
const config: NextConfig = {
  // `next dev` would write an AGENTS.md into this app; the document set is fixed.
  agentRules: false,
  // The monorepo root: the lockfile lives there, and so does assets/brand, which a route
  // reads at request time and the deployment must therefore trace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/favicon.ico": ["../../assets/brand/favicon.png"],
  },
  // The homepage is its photos: AVIF where a browser takes it, WebP where it does not.
  // Each size of each photo is then made and kept twice, and Vercel bills image
  // optimization by use: cents a month for this many photos.
  images: { formats: ["image/avif", "image/webp"] },
  // No framework banner on responses.
  poweredByHeader: false,
  // Baseline response headers for every route of a built app: no MIME sniffing, no framing by
  // another site, and no path or query sent to another origin. Built apps only: a development
  // server is never exposed, and nothing there needs them. Transport security: two years,
  // subdomains included, not preloaded; a browser ignores it over plain HTTP, so a local `next start` is unaffected.
  // The content security policy carries a per-request nonce and is set in proxy.ts.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        // The homepage's two fonts (public/fonts): the version is in each file's name, so
        // an address never changes what it holds and a browser may keep it for good.
        source: "/fonts/:file",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
