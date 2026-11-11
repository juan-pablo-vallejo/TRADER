// TASKS:50: status.get through the fetch adapter, as the route handler will serve it. Public:
// answered with no identity, a garbage one, and a database that fails on any use. Its answer
// is exactly `{ version, state }`; malformed input is a 400 and never reported; an invalid
// configuration pauses, reported once however many requests arrive.
import type { Db } from "@trader/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../../src/router";
import { failure, http, recordingReporter } from "../helpers";

// Any use of the database — a property read, a call — throws.
const unusable = new Proxy(
  {},
  {
    get() {
      throw new Error("status.get touched the database");
    },
  },
) as Db;

const ok = { protocolVersion: 1, platform: "ios", build: 10 };
const ask = (input: unknown, opts: Parameters<typeof http>[3] = {}) =>
  http(unusable, null, [{ path: "status.get", input }], { router: appRouter, ...opts });
const answerOf = (r: Awaited<ReturnType<typeof ask>>) => r.results[0]?.result?.data.json;

const CONFIG = ["TRADER_SYNC_MODE", "TRADER_MIN_BUILD_IOS", "TRADER_MIN_BUILD_ANDROID"];
function configure(env: Record<string, string>) {
  for (const name of CONFIG) vi.stubEnv(name, env[name] ?? "");
}
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("status.get", () => {
  it("answers with no identity, a garbage identity, and an unusable database", async () => {
    configure({});
    for (const who of [null, { subject: "", email: "not an email" }, "garbage"]) {
      const r = await http(unusable, who, [{ path: "status.get", input: ok }], {
        router: appRouter,
      });
      expect(r.status).toBe(200);
      expect(answerOf(r)).toEqual({ version: 1, state: "normal" });
    }
  });

  it("answers exactly version and state, nothing else", async () => {
    configure({ TRADER_SYNC_MODE: "read_only", TRADER_MIN_BUILD_IOS: "7" });
    const answer = answerOf(await ask(ok));
    expect(answer).toEqual({ version: 1, state: "read_only" });
    expect(Object.keys(answer as object).sort()).toEqual(["state", "version"]);
  });

  it("answers each state from configuration and build", async () => {
    configure({ TRADER_SYNC_MODE: "paused" });
    expect(answerOf(await ask(ok))).toEqual({ version: 1, state: "paused" });
    configure({ TRADER_MIN_BUILD_ANDROID: "50" });
    expect(answerOf(await ask({ ...ok, platform: "android", build: 49 }))).toEqual({
      version: 1,
      state: "update_required",
    });
    expect(answerOf(await ask({ ...ok, build: 49 }))).toEqual({
      version: 1,
      state: "normal",
    });
  });

  it("refuses malformed input with 400, reporting nothing", async () => {
    configure({});
    const { reporter, events } = recordingReporter();
    const bad = [
      { ...ok, platform: "web" },
      { ...ok, platform: "windows" },
      { ...ok, build: "10" },
      { ...ok, build: 0 },
      { ...ok, build: 1.5 },
      { ...ok, build: 2 ** 53 },
      { ...ok, protocolVersion: 0 },
      { ...ok, protocolVersion: "1" },
      { platform: "ios", build: 10 },
      null,
    ];
    for (const input of bad) {
      const r = await ask(input, { reporter });
      expect(failure(r.results[0]).code, JSON.stringify(input)).toBe("BAD_REQUEST");
    }
    expect(events).toEqual([]);
  });

  it("answers a later build that sends a field this server does not know", async () => {
    configure({});
    expect(answerOf(await ask({ ...ok, locale: "es" }))).toEqual({
      version: 1,
      state: "normal",
    });
  });

  it("never answers normal on a fault: invalid configuration, a protocol ahead of the server", async () => {
    configure({ TRADER_SYNC_MODE: "paued" });
    expect(answerOf(await ask(ok))).toEqual({ version: 1, state: "paused" });
    configure({});
    expect(answerOf(await ask({ ...ok, protocolVersion: 2 }))).toEqual({
      version: 1,
      state: "paused",
    });
  });

  it("reports an invalid configuration once, by name, however many ask", async () => {
    const { reporter, events } = recordingReporter();
    // A valid configuration first resets the instance's latch, whatever ran before.
    configure({});
    await ask(ok, { reporter });
    configure({ TRADER_SYNC_MODE: "paued", TRADER_MIN_BUILD_IOS: "secret-value-1o" });
    for (let i = 0; i < 3; i++) await ask(ok, { reporter });
    expect(events).toEqual([
      expect.objectContaining({
        source: "config",
        path: "status.get",
        invalid: ["TRADER_SYNC_MODE", "TRADER_MIN_BUILD_IOS"],
      }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/paued|secret-value/);
  });
});
