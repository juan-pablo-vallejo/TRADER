// The invitation message an admin sends from their own phone (people/invitation.ts).
import { describe, expect, it } from "vitest";

import { invitationText, isPhone, smsLink } from "../src/app/(office)/people/invitation";

describe("the invitation message", () => {
  const text = invitationText({
    name: "Luis Herrera",
    company: "D Sierra Painting",
    url: "https://dsierrapainting.jpteq.app/get",
  });

  it("is in English and in Spanish, each with the name, the company and the link", () => {
    const [english, spanish, ...more] = text.split("\n\n");
    expect(more).toEqual([]);
    for (const part of [english!, spanish!]) {
      expect(part).toContain("Luis Herrera");
      expect(part).toContain("D Sierra Painting");
      expect(part).toContain("https://dsierrapainting.jpteq.app/get");
    }
    expect(english).toContain("Get the app");
    expect(spanish).toContain("Obtén la aplicación");
    expect(english).not.toBe(spanish);
  });

  it("opens the phone's messages on the person's number with the words written", () => {
    const link = smsLink("+14015550100", text);
    expect(link.startsWith("sms:+14015550100?&body=")).toBe(true);
    // The words survive the trip through a link whole: spaces, accents, a line break.
    expect(decodeURIComponent(link.slice("sms:+14015550100?&body=".length))).toBe(text);
    expect(link).not.toContain(" ");
    expect(link).not.toContain("\n");
    // A number as it is shown still dials.
    expect(smsLink("(401) 555-0100", "x")).toBe("sms:4015550100?&body=x");
  });

  it("is a link only on a phone", () => {
    expect(isPhone("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe(true);
    expect(isPhone("Mozilla/5.0 (Linux; Android 16; Pixel 9)")).toBe(true);
    expect(isPhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
    expect(isPhone("")).toBe(false);
  });
});
