// When Face ID or fingerprint sign-in is offered, and what becomes of the key
// (biometric-rules.ts).
import { describe, expect, it } from "vitest";

import {
  canHoldKey,
  keySwitch,
  offersBiometric,
  offersKeySignIn,
  revokesKey,
  type Unavailable,
} from "../src/biometric-rules";

const fresh = {
  by: "code" as const,
  reason: "no_local_credential" as Unavailable | null,
  keyFor: null as string | null,
  declinedBy: null as string | null,
  who: "luis",
};

describe("the offer after a sign-in", () => {
  it("is made after a code sign-in on a phone that can hold a key and has none", () => {
    expect(offersBiometric(fresh)).toBe(true);
    for (const reason of [
      "local_key_missing",
      "server_credential_missing",
      "server_credential_revoked",
    ] as const) {
      expect([reason, offersBiometric({ ...fresh, reason })]).toEqual([reason, true]);
    }
  });

  it("is never made after a sign-in that was not by code, the Demo door's above all", () => {
    for (const by of ["biometric", "google", "apple", "demo"] as const) {
      expect([by, offersBiometric({ ...fresh, by })]).toEqual([by, false]);
    }
  });

  it("is not made where the phone or the build cannot", () => {
    for (const reason of [
      "environment_unavailable",
      "native_api_disabled",
      "feature_disabled",
      "unsupported_platform",
      "biometric_authentication_unavailable",
    ] as const) {
      expect([reason, offersBiometric({ ...fresh, reason })]).toEqual([reason, false]);
    }
  });

  it("remembers Not now for the person who said it, and no one else", () => {
    expect(offersBiometric({ ...fresh, declinedBy: "luis" })).toBe(false);
    expect(offersBiometric({ ...fresh, declinedBy: "ana" })).toBe(true);
  });

  it("offers a second person their own key, which replaces the first's", () => {
    const held = { ...fresh, reason: null, keyFor: "luis" };
    expect(offersBiometric(held)).toBe(false);
    expect(offersBiometric({ ...held, who: "ana" })).toBe(true);
  });
});

describe("the key's button and switch", () => {
  it("shows the sign-in button only where a key works", () => {
    expect(offersKeySignIn(null, "luis")).toBe(true);
    expect(offersKeySignIn(null, null)).toBe(false);
    expect(offersKeySignIn("no_local_credential", "luis")).toBe(false);
  });

  it("says on for this person's key, off for none or another's, and nothing where none can be", () => {
    expect(keySwitch(null, "luis", "luis")).toBe("on");
    expect(keySwitch(null, "ana", "luis")).toBe("off");
    expect(keySwitch("no_local_credential", null, "luis")).toBe("off");
    expect(keySwitch("unsupported_platform", null, "luis")).toBe("absent");
    expect(canHoldKey("feature_disabled")).toBe(false);
  });

  it("revokes the key when the server refuses a sign-in that came by it", () => {
    expect(revokesKey("biometric")).toBe(true);
    for (const by of ["code", "google", "apple", "demo"] as const) {
      expect([by, revokesKey(by)]).toEqual([by, false]);
    }
  });
});
