// An invitation's words, and where an invitation stands. The words are the same whether
// they go as a text from the admin's own phone (apps/web, people/invitation.ts) or as an
// email TRADER sends (people/invitation.ts): in English and Spanish, since the office may
// not know which the person reads, with the link to where the app is got. Pure, so the
// browser and the server say exactly the same thing.

// The two ways an invitation goes out. `text` is the admin's own phone; `email` is TRADER's.
export const INVITATION_CHANNELS = ["text", "email"] as const;
export type InvitationChannel = (typeof INVITATION_CHANNELS)[number];

// Each language's paragraph. The last sentence names the address the person signs in
// with, which is the one the invitation went to.
export function invitationParagraphs(input: {
  name: string;
  company: string;
  // Where the app is got from: a host's `/get`.
  url: string;
  by: InvitationChannel;
}): [english: string, spanish: string] {
  const { name, company, url, by } = input;
  return [
    `${name}: ${company} uses TRADER for your schedule and your hours. Get the app: ${url} Then sign in with this ${by === "text" ? "mobile number" : "email address"}.`,
    `${name}: ${company} usa TRADER para tu horario y tus horas. Obtén la aplicación: ${url} Después inicia sesión con este ${by === "text" ? "número de celular" : "correo"}.`,
  ];
}

// An emailed invitation's subject, in both languages on one line.
export const invitationSubject = (company: string): string =>
  `${company}: get the TRADER app / obtén la aplicación TRADER`;

// Where an invitation stands, for the office. Worked out, never stored:
// `verified` once the person has signed in, which is the proof that an address is theirs;
// `sent` when an invitation went to an address they still have; `not_sent` otherwise.
export const INVITATION_STATUSES = ["not_sent", "sent", "verified"] as const;
type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export function invitationStatus(person: {
  // Whether a sign-in has been bound to the person's roster row.
  signedIn: boolean;
  email: string | null;
  signInPhone: string | null;
  sends: readonly { channel: InvitationChannel; recipient: string; outcome: string }[];
}): InvitationStatus {
  if (person.signedIn) return "verified";
  // A send to an address since changed says nothing of the one they have now, and a send
  // that failed went nowhere.
  const reached = person.sends.some(
    (send) =>
      send.outcome === "sent" &&
      send.recipient ===
        (send.channel === "email" ? person.email?.toLowerCase() : person.signInPhone),
  );
  return reached ? "sent" : "not_sent";
}
