// What a field says when the browser finds it wrong as its form is sent: the office's own
// sentence in the person's language, in place of the browser's bubble, which speaks the
// browser's language whatever the office's (field.tsx). An empty required field, an email
// that is not one, and anything else a control's own rules refuse.
import type { Catalog } from "./i18n/en";

export function refusalOf(
  validity: Pick<ValidityState, "valueMissing" | "typeMismatch">,
  t: Catalog,
): string {
  if (validity.valueMissing) return t.fieldRefusal.missing;
  // The office's only typed fields that can mismatch are emails.
  if (validity.typeMismatch) return t.fieldRefusal.email;
  return t.fieldRefusal.other;
}
