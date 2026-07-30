import type { AuthIdentity } from "@trader/api";
import { cookies, headers } from "next/headers";

/**
 * The one file Clerk replaces.
 *
 * `packages/api` never talks to Clerk — it takes an `AuthIdentity` that has
 * already been verified, and that verification belongs here at the HTTP edge.
 * Phase 0 runs against a local stack with no auth provider, so this supplies a
 * development identity instead. When Clerk lands, `identityFromRequest` starts
 * reading a verified session and nothing downstream changes.
 */

/** Cookie holding the development subject id. Name is deliberately unmistakable. */
export const DEV_SUBJECT_COOKIE = "trader_dev_subject";

/**
 * Header carrying the same thing for native clients, which have no cookie jar.
 * Kept in step with `apps/mobile/src/dev-identity.ts`.
 */
export const DEV_SUBJECT_HEADER = "x-trader-dev-subject";

const isProduction = () => process.env.NODE_ENV === "production";
const devAuthFlagSet = () => process.env.DEV_AUTH_ENABLED === "true";

/**
 * Whether the development identity path may run at all.
 *
 * **Fails closed at request time, never at module load.** A module-load throw
 * would break `next build`, which evaluates route modules with
 * `NODE_ENV=production` and no dev flag set — and the obvious fix, setting the
 * flag in CI, would normalise it being on everywhere. That is the opposite of
 * failing closed. So an absent flag simply yields no identity, and the existing
 * `protectedProcedure` turns that into a 401.
 *
 * The flag set *in production* is the genuinely dangerous combination — a
 * deployment that would accept any subject anyone names — and is the only one
 * worth crashing over.
 */
export function devAuthEnabled(): boolean {
  if (isProduction() && devAuthFlagSet()) {
    throw new Error(
      "DEV_AUTH_ENABLED is set in a production build. This would accept any " +
        "identity a caller claims. Unset it, or wire a real auth provider.",
    );
  }
  return devAuthFlagSet();
}

/**
 * The caller's verified identity, or null when there is none.
 *
 * Null is not an error: `createContext` accepts it and the request proceeds as
 * unauthenticated, which public procedures allow and protected ones reject.
 */
export async function identityFromRequest(): Promise<AuthIdentity | null> {
  if (!devAuthEnabled()) return null;

  // The header comes first because it is the mobile path: a native app has no
  // cookie jar, so the subject travels in a header there. Clerk will collapse
  // both back into one bearer token.
  const fromHeader = (await headers()).get(DEV_SUBJECT_HEADER)?.trim();
  const fromCookie = (await cookies()).get(DEV_SUBJECT_COOKIE)?.value?.trim();

  const subject = fromHeader || fromCookie;
  if (!subject) return null;

  return {
    clerkUserId: subject,
    /**
     * Only ever consulted when the row is created, so this names the *first*
     * sign-in and never overwrites a later correction. See `AuthIdentity`.
     */
    profile: { name: subject },
  };
}
