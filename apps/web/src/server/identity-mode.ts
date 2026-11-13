// Which identity this server runs on (ARCHITECTURE, identity). One rule, read per request:
// the development identity only where its own flag and NODE_ENV admit it
// (`devIdentityEnabled`: never under a production build), Clerk everywhere else. So a
// production build never constructs, calls or links to the development adapter's sign-in,
// whatever TRADER_DEV_IDENTITY says. Consumed by identity.ts, the layout, the header and the
// sign-in pages.
import { devIdentityEnabled } from "@trader/api";

import { DEV_SIGN_IN_PATH, SIGN_IN_PATH } from "./sign-in-paths";

export type IdentityMode = "dev" | "clerk";

export const identityMode = (env: Record<string, string | undefined>): IdentityMode =>
  devIdentityEnabled(env) ? "dev" : "clerk";

// Where a person without a session is sent. Each route answers 404 in the other mode.
export const signInPath = (env: Record<string, string | undefined>): string =>
  identityMode(env) === "dev" ? DEV_SIGN_IN_PATH : SIGN_IN_PATH;
