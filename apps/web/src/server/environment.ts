// Which TRADER environment a deployment is: `staging` or `production`, stated in TRADER_ENVIRONMENT and
// never worked out. Vercel's VERCEL_ENV cannot say it: staging is the staging project's
// own Production deployment, so `production` there means only "this project's production
// branch". Null when unset or anything else; a deployment refuses to start on null
// (deploy-env.ts).
type Env = Record<string, string | undefined>;

export const TRADER_ENVIRONMENTS = ["staging", "production"] as const;
export type TraderEnvironment = (typeof TRADER_ENVIRONMENTS)[number];

export function traderEnvironment(env: Env): TraderEnvironment | null {
  const value = env.TRADER_ENVIRONMENT ?? "";
  return (TRADER_ENVIRONMENTS as readonly string[]).includes(value)
    ? (value as TraderEnvironment)
    : null;
}

// Whether the API answers its timings and request id to a caller: on staging, and on a
// development machine. A production build that names no environment answers none.
export const answersTimings = (env: Env): boolean =>
  traderEnvironment(env) === "staging" || env.NODE_ENV !== "production";
