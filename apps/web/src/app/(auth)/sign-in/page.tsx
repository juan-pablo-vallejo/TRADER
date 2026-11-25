import { auth } from "@clerk/nextjs/server";
import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";

import { clerkEnv } from "../../../server/clerk-env";
import { identityMode } from "../../../server/identity-mode";
import { GOOGLE_FAILED, GOOGLE_REFUSED, returnPath } from "../../../server/sign-in-paths";
import { requestStrings } from "../../i18n/server";
import styles from "../auth.module.css";
import { SignInFrame } from "../sign-in-frame";
import { SignInForm } from "./sign-in-form";

// Office sign-in: a code sent to the person's mobile number or to their email, asked for
// in one field (sign-in-form.tsx), inside the page sign-in-frame.tsx draws. Clerk sends and
// checks the code; the form is ours. Or Google, for a person whose invitation carries that
// address (sso-callback/page.tsx is where the browser comes back to when Google's account
// is nobody's). There is no sign-up: a person exists at Clerk because
// people.invite admitted them. The route answers 404 where the development identity is
// this server's, as /dev-signin does everywhere else; a server with no Clerk keys says so
// instead of drawing a form that could not work.
export const dynamic = "force-dynamic";

// The browser's own bar takes the navy: --brand-navy (theme.css), which a test holds
// this to.
export const viewport: Viewport = { themeColor: "#140064" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  // Where the person was, if a link from the office said (sign-in-paths.ts), else Today.
  const asked = await searchParams;
  const returnTo = returnPath(asked.redirect_url);
  // Someone already signed in has nothing to do here: they go on, before a form is drawn.
  // Whether a roster holds them is the office's to say, as for anyone it shows a screen.
  const { userId } = await auth();
  if (userId !== null) redirect(returnTo);
  return (
    <SignInFrame>
      <SignInForm
        returnTo={returnTo}
        googleBack={
          asked.refused === GOOGLE_REFUSED
            ? "google_refused"
            : asked.refused === GOOGLE_FAILED
              ? "failed"
              : null
        }
      />
    </SignInFrame>
  );
}
