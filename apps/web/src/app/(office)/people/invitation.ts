// The invitation an admin sends from their own phone: a ready text message to the person's
// number, in English and Spanish since the office may not know which they read, with the
// link to `/get`. Pure: the words, the link that opens the phone's own messages on them,
// and whether this is a phone at all. Nothing is sent by TRADER: the admin presses Send in
// their own messages, or copies the text on a desktop. The words are the ones an emailed
// invitation carries too (packages/api, contract/invitation.ts).
import { invitationParagraphs } from "@trader/api/contract";

export function invitationText(input: {
  name: string;
  company: string;
  // Where the app is got from: this host's `/get`.
  url: string;
}): string {
  return invitationParagraphs({ ...input, by: "whatsapp" }).join("\n\n");
}

// A link that opens the phone's messages on a new text to a number, with the words
// written. `?&body=` is the one spelling both iPhones and Android phones read.
export function smsLink(number: string, text: string): string {
  return `sms:${number.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
}

// Whether the browser says it is a phone: only there does a text-message link go anywhere.
export const isPhone = (userAgent: string): boolean =>
  /android|iphone|ipod/i.test(userAgent);
