// When Today offers a passkey, and what a failed attempt is called (passkey-rules.ts).
import { describe, expect, it } from "vitest";

import {
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
