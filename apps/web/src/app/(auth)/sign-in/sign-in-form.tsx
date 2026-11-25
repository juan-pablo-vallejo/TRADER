"use client";

// The office's sign-in form: one field that takes a mobile number or an email, then the
// code that was texted or emailed. Its own form on the identity provider's hooks, as the
// phone app's is (apps/mobile/src/ui/phone-sign-in.tsx): Clerk's prebuilt form keeps a
// number and an email as two fields it switches between, and cannot be one. Clerk still
// sends the code, checks it and makes the session; this only asks.
//
// Nobody signs up here. A number or an email Clerk does not know, and one no roster holds,
// get the same sentence: ask your office. What was typed and what a refusal means are read
// by the functions the phone shares (`@trader/api/contract`, sign-in.ts).
//
// Rendered only inside Clerk's provider: the page draws it only where Clerk is this
// server's identity and its keys are present (page.tsx, session-frame.tsx).
import { useClerk, useSignIn } from "@clerk/nextjs";
import {
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_RESEND_SECONDS,
  signInCode,
  signInFailure,
  signInIdentifier,
  type SignInFailure,
  type SignInIdentifier,
} from "@trader/api/contract";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ssoCallbackFrom } from "../../../server/sign-in-paths";
import { fieldOfferSays, passkeyFailure } from "../../passkey-rules";
import { signInPhone as shownNumber } from "../../format";
import { useStrings } from "../../i18n";
import styles from "../auth.module.css";
import google from "./google-button.module.css";

// What the form says under its field. A refusal from Clerk, by name; a field that is
// neither a number nor an email; or a sign-in Clerk left at a step this form has none for.
// Or a Google account no roster holds, said when the browser comes back from Google.
// Or a passkey Clerk did not take.
// Or Clerk's script that never arrived, so nothing on the form can work.
type Note =
  | SignInFailure
  | "bad_address"
  | "unfinished"
  | "google_refused"
  | "passkey_failed"
  | "not_loaded";
// The notes that are about what was typed: only these mark the field invalid.
const ABOUT_THE_FIELD: ReadonlySet<Note> = new Set<Note>([
  "unknown",
  "wrong_code",
  "expired_code",
  "bad_address",
]);
// How long Clerk's script may take before the form says it has not come.
const CLERK_LOAD_WAIT_MS = 10_000;

// Clerk's script, given its time: false while it may still come, true once it has failed
// or the wait is over with nothing loaded. Shared with the Google return (sso-callback).
export function useClerkStalled(): boolean {
  const clerk = useClerk();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (clerk.loaded) return;
    const timer = window.setTimeout(() => setLate(true), CLERK_LOAD_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [clerk.loaded]);
  return !clerk.loaded && (late || clerk.status === "error");
}

// What a step answers when the browser is on its way to the office.
const LEAVING = Symbol("leaving");

// What only the browser knows, and that does not change under a page.
const unchanging = () => () => undefined;

// Clerk's own name for why a call was refused. Its errors carry a list of them, or one.
function codeOf(error: unknown): string | undefined {
  const e = error as { code?: unknown; errors?: { code?: unknown }[] } | null;
  const first = Array.isArray(e?.errors) ? e.errors[0]?.code : e?.code;
  return typeof first === "string" ? first : undefined;
}

