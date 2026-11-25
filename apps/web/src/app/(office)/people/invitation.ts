// The invitation an admin sends from their own WhatsApp: a ready message to the person's
// number, in English and Spanish since the office may not know which they read, with the
// link to `/get`. Nothing is sent by TRADER: the admin presses Send in WhatsApp, or copies
// the message. The words are the ones an emailed invitation carries too (packages/api,
// contract/invitation.ts).
import { invitationParagraphs } from "@trader/api/contract";

export function invitationText(input: {
  name: string;
  company: string;
  // Where the app is got from: this host's `/get`.
  url: string;
}): string {
  return invitationParagraphs({ ...input, by: "whatsapp" }).join("\n\n");
}
