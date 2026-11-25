// The invitation message an admin sends from their own WhatsApp (people/invitation.ts).
import { describe, expect, it } from "vitest";

import { whatsAppLink } from "@trader/api/contract";

import { invitationText } from "../src/app/(office)/people/invitation";

describe("the invitation message", () => {
  const text = invitationText({
    name: "Luis Herrera",
    company: "Bluebird Painting",
    url: "https://bluebirdpainting.jpteq.app/get",
  });

  it("is in English and in Spanish, each with the name, the company and the link", () => {
    const [english, spanish, ...more] = text.split("\n\n");
    expect(more).toEqual([]);
    for (const part of [english!, spanish!]) {
      expect(part).toContain("Luis Herrera");
      expect(part).toContain("Bluebird Painting");
      expect(part).toContain("https://bluebirdpainting.jpteq.app/get");
    }
    expect(english).toContain("Get the app");
    expect(spanish).toContain("Obtén la aplicación");
    expect(english).not.toBe(spanish);
  });

  it("opens WhatsApp on the person's number with the words written", () => {
    const link = whatsAppLink("+14015550100", text)!;
    expect(link.startsWith("https://wa.me/14015550100?text=")).toBe(true);
    // The words survive the trip through a link whole: spaces, accents, a line break.
    expect(decodeURIComponent(link.slice("https://wa.me/14015550100?text=".length))).toBe(
      text,
    );
    expect(link).not.toContain(" ");
    expect(link).not.toContain("\n");
  });
});
