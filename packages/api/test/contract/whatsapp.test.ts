// Each way a number is typed, as the WhatsApp address both apps open.
import { describe, expect, it } from "vitest";

import { whatsAppLink } from "../../src/contract/whatsapp";

describe("whatsAppLink", () => {
  it("writes a number in full international form, a bare ten digits as a US number", () => {
    expect(whatsAppLink("(401) 555-0100")).toBe("https://wa.me/14015550100");
    expect(whatsAppLink("401.555.0100")).toBe("https://wa.me/14015550100");
    expect(whatsAppLink("1 401 555 0100")).toBe("https://wa.me/14015550100");
    expect(whatsAppLink("+1 401-555-0100 ext. 2")).toBe("https://wa.me/14015550100");
    expect(whatsAppLink("+34 612 345 678")).toBe("https://wa.me/34612345678");
    expect(whatsAppLink("Office: +1 (401) 555-0100")).toBe("https://wa.me/14015550100");
  });

  it("carries a ready message, and gives nothing for what holds no number", () => {
    expect(whatsAppLink("+14015550100", "Hi & welcome: get the app")).toBe(
      "https://wa.me/14015550100?text=Hi%20%26%20welcome%3A%20get%20the%20app",
    );
    for (const none of [null, "", "call the office", "555-01"])
      expect([none, whatsAppLink(none)]).toEqual([none, null]);
  });
});
