// The identity adapter seam. An adapter turns an HTTP request's
// headers into a verified identity, or null. Verification happens inside the adapter, at the
// HTTP edge; this package never sees a token. The development adapter (dev-identity.ts) and
// Clerk's, in apps/web, implement the same interface. The directory beside it is the same
// seam facing the other way: where an invitation is made known to the provider.
import { z } from "zod";

// A sign-in email. 254: the longest address SMTP can carry.
export const signInEmailSchema = z.email().trim().max(254);

// A sign-in number as it is stored and compared: E.164, United States and Canada only
// The same pattern as the column's CHECK,
// users_sign_in_phone_e164; matching is exact, so nothing looser may pass here.
export const signInPhoneSchema = z.string().regex(/^\+1[2-9][0-9]{9}$/);

// What the API needs from any provider: its subject, and an email or a phone number it has
// verified, or both. They are the invitation join keys, so an unverified one
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

// Where an invited person is made known to the identity provider, so that the provider will
// let them sign in: sign-in is by invitation only. `admit` returns once the provider holds a
// login for these addresses, whether it made one now or already had one: a second admission
// is not an error, and it never says whose the existing login is. It throws when the provider
// could not be reached or refused, and people.invite then invites no one. A person has a
// mobile number, an email, or both: never neither. `id` is the person's row's own, which a
// login made here is tagged with, so that the row's login can later be found by what it
// is and never by an address someone else may hold.
//
// `readdress` brings the login of one person's row to the addresses the row now holds, and
// to nothing else: an address the row does not hold is taken off the login. The
// login is the one bound to the row (`subject`) or, for a person who has not signed in,
// the one tagged with the row's id; it is never looked for by an address, since an address
// may be another person's, in another company. It answers:
//   `done`       the login was changed, and whatever could sign in as the person before
//                (sessions, passkeys, links to other accounts) was ended with it;
//   `unchanged`  the login already held exactly these addresses, and nothing was touched;
//   `no_login`   no login is this row's: nothing was changed;
//   `held`       an address is another login's: nothing of the person's row may change.
// It throws when the provider could not be reached or refused, like `admit`. Asked again
// with the same addresses it finishes what an earlier call left half-done; and `fresh`,
// true when the person's row itself changed in this call, has it end whatever could sign in as
// the person even where the login already holds the addresses, which is how a call that
// stopped after the addresses and before the sign-out is finished too.
export type Readdressed = "done" | "unchanged" | "no_login" | "held";

export type IdentityDirectory = {
  admit(person: {
    id: string;
    email: string | null;
    phone: string | null;
  }): Promise<void>;
  readdress(person: {
    id: string;
    // The provider's own name for the login bound to the row, or null: never signed in.
    subject: string | null;
    email: string | null;
    phone: string | null;
    fresh: boolean;
  }): Promise<Readdressed>;
};

// The directory where no provider is connected — the development identity, the demo and the
// tests: the users row is the whole invitation, as it was before a provider existed.
export const localDirectory: IdentityDirectory = {
  admit: () => Promise.resolve(),
  readdress: () => Promise.resolve("unchanged"),
};
