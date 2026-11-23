"use client";

// The browser is back from Google. Clerk's own component for this moment tries a sign-up
// when Google's account is nobody it knows (@clerk/react 6.18.6, HandleSSOCallback:
// `signUp.create({ transfer: true })`). Nobody signs up here: a login exists only because
// the office made it. So this is that component's sign-in half and no more: a sign-in that
// is complete is finished and the person goes on; a session Clerk already has is taken up;
// anything else is a Google account no roster holds, and the person is sent back to the
// form to be told so. Consumed by page.tsx.
import { useClerk, useSignIn } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

import { signInRefused } from "../../../../server/sign-in-paths";
import { useStrings } from "../../../i18n";
import styles from "../../auth.module.css";

export function SsoCallback({ returnTo }: { returnTo: string }) {
  const { t } = useStrings();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const ran = useRef(false);
  useEffect(() => {
    if (!clerk.loaded || ran.current) return;
    ran.current = true;
    // As the form goes on after a code: a fresh page, asked for as the person signed in.
    const goOn = ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
      window.location.assign(decorateUrl(returnTo));
    };
    const refuse = () => window.location.replace(signInRefused(returnTo));
    void (async () => {
      try {
        if (signIn.status === "complete") {
          const { error } = await signIn.finalize({ navigate: goOn });
          if (error !== null) refuse();
          return;
        }
        const sessionId = signIn.existingSession?.sessionId;
        if (sessionId !== undefined) {
          await clerk.setActive({ session: sessionId, navigate: goOn });
          return;
        }
      } catch (error) {
        // Left in the console for whoever is asked about it: the office has no error
        // reporting in the browser.
        console.error("the sign-in from Google could not be finished", error);
      }
      refuse();
    })();
  }, [clerk, clerk.loaded, signIn, returnTo]);
  return (
    <div className={styles.fields}>
      <h1 className={styles.heading}>{t.teamSignIn}</h1>
      <p className={styles.helper} role="status">
        {t.signInForm.signingIn}
      </p>
    </div>
  );
}
