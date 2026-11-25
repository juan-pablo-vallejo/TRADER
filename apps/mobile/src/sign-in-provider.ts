// The two providers the sign-in steps are handed (sign-in-steps.ts, Provider). Clerk's, on
// a build with its key: it sends the code, checks it and makes the session. And a stand-in
// for it that exists only in a development build with the development identity on
// (config.ts), so the simulators and Maestro walk every step of the real screen with no
// text message: it asks the local server whether a company has added the address, takes 123456
// as the code and 000000 as one that has expired, and signs in with the development
// headers. `__DEV__` is false in every release build, so the stand-in is never chosen there.
import { useClerk, useSignIn, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { signInIdentifier, type SignInIdentifier } from "@trader/api/contract";
import { makeRedirectUri } from "expo-auth-session";
import { Platform } from "react-native";

import { createApi, devHeaders, type DevWho } from "./api";
import type { Answer, Provider, SocialAnswer } from "./sign-in-steps";

// Clerk's own name for why a call was refused. Its errors carry a list of them, or one.
function codeOf(error: unknown): string | undefined {
  const e = error as { code?: unknown; errors?: { code?: unknown }[] } | null;
  const first = Array.isArray(e?.errors) ? e.errors[0]?.code : e?.code;
  return typeof first === "string" ? first : undefined;
}

const answer = ({ error }: { error: unknown }): Answer =>
  error === null || error === undefined
    ? { ok: true }
    : { ok: false, code: codeOf(error) };

// A closed sheet: the browser's dismissal, or Apple's own cancel code.
const closedSheet = (error: unknown): boolean => {
  const code = codeOf(error) ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /cancel/i.test(code);
};

export function useClerkProvider(): Provider {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  // Google: the phone's browser sheet comes back to trader://sso-callback (app.json's
  // scheme; Clerk's allowed redirects list it). Apple: its own sheet, on an iPhone alone.
  // A result with no session is an account no login holds, for which Clerk starts a
  // sign-up: it is never activated here, and the instance refuses sign-ups besides.
  const social = async (kind: "google" | "apple"): Promise<SocialAnswer> => {
    try {
      const result =
        kind === "google"
          ? await startSSOFlow({
              strategy: "oauth_google",
              redirectUrl: makeRedirectUri({ path: "sso-callback" }),
            })
          : Platform.OS === "ios"
            ? await startAppleAuthenticationFlow()
            : null;
      if (result === null) return { ok: false, code: undefined, cancelled: false };
      const browser = (result as { authSessionResult?: { type?: string } })
        .authSessionResult;
      if (
        browser !== undefined &&
        browser.type !== "success" &&
        result.createdSessionId === null
      ) {
        return { ok: false, code: undefined, cancelled: true };
      }
      if (result.createdSessionId === null || result.setActive === undefined) {
        return { ok: false, code: "external_account_not_found", cancelled: false };
      }
      await result.setActive({ session: result.createdSessionId });
      return { ok: true, session: { kind: "clerk" } };
    } catch (error) {
      return closedSheet(error)
        ? { ok: false, code: undefined, cancelled: true }
        : { ok: false, code: codeOf(error) ?? undefined, cancelled: false };
    }
  };
  // A step Clerk answered without error but left short of a session: a second factor or a
  // check this instance asks of nobody, and nothing this screen can answer.
  const complete = (done: Answer): Answer =>
    done.ok && signIn.status !== "complete" ? { ok: false, code: undefined } : done;
  return {
    forgetStale: async () => {
      if (clerk.session !== null && clerk.session !== undefined) await clerk.signOut();
    },
    sendCode: async (to) =>
      answer(
        to.kind === "phone"
          ? await signIn.phoneCode.sendCode({ phoneNumber: to.phone })
          : await signIn.emailCode.sendCode({ emailAddress: to.email }),
      ),
    verifyCode: async (to, code) =>
      complete(
        answer(
          to.kind === "phone"
            ? await signIn.phoneCode.verifyCode({ code })
            : await signIn.emailCode.verifyCode({ code }),
        ),
      ),
    redeem: async (ticket) => complete(answer(await signIn.ticket({ ticket }))),
    finish: async () => {
      await signIn.finalize();
      return { kind: "clerk" };
    },
    social,
  };
}

const STAND_IN_CODE = "123456";
const STAND_IN_EXPIRED = "000000";

const who = (to: SignInIdentifier): DevWho =>
  to.kind === "phone" ? { phone: to.phone } : { email: to.email };

export function standInProvider(apiUrl: string): Provider {
  return {
    forgetStale: async () => undefined,
    // A company has added the address, or Clerk would have refused it here: the server says.
    sendCode: async (to) => {
      try {
        await createApi(apiUrl, () => devHeaders(who(to))).me.get.query();
        return { ok: true };
      } catch (error) {
        const refused =
          (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";
        return { ok: false, code: refused ? "form_identifier_not_found" : undefined };
      }
    },
    verifyCode: async (_to, code) =>
      code === STAND_IN_CODE
        ? { ok: true }
        : {
            ok: false,
            code:
              code === STAND_IN_EXPIRED ? "verification_expired" : "form_code_incorrect",
          },
    // The Demo door hands out Clerk's tickets, which nothing here can redeem.
    redeem: async () => ({ ok: false, code: undefined }),
    finish: async (to) => {
      if (to === null) throw new Error("the stand-in signs in by an address only");
      return { kind: "dev", ...who(to) };
    },
    // Google or Apple, as the account whose email the field holds: the stand-in has no
    // sheet to pick one in. With none there, it is an account no company has added.
    social: async (_kind, hint) => {
      const typed = signInIdentifier(hint);
      const to: SignInIdentifier =
        typed !== null && typed.kind === "email"
          ? typed
          : { kind: "email", email: "nobody.invited@demo.invalid" };
      try {
        await createApi(apiUrl, () => devHeaders(who(to))).me.get.query();
        return { ok: true, session: { kind: "dev", ...who(to) } };
      } catch (error) {
        const refused =
          (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";
        return {
          ok: false,
          code: refused ? "external_account_not_found" : undefined,
          cancelled: false,
        };
      }
    },
  };
}
