import { SignIn } from "@clerk/nextjs";
import type { Viewport } from "next";
import { notFound } from "next/navigation";

import { clerkEnv } from "../../../../server/clerk-env";
import { identityMode } from "../../../../server/identity-mode";
import { requestStrings } from "../../../i18n/server";
import styles from "../../auth.module.css";
import { SignInFrame } from "../../sign-in-frame";
import { signInAppearance } from "../sign-in-appearance";

// Office sign-in: Clerk's own form — a code sent to the person's mobile number, or to
// their email, and a passkey where they have added one — drawn on D'Sierra's brand
// (sign-in-appearance.ts) inside the page sign-in-frame.tsx draws. The form is Clerk's
// prebuilt one, never a flow of our own. There is no sign-up: a person exists at Clerk
// because roster.invite admitted them. The route answers 404 where the development
// identity is this server's, as /dev-signin does everywhere else; a server with no Clerk
// keys says so instead of drawing a form that could not work. The catch-all segment is
// Clerk's: its form walks its steps under this path.
export const dynamic = "force-dynamic";

// The browser's own bar takes the navy: --brand-navy (theme.css), which a test holds
// this to.
export const viewport: Viewport = { themeColor: "#140064" };

// The number first. Clerk shows email first where an instance admits both, and has no
// setting for the order: a phone number to start from is what makes it open on the number
// field, and the country's code alone leaves that field empty (seen on staging,
// 2026-11-23). Only +1 numbers are ever invited.
const START_ON_NUMBER = { phoneNumber: "+1" };

export default async function SignInPage() {
  // Before anything of the request is read: where this page does not exist, it is a 404.
  if (identityMode(process.env) !== "clerk") notFound();
  const { t } = await requestStrings();
  if (clerkEnv(process.env) === null) {
    return (
      <SignInFrame>
        <h1 className={styles.heading}>{t.teamSignIn}</h1>
        <p className={styles.helper}>{t.signInNotSetUp}</p>
      </SignInFrame>
    );
  }
  return (
    <SignInFrame>
      <div className={styles.mount}>
        <SignIn
          withSignUp={false}
          initialValues={START_ON_NUMBER}
          appearance={signInAppearance}
          // Until Clerk's form has loaded: its heading and helper, already in their places.
          fallback={
            <div aria-busy="true">
              <h1 className={styles.heading}>{t.teamSignIn}</h1>
              <p className={styles.helper}>{t.signInForm.helper}</p>
              <div className={styles.place} />
              <div className={styles.place} />
            </div>
          }
        />
      </div>
    </SignInFrame>
  );
}
