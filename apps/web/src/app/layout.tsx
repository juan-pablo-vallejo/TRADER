import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { clerkEnv } from "../server/clerk-env";
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

export default function RootLayout({ children }: { children: ReactNode }) {
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
