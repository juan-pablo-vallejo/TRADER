// The development identity: trusts three request headers — a subject, and an email, a phone
// number or both — as a verified login, which is exactly
// why it is gated. Off unless TRADER_DEV_IDENTITY=enabled, and then only under an allowlisted
// NODE_ENV; every deployed build and runtime is NODE_ENV=production, so a deployment cannot
// accept a named identity. Nor is it trusted where DATABASE_URL is set: that is a deployed
// database, and a `dev:` sign-in would bind a
// person's row there for good. The check runs per request, never at module load, so `next build`
// never fails. Pure over the env record it is handed, like db/src/env.ts.
import { DEV_EMAIL_HEADER, DEV_PHONE_HEADER, DEV_SUBJECT_HEADER } from "../contract/dev";
import { z } from "zod";

import {
  verifiedIdentitySchema,
  type IdentityAdapter,
  type VerifiedIdentity,
} from "./identity";

// The header names live in the client-safe contract: the phone's development sign-in sends
// them (contract/dev.ts).
export { DEV_EMAIL_HEADER, DEV_PHONE_HEADER, DEV_SUBJECT_HEADER };

// An allowlist: unset or any other NODE_ENV is not development.
const DEVELOPMENT_NODE_ENVS = ["development", "test"];

const flagSchema = z.object({
  TRADER_DEV_IDENTITY: z
    .enum(["enabled", ""])
    .optional()
    .transform((v) => v === "enabled"),
});

// Whether the adapter would trust the headers: the flag, under an allowlisted NODE_ENV. A
// route that exists only for development answers 404 on false.
// Never throws, so a wrongly enabled deployment hides its routes while the adapter refuses.
export function devIdentityEnabled(env: Record<string, string | undefined>): boolean {
  const flag = flagSchema.safeParse(env);
  return (
    flag.success &&
    flag.data.TRADER_DEV_IDENTITY &&
    isDevelopmentNodeEnv(env) &&
    !onDeployedDatabase(env)
  );
}

const isDevelopmentNodeEnv = (env: Record<string, string | undefined>) =>
  DEVELOPMENT_NODE_ENVS.includes(env.NODE_ENV ?? "");

// The deployed shape of the database environment (db/src/env.ts): blank means local.
const onDeployedDatabase = (env: Record<string, string | undefined>) =>
  (env.DATABASE_URL ?? "") !== "";

export function createDevIdentityAdapter(
  env: Record<string, string | undefined> = process.env,
): IdentityAdapter {
  return {
    async identify(headers: Headers): Promise<VerifiedIdentity | null> {
      if (!flagSchema.parse(env).TRADER_DEV_IDENTITY) return null;
      // Enabled where it must never be: refuse loudly rather than serve as anyone.
      if (!isDevelopmentNodeEnv(env)) {
        throw new Error(
          `refusing the development identity: TRADER_DEV_IDENTITY is enabled under NODE_ENV=${env.NODE_ENV ?? "(unset)"}`,
        );
      }
      if (onDeployedDatabase(env)) {
        throw new Error(
          "refusing the development identity: TRADER_DEV_IDENTITY is enabled while DATABASE_URL is set",
        );
      }
      // A header that is absent is an address not claimed; one that is present must parse.
      const email = headers.get(DEV_EMAIL_HEADER);
      const phone = headers.get(DEV_PHONE_HEADER);
      const parsed = verifiedIdentitySchema.safeParse({
        subject: headers.get(DEV_SUBJECT_HEADER),
        ...(email !== null && { email, emailVerified: true }),
        ...(phone !== null && { phone, phoneVerified: true }),
      });
      return parsed.success ? parsed.data : null;
    },
  };
}
