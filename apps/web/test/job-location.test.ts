// A job's location as one field (jobs/location.ts): a pasted pair and a maps address read
// into the same place, a short link refused by name, and nonsense refused.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RADIUS_M,
  locationText,
  parseLocation,
  parseRadius,
} from "../src/app/(office)/jobs/location";

const PLACE = { ok: true, lat: 41.824, lng: -71.4128 };

describe("a job's location, pasted", () => {
  it("reads a pair of coordinates as a map shows it", () => {
    for (const text of [
      "41.8240, -71.4128",
      "41.8240,-71.4128",
      "  41.824   -71.4128 ",
      "(41.8240, -71.4128)",
      "41.8240; -71.4128",
    ]) {
      expect([text, parseLocation(text)]).toEqual([text, PLACE]);
    }
  });

  it("reads a maps address that carries the pair into the same location", () => {
    for (const address of [
      // Google: the place's own pair, more exact than the view's center beside it.
      "https://www.google.com/maps/place/14+Elmgrove+Ave,+Providence,+RI/@41.8251,-71.4101,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.8240!4d-71.4128",
      "https://www.google.com/maps/@41.8240,-71.4128,17z",
      "https://www.google.com/maps?q=41.8240,-71.4128",
      "https://maps.google.com/?ll=41.8240,-71.4128&z=17",
      "https://www.google.com/maps/search/?api=1&query=41.8240%2C-71.4128",
      "https://www.google.com/maps?q=loc:41.8240,-71.4128",
      // Apple.
      "https://maps.apple.com/?ll=41.8240,-71.4128&q=Dropped%20Pin",
      "https://maps.apple.com/place?coordinate=41.8240,-71.4128",
      // Without its scheme, as an address bar copies it.
      "www.google.com/maps/@41.8240,-71.4128,17z",
    ]) {
      expect([address, parseLocation(address)]).toEqual([address, PLACE]);
    }
    // The pair and the address are one location.
    expect(parseLocation("https://www.google.com/maps?q=41.8240,-71.4128")).toEqual(
      parseLocation("41.8240, -71.4128"),
    );
  });

  it("refuses a short link by name: it hides the coordinates", () => {
    for (const short of [
      "https://maps.app.goo.gl/AbCdEf123456",
      "https://goo.gl/maps/AbCdEf",
      "maps.app.goo.gl/AbCdEf123456",
      "https://g.co/kgs/abc",
    ]) {
      expect([short, parseLocation(short)]).toEqual([
        short,
        { ok: false, problem: "short_link" },
      ]);
    }
  });

  it("refuses what is no pair and no address that carries one", () => {
    expect(parseLocation("")).toEqual({ ok: false, problem: "empty" });
    expect(parseLocation("   ")).toEqual({ ok: false, problem: "empty" });
    for (const text of [
      "14 Elmgrove Ave, Providence, RI",
      "41.8240",
      "north of the river",
      "https://www.google.com/maps/place/14+Elmgrove+Ave",
      "https://example.com/",
    ]) {
      expect([text, parseLocation(text)]).toEqual([
        text,
        { ok: false, problem: "unreadable" },
      ]);
    }
    expect(parseLocation("141.8, -71.4")).toEqual({ ok: false, problem: "out_of_range" });
    expect(parseLocation("41.8, -271.4")).toEqual({ ok: false, problem: "out_of_range" });
  });

  it("shows a stored location as the pair it would be pasted as", () => {
    expect(locationText({ lat: 41.824, lng: -71.4128 })).toBe("41.824, -71.4128");
    expect(parseLocation(locationText({ lat: 41.824, lng: -71.4128 }))).toEqual(PLACE);
    expect(locationText(null)).toBe("");
  });

  it("takes a radius in whole meters, 200 unless changed", () => {
    expect(DEFAULT_RADIUS_M).toBe(200);
    expect(parseRadius("200")).toBe(200);
    expect(parseRadius(" 50 ")).toBe(50);
    expect(parseRadius("100000")).toBe(100_000);
    for (const bad of ["", "0", "100001", "12.5", "-5", "wide"]) {
      expect([bad, parseRadius(bad)]).toEqual([bad, null]);
    }
  });
});
