// core/pg-error.ts: a database refusal read by shape. The web build can hold two copies of
// drizzle-orm, and an error from one is no instance of the other's class: a reader that
// asked `instanceof` answered a refusal the database had named with a 500 on the deployed
// route (seen 2026-11-15, an overpayment), while every suite, which loads one copy, was
// green. These errors are of no class this file imports.
import { describe, expect, it } from "vitest";

import { pgFailure } from "../../src/core/pg-error";

class SomeoneElsesQueryError extends Error {}

describe("pgFailure", () => {
  it("reads the SQLSTATE and the constraint from the cause, whatever class wrapped it", () => {
    const wrapped = new SomeoneElsesQueryError("Failed query: insert …", {
      cause: { code: "23000", constraint: "invoice_payments_not_overpaid", message: "…" },
    });
    expect(pgFailure(wrapped)).toEqual({
      code: "23000",
      constraint: "invoice_payments_not_overpaid",
    });
    expect(
      pgFailure({
        cause: { code: "23505", constraint: "users_identity_subject_unique" },
      }),
    ).toEqual({ code: "23505", constraint: "users_identity_subject_unique" });
  });

  it("answers nothing for an error that carries no database cause", () => {
    for (const error of [
      new Error("plain"),
      new Error("with a text cause", { cause: "timeout" }),
      { cause: null },
      { cause: { code: 23505, constraint: 7 } },
      null,
      undefined,
      "string",
    ]) {
      expect(pgFailure(error)).toEqual({ code: undefined, constraint: undefined });
    }
  });
});
