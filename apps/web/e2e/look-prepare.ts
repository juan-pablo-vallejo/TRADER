// The preparation the look harness (look.local.config.ts) and the office suite
// (local.config.ts) run once, before their pages: beside the demo company `pnpm demo`
// wrote, a second company with one admin and nothing else, so every office screen can be
// seen empty. Written by the seed, as the demo's own company is, into the demo database
// the config names (PREPARE_DB) and no other.
import path from "node:path";

import { createDb, seed } from "@trader/db";

import { EMAILS } from "./screens";

export const LOOK_DB = "trader_demo_look";

export default async function prepare(): Promise<void> {
  try {
    process.loadEnvFile(path.join(__dirname, "../../../.env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const name = process.env.PREPARE_DB ?? LOOK_DB;
  if (!/^trader_demo_[a-z0-9]{1,16}$/.test(name))
    throw new Error(`${name} is no demo database`);
  const db = createDb({ ...process.env, POSTGRES_DB: name, DATABASE_URL: "" });
  try {
    await db.transaction((tx) =>
      seed(tx, {
        companyId: "019a4a00-0000-7000-8000-0000000e0e70",
        companyName: "Empty Look Co.",
        timezone: "America/New_York",
        adminEmail: EMAILS.empty,
        adminName: "Eve Empty",
      }),
    );
  } finally {
    await db.$client.end();
  }
}
