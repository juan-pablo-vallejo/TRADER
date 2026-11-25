// How a name is ordered in every list of either app and in the payroll file: by ICU's root
// collation, an accented letter beside its plain one and a capital beside its small letter.
// The database orders by the same collation (core/order.ts, "und-x-icu").
const collator = new Intl.Collator("und");

export const compareNames = (a: string, b: string): number => collator.compare(a, b);
