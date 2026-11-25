// The phone's sign-in, as steps: one field for a mobile number or an email, then the code
// sent to it, another code after half a minute, and the Demo door. What was typed and what a
// refusal means are read by the functions the office's form shares (`@trader/api/contract`,
// sign-in.ts). No React and no identity provider here: each step is handed a `Provider`,
// Clerk's on a build with its key and the development stand-in otherwise
// (sign-in-provider.ts), so the screen (ui/phone-sign-in.tsx) and its tests drive the same
// steps.
import {
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_RESEND_SECONDS,
  signInCode,
  signInFailure,
  signInIdentifier,
  signInPhone,
  type SignInFailure,
  type SignInIdentifier,
} from "@trader/api/contract";

import type { Session } from "./session";

// One answer from the provider: done, or refused with its own error code (none when the
// request never arrived).
export type Answer = { ok: true } | { ok: false; code: string | undefined };

export type Provider = {
  // A session the provider still keeps on the phone from before. Its keychain outlives a
  // cleared app, and an earlier sign-in may have stopped half-way: the provider then
  // refuses a new one as "already signed in" (seen on staging, 2026-11-19).
  forgetStale(): Promise<void>;
  sendCode(to: SignInIdentifier): Promise<Answer>;
  verifyCode(to: SignInIdentifier, code: string): Promise<Answer>;
  // A single-use ticket from the Demo door.
  redeem(ticket: string): Promise<Answer>;
  // A sign-in the provider has verified, made the phone's session.
  finish(to: SignInIdentifier | null): Promise<Session>;
  // Google by the phone's own browser sheet, or Apple's own sheet on an iPhone: a session,
  // or why not. `hint` is what the field holds, which only the development stand-in reads.
  social(kind: Social, hint: string): Promise<SocialAnswer>;
};

export type Social = "google" | "apple";

export type SocialAnswer =
  | { ok: true; session: Session }
  // `cancelled`: the person closed the sheet, which says nothing.
  | { ok: false; code: string | undefined; cancelled: boolean };

// What the form says under its field: a refusal, by name; a field that is neither a number
// nor an email; a Demo number and code the door did not take.
export type Note = SignInFailure | "bad_address" | "bad_demo";

export type Form =
  { at: "field" } | { at: "code"; to: SignInIdentifier; sentAt: number } | { at: "demo" };

export const FIELD: Form = { at: "field" };

// Whether the keyboard stays up after a refusal: where typing again can help, a wrong code
// above all, it does; where it cannot, it goes, so what can (Send another code, the trouble
// lines) is in view, as on Android it would stay under the keyboard.
export const keepsKeyboard = (note: Note): boolean =>
  note !== "expired_code" && note !== "too_many" && note !== "locked";

// A step's outcome: where the form is now, and what it says.
export type Step = { form: Form; note: Note | null };

const refused = (form: Form, answer: { code: string | undefined }): Step => ({
  form,
  note: signInFailure(answer.code),
});

// Send me a code: the field read first, so a typing mistake is said without asking the
// provider anything; a stale session ended before a new sign-in starts.
export async function sendCode(p: Provider, typed: string, now: number): Promise<Step> {
  const to = signInIdentifier(typed);
  if (to === null) return { form: FIELD, note: "bad_address" };
  await p.forgetStale();
  const sent = await p.sendCode(to);
  return sent.ok
    ? { form: { at: "code", to, sentAt: now }, note: null }
    : refused(FIELD, sent);
}

// Seconds until another code may be asked for, rounded up so it never reads 0 too soon.
export const secondsLeft = (sentAt: number, now: number): number =>
  Math.max(0, Math.ceil((sentAt + SIGN_IN_RESEND_SECONDS * 1000 - now) / 1000));

// Send another code, once the half minute is up; before then nothing is asked.
export async function resend(
  p: Provider,
  form: Extract<Form, { at: "code" }>,
  now: number,
): Promise<Step> {
  if (secondsLeft(form.sentAt, now) > 0) return { form, note: null };
  const sent = await p.sendCode(form.to);
  return sent.ok ? { form: { ...form, sentAt: now }, note: null } : refused(form, sent);
}

// The code, once it has all its digits: the last one sends it, as the office's form does.
// `complete` is the provider's verified sign-in, for `finish` to make a session of.
export async function verifyCode(
  p: Provider,
  form: Extract<Form, { at: "code" }>,
  typed: string,
): Promise<Step | "complete" | "incomplete"> {
  const code = signInCode(typed);
  if (code.length < SIGN_IN_CODE_LENGTH) return "incomplete";
  const checked = await p.verifyCode(form.to, code);
  return checked.ok ? "complete" : refused(form, checked);
}

// The Demo door: the API answers the Demo company's person's number and the code the owner
// keeps with a single-use ticket, and every other try with one refusal that says nothing of
// which part was wrong (packages/api, core/demo-door.ts).
export async function demoDoor(
  p: Provider,
  ask: (phone: string, code: string) => Promise<{ ticket: string } | null>,
  typedPhone: string,
  typedCode: string,
): Promise<Step | "complete"> {
  const form: Form = { at: "demo" };
  const phone = signInPhone(typedPhone);
  if (phone === null) return { form, note: "bad_address" };
  if (typedCode.trim() === "") return { form, note: null };
  const answer = await ask(phone, typedCode.trim());
  if (answer === null) return { form, note: "bad_demo" };
  await p.forgetStale();
  const redeemed = await p.redeem(answer.ticket);
  return redeemed.ok ? "complete" : { form, note: "failed" };
}

// Google or Apple. An account no login holds comes back from the provider with no session
// (Clerk's answer is a sign-up, which is never completed here, and the instance refuses
// sign-ups besides): it is told to ask the office, as an unknown address is.
export async function socialSignIn(
  p: Provider,
  kind: Social,
  hint: string,
): Promise<Step | { session: Session }> {
  await p.forgetStale();
  const answer = await p.social(kind, hint);
  if (answer.ok) return { session: answer.session };
  if (answer.cancelled) return { form: FIELD, note: null };
  return { form: FIELD, note: answer.code === undefined ? "failed" : "unknown" };
}
