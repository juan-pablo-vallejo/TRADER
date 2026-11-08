// Entry point for `pnpm demo` (TASKS, Stage 4: demo fixture): the synthetic company written into
// a demo database of its own on the local compose server, through the real procedures. It reads
// the root .env as run-seed.ts does; shell variables win over it. Flags: --db <name> (default
// trader_demo, must match the demo pattern), --anchor YYYY-MM-DD (a Monday; default two weeks
// back), --reset (drop an existing demo database of that name first). Point the office at it
// with `POSTGRES_DB=trader_demo pnpm --filter @trader/web dev` and sign in as the demo admin.
import path from "node:path";
import { parseArgs } from "node:util";

import { seed } from "@trader/db";

import { DEMO } from "./demo/content";
import { defaultAnchor, ISO_DATE } from "./demo/ids";
import { DemoFailure, runDemo } from "./demo/run";
import {
  DEFAULT_DEMO_DB,
  DemoTargetRefused,
  prepareTarget,
  recovery,
} from "./demo/target";

try {
  process.loadEnvFile(path.join(__dirname, "../../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

async function main() {
  const { values } = parseArgs({
    options: {
      db: { type: "string", default: DEFAULT_DEMO_DB },
      anchor: { type: "string" },
      reset: { type: "boolean", default: false },
    },
  });
  const anchor = values.anchor ?? defaultAnchor(new Date(), DEMO.timezone);
  if (!ISO_DATE.test(anchor))
    throw new DemoTargetRefused(`--anchor must be YYYY-MM-DD, got "${anchor}"`);

  const target = await prepareTarget({
    env: process.env,
    name: values.db,
    reset: values.reset,
    migrationsFolder: path.join(__dirname, "../../db/migrations"),
  });
  console.log(`demo: database ${target.name} created and migrated; anchor ${anchor}`);
  let committed = 0;
  try {
    const summary = await runDemo({
      app: target.app,
      bootstrap: (company) =>
        target.owner.transaction((tx) => seed(tx, company)).then(() => undefined),
      anchor,
      onStep: (step) => {
        committed = step.index;
        console.log(`demo: ${String(step.index).padStart(2)}  ${step.name}`);
      },
    });
    await target.close();
    console.log(
      `demo: done in ${summary.steps} steps — ${summary.users} users, ${summary.jobs} jobs, ` +
        `${summary.events} labor events, ${summary.closeouts} closeouts, ${summary.approvals} approvals ` +
        `(${summary.decided} decided). Sign in as ${DEMO.adminEmail}.`,
    );
  } catch (error) {
    if (committed === 0) {
      await target.drop();
      console.error(
        `demo: failed before anything was committed; ${target.name} was dropped.`,
      );
    } else {
      await target.close();
      console.error(
        `demo: failed after ${committed} committed step(s); ${target.name} is kept for inspection. ` +
          `To start over: ${recovery(target.name)}`,
      );
    }
    throw error;
  }
}

// Not top-level await: tsx runs a package without "type": "module" as CommonJS.
main().catch((error: unknown) => {
  if (error instanceof DemoTargetRefused || error instanceof DemoFailure) {
    console.error(`demo: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
