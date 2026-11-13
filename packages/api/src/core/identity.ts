// The identity adapter seam (RULES: three thin seams). An adapter turns an HTTP request's
// headers into a verified identity, or null. Verification happens inside the adapter, at the
// HTTP edge; this package never sees a token. The development adapter (dev-identity.ts) is the
// only implementation until Clerk's (Stage 6), which implements the same interface.
import { z } from "zod";

// A sign-in email. 254: the longest address SMTP can carry.
export const signInEmailSchema = z.email().trim().max(254);

// A sign-in number as it is stored and compared: E.164, United States and Canada only
// (ARCHITECTURE, 2026-11-12 Release 0.1 sign-in). The same pattern as the column's CHECK,
// users_sign_in_phone_e164; matching is exact, so nothing looser may pass here.
export const signInPhoneSchema = z.string().regex(/^\+1[2-9][0-9]{9}$/);

// What the API needs from any provider: its subject, and an email or a phone number it has
// verified, or both. They are the invitation join keys (PRD, Access), so an unverified one
// would let anyone claim an invitation; each flag is a literal so an adapter cannot hand one
// over by accident, and an address without its flag, or no address at all, is no identity.
export const verifiedIdentitySchema = z
  .object({
    subject: z.string().trim().min(1).max(255),
    email: signInEmailSchema.optional(),
    emailVerified: z.literal(true).optional(),
    phone: signInPhoneSchema.optional(),
    phoneVerified: z.literal(true).optional(),
  })
  .refine(
    (i) =>
      (i.email !== undefined || i.phone !== undefined) &&
      (i.email === undefined) === (i.emailVerified === undefined) &&
      (i.phone === undefined) === (i.phoneVerified === undefined),
  );

export type VerifiedIdentity = z.infer<typeof verifiedIdentitySchema>;

export type IdentityAdapter = {
  identify(headers: Headers): Promise<VerifiedIdentity | null>;
};
