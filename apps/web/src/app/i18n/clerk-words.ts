// What Clerk's own form says, in the office's words. The form is Clerk's prebuilt one
// ((auth)/sign-in), so its sentences are Clerk's: this puts the office's catalog entry
// under each of Clerk's keys that the sign-in page needs to say differently, and leaves
// every other sentence Clerk's. A test holds each key to one Clerk's own English still has
// (test/clerk-words.test.ts): a key Clerk renames would otherwise go quiet.
//
// Not overridden: `formButtonPrimary`, "Continue". It is the one label of the main button
// on every step of every Clerk form, so "Send me a code" there would also be the code
// step's button.
import { esMX } from "@clerk/localizations";
import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

import type { Catalog } from "./en";
import type { Language } from "./language";

export type ClerkWords = NonNullable<
  ComponentProps<typeof ClerkProvider>["localization"]
>;

export function clerkOverrides(t: Catalog): ClerkWords {
  const s = t.signInForm;
  return {
    formFieldLabel__phoneNumber: s.mobileNumber,
    signIn: {
      start: {
        title: t.teamSignIn,
        subtitle: s.helper,
        actionLink__use_email: s.useEmail,
        actionLink__use_phone: s.usePhone,
      },
      phoneCode: { title: s.codeTitle, subtitle: s.codeTexted, resendButton: s.resend },
      emailCode: { title: s.codeTitle, subtitle: s.codeEmailed, resendButton: s.resend },
      alternativeMethods: {
        blockButton__phoneCode: s.textCodeTo,
        blockButton__emailCode: s.emailCodeTo,
        // Clerk's "Get help" card: the page's own Trouble signing in?, in the same words.
        actionLink: s.trouble,
        getHelp: {
          title: s.trouble,
          content: [s.troubleNoCode, s.troubleNewDevice, s.troubleNeverInvited].join(" "),
        },
      },
    },
    unstable__errors: {
      // One sentence for a number or an email Clerk does not know, the same one the
      // office says to a session no roster holds: neither says more than "ask the office".
      form_identifier_not_found: t.notOnRoster,
      form_code_incorrect: s.codeWrong,
    },
  };
}

type Tree = { [key: string]: unknown };
const isTree = (value: unknown): value is Tree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// `over` laid on `base`, branch by branch: a sentence replaces a sentence, and a branch
// keeps every sentence `over` does not name.
export function laidOver<T>(base: T, over: unknown): T {
  if (!isTree(base) || !isTree(over)) return (over === undefined ? base : over) as T;
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = laidOver(out[key], value);
  return out as T;
}

// Clerk's localization for a request. English is Clerk's own default, which it lays ours
// over itself; its Spanish is the Latin American one, as the crew's is.
export function clerkWords(language: Language, t: Catalog): ClerkWords {
  const ours = clerkOverrides(t);
  return language === "es" ? laidOver<ClerkWords>(esMX, ours) : ours;
}
