// What the two sign-in forms share: the one field read as a number or an email, the code
// as typed, and a refusal named.
import { describe, expect, it } from "vitest";

import {
  SIGN_IN_FAILURES,
  signInCode,
  signInFailure,
  signInIdentifier,
  signInPhone,
} from "../../src/contract";

describe("signInPhone", () => {
  it("reads the ways people type a number", () => {
    for (const typed of [
      "4015550123",
      "401 555 0123",
      "(401) 555-0123",
      "401.555.0123",
      "1 401 555 0123",
      "+1 (401) 555-0123",
    ]) {
      expect([typed, signInPhone(typed)]).toEqual([typed, "+14015550123"]);
    }
  });

  it("refuses what is not a North American number", () => {
    for (const typed of [
      "",
      "555 0123",
      "401555012",
      "40155501234",
      "+44 20 7946 0958",
      "0015550123",
      "401 155 0123",
      "4O1 555 0123",
      "+1 401 555 0123 x2",
    ]) {
      expect([typed, signInPhone(typed)]).toEqual([typed, null]);
    }
  });
});

describe("the one sign-in field", () => {
  it("takes a mobile number, however it is typed", () => {
    for (const typed of ["4015550123", " (401) 555-0123 ", "+1 401 555 0123"]) {
      expect([typed, signInIdentifier(typed)]).toEqual([
        typed,
        { kind: "phone", phone: "+14015550123" },
      ]);
    }
  });

  it("takes an email, lowercased as the server compares it", () => {
    expect(signInIdentifier("  Ana.Ruiz@Example.com ")).toEqual({
      kind: "email",
      email: "ana.ruiz@example.com",
    });
  });

  it("refuses what is neither, and never reads a bad email as a number", () => {
    for (const typed of [
      "",
      "   ",
      "ana",
      "401555",
      "ana@",
      "@example.com",
      "ana ruiz@example.com",
      // An `@` makes it an email, so the digits beside it are not tried as a number.
      "4015550123@",
      `${"a".repeat(250)}@example.com`,
    ]) {
      expect([typed, signInIdentifier(typed)]).toEqual([typed, null]);
    }
  });
});

describe("the code as typed", () => {
  it("is its digits, six at most", () => {
    expect(signInCode("123456")).toBe("123456");
    expect(signInCode("123 456")).toBe("123456");
    expect(signInCode("12-34-56-78")).toBe("123456");
    expect(signInCode("12ab")).toBe("12");
    expect(signInCode("")).toBe("");
  });
});

describe("a refusal, as the form says it", () => {
  it("gives every way an address is nobody's the same answer", () => {
    for (const code of [
      "form_identifier_not_found",
      "form_param_format_invalid",
      "strategy_for_user_invalid",
      "not_allowed_access",
      "external_account_not_found",
    ]) {
      expect([code, signInFailure(code)]).toEqual([code, "unknown"]);
    }
  });

  it("tells a wrong code from an expired one, and too many tries from a lock", () => {
    expect(signInFailure("form_code_incorrect")).toBe("wrong_code");
    expect(signInFailure("verification_expired")).toBe("expired_code");
    expect(signInFailure("verification_failed")).toBe("too_many");
    expect(signInFailure("too_many_requests")).toBe("too_many");
    expect(signInFailure("user_locked")).toBe("locked");
  });

  it("is a plain failure for a code it does not know, and for none", () => {
    for (const code of [
      undefined,
      null,
      "",
      "something_new",
      "constructor",
      "toString",
    ]) {
      expect([code, signInFailure(code)]).toEqual([code, "failed"]);
    }
    expect(new Set(SIGN_IN_FAILURES).size).toBe(SIGN_IN_FAILURES.length);
  });
});
