// The rules of a passkey in the office, apart from Clerk and the browser so they can be
// tested: when Today offers one, and what a failed attempt is called. Clerk asks that a
// person has signed in within the last ten minutes before a passkey is added or removed
// ("Add/remove passkey", its reverification table, read 2026-11-23), so the offer is made
// only while that holds, and later the screen says to sign in again.

// Clerk's window for a sensitive action, in minutes, as its dashboard has it by default.
export const REVERIFICATION_MINUTES = 10;

// Where "Not now" is remembered: in this browser, and nowhere else.
export const PASSKEY_OFFER_KEY = "trader.passkey-offer";
export const PASSKEY_OFFER_DECLINED = "declined";

// Whether Today offers a passkey: to someone who has none, in a browser that can make
// one, who has just signed in, and who has not said "Not now" here.
export function offersPasskey(input: {
  // The browser has WebAuthn.
  supported: boolean;
  // How many passkeys the person has.
  passkeys: number;
  // Minutes since the person last proved who they are, or null when Clerk does not say.
  minutesSinceSignIn: number | null;
  // What this browser remembers of the offer.
  remembered: string | null;
}): boolean {
  return (
    input.supported &&
    input.passkeys === 0 &&
    input.minutesSinceSignIn !== null &&
    input.minutesSinceSignIn < REVERIFICATION_MINUTES &&
    input.remembered !== PASSKEY_OFFER_DECLINED
  );
}

// Why a passkey was not added, removed or used.
export const PASSKEY_FAILURES = [
  // Clerk wants a sign-in more recent than this one.
  "sign_in_again",
  // The person closed the browser's sheet: nothing happened, and nothing is wrong.
  "cancelled",
  // This device already holds one for them.
  "exists",
  // The browser, or this address, cannot do passkeys.
  "unsupported",
  "failed",
] as const;
export type PasskeyFailure = (typeof PASSKEY_FAILURES)[number];

const BY_CODE: Record<string, PasskeyFailure> = {
  session_reverification_required: "sign_in_again",
  passkey_registration_cancelled: "cancelled",
  passkey_retrieval_cancelled: "cancelled",
  passkey_operation_aborted: "cancelled",
  passkey_already_exists: "exists",
  passkey_not_supported: "unsupported",
  passkey_pa_not_supported: "unsupported",
  passkey_invalid_rp: "unsupported",
};
// The browser's own names for a sheet that was closed or timed out.
const CANCELLED_NAMES = ["NotAllowedError", "AbortError"];

// Clerk's errors carry a code, or a list of errors each with one; the browser's carry a
// name. Anything else failed, and is said so.
export function passkeyFailure(error: unknown): PasskeyFailure {
  const e = error as {
    code?: unknown;
    name?: unknown;
    errors?: { code?: unknown }[];
  } | null;
  const codes = [
    e?.code,
    ...(Array.isArray(e?.errors) ? e.errors.map((x) => x?.code) : []),
  ];
  for (const code of codes) {
    if (typeof code === "string" && Object.hasOwn(BY_CODE, code)) return BY_CODE[code]!;
  }
  return typeof e?.name === "string" && CANCELLED_NAMES.includes(e.name)
    ? "cancelled"
    : "failed";
}

// The browser's own ways of not offering a passkey at all: none to offer, none it can make,
// or an address it will not use one at. Clerk's names for them, then the browser's.
const NOT_OFFERED = new Set([
  "passkey_retrieval_failed",
  "passkey_not_supported",
  "passkey_pa_not_supported",
  "passkey_invalid_rp",
]);
const NOT_OFFERED_NAMES = ["NotSupportedError", "SecurityError"];

// Whether the sign-in field's own passkey offer, the one it makes unseen as the page loads,
// has anything to tell the person when it ends without a sign-in. Only a passkey they picked
// and Clerk refused: a browser with none to offer fails that request at once (seen in the
// Clerk suite, 2026-11-23), and a person who asked for nothing is told nothing.
export function fieldOfferSays(error: unknown): boolean {
  if (passkeyFailure(error) === "cancelled") return false;
  const e = error as {
    code?: unknown;
    name?: unknown;
    errors?: { code?: unknown }[];
  } | null;
  const codes = [
    e?.code,
    ...(Array.isArray(e?.errors) ? e.errors.map((x) => x?.code) : []),
  ];
  if (codes.some((code) => typeof code === "string" && NOT_OFFERED.has(code)))
    return false;
  return !(typeof e?.name === "string" && NOT_OFFERED_NAMES.includes(e.name));
}
