// When the phone offers Face ID or fingerprint sign-in, and what becomes of its key. Pure:
// the screens (biometric-offer.tsx, settings.tsx, ui/phone-sign-in.tsx) ask these, as the
// office's passkey band asks apps/web/src/app/passkey-rules.ts.
//
// The key is the provider's (Clerk's biometric credentials, biometrics.ts): one per app
// installation, made for whoever was signed in when it was turned on. Which person that was
// is kept on the phone as their roster id, so a second person signing in by code is offered
// their own, which replaces the first's.

// Why the provider says the phone cannot sign in with its lock now (Clerk's
// BiometricCredentialAvailability.unavailableReason, read 2026-11-23), or null: it can.
export type Unavailable =
  | "environment_unavailable"
  | "native_api_disabled"
  | "feature_disabled"
  | "unsupported_platform"
  | "biometric_authentication_unavailable"
  | "no_local_credential"
  | "local_key_missing"
  | "server_credential_missing"
  | "server_credential_revoked";

// The reasons that mean only "no key here yet", on a phone that could hold one. Every other
// reason is a phone, a build or an instance that cannot: nothing is offered there.
const CAN_HOLD_ONE: ReadonlySet<Unavailable> = new Set([
  "no_local_credential",
  "local_key_missing",
  "server_credential_missing",
  "server_credential_revoked",
]);

export const canHoldKey = (reason: Unavailable | null): boolean =>
  reason === null || CAN_HOLD_ONE.has(reason);

// How a person came in. Only a code earns the offer: a sign-in by the key itself, or by Google
// or Apple, is not the first sign-in on this phone the offer is for, and the Demo door's
// people are shared by design and never hold one.
export type SignedInBy = "code" | "biometric" | "google" | "apple" | "demo";

export function offersBiometric(input: {
  by: SignedInBy;
  reason: Unavailable | null;
  // Who the phone's key was made for, by roster id; null when none was.
  keyFor: string | null;
  // Who said "Not now" on this phone, by roster id.
  declinedBy: string | null;
  // Who has just signed in.
  who: string;
}): boolean {
  if (input.by !== "code") return false;
  if (input.declinedBy === input.who) return false;
  if (!canHoldKey(input.reason)) return false;
  // A key that works, made for this person: nothing to offer. Made for someone else: theirs
  // is offered, and replaces it.
  return input.reason !== null || input.keyFor !== input.who;
}

// The sign-in screen's button for the key: shown only where a key works on this phone.
export const offersKeySignIn = (
  reason: Unavailable | null,
  keyFor: string | null,
): boolean => reason === null && keyFor !== null;

// Me's switch for it: on when this person's key is here, offered wherever one could be.
export function keySwitch(
  reason: Unavailable | null,
  keyFor: string | null,
  who: string,
): "on" | "off" | "absent" {
  if (!canHoldKey(reason)) return "absent";
  return reason === null && keyFor === who ? "on" : "off";
}

// A sign-in the server refused (deactivated, or no roster holds the person): when it came by
// the key, the key goes too, so the phone stops offering a way in that leads nowhere.
export const revokesKey = (by: SignedInBy): boolean => by === "biometric";
