// An invitation's words, the same by text and by email, and where an invitation stands.
import { describe, expect, it } from "vitest";

import {
  invitationParagraphs,
  invitationStatus,
  invitationSubject,
} from "../../src/contract";

describe("an invitation's words", () => {
  const input = {
    name: "Ana Ruiz",
    company: "Bluebird Painting",
    url: "https://bluebirdpainting.jpteq.app/get",
  };

  it("say the same thing in English and in Spanish, with the link", () => {
    const [english, spanish] = invitationParagraphs({ ...input, by: "whatsapp" });
    expect(english).toBe(
      "Ana Ruiz: Bluebird Painting uses TRADER for your schedule and your hours. Get the app: https://bluebirdpainting.jpteq.app/get Then sign in with this mobile number.",
    );
    expect(spanish).toBe(
      "Ana Ruiz: Bluebird Painting usa TRADER para tu horario y tus horas. Obtén la aplicación: https://bluebirdpainting.jpteq.app/get Después inicia sesión con este número de celular.",
    );
  });

  it("name the address the person signs in with: the one the invitation went to", () => {
    const [english, spanish] = invitationParagraphs({ ...input, by: "email" });
    expect(english).toMatch(/Then sign in with this email address\.$/);
    expect(spanish).toMatch(/Después inicia sesión con este correo\.$/);
    expect(english).not.toContain("mobile number");
    expect(spanish).not.toContain("celular");
  });

  it("have a subject in both languages", () => {
    expect(invitationSubject("Bluebird Painting")).toBe(
      "Bluebird Painting: get the TRADER app / obtén la aplicación TRADER",
    );
  });
});

describe("where an invitation stands", () => {
  const person = { signedIn: false, email: "Ana@Crew.test", signInPhone: "+14015550123" };
  const text = {
    channel: "whatsapp",
    recipient: "+14015550123",
    outcome: "sent",
  } as const;
  const email = {
    channel: "email",
    recipient: "ana@crew.test",
    outcome: "sent",
  } as const;

  it("is not sent until something went to an address the person has", () => {
    expect(invitationStatus({ ...person, sends: [] })).toBe("not_sent");
    expect(invitationStatus({ ...person, sends: [text] })).toBe("sent");
    // An email is compared as People compares it, whatever its case.
    expect(invitationStatus({ ...person, sends: [email] })).toBe("sent");
  });

  it("does not count a send that failed, or one to an address since changed", () => {
    expect(
      invitationStatus({ ...person, sends: [{ ...email, outcome: "failed" }] }),
    ).toBe("not_sent");
    expect(
      invitationStatus({ ...person, sends: [{ ...text, recipient: "+14015550199" }] }),
    ).toBe("not_sent");
    expect(invitationStatus({ ...person, signInPhone: null, sends: [text] })).toBe(
      "not_sent",
    );
    expect(invitationStatus({ ...person, email: null, sends: [email] })).toBe("not_sent");
    // A number is never matched against an email's send, or the reverse.
    expect(
      invitationStatus({
        ...person,
        sends: [{ channel: "email", recipient: "+14015550123", outcome: "sent" }],
      }),
    ).toBe("not_sent");
  });

  it("is verified once the person has signed in, whatever was or was not sent", () => {
    expect(invitationStatus({ ...person, signedIn: true, sends: [] })).toBe("verified");
    expect(invitationStatus({ ...person, signedIn: true, sends: [text] })).toBe(
      "verified",
    );
  });
});
