// The identity directory this server hands to roster.invite (packages/api identity.ts),
// chosen as the identity adapter is (identity.ts) and read per call: Clerk where Clerk is
// this server's identity, and nothing where the development identity is — a person invited
// there exists in the database only. A server whose identity is Clerk and whose keys are
// missing refuses the invitation: a roster row no provider was told about could never be
// signed in to. Consumed by the route handler.
import { localDirectory, type IdentityDirectory } from "@trader/api";

import { createClerkDirectory } from "./clerk-directory";
import { clerkEnv } from "./clerk-env";
import { identityMode } from "./identity-mode";

export const webDirectory: IdentityDirectory = {
  admit(person) {
    if (identityMode(process.env) === "dev") return localDirectory.admit(person);
    const env = clerkEnv(process.env);
    if (env === null) {
      return Promise.reject(new Error("no identity provider is configured"));
    }
    return createClerkDirectory({ secretKey: env.secretKey, fetch }).admit(person);
  },
};
