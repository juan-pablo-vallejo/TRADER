// The identity adapter seam (RULES: three thin seams). An adapter turns an HTTP request's
// headers into a verified identity, or null. Verification happens inside the adapter, at the
// HTTP edge; this package never sees a token. The development adapter (dev-identity.ts) is the
// only implementation until Clerk's (Stage 6), which implements the same interface.
import { z } from "zod";

// What the API needs from any provider: its subject and an email it has verified. The email is
// the invitation join key (PRD, Access), so an unverified one would let anyone claim an
// invitation; `emailVerified` is a literal so an adapter cannot hand one over by accident.
export const verifiedIdentitySchema = z.object({
  subject: z.string().trim().min(1).max(255),
  email: z.email().trim(),
  emailVerified: z.literal(true),
});

export type VerifiedIdentity = z.infer<typeof verifiedIdentitySchema>;

export type IdentityAdapter = {
  identify(headers: Headers): Promise<VerifiedIdentity | null>;
};
