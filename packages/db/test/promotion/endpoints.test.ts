// Which databases a promotion may speak to (ARCHITECTURE, 2026-11-16, endpoint pins).
// No database; the strings are made up.
import { describe, expect, it } from "vitest";

import { endpointFaults } from "../../src/promotion/endpoints";

const STAGING = "ep-quiet-lake-a1b2c3d4";
const REHEARSAL = "ep-tall-tree-e5f6g7h8";
const direct = (endpoint: string) =>
  `postgresql://owner:pw@${endpoint}.c-1.us-east-1.aws.example.test/neondb?sslmode=require`;
const pooled = (endpoint: string) => direct(`${endpoint}-pooler`);

const faults = (over: Partial<Parameters<typeof endpointFaults>[0]> = {}) =>
  endpointFaults({
    stagingUrl: direct(STAGING),
    rehearsalUrl: direct(REHEARSAL),
    stagingEndpoint: STAGING,
    rehearsalEndpoint: REHEARSAL,
    ...over,
  });

describe("endpointFaults", () => {
  it("passes two direct strings, each on the endpoint stated for it", () => {
    expect(faults()).toEqual([]);
    expect(faults({ stagingEndpoint: ` ${STAGING}\n` })).toEqual([]);
    expect(
      faults({ stagingUrl: direct(STAGING).replace("postgresql:", "postgres:") }),
    ).toEqual([]);
  });

  it("refuses a string on any other endpoint", () => {
    expect(faults({ stagingUrl: direct("ep-prod-main-z9y8x7w6") })).toEqual([
      "staging_url_on_another_endpoint",
    ]);
    expect(faults({ rehearsalUrl: direct("ep-prod-main-z9y8x7w6") })).toEqual([
      "rehearsal_url_on_another_endpoint",
    ]);
    // A longer id that only begins with the stated one is another endpoint.
    expect(faults({ stagingUrl: direct(`${STAGING}x`) })).toEqual([
      "staging_url_on_another_endpoint",
    ]);
  });

  it("refuses a pooled string, by name", () => {
    expect(faults({ stagingUrl: pooled(STAGING) })).toEqual(["staging_url_pooled"]);
    expect(faults({ rehearsalUrl: pooled(REHEARSAL) })).toEqual(["rehearsal_url_pooled"]);
  });

  it("refuses the two strings crossed, and one database stated twice", () => {
    expect(
      faults({ stagingUrl: direct(REHEARSAL), rehearsalUrl: direct(STAGING) }),
    ).toEqual(["staging_url_on_another_endpoint", "rehearsal_url_on_another_endpoint"]);
    expect(faults({ rehearsalUrl: direct(STAGING), rehearsalEndpoint: STAGING })).toEqual(
      ["endpoints_equal"],
    );
  });

  it("refuses an endpoint that is not stated, or stated as anything but an id", () => {
    expect(faults({ stagingEndpoint: "" })).toEqual(["staging_endpoint_not_stated"]);
    expect(faults({ rehearsalEndpoint: "" })).toEqual(["rehearsal_endpoint_not_stated"]);
    for (const bad of [
      `${STAGING}-pooler`,
      `${STAGING}.c-1.us-east-1`,
      "EP-QUIET",
      "*",
    ]) {
      expect(faults({ stagingEndpoint: bad })).toEqual(["staging_endpoint_not_stated"]);
    }
  });

  it("refuses a string it cannot read, and says nothing of it", () => {
    for (const bad of ["", "not a url", `https://${STAGING}.example.test/x`]) {
      expect(faults({ stagingUrl: bad })).toEqual(["staging_url_unreadable"]);
    }
  });
});
