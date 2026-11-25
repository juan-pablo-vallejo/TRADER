import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";

import { clerkEnv } from "../../../../server/clerk-env";
import { identityMode } from "../../../../server/identity-mode";
import { returnPath, SIGN_IN_PATH } from "../../../../server/sign-in-paths";
import { SignInFrame } from "../../sign-in-frame";
import { SsoCallback } from "./sso-callback";

// Where the browser comes back to from Google when the sign-in was not finished there:
// sso-callback.tsx finishes it if it can be, and otherwise sends the person back to the
// form to be told their Google account was added by no company. It never asks for a sign-up. As
// sign-in itself: a 404 where the development identity is this server's, and nothing to
// do on a server with no Clerk keys.
export const dynamic = "force-dynamic";

// The browser's own bar takes the navy, as on sign-in (page.tsx).
export const viewport: Viewport = { themeColor: "#140064" };

export default async function SsoCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (identityMode(process.env) !== "clerk") notFound();
  if (clerkEnv(process.env) === null) redirect(SIGN_IN_PATH);
  // Where the person was going, held to the same rule as the link that carried it.
  const returnTo = returnPath((await searchParams).redirect_url);
  return (
    <SignInFrame>
      <SsoCallback returnTo={returnTo} />
    </SignInFrame>
  );
}
