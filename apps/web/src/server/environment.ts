// Which TRADER environment a deployment is: `staging` or `production`, stated in TRADER_ENVIRONMENT and
// never worked out. Vercel's VERCEL_ENV cannot say it: staging is the staging project's
// own Production deployment, so `production` there means only "this project's production
// branch". Null when unset or anything else; a deployment refuses to start on null
// (deploy-env.ts). Consumed by the mailer's allow-list rule and the error
// reporter's environment tag.
type Env = Record<string, string | undefined>;

export const TRADER_ENVIRONMENTS = ["staging", "production"] as const;
export type TraderEnvironment = (typeof TRADER_ENVIRONMENTS)[number];

export function traderEnvironment(env: Env): TraderEnvironment | null {
  const value = env.TRADER_ENVIRONMENT ?? "";
  return (TRADER_ENVIRONMENTS as readonly string[]).includes(value)
    ? (value as TraderEnvironment)
    : null;
}
