// Clerk's part of the environment contract (.env.example), checked where it is read. Never
// thrown from: a deployment without its keys has no Clerk, and every request is then refused
// for want of an identity (identity.ts), which is what a missing secret should cost.
// Checked by hand, three variables: apps/web has no zod of its own (RULES: a dependency needs
// its TASKS line). Consumed by identity.ts, proxy.ts, the layout and the sign-in page.
const PUBLISHABLE_KEY = /^pk_(test|live)_\S+$/;
const SECRET_KEY = /^sk_(test|live)_\S+$/;

export type ClerkEnv = {
  publishableKey: string;
  secretKey: string;
  // The origins a session token may have been issued to (Clerk, `authorizedParties`): the
  // office's own, comma-separated in CLERK_AUTHORIZED_PARTIES. Empty leaves the check to
  // Clerk's default.
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
