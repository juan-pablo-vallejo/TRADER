// Which language the app opens in: the first of the phone's languages that is one of ours,
// English when none is: a pure function of what the phone reported.
import { describe, expect, it } from "vitest";

import { preferred } from "../src/i18n/preferred";

describe("preferred", () => {
  it("takes the first of the phone's languages that the app has", () => {
    expect(preferred(["es", "en"])).toBe("es");
    expect(preferred(["pt", "es", "en"])).toBe("es");
    expect(preferred(["en"])).toBe("en");
  });

  it("is English when the phone has none of them, or reports nothing", () => {
    expect(preferred(["pt", "fr"])).toBe("en");
    expect(preferred([null])).toBe("en");
    expect(preferred([])).toBe("en");
  });
});
