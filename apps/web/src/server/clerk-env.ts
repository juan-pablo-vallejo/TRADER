// Clerk's part of the environment contract (.env.example), checked where it is read. Never
// thrown from: a deployment without its keys has no Clerk, and every request is then refused
// for want of an identity (identity.ts), which is what a missing secret should cost.
// Checked by hand, three variables: apps/web has no zod of its own. Consumed by identity.ts,
// proxy.ts, the layout and the sign-in page.
const PUBLISHABLE_KEY = /^pk_(test|live)_\S+$/;
const SECRET_KEY = /^sk_(test|live)_\S+$/;

export type ClerkEnv = {
  publishableKey: string;
  secretKey: string;
  // The origins a session token may have been issued to (Clerk, `authorizedParties`): the
  // office's own, comma-separated in CLERK_AUTHORIZED_PARTIES. Empty admits no token that
  // names an origin (clerk-identity.ts, admitsParty): no browser signs in.
  authorizedParties: string[];
};

const isOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const parties = (env: Record<string, string | undefined>): string[] =>
  (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");

// The token Clerk would take from an `Authorization` header, read as Clerk's own code reads
// it (`@clerk/backend`, parseAuthorizationHeader): `Bearer <token>`, or a bare token.
const headerToken = (authorization: string | null): boolean => {
  if (authorization === null || authorization === "") return false;
  const [scheme, token] = authorization.split(" ", 2);
  return token === undefined || token === "" || scheme === "Bearer";
};

// The origins Clerk is told to hold one request's token to. A browser's session is a cookie
// and names the origin it was issued to (`azp`); Clerk refuses it unless that origin is
// listed. The phone's token comes in the `Authorization` header and names no origin at all
// — a native client has none — and Clerk, given a list, refuses a token without one
// (`@clerk/backend` 3.27.0, assertAuthorizedPartiesClaim; seen 2026-11-16: a phone's pull
// 401 with the list set, 200 with it blank). So a header token is verified with no list
// here, and `admitsParty` (clerk-identity.ts) then holds any origin it does name to the list.
export const partiesFor = (authorization: string | null, listed: string[]): string[] =>
  headerToken(authorization) ? [] : listed;

// The Clerk variables that are missing or malformed, by name and never by value: what the
// deployment's environment check prints (deploy-env.ts).
export function clerkEnvFaults(env: Record<string, string | undefined>): string[] {
  return [
    ...(PUBLISHABLE_KEY.test(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "")
      ? []
      : ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]),
    ...(SECRET_KEY.test(env.CLERK_SECRET_KEY ?? "") ? [] : ["CLERK_SECRET_KEY"]),
    ...(parties(env).every(isOrigin) ? [] : ["CLERK_AUTHORIZED_PARTIES"]),
  ];
}

// Both keys and a well-formed origin list, or null: one key without the other, or an origin
// that is not one, is no configuration.
export function clerkEnv(env: Record<string, string | undefined>): ClerkEnv | null {
  if (clerkEnvFaults(env).length > 0) return null;
  return {
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
    secretKey: env.CLERK_SECRET_KEY ?? "",
    authorizedParties: parties(env),
  };
}
