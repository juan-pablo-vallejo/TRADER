// Stage 4, hours and cost aggregation: the rate a work date is priced at. Pure.
import { describe, expect, it } from "vitest";

import { rateOn } from "../../src/roster/rate-on";

describe("rateOn", () => {
  const rates = [
    { effectiveFrom: "2026-10-05", hourlyRateCents: 3000 },
    { effectiveFrom: "2025-10-05", hourlyRateCents: 2800 },
    { effectiveFrom: "2026-10-12", hourlyRateCents: 3200 },
  ];

  it("is the newest rate that had started on that day, whatever the rows' order", () => {
    expect(rateOn(rates, "2026-10-04")?.hourlyRateCents).toBe(2800);
    expect(rateOn(rates, "2026-10-05")?.hourlyRateCents).toBe(3000);
    expect(rateOn(rates, "2026-10-11")?.hourlyRateCents).toBe(3000);
    expect(rateOn(rates, "2026-10-12")?.hourlyRateCents).toBe(3200);
    expect(rateOn([...rates].reverse(), "2026-10-11")?.hourlyRateCents).toBe(3000);
  });

  it("is null before the first rate, and with no rate at all", () => {
    expect(rateOn(rates, "2025-10-04")).toBeNull();
    expect(rateOn([], "2026-10-05")).toBeNull();
  });
});
