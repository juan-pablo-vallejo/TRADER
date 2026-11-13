// Clerk behind the identity seam (ARCHITECTURE, identity; RULES: three thin seams). Clerk's
// own code verifies the session token — in the proxy, before this runs — and this file only
// maps what the verified token says onto the seam's shape. packages/api never sees a token.
//
// The token carries four claims the Clerk instance is configured to add (Dashboard, Sessions,
// Customize session token; named in .env.example), because a default session token names no
// address at all:
//   email, email_verified, phone_number, phone_number_verified
// An address counts only beside its own flag, and the flag only as the boolean true: the
// addresses are the invitation join keys (identity.ts), so anything looser would let an
// unverified address claim an invitation. A number that is not a +1 E.164 number is dropped,
// never reinterpreted; a login left with no address is no identity, and the API answers 401.
import {
  signInEmailSchema,
  signInPhoneSchema,
  verifiedIdentitySchema,
  type IdentityAdapter,
  type VerifiedIdentity,
} from "@trader/api";

// Clerk's user id, `user_…`. It becomes users.identity_subject at the first sign-in.
const CLERK_USER_ID = /^user_[A-Za-z0-9]{1,250}$/;

const claim = (claims: unknown, name: string): unknown =>
  typeof claims === "object" && claims !== null
    ? (claims as Record<string, unknown>)[name]
    : undefined;

// Every value is judged by the seam's own schemas (packages/api, identity.ts), the same ones
// the context applies again: this file adds only Clerk's claim names and the flag rule.
export function identityFromClaims(
  userId: unknown,
  sessionClaims: unknown,
): VerifiedIdentity | null {
  if (typeof userId !== "string" || !CLERK_USER_ID.test(userId)) return null;
  const email =
    claim(sessionClaims, "email_verified") === true
      ? signInEmailSchema.safeParse(claim(sessionClaims, "email"))
      : null;
  const phone =
    claim(sessionClaims, "phone_number_verified") === true
      ? signInPhoneSchema.safeParse(claim(sessionClaims, "phone_number"))
      : null;
  const identity = verifiedIdentitySchema.safeParse({
    subject: userId,
    // Lower case, as the development subject's email is: the match is case-insensitive in
    // SQL already, and one spelling keeps `app.identity_email` the same on every request.
    ...(email?.success === true && {
      email: email.data.toLowerCase(),
      emailVerified: true,
    }),
    ...(phone?.success === true && { phone: phone.data, phoneVerified: true }),
  });
  return identity.success ? identity.data : null;
}

// What Clerk's `auth()` answers, as far as this file reads it.
export type ClerkSession = { userId: string | null; sessionClaims: unknown };

// `readSession` is Clerk's `auth()` in the route handler and a fake in tests: it reads the
// request from Next's own scope, so the headers are not consulted here. Whatever it throws —
// no proxy ran, Clerk's key set could not be fetched — is reported and answers no identity:
// the request is refused, never trusted and never a crash, and `status.get`, which needs no
// identity, still answers.
export function createClerkIdentityAdapter(deps: {
  readSession: () => Promise<ClerkSession>;
  onError: (error: unknown) => void;
}): IdentityAdapter {
  return {
    async identify() {
      try {
        const session = await deps.readSession();
        return identityFromClaims(session.userId, session.sessionClaims);
      } catch (error) {
        deps.onError(error);
        return null;
      }
    },
  };
}
