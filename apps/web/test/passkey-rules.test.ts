// When Today offers a passkey, and what a failed attempt is called (passkey-rules.ts).
import { describe, expect, it } from "vitest";

import {
  fieldOfferSays,
  offersPasskey,
  PASSKEY_OFFER_DECLINED,
  passkeyFailure,
  REVERIFICATION_MINUTES,
} from "../src/app/passkey-rules";

describe("the passkey offer on Today", () => {
  const fresh = { supported: true, passkeys: 0, minutesSinceSignIn: 1, remembered: null };

  it("is made to someone who has just signed in and has none", () => {
    expect(offersPasskey(fresh)).toBe(true);
    expect(offersPasskey({ ...fresh, minutesSinceSignIn: 0 })).toBe(true);
  });

  it("is not made where it could not be taken up, or was turned down", () => {
    for (const not of [
      { supported: false },
      { passkeys: 1 },
      // Clerk would ask for a newer sign-in: an offer that ends in "sign in again" is
      // no offer.
      { minutesSinceSignIn: REVERIFICATION_MINUTES },
      { minutesSinceSignIn: 600 },
      { minutesSinceSignIn: null },
      { remembered: PASSKEY_OFFER_DECLINED },
    ]) {
      expect([not, offersPasskey({ ...fresh, ...not })]).toEqual([not, false]);
    }
    // Something else under the key is not a "Not now".
    expect(offersPasskey({ ...fresh, remembered: "yes" })).toBe(true);
  });
});

describe("why a passkey was not added, removed or used", () => {
  it("reads Clerk's code, alone or in its list", () => {
    for (const [code, failure] of [
      ["session_reverification_required", "sign_in_again"],
      ["passkey_registration_cancelled", "cancelled"],
      ["passkey_retrieval_cancelled", "cancelled"],
      ["passkey_operation_aborted", "cancelled"],
      ["passkey_already_exists", "exists"],
      ["passkey_not_supported", "unsupported"],
      ["passkey_pa_not_supported", "unsupported"],
      ["passkey_invalid_rp", "unsupported"],
      ["something_new", "failed"],
    ] as const) {
      expect([code, passkeyFailure({ code })]).toEqual([code, failure]);
      expect([code, passkeyFailure({ errors: [{ code }] })]).toEqual([code, failure]);
    }
  });

  it("reads the browser's closed sheet as cancelled, and anything else as failed", () => {
    expect(passkeyFailure(new DOMException("no", "NotAllowedError"))).toBe("cancelled");
    expect(passkeyFailure(new DOMException("no", "AbortError"))).toBe("cancelled");
    expect(passkeyFailure(new Error("network"))).toBe("failed");
    for (const nothing of [null, undefined, "text", 5, { code: "toString" }]) {
      expect(passkeyFailure(nothing)).toBe("failed");
    }
  });
});

// The sign-in field asks the browser for a passkey by itself, unseen, as the page loads
// (sign-in-form.tsx). Seen in the Clerk suite, 2026-11-23: in a browser with no passkey to
// offer, that request fails at once, and the form told a person who had asked for nothing
// that "that passkey did not work", over the answer to the code they had asked for.
describe("what the sign-in field's own passkey offer says when it fails", () => {
  it("says nothing when the browser could not offer one, or the offer was set aside", () => {
    for (const code of [
      "passkey_retrieval_failed",
      "passkey_retrieval_cancelled",
      "passkey_operation_aborted",
      "passkey_not_supported",
      "passkey_pa_not_supported",
      "passkey_invalid_rp",
    ]) {
      expect([code, fieldOfferSays({ code })]).toEqual([code, false]);
      expect([code, fieldOfferSays({ errors: [{ code }] })]).toEqual([code, false]);
    }
    expect(fieldOfferSays(new DOMException("no", "NotAllowedError"))).toBe(false);
    expect(fieldOfferSays(new DOMException("no", "NotSupportedError"))).toBe(false);
  });

  it("says so when a passkey the person picked was refused", () => {
    expect(fieldOfferSays({ errors: [{ code: "passkey_not_found" }] })).toBe(true);
    expect(fieldOfferSays({ code: "form_identifier_not_found" })).toBe(true);
    expect(fieldOfferSays(new Error("network"))).toBe(true);
  });
});
