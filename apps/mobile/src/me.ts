// What Me works out apart from the screen: the contact phone's loading, and its three pairs.
// Pure but for the fetch it is handed, so it is tested with nothing of a device beneath it.
import { shownSignInPhone } from "@trader/api/contract";

import type { Language } from "./i18n/catalog";

// What the server answers for Me: the person's own name and contact phone, which they edit,
// and the sign-in addresses and role, which only the office changes.
export type Contact = {
  name: string;
  phone: string | null;
  role: "admin" | "worker";
  email: string | null;
  signInPhone: string | null;
};
export type ContactLoad =
  { phase: "loading" } | { phase: "failed" } | { phase: "loaded"; contact: Contact };

// The contact phone comes only from the server. Me calls this as it comes into focus, as the
// app comes back to the front, and on Try again: it asks until the server has answered once,
// one question at a time, and after that never again, so a later focus leaves what the
// person is typing alone.
export function contactLoader(
  fetch: () => Promise<Contact>,
  told: (state: ContactLoad) => void,
): () => Promise<void> {
  let loaded = false;
  let asking = false;
  return async () => {
    if (loaded || asking) return;
    asking = true;
    told({ phase: "loading" });
    try {
      const contact = await fetch();
      loaded = true;
      told({ phase: "loaded", contact });
    } catch {
      told({ phase: "failed" });
    } finally {
      asking = false;
    }
  };
}

export type Side<T extends string> = { value: T; selected: boolean };

const pair = <T extends string>(values: readonly [T, T], chosen: T): Side<T>[] =>
  values.map((value) => ({ value, selected: value === chosen }));

// Me's three pairs, each read as two radio buttons with the chosen side selected: the
// language; reminders, off until turned on; and Face ID or fingerprint, absent where this
// phone can hold no key.
export function mePairs(input: {
  language: Language;
  reminders: "on" | "off" | null;
  key: "on" | "off" | "absent";
}) {
  return {
    language: pair(["en", "es"] as const, input.language),
    reminders: pair(["on", "off"] as const, input.reminders === "on" ? "on" : "off"),
    key: input.key === "absent" ? null : pair(["on", "off"] as const, input.key),
  };
}

// The addresses a person signs in with, as Me shows them: read-only, the number first, each
// with who changes it. The office changes a worker's; TRADER's support an admin's, since
// no one in the company is above them.
export type SignInRow = {
  kind: "phone" | "email";
  value: string;
  changedBy: "office" | "support";
};
export function signInRows(contact: Contact): SignInRow[] {
  const changedBy = contact.role === "admin" ? "support" : "office";
  const rows: SignInRow[] = [];
  if (contact.signInPhone !== null)
    rows.push({ kind: "phone", value: shownSignInPhone(contact.signInPhone), changedBy });
  if (contact.email !== null)
    rows.push({ kind: "email", value: contact.email, changedBy });
  return rows;
}

// The contact phone as Me shows it once loaded: a United States number, ten digits with or
// without its 1 or +1, as it is said aloud; anything else as it was typed.
export function shownContactPhone(stored: string | null): string {
  if (stored === null) return "";
  const digits = stored.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 && /^[+\d\s().-]+$/.test(stored)
    ? shownSignInPhone(`+1${national}`)
    : stored;
}
