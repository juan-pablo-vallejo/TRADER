// A material quantity at the API boundary: a decimal string with at most nine integer and three
// fractional digits — numeric(12,3) — and above zero, rewritten as Postgres prints the column
// ("2.5" → "2.500"), so equal quantities compare equal as text. Never a float. Consumed by
// materials/correct.ts (an amend) and sync/material.ts (a receipt).
import { z } from "zod";

export const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/)
  .transform((q) => {
    const [whole, fraction = ""] = q.split(".");
    return `${BigInt(whole!).toString()}.${fraction.padEnd(3, "0")}`;
  })
  .refine((q) => q !== "0.000", "quantity must be above zero");
