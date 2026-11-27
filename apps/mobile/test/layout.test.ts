// The width and text classes a screen fits itself to (src/layout.ts), at their edges.
import { describe, expect, it, vi } from "vitest";

// React Native's own module does not load in a test; the classes need none of it.
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
}));

import { textClass, widthClass } from "../src/layout";

describe("the layout classes", () => {
  it("reads the window's width", () => {
    expect(widthClass(320)).toBe("compact");
    expect(widthClass(359)).toBe("compact");
    expect(widthClass(360)).toBe("regular");
    expect(widthClass(419)).toBe("regular");
    expect(widthClass(420)).toBe("wide");
  });

  it("reads the phone's text size", () => {
    expect(textClass(1)).toBe("default");
    expect(textClass(1.29)).toBe("default");
    expect(textClass(1.3)).toBe("large");
    expect(textClass(1.79)).toBe("large");
    // Android's largest, and iOS's accessibility sizes.
    expect(textClass(2)).toBe("huge");
    expect(textClass(3.1)).toBe("huge");
  });
});