export function SignInForm({
  returnTo,
  googleBack,
}: {
  returnTo: string;
  // The browser has just come back from Google: with an account no roster holds, or
  // from a return that failed.
  googleBack: "google_refused" | "failed" | null;
}) {
  const { t } = useStrings();
  const s = t.signInForm;
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const [typed, setTyped] = useState("");
  // Where the code went, once one has: the form is then on its second step.
  const [sentTo, setSentTo] = useState<SignInIdentifier | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(googleBack);
  const stalled = useClerkStalled();
  // "Use a different number or email" sends the focus back to the field on any width.
  const backToField = useRef(false);
  const [wait, setWait] = useState(0);
  const address = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);

  // The field a person is about to type in takes the focus. The first one only where a
  // keyboard is there to be typed on: on a phone it would open the keyboard over the page
  // before it has been read. The code's always: they have just asked for it.
  useEffect(() => {
    if (sentTo !== null) codeField.current?.focus();
    else if (backToField.current || window.matchMedia("(min-width: 768px)").matches) {
      backToField.current = false;
      address.current?.focus();
    }
  }, [sentTo]);
  // And back to the code's field when a try has been answered: it is cleared and empty.
  useEffect(() => {
    if (!busy && sentTo !== null) codeField.current?.focus();
  }, [busy, sentTo]);

  // Another code may be asked for after half a minute.
  useEffect(() => {
    if (wait <= 0) return;
    const tick = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(tick);
  }, [wait]);

  const sentence = (which: Note): string =>
    ({
      unknown: t.signInNotAdded,
      wrong_code: s.codeWrong,
      expired_code: s.codeExpired,
      too_many: s.tooMany,
      locked: s.locked,
      failed: s.failed,
      bad_address: s.badAddress,
      unfinished: s.unfinished,
      google_refused: s.googleRefused,
      passkey_failed: s.passkeyFailed,
      not_loaded: s.notLoaded,
    })[which];

  // One step of the sign-in: busy while it runs, and whatever it threw is a failure said
  // in the form, never an unhandled one.
  const attempt = async (step: () => Promise<Note | null | typeof LEAVING>) => {
    setBusy(true);
    setNote(null);
    try {
      const answer = await step();
      // A finished sign-in is leaving for the office: the form stays busy through that.
      if (answer === LEAVING) return;
      setNote(answer);
      setBusy(false);
    } catch {
      setNote("failed");
      setBusy(false);
    }
  };

  const sendCode = (to: SignInIdentifier) =>
    to.kind === "phone"
      ? signIn.phoneCode.sendCode({ phoneNumber: to.phone })
      : signIn.emailCode.sendCode({ emailAddress: to.email });

  const send = (event: { preventDefault(): void }) => {
    event.preventDefault();
    // The field keeps its own value (below), and this is where it is read.
    const value = address.current?.value ?? "";
    setTyped(value);
    const to = signInIdentifier(value);
    if (to === null) {
      setNote("bad_address");
      return;
    }
    void attempt(async () => {
      const { error } = await sendCode(to);
      if (error !== null) return signInFailure(codeOf(error));
      setCode("");
      setSentTo(to);
      setWait(SIGN_IN_RESEND_SECONDS);
      return null;
    });
  };

  // Google: the browser leaves for Google and comes back signed in, to where the person
  // was going; or, when Google's account is nobody Clerk knows, to the callback page,
  // which sends them back here to be told so. Clerk ties a Google account to the login
  // whose verified email it is, so it works for a person the office invited by that email.
  const withGoogle = () => {
    void attempt(async () => {
      // The field's passkey offer (below) has already started a sign-in of its own, and
      // Clerk's `sso` goes to Google only for a sign-in it starts itself: on one already
      // started it does nothing at all (@clerk/clerk-js 6.43.1, SignInFuture.sso). Seen
      // on staging: the button did nothing. So the passkey's is set aside first. The code
      // buttons need nothing of the kind: each call starts its own sign-in.
      await signIn.reset();
      const { error } = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: returnTo,
        redirectCallbackUrl: ssoCallbackFrom(returnTo),
      });
      return error === null ? null : signInFailure(codeOf(error));
    });
  };

  // A sign-in Clerk has verified becomes a session, and the browser goes to the office as
  // a fresh page, so everything it draws is asked for as the person now signed in.
  const finish = async (): Promise<Note | null | typeof LEAVING> => {
    if (signIn.status !== "complete") {
      // A second factor, a device check or a challenge: nothing this instance asks of
      // anyone, and nothing this form can answer. Said, and left in the console for
      // whoever is asked about it: the office has no error reporting in the browser.
      console.error(`sign-in stopped at ${signIn.status}`);
      return "unfinished";
    }
    const { error: refused } = await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(returnTo));
      },
    });
    return refused === null ? LEAVING : signInFailure(codeOf(refused));
  };

  const verify = (entered: string) => {
    if (sentTo === null || entered.length < SIGN_IN_CODE_LENGTH) return;
    void attempt(async () => {
      const { error } =
        sentTo.kind === "phone"
          ? await signIn.phoneCode.verifyCode({ code: entered })
          : await signIn.emailCode.verifyCode({ code: entered });
      if (error !== null) {
        setCode("");
        return signInFailure(codeOf(error));
      }
      return finish();
    });
  };

  // A passkey: the device's own lock signs the person in, with no code. Asked for by the
  // button below, and offered by the browser in the field itself where it can (`autofill`:
  // the request waits, unseen, until the person picks their passkey from the field's
  // suggestions, and ends by itself when they sign in another way). A sheet the person
  // closed is nothing to say; a passkey Clerk did not take is.
  const withPasskey = async (
    flow: "discoverable" | "autofill",
  ): Promise<Note | null | typeof LEAVING> => {
    const { error } = await signIn.passkey({ flow });
    if (error !== null) {
      // The field's own offer speaks only of a passkey the person picked (fieldOfferSays);
      // the button's, of anything but a sheet they closed.
      const says =
        flow === "autofill"
          ? fieldOfferSays(error)
          : passkeyFailure(error) !== "cancelled";
      return says ? "passkey_failed" : null;
    }
    return finish();
  };
  // Whether this browser can use one at all: the browser's to say, and nothing on the
  // server, so the button is drawn once the page is the browser's.
  const passkeys = useSyncExternalStore(
    unchanging,
    () => typeof window.PublicKeyCredential === "function",
    () => false,
  );
  useEffect(() => {
    if (!clerk.loaded || !passkeys) return;
    let gone = false;
    void (async () => {
      const inField =
        (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) === true;
      if (!inField || gone) return;
      const note = await withPasskey("autofill").catch(() => null);
      if (note === LEAVING) setBusy(true);
      else if (!gone && note !== null) setNote(note);
    })();
    return () => {
      gone = true;
    };
    // Once, when Clerk has loaded: the request it starts lives as long as the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerk.loaded, passkeys]);

  const again = () => {
    if (sentTo === null) return;
    void attempt(async () => {
      const { error } = await sendCode(sentTo);
      if (error !== null) return signInFailure(codeOf(error));
      setCode("");
      setWait(SIGN_IN_RESEND_SECONDS);
      return null;
    });
  };

  const startOver = () => {
    backToField.current = true;
    void signIn.reset();
    setSentTo(null);
    setCode("");
    setNote(null);
    setWait(0);
  };

  const shown: Note | null = note ?? (stalled ? "not_loaded" : null);
  const problem = shown !== null && (
    <p id="sign-in-note" className={styles.problem} role="alert">
      {sentence(shown)}
    </p>
  );
  const invalid = note !== null && ABOUT_THE_FIELD.has(note);
  // Until Clerk has loaded there is nothing to send a code with.
  const idle = busy || !clerk.loaded;

  if (sentTo === null) {
    return (
      <form className={styles.fields} onSubmit={send} noValidate>
        <h1 className={styles.heading}>{t.teamSignIn}</h1>
        <button
          type="button"
          className={google.google}
          disabled={idle}
          onClick={withGoogle}
        >
          {/* Google's mark, cut from Google's own button (public/google-g.svg) and served
              from here: nothing is fetched from Google. A plain <img>: it is a 20px mark,
              and next/image would write an inline style the policy refuses. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src="/google-g.svg" alt="" width={20} height={20} />
          <span>{s.google}</span>
        </button>
        <p className={styles.or}>{s.or}</p>
        <p className={styles.helper}>{s.helper}</p>
        <label className={styles.label} htmlFor="sign-in-address">
          {s.address}
        </label>
        <input
          ref={address}
          id="sign-in-address"
          name="identifier"
          className={styles.field}
          // Letters, digits and an @: a number and an email are both typed here.
          type="text"
          inputMode="email"
          // `webauthn`: the browser lists the person's passkey for this site here too.
          autoComplete="username webauthn"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          // The field's value is the browser's, not this component's: React empties a
          // field whose value it holds as it takes the page over, so an address typed,
          // pasted or filled in before the script arrived was erased under the person
          // (seen on staging). `typed` is only what the field starts from when it is
          // drawn again, after "Use a different number or email".
          defaultValue={typed}
          aria-invalid={invalid}
          aria-describedby={shown !== null ? "sign-in-note" : undefined}
        />
        {problem}
        <button type="submit" className={styles.send} disabled={idle}>
          {busy ? s.sending : s.send}
        </button>
        {passkeys && (
          <button
            type="button"
            className={styles.textButton}
            disabled={idle}
            onClick={() => void attempt(() => withPasskey("discoverable"))}
          >
            {s.usePasskey}
          </button>
        )}
      </form>
    );
  }

  return (
    <form
      className={styles.fields}
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
      noValidate
    >
      <h1 className={styles.heading}>{s.codeTitle}</h1>
      <p className={styles.helper}>
        {sentTo.kind === "phone"
          ? s.codeTexted(shownNumber(sentTo.phone))
          : s.codeEmailed(sentTo.email)}
      </p>
      <label className={styles.label} htmlFor="sign-in-code">
        {s.code}
      </label>
      <input
        ref={codeField}
        id="sign-in-code"
        name="code"
        className={`${styles.field} ${styles.code}`}
        // The texted code is offered above a phone's keyboard, and one tap fills it.
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // No length limit on the field: a pasted "123 456" would lose its last digit to
        // one. signInCode keeps the digits and cuts them to the code's length.
        value={code}
        disabled={busy}
        onChange={(event) => {
          const entered = signInCode(event.target.value);
          setCode(entered);
          // The last digit sends it: nobody types a code and then looks for a button.
          verify(entered);
        }}
        aria-invalid={invalid}
        aria-describedby={shown !== null ? "sign-in-note" : undefined}
      />
      {problem}
      <button
        type="submit"
        className={styles.send}
        disabled={idle || code.length < SIGN_IN_CODE_LENGTH}
      >
        {busy ? s.checking : t.signIn}
      </button>
      <button
        type="button"
        className={styles.textButton}
        disabled={idle || wait > 0}
        onClick={again}
      >
        {wait > 0 ? s.resendIn(wait) : s.resend}
      </button>
      <button
        type="button"
        className={styles.textButton}
        disabled={busy}
        onClick={startOver}
      >
        {s.change}
      </button>
    </form>
  );
}
