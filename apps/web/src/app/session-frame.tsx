import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { clerkEnv } from "../server/clerk-env";
import { NONCE_HEADER } from "../server/csp";
import { identityMode } from "../server/identity-mode";
import { OFFICE_HOME, SIGN_IN_PATH } from "../server/sign-in-paths";
import { clerkWords } from "./i18n/clerk-words";
import { requestStrings } from "./i18n/server";
import { Providers } from "./providers";

// What the office and the sign-in page share and the public pages never load: the query
// client, and Clerk's provider where Clerk is this server's identity and its keys are
// present (server/identity-mode.ts, clerk-env.ts). Under the development identity, and in
// a build with no keys, nothing of Clerk is rendered or loaded. The publishable key is
// handed over as a prop, read on the server per request, so it never depends on what a
// build inlined. Consumed by (office)/layout.tsx and (auth)/layout.tsx.
export async function SessionFrame({ children }: { children: ReactNode }) {
  // The request's nonce (proxy.ts), for the script Clerk's provider adds; absent on a
  // development server, which sets no policy.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const env = identityMode(process.env) === "clerk" ? clerkEnv(process.env) : null;
  const inside = <Providers clerk={env !== null}>{children}</Providers>;
  if (env === null) return inside;
  // Clerk's own form and messages, in the person's language and, where the sign-in page
  // says a thing its own way, in the office's words (i18n/clerk-words.ts).
  const { t, language } = await requestStrings();
  return (
    <ClerkProvider
      publishableKey={env.publishableKey}
      nonce={nonce}
      // Clerk's SDK reports usage to a host of its own from a development instance;
      // the policy admits no such host, and nothing here needs it sent.
      telemetry={false}
      localization={clerkWords(language, t)}
      signInUrl={SIGN_IN_PATH}
      signInFallbackRedirectUrl={OFFICE_HOME}
      afterSignOutUrl={SIGN_IN_PATH}
    >
      {inside}
    </ClerkProvider>
  );
}
