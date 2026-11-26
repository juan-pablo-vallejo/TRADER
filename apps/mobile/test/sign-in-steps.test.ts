// The phone's sign-in steps (sign-in-steps.ts) against a provider that records what it was
// asked, in order, and answers what each test says.
import { describe, expect, it } from "vitest";

import {
  demoDoor,
  FIELD,
  keepsKeyboard,
  resend,
  secondsLeft,
  sendCode,
  socialSignIn,
  verifyCode,
  type SocialAnswer,
  type Answer,
  type Form,
  type Provider,
} from "../src/sign-in-steps";

const OK: Answer = { ok: true };
const no = (code: string | undefined): Answer => ({ ok: false, code });

function provider(
  answers: Partial<Record<"send" | "verify" | "redeem", Answer>> & {
    social?: SocialAnswer;
  } = {},
) {
  const asked: string[] = [];
  const p: Provider = {
    forgetStale: async () => {
      asked.push("forgetStale");
    },
    sendCode: async (to) => {
      asked.push(`send ${to.kind === "phone" ? to.phone : to.email}`);
      return answers.send ?? OK;
    },
    verifyCode: async (_to, code) => {
      asked.push(`verify ${code}`);
      return answers.verify ?? OK;
    },
    redeem: async () => {
      asked.push("redeem");
      return answers.redeem ?? OK;
    },
    finish: async () => ({ kind: "clerk" }),
    social: async (kind) => {
      asked.push(`social ${kind}`);
      return answers.social ?? { ok: true, session: { kind: "clerk" } };
    },
  };
  return { p, asked };
}

const T0 = 1_800_000_000_000;
const AT_CODE: Extract<Form, { at: "code" }> = {
  at: "code",
  to: { kind: "phone", phone: "+14015550108" },
  sentAt: T0,
};

describe("the field", () => {
  it("takes a number or an email to the code step, a stale session ended first", async () => {
    for (const [typed, sent] of [
      ["(401) 555-0108", "send +14015550108"],
      [" Sam.Carter@Demo.Invalid ", "send sam.carter@demo.invalid"],
    ] as const) {
      const { p, asked } = provider();
      const step = await sendCode(p, typed, T0);
      expect(step.note).toBeNull();
      expect(step.form.at).toBe("code");
      expect(asked).toEqual(["forgetStale", sent]);
    }
  });

  it("says a typing mistake without asking the provider anything", async () => {
    for (const typed of ["", "555 0108", "sam@", "401 155 0108"]) {
      const { p, asked } = provider();
      expect(await sendCode(p, typed, T0)).toEqual({ form: FIELD, note: "bad_address" });
      expect(asked).toEqual([]);
    }
  });

  it("gives a number and an email no company has added the same one answer", async () => {
    const notes = [];
    for (const typed of ["401 555 0199", "nobody@example.com"]) {
      for (const code of ["form_identifier_not_found", "strategy_for_user_invalid"]) {
        const { p } = provider({ send: no(code) });
        const step = await sendCode(p, typed, T0);
        expect(step.form).toEqual(FIELD);
        notes.push(step.note);
      }
    }
    expect(new Set(notes)).toEqual(new Set(["unknown"]));
  });

  it("reads a request that never arrived, and a code Clerk has no name for, as failed", async () => {
    for (const code of [undefined, "something_new"]) {
      const { p } = provider({ send: no(code) });
      expect((await sendCode(p, "4015550108", T0)).note).toBe("failed");
    }
  });
});

describe("the code", () => {
  it("waits for every digit, then sends it", async () => {
    const { p, asked } = provider();
    expect(await verifyCode(p, AT_CODE, "12345")).toBe("incomplete");
    expect(asked).toEqual([]);
    expect(await verifyCode(p, AT_CODE, "123 456")).toBe("complete");
    expect(asked).toEqual(["verify 123456"]);
  });

  it("tells a wrong code from an expired one, and stays on the code step", async () => {
    for (const [code, note] of [
      ["form_code_incorrect", "wrong_code"],
      ["verification_expired", "expired_code"],
      ["verification_failed", "too_many"],
      ["user_locked", "locked"],
    ] as const) {
      const { p } = provider({ verify: no(code) });
      expect(await verifyCode(p, AT_CODE, "123456")).toEqual({ form: AT_CODE, note });
    }
  });
});

