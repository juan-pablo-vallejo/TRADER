// `/get`'s two links and which phone is asking (server/app-links.ts).
import { describe, expect, it } from "vitest";

import { appLinks, deviceOf } from "../src/server/app-links";

describe("where the app is got from", () => {
  it("is each variable's https address, and nothing for one unset or malformed", () => {
    expect(
      appLinks({
        TRADER_GET_IOS_URL: "https://testflight.apple.com/join/abc123",
        TRADER_GET_ANDROID_URL: " https://play.google.com/apps/internaltest/1 ",
      }),
    ).toEqual({
      ios: "https://testflight.apple.com/join/abc123",
      android: "https://play.google.com/apps/internaltest/1",
    });
    expect(appLinks({})).toEqual({ ios: null, android: null });
    expect(appLinks({ TRADER_GET_IOS_URL: "", TRADER_GET_ANDROID_URL: "   " })).toEqual({
      ios: null,
      android: null,
    });
    // Not a link a page should send anyone to.
    expect(
      appLinks({
        TRADER_GET_IOS_URL: "javascript:alert(1)",
        TRADER_GET_ANDROID_URL: "http://play.google.com/x",
      }),
    ).toEqual({ ios: null, android: null });
    expect(appLinks({ TRADER_GET_IOS_URL: "ask the office" }).ios).toBeNull();
  });
});

describe("which phone is asking", () => {
  it("is read from what the browser says of itself", () => {
    expect(
      deviceOf(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe("ios");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36")).toBe(
      "android",
    );
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("other");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("other");
    expect(deviceOf(null)).toBe("other");
    expect(deviceOf("")).toBe("other");
  });
});
