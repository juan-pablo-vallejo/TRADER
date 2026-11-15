// An invoice's arithmetic (ARCHITECTURE, invariant 3: money is integer minor units; Invoice
// pricing, V1-D14). A line's amount is its quantity times its unit price, rounded half-up to
// the cent — what the database's own check computes (invoice_line_items, 0009) — worked in
// integers: the quantity in thousandths, never a float. The subtotal is the sum of the
// lines; the total adds the tax the admin entered. Nothing here knows a pay rate or a
// receipt's cost: a price is whatever the admin typed. Pure. Consumed by draft.ts and
// read.ts.
import { z } from "zod";

import { quantity } from "../materials/quantity";

// What an `integer` column holds: the ceiling of every amount stored.
export const MAX_CENTS = 2_147_483_647;
export const MAX_LINES = 100;

const cents = z.number().int().min(0).max(MAX_CENTS);

export const lineInput = z.strictObject({
  id: z.uuid(),
  description: z.string().trim().min(1).max(500),
  quantity,
  unit: z.string().trim().min(1).max(32).nullable(),
  // What the customer is charged for one unit: entered by the admin, never derived.
  unitPriceCents: cents,
  // The receipt a line was drawn from, kept as provenance; its quantity and description
  // were copied when the line was made and do not follow the receipt.
  materialId: z.uuid().nullable(),
});
export const taxInput = cents;

// Null when the amount would not fit the column.
export function amountCents(quantityText: string, unitPriceCents: number): number | null {
  const [whole, fraction = ""] = quantityText.split(".");
  const thousandths = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, "0"));
  const rounded = (thousandths * BigInt(unitPriceCents) + 500n) / 1000n;
  return rounded > BigInt(MAX_CENTS) ? null : Number(rounded);
}

export function totals(lines: readonly { amountCents: number }[], taxCents: number) {
  const subtotalCents = lines.reduce((n, l) => n + l.amountCents, 0);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

// Hundredths of an hour as a line's quantity: "8.50".
export const hoursQuantity = (hundredths: number) =>
  `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
