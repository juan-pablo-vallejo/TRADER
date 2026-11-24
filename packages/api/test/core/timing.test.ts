// The timing line (core/trpc.ts, core/observe.ts): every call, at every gate, reports its
// path, its time and its statements once to the context's observer, whether it succeeds or
// fails; an observer that throws changes no answer.
import { afterAll, expect, it } from "vitest";

import { createCallerFactory } from "../../src/core/trpc";
import { createContext } from "../../src/core/context";
import { localDirectory } from "../../src/core/identity";
import type { CallLine } from "../../src/core/observe";
import { appRouter } from "../../src/router";
import { REQUEST_ID, appDb, member, ownerDb, quietReporter, world } from "../helpers";

const owner = ownerDb();
const app = appDb();
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const callerWith = (who: unknown, observe: (line: CallLine) => void) =>
  createCallerFactory(appRouter)(
    createContext({
      db: app,
      identity: who,
      directory: localDirectory,
      reporter: quietReporter,
      requestId: REQUEST_ID,
      observe,
    }),
  );

it("reports a signed-in call with its statements, and a refused one with its code", async () => {
  const w = await world(owner);
  try {
    const { who } = await member(owner, w, "a", "admin", { label: "timing" });
    const lines: CallLine[] = [];
    const api = callerWith(who, (line) => lines.push(line));
    await api.customer.list();
    await expect(
      callerWith(null, (line) => lines.push(line)).customer.list(),
    ).rejects.toThrow();
    expect(lines).toHaveLength(2);
    const [ok, refused] = lines as [CallLine, CallLine];
    expect(ok).toMatchObject({
      requestId: REQUEST_ID,
      path: "customer.list",
      type: "query",
      ok: true,
      code: null,
    });
    expect(ok.statements).toBeGreaterThan(4);
    expect(ok.ms).toBeGreaterThanOrEqual(0);
    expect(refused).toMatchObject({
      path: "customer.list",
      ok: false,
      code: "UNAUTHORIZED",
      statements: 0,
    });
  } finally {
    await w.cleanup();
  }
});

it("reports a public call, and an observer that throws changes nothing", async () => {
  const lines: CallLine[] = [];
  const status = await callerWith(null, (line) => {
    lines.push(line);
    throw new Error("observer down");
  }).status.get({ protocolVersion: 1, platform: "ios", build: 1 });
  expect(status).toBeDefined();
  expect(lines.map((l) => [l.path, l.ok])).toEqual([["status.get", true]]);
});
