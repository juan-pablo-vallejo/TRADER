import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { clerkEnv } from "../server/clerk-env";
import { NONCE_HEADER } from "../server/csp";
import { identityMode } from "../server/identity-mode";
import { SIGN_IN_PATH } from "../server/sign-in-paths";
import { Header } from "./header";
import { Nav } from "./nav";
import { Providers } from "./providers";
import styles from "./shell.module.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "TRADER",
  description: "Daily closeout and job costing for painting contractors",
};

// Clerk's provider is around the office only where Clerk is this server's identity and its
// keys are present (server/identity-mode.ts, clerk-env.ts): under the development identity,
// and in a build with no keys, nothing of Clerk is rendered or loaded. The publishable key
// is handed over as a prop, read on the server per request, so it never depends on what a
// build inlined. Every page is dynamic, so this is read per request too.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The request's nonce (proxy.ts), for the script Clerk's provider adds; absent on a
  // development server, which sets no policy.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const env = identityMode(process.env) === "clerk" ? clerkEnv(process.env) : null;
  const office = (
    <Providers clerk={env !== null}>
      <Header />
      <div className={styles.shell}>
        <Nav />
        <main className={styles.main}>{children}</main>
      </div>
    </Providers>
  );
  return (
    <html lang="en">
      <body>
        {env === null ? (
          office
        ) : (
          <ClerkProvider
            publishableKey={env.publishableKey}
            nonce={nonce}
            // Clerk's SDK reports usage to a host of its own from a development instance;
            // the policy admits no such host, and nothing here needs it sent.
            telemetry={false}
            signInUrl={SIGN_IN_PATH}
            signInFallbackRedirectUrl="/"
            afterSignOutUrl={SIGN_IN_PATH}
          >
            {office}
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
