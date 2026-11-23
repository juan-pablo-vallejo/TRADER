// What the two sign-in forms share: the office's (apps/web, (auth)/sign-in) and the phone
// app's. Each is its own screen on the identity provider's hooks; what a person typed, and
// what a refusal means, are read here so both read them the same. Pure, and only zod
// beneath it, as the rest of the contract is.
import { z } from "zod";

// A sign-in number as the roster holds it: E.164, `+1` and ten digits. People type it with
// spaces, dashes, brackets, with or without the 1.
export function signInPhone(typed: string): string | null {
  const digits = typed.replace(/[\s().-]/g, "");
  const national = /^\+1\d{10}$/.test(digits)
    ? digits.slice(2)
    : /^1\d{10}$/.test(digits)
      ? digits.slice(1)
      : /^\d{10}$/.test(digits)
        ? digits
        : null;
  // A North American number's area code and exchange never begin with 0 or 1.
  return national !== null && /^[2-9]\d{2}[2-9]\d{6}$/.test(national)
    ? `+1${national}`
    : null;
}

const emailAddress = z.email().max(254);

export type SignInIdentifier =
  { kind: "phone"; phone: string } | { kind: "email"; email: string };

// The one field of a sign-in form takes a mobile number or an email. Anything with an `@`
// is read as an email, lowercased as the server compares it; anything else as a number.
// Null where it is neither: the form says so before the provider is asked anything.
export function signInIdentifier(typed: string): SignInIdentifier | null {
  const text = typed.trim();
  if (text.includes("@")) {
    const email = emailAddress.safeParse(text.toLowerCase());
    return email.success ? { kind: "email", email: email.data } : null;
  }
  const phone = signInPhone(text);
  return phone === null ? null : { kind: "phone", phone };
}

// A code is six digits, and another may be asked for after half a minute: the provider's
// own form waits the same.
export const SIGN_IN_CODE_LENGTH = 6;
export const SIGN_IN_RESEND_SECONDS = 30;

// What was typed into the code field, as the digits of it and no more than a code holds: a
// pasted "123 456" is the code, and a seventh key does nothing.
export const signInCode = (typed: string): string =>
  typed.replace(/\D/g, "").slice(0, SIGN_IN_CODE_LENGTH);

// Why a sign-in step was refused, as the form says it. `unknown` is one answer for every
// way an address is not somebody's: the forms never say whether a number or an email
// exists, only to ask the office.
export const SIGN_IN_FAILURES = [
  "unknown",
  "wrong_code",
  "expired_code",
  "too_many",
  "locked",
  "failed",
] as const;
export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

// The provider's error codes (Clerk's Frontend API), each as one of those. A code not
// listed, and no code at all (the request never arrived), is `failed`: try again.
const FAILURE_OF: Record<string, SignInFailure> = {
  form_identifier_not_found: "unknown",
  form_param_format_invalid: "unknown",
  strategy_for_user_invalid: "unknown",
  not_allowed_access: "unknown",
  external_account_not_found: "unknown",
  form_code_incorrect: "wrong_code",
  verification_expired: "expired_code",
  verification_failed: "too_many",
  too_many_requests: "too_many",
  user_locked: "locked",
};

export const signInFailure = (code: string | null | undefined): SignInFailure =>
  (code != null && Object.hasOwn(FAILURE_OF, code) ? FAILURE_OF[code] : undefined) ??
  "failed";
