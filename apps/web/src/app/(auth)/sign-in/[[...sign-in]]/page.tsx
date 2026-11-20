import { SignIn } from "@clerk/nextjs";
import { notFound } from "next/navigation";

import { clerkEnv } from "../../../../server/clerk-env";
import { identityMode } from "../../../../server/identity-mode";
import { EmptyState } from "../../../empty-state";
import { requestStrings } from "../../../i18n/server";
import styles from "./sign-in.module.css";

// Office sign-in: Clerk's own form — a code sent to the person's mobile
// number or email, nothing else — in the theme's colours. There is no sign-up: a person
// exists at Clerk because roster.invite admitted them. The route answers 404 where the
// development identity is this server's, as /dev-signin does
// everywhere else; a server with no Clerk keys says so instead of drawing a form that could
// not work. The catch-all segment is Clerk's: its form walks its steps under this path.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Before anything of the request is read: where this page does not exist, it is a 404.
  if (identityMode(process.env) !== "clerk") notFound();
  const { t } = await requestStrings();
  if (clerkEnv(process.env) === null) return <EmptyState text={t.signInNotSetUp} />;
  return (
    <div className={styles.signIn}>
      <SignIn
        withSignUp={false}
        appearance={{
          variables: {
            // theme.css's --accent, as a literal: Clerk derives the button's shades from
            // this value and cannot from a CSS variable (the button drew blank).
            colorPrimary: "#2808ac",
            colorForeground: "var(--ink)",
            fontFamily: "var(--font)",
            borderRadius: "var(--radius-card)",
          },
        }}
      />
    </div>
  );
}
