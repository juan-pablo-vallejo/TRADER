// The two providers the sign-in steps are handed (sign-in-steps.ts, Provider). Clerk's, on
// a build with its key: it sends the code, checks it and makes the session. And a stand-in
// for it that exists only in a development build with the development identity on
// (config.ts), so the simulators and Maestro walk every step of the real screen with no
// text message: it asks the local server whether a roster holds the address, takes 123456
// as the code and 000000 as one that has expired, and signs in with the development
// headers. `__DEV__` is false in every release build, so the stand-in is never chosen there.
import { useClerk, useSignIn } from "@clerk/expo";
import type { SignInIdentifier } from "@trader/api/contract";

import { createApi, devHeaders, type DevWho } from "./api";
import type { Answer, Provider } from "./sign-in-steps";

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

export function useClerkProvider(): Provider {
  const clerk = useClerk();
  const { signIn } = useSignIn();
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
  };
}

export const STAND_IN_CODE = "123456";
export const STAND_IN_EXPIRED = "000000";

const who = (to: SignInIdentifier): DevWho =>
  to.kind === "phone" ? { phone: to.phone } : { email: to.email };

export function standInProvider(apiUrl: string): Provider {
  return {
    forgetStale: async () => undefined,
    // A roster holds the address, or Clerk would have refused it here: the server says.
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
  };
}
