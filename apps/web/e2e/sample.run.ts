// Staging's API, timed (item 24e): seven of the office's reads, each called ROUNDS times
// as the suite's admin, one call a second (under the firewall's 60 a minute). For each call:
// the time the browser waited, and the server's own time and statement count from its
// Server-Timing answer (handler.ts), which staging sends and production does not. The
// sample is written as JSON to SAMPLE_FILE, under the commit staging said it serves; a
// summary is printed. It only reads: nothing on staging changes.
import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { signInByTicket } from "./ticket-session";

const ROUNDS = 5;
const GAP_MS = 1_000;
const file = process.env.SAMPLE_FILE ?? "";
const ticket = process.env.E2E_ADMIN_TICKET ?? "";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const CALLS: { path: string; input?: unknown }[] = [
  { path: "me.get" },
  { path: "company.get" },
  { path: "overview.today" },
  { path: "roster.list" },
  { path: "job.list" },
  { path: "invoice.list" },
  { path: "labor.hours", input: { from: day(-6), to: day(0) } },
];

type Timed = {
  path: string;
  round: number;
  status: number;
  clientMs: number;
  serverMs: number | null;
  statements: number | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? null : s[Math.floor((s.length - 1) / 2)];
};

test("staging's API, sampled", async ({ page, request }) => {
  expect(file, "SAMPLE_FILE is set").not.toBe("");
  expect(ticket, "E2E_ADMIN_TICKET is set").not.toBe("");
  const ready = (await (await request.get("/api/ready")).json()) as { commit?: string };

  expect(await signInByTicket(page, ticket), "the ticket signs the admin in").toBe(true);
  await page.goto("/today");

  const calls: Timed[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    for (const call of CALLS) {
      const query =
        call.input === undefined
          ? ""
          : `?input=${encodeURIComponent(JSON.stringify({ json: call.input }))}`;
      const timed = await page.evaluate(async (url) => {
        const t0 = performance.now();
        const res = await fetch(url, { credentials: "include" });
        await res.text();
        return {
          status: res.status,
          clientMs: performance.now() - t0,
          timing: res.headers.get("server-timing"),
        };
      }, `/api/trpc/${call.path}${query}`);
      const m = /desc="[^"]*, (\d+) statements";dur=([\d.]+)/.exec(timed.timing ?? "");
      calls.push({
        path: call.path,
        round,
        status: timed.status,
        clientMs: Math.round(timed.clientMs * 10) / 10,
        serverMs: m ? Number(m[2]) : null,
        statements: m ? Number(m[1]) : null,
      });
      await page.waitForTimeout(GAP_MS);
    }
  }

  const sample = {
    commit: ready.commit ?? null,
    takenAt: new Date().toISOString(),
    calls,
  };
  writeFileSync(file, `${JSON.stringify(sample, null, 2)}\n`);
  console.log(`commit ${sample.commit}, ${calls.length} calls, written to ${file}`);
  console.log(
    "path | status | statements | server ms median, max | browser ms median, max",
  );
  for (const { path } of CALLS) {
    const of = calls.filter((c) => c.path === path);
    const server = of.flatMap((c) => (c.serverMs === null ? [] : [c.serverMs]));
    const client = of.map((c) => c.clientMs);
    console.log(
      [
        path,
        [...new Set(of.map((c) => c.status))].join("/"),
        [...new Set(of.map((c) => c.statements))].join("/"),
        `${median(server)}, ${Math.max(...server)}`,
        `${median(client)}, ${Math.max(...client)}`,
      ].join(" | "),
    );
  }
  expect(
    calls.every((c) => c.status === 200),
    "every call answered 200",
  ).toBe(true);
});