describe("another code", () => {
  it("is not asked for in the first half minute, and counts down to it", async () => {
    const { p, asked } = provider();
    expect(secondsLeft(T0, T0)).toBe(30);
    expect(secondsLeft(T0, T0 + 29_001)).toBe(1);
    expect(secondsLeft(T0, T0 + 30_000)).toBe(0);
    expect(await resend(p, AT_CODE, T0 + 29_000)).toEqual({ form: AT_CODE, note: null });
    expect(asked).toEqual([]);
  });

  it("is sent after it, and the half minute starts again", async () => {
    const { p, asked } = provider();
    const later = T0 + 31_000;
    expect(await resend(p, AT_CODE, later)).toEqual({
      form: { ...AT_CODE, sentAt: later },
      note: null,
    });
    expect(asked).toEqual(["send +14015550108"]);
  });
});

describe("the Demo door", () => {
  const door = (ticket: string | null) => async () =>
    ticket === null ? null : { ticket };

  it("redeems the door's ticket, a stale session ended first", async () => {
    const { p, asked } = provider();
    expect(await demoDoor(p, door("t1"), "401 555 0108", "the-code")).toBe("complete");
    expect(asked).toEqual(["forgetStale", "redeem"]);
  });

  it("says one thing for a number and code the door refused, and asks nothing more", async () => {
    const { p, asked } = provider();
    expect(await demoDoor(p, door(null), "401 555 0108", "wrong")).toEqual({
      form: { at: "demo" },
      note: "bad_demo",
    });
    expect(asked).toEqual([]);
  });

  it("reads the number first, and a ticket Clerk would not take as failed", async () => {
    const { p } = provider({ redeem: no("ticket_invalid") });
    expect((await demoDoor(p, door("t1"), "555", "c")) as unknown).toEqual({
      form: { at: "demo" },
      note: "bad_address",
    });
    expect(await demoDoor(p, door("t1"), "401 555 0108", "c")).toEqual({
      form: { at: "demo" },
      note: "failed",
    });
  });
});

describe("Google and Apple", () => {
  it("make a session, a stale one ended first", async () => {
    const { p, asked } = provider();
    expect(await socialSignIn(p, "google", "")).toEqual({ session: { kind: "clerk" } });
    expect(asked).toEqual(["forgetStale", "social google"]);
  });

  it("tell an account no login holds to ask the office, and say nothing of a closed sheet", async () => {
    for (const code of ["external_account_not_found", "not_allowed_access", "sign_up"]) {
      const { p } = provider({ social: { ok: false, code, cancelled: false } });
      expect(await socialSignIn(p, "google", "")).toEqual({
        form: FIELD,
        note: "unknown",
      });
      // Apple's own note: its email may be hidden, and the person can change that.
      expect(await socialSignIn(p, "apple", "")).toEqual({
        form: FIELD,
        note: "apple_unknown",
      });
    }
    const closed = provider({ social: { ok: false, code: "cancel", cancelled: true } });
    expect(await socialSignIn(closed.p, "google", "")).toEqual({
      form: FIELD,
      note: null,
    });
    const lost = provider({ social: { ok: false, code: undefined, cancelled: false } });
    expect(await socialSignIn(lost.p, "google", "")).toEqual({
      form: FIELD,
      note: "failed",
    });
  });
});

describe("the keyboard after a refusal", () => {
  it("stays for a wrong code, so the next one is typed at once", () => {
    expect(keepsKeyboard("wrong_code")).toBe(true);
    expect(keepsKeyboard("bad_address")).toBe(true);
  });

  it("goes where typing again cannot help, so what can is in view", () => {
    for (const note of ["expired_code", "too_many", "locked"] as const) {
      expect([note, keepsKeyboard(note)]).toEqual([note, false]);
    }
  });
});
