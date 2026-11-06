// TASKS:50: the kill switch's state, pure. The most restrictive verdict wins; a fault is never
// `normal`; configuration errors name variables, never values; reports are latched.
import { describe, expect, it } from "vitest";

import {
  createConfigLatch,
  serviceStatus,
  type ServiceState,
  type StatusClient,
} from "../src/status";
import { SYNC_PROTOCOL } from "../src/sync/protocol";

const ONE = { min: 1, max: 1 };
const client = (over: Partial<StatusClient> = {}): StatusClient => ({
  protocolVersion: 1,
  platform: "ios",
  build: 10,
  ...over,
});
const stateOf = (
  env: Record<string, string | undefined>,
  c: StatusClient = client(),
  p = ONE,
): ServiceState => serviceStatus(env, c, p).state;

describe("serviceStatus", () => {
  it("speaks the protocol the sync procedures accept", () => {
    expect(SYNC_PROTOCOL).toEqual({ min: 1, max: 1 });
  });

  it("is normal with nothing configured: blank and unset are the defaults", () => {
    expect(stateOf({})).toBe("normal");
    expect(
      stateOf({
        TRADER_SYNC_MODE: "",
        TRADER_MIN_BUILD_IOS: "",
        TRADER_MIN_BUILD_ANDROID: "",
      }),
    ).toBe("normal");
    expect(serviceStatus({}, client({ build: 1 }), ONE)).toEqual({
      state: "normal",
      invalid: [],
    });
  });

  it("answers each configured mode", () => {
    expect(stateOf({ TRADER_SYNC_MODE: "read_only" })).toBe("read_only");
    expect(stateOf({ TRADER_SYNC_MODE: "paused" })).toBe("paused");
  });

  it("tells a build below its own platform's minimum to update, and only that platform", () => {
    const env = { TRADER_MIN_BUILD_IOS: "10", TRADER_MIN_BUILD_ANDROID: "200" };
    expect(stateOf(env, client({ platform: "ios", build: 9 }))).toBe("update_required");
    expect(stateOf(env, client({ platform: "ios", build: 10 }))).toBe("normal");
    expect(stateOf(env, client({ platform: "ios", build: 11 }))).toBe("normal");
    expect(stateOf(env, client({ platform: "android", build: 199 }))).toBe(
      "update_required",
    );
    expect(stateOf(env, client({ platform: "android", build: 200 }))).toBe("normal");
    // iOS build 150 is above iOS's minimum; Android's 200 does not apply to it.
    expect(stateOf(env, client({ platform: "ios", build: 150 }))).toBe("normal");
  });

  it("judges the protocol against a real range: below updates, above waits", () => {
    const range = { min: 2, max: 3 };
    expect(stateOf({}, client({ protocolVersion: 1 }), range)).toBe("update_required");
    expect(stateOf({}, client({ protocolVersion: 2 }), range)).toBe("normal");
    expect(stateOf({}, client({ protocolVersion: 3 }), range)).toBe("normal");
    expect(stateOf({}, client({ protocolVersion: 4 }), range)).toBe("paused");
    expect(stateOf({}, client({ protocolVersion: 2 }), ONE)).toBe("paused");
  });

  it("takes the most restrictive verdict", () => {
    const old = client({ build: 1 });
    const min = { TRADER_MIN_BUILD_IOS: "5" };
    expect(stateOf({ ...min, TRADER_SYNC_MODE: "paused" }, old)).toBe("update_required");
    expect(stateOf({ ...min, TRADER_SYNC_MODE: "read_only" }, old)).toBe(
      "update_required",
    );
    expect(
      stateOf({ TRADER_SYNC_MODE: "read_only" }, client({ protocolVersion: 2 })),
    ).toBe("paused");
    expect(stateOf({ TRADER_SYNC_MODE: "paused" }, client({ protocolVersion: 2 }))).toBe(
      "paused",
    );
    expect(stateOf({ TRADER_SYNC_MODE: "read_only" }, client())).toBe("read_only");
  });

  it("pauses on any invalid variable, naming it and never its value", () => {
    const cases: [Record<string, string>, string[]][] = [
      [{ TRADER_SYNC_MODE: "paued" }, ["TRADER_SYNC_MODE"]],
      [{ TRADER_SYNC_MODE: "update_required" }, ["TRADER_SYNC_MODE"]],
      [{ TRADER_SYNC_MODE: "NORMAL" }, ["TRADER_SYNC_MODE"]],
      [{ TRADER_MIN_BUILD_IOS: "1o" }, ["TRADER_MIN_BUILD_IOS"]],
      [{ TRADER_MIN_BUILD_IOS: "0" }, ["TRADER_MIN_BUILD_IOS"]],
      [{ TRADER_MIN_BUILD_IOS: "-1" }, ["TRADER_MIN_BUILD_IOS"]],
      [{ TRADER_MIN_BUILD_IOS: "1.5" }, ["TRADER_MIN_BUILD_IOS"]],
      [{ TRADER_MIN_BUILD_IOS: " 2" }, ["TRADER_MIN_BUILD_IOS"]],
      [{ TRADER_MIN_BUILD_IOS: "9007199254740993" }, ["TRADER_MIN_BUILD_IOS"]],
      // The other platform's variable still counts: a bad deployment is paused for everyone.
      [{ TRADER_MIN_BUILD_ANDROID: "x" }, ["TRADER_MIN_BUILD_ANDROID"]],
      [
        { TRADER_SYNC_MODE: "nope", TRADER_MIN_BUILD_ANDROID: "x" },
        ["TRADER_SYNC_MODE", "TRADER_MIN_BUILD_ANDROID"],
      ],
    ];
    for (const [env, names] of cases) {
      const answer = serviceStatus(env, client(), ONE);
      expect(answer, JSON.stringify(env)).toEqual({ state: "paused", invalid: names });
      for (const value of Object.values(env)) {
        expect(JSON.stringify(answer.invalid)).not.toContain(`"${value}"`);
      }
    }
  });

  it("still tells an old build to update under an invalid configuration", () => {
    const env = { TRADER_SYNC_MODE: "nope", TRADER_MIN_BUILD_IOS: "5" };
    expect(stateOf(env, client({ build: 1 }))).toBe("update_required");
  });
});

describe("createConfigLatch", () => {
  it("reports a fault once, a different fault again, and resets on a valid configuration", () => {
    const latch = createConfigLatch();
    expect(latch([])).toBe(false);
    expect(latch(["TRADER_SYNC_MODE"])).toBe(true);
    expect(latch(["TRADER_SYNC_MODE"])).toBe(false);
    expect(latch(["TRADER_SYNC_MODE"])).toBe(false);
    expect(latch(["TRADER_MIN_BUILD_IOS"])).toBe(true);
    expect(latch([])).toBe(false);
    expect(latch(["TRADER_MIN_BUILD_IOS"])).toBe(true);
  });
});
