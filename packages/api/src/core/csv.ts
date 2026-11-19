// Comma-separated values as a spreadsheet or an import reads them (RFC 4180): cells joined by
// commas, rows by CRLF, a cell quoted when it holds a comma, a quote or a line break, a quote
// doubled. `text` is for a cell a person typed — a name, a description: when it begins with a
// character a spreadsheet would run as a formula it is led by an apostrophe, so a job named
// "=SUM(A1)" is read as its name. A number is never passed through `text`: a negative figure
// begins with a minus and must stay a number. Consumed by labor/export.ts.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export const text = (value: string): string =>
  FORMULA_LEAD.test(value) ? `'${value}` : value;

const cell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const csv = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => `${row.map(cell).join(",")}\r\n`).join("");

// Hundredths of an hour as a decimal, signed: 800 is "8.00", -150 is "-1.50".
export function hoursText(hundredths: number): string {
  if (!Number.isSafeInteger(hundredths)) throw new Error("hours are whole hundredths");
  const abs = Math.abs(hundredths);
  return `${hundredths < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
