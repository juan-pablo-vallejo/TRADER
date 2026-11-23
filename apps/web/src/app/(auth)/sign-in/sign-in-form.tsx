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
import { useEffect, useRef, useState } from "react";

import { signInPhone as shownNumber } from "../../format";
import { useStrings } from "../../i18n";
import styles from "../auth.module.css";

// What the form says under its field. A refusal from Clerk, by name; a field that is
// neither a number nor an email; or a sign-in Clerk left at a step this form has none for.
type Note = SignInFailure | "bad_address" | "unfinished";

// Clerk's own name for why a call was refused. Its errors carry a list of them, or one.
function codeOf(error: unknown): string | undefined {
  const e = error as { code?: unknown; errors?: { code?: unknown }[] } | null;
  const first = Array.isArray(e?.errors) ? e.errors[0]?.code : e?.code;
  return typeof first === "string" ? first : undefined;
}

export function SignInForm({ returnTo }: { returnTo: string }) {
  const { t } = useStrings();
  const s = t.signInForm;
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const [typed, setTyped] = useState("");
  // Where the code went, once one has: the form is then on its second step.
  const [sentTo, setSentTo] = useState<SignInIdentifier | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [wait, setWait] = useState(0);
  const address = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);

  // The field a person is about to type in takes the focus. The first one only where a
  // keyboard is there to be typed on: on a phone it would open the keyboard over the page
  // before it has been read. The code's always: they have just asked for it.
  useEffect(() => {
    if (sentTo !== null) codeField.current?.focus();
    else if (window.matchMedia("(min-width: 768px)").matches) address.current?.focus();
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
      unknown: t.notOnRoster,
      wrong_code: s.codeWrong,
      expired_code: s.codeExpired,
      too_many: s.tooMany,
      locked: s.locked,
      failed: s.failed,
      bad_address: s.badAddress,
      unfinished: s.unfinished,
    })[which];

  // One step of the sign-in: busy while it runs, and whatever it threw is a failure said
  // in the form, never an unhandled one.
  const attempt = async (step: () => Promise<Note | null>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await step());
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (to: SignInIdentifier) =>
    to.kind === "phone"
      ? signIn.phoneCode.sendCode({ phoneNumber: to.phone })
      : signIn.emailCode.sendCode({ emailAddress: to.email });

  const send = (event: { preventDefault(): void }) => {
    event.preventDefault();
    // What the field holds, not what this component was told: an address typed, pasted or
    // filled in by the browser before the page's script arrived never reached `typed`,
    // and was refused as no address at all while it stood in the field (seen on staging).
    const to = signInIdentifier(address.current?.value ?? typed);
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
      if (signIn.status !== "complete") {
        // A second factor, a device check or a challenge: nothing this instance asks of
        // anyone, and nothing this form can answer. Said, and left in the console for
        // whoever is asked about it: the office has no error reporting in the browser.
        console.error(`sign-in stopped at ${signIn.status}`);
        return "unfinished";
      }
      // The session is made, and the browser goes to the office as a fresh page, so
      // everything it draws is asked for as the person now signed in.
      const { error: refused } = await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          window.location.assign(decorateUrl(returnTo));
        },
      });
      return refused === null ? null : signInFailure(codeOf(refused));
    });
  };

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
    void signIn.reset();
    setSentTo(null);
    setCode("");
    setNote(null);
    setWait(0);
  };

  const problem = note !== null && (
    <p id="sign-in-note" className={styles.problem} role="alert">
      {sentence(note)}
    </p>
  );
  // Until Clerk has loaded there is nothing to send a code with.
  const idle = busy || !clerk.loaded;

  if (sentTo === null) {
    return (
      <form className={styles.fields} onSubmit={send} noValidate>
        <h1 className={styles.heading}>{t.teamSignIn}</h1>
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
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={note !== null}
          aria-describedby={note !== null ? "sign-in-note" : undefined}
        />
        {problem}
        <button type="submit" className={styles.send} disabled={idle}>
          {busy ? s.sending : s.send}
        </button>
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
        maxLength={SIGN_IN_CODE_LENGTH}
        value={code}
        disabled={busy}
        onChange={(event) => {
          const entered = signInCode(event.target.value);
          setCode(entered);
          // The last digit sends it: nobody types a code and then looks for a button.
          verify(entered);
        }}
        aria-invalid={note !== null}
        aria-describedby={note !== null ? "sign-in-note" : undefined}
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
