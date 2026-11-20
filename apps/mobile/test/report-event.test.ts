// What the phone sends to Sentry: the allow-list, stated field by field. A report carries
// the build and the screen, and never a name, a number, a coordinate or an entry.
import type { Event } from "@sentry/react-native";
import { describe, expect, it } from "vitest";

import { screenTag, scrubEvent } from "../src/report-event";

const DEBUG_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("an event on its way out", () => {
  it("keeps the build, the screen, the class and the stack, and nothing else", () => {
    const event: Event = {
      event_id: "abc",
      timestamp: 1_795_000_000,
      level: "error",
      platform: "javascript",
      environment: "staging",
      release: "app.jpteq.trader@0.1.0+12",
      dist: "12",
      message: "Luis Herrera +14015550142",
      user: { id: "u1", email: "luis@demo.invalid", ip_address: "10.0.0.1" },
      contexts: { device: { name: "Luis's iPhone" } },
      extra: { payload: { latitude: 41.82, longitude: -71.41 } },
      breadcrumbs: [{ message: "POST /api/trpc/sync.push" }],
      server_name: "phone",
      request: { url: "https://example.test/api?phone=+14015550142" },
      tags: {
        build: "12",
        screen: "/today",
        sync_stage: "push",
        sync_failure: "trpc_INTERNAL_SERVER_ERROR",
        worker: "Luis Herrera",
      },
      fingerprint: ["sync", "push", "trpc_INTERNAL_SERVER_ERROR"],
      exception: {
        values: [
          {
            type: "TRPCClientError",
            value: "Invalid input: +14015550142 at 41.82,-71.41",
            mechanism: { type: "onunhandledrejection", handled: false, data: { x: "1" } },
            stacktrace: {
              frames: [
                {
                  filename: "app:///main.jsbundle",
                  function: "runCycle",
                  lineno: 10,
                  colno: 4,
                  in_app: true,
                  vars: { phone: "+14015550142" },
                  context_line: "const phone = '+14015550142'",
                },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          { type: "sourcemap", debug_id: DEBUG_ID, code_file: "app:///main.jsbundle" },
          { type: "sourcemap", debug_id: "not an id", code_file: "app:///x" },
        ],
      },
    };
    expect(scrubEvent(event)).toEqual({
      event_id: "abc",
      timestamp: 1_795_000_000,
      level: "error",
      platform: "javascript",
      environment: "staging",
      release: "app.jpteq.trader@0.1.0+12",
      dist: "12",
      tags: {
        build: "12",
        screen: "/today",
        sync_stage: "push",
        sync_failure: "trpc_INTERNAL_SERVER_ERROR",
      },
      fingerprint: ["sync", "push", "trpc_INTERNAL_SERVER_ERROR"],
      exception: {
        values: [
          {
            type: "TRPCClientError",
            mechanism: { type: "generic", handled: false },
            stacktrace: {
              frames: [
                {
                  filename: "app:///main.jsbundle",
                  function: "runCycle",
                  lineno: 10,
                  colno: 4,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          { type: "sourcemap", debug_id: DEBUG_ID, code_file: "app:///main.jsbundle" },
        ],
      },
    });
    const sent = JSON.stringify(scrubEvent(event));
    for (const never of ["Luis", "4015550142", "41.82", "demo.invalid", "10.0.0.1"]) {
      expect(sent).not.toContain(never);
    }
  });

  it("drops a tag whose value is not a plain token", () => {
    expect(scrubEvent({ tags: { screen: "/today?phone=1\n2" } }).tags).toBeUndefined();
  });
});

describe("a screen's name", () => {
  it("is a route of the app and never an address with a value in it", () => {
    expect(screenTag("/today")).toBe("/today");
    expect(screenTag("/sign-in")).toBe("/sign-in");
    expect(screenTag("/")).toBe("/");
    expect(screenTag("/jobs/0190-abc")).toBeUndefined();
    expect(screenTag("/week?day=2026-11-20")).toBeUndefined();
  });
});
