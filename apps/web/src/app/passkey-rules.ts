// The rules of a passkey in the office, apart from Clerk and the browser so they can be
// tested: when Today offers one, and what a failed attempt is called. Clerk asks that a
// person has signed in within the last ten minutes before a passkey is added or removed
// ("Add/remove passkey", its reverification table, read 2026-11-23), so the offer is made
// only while that holds, and later the screen says to sign in again. Consumed by
// clerk-passkeys.tsx and the sign-in form.

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
