// What Postgres said about a failed statement, read from the error Drizzle wraps it in.
// Read by shape, never by `instanceof DrizzleQueryError`: the web build can hold more than
// one copy of drizzle-orm (an added package can bring a second), and an error made by
// one copy is no instance of the other's class: a refusal the database named would arrive
// as a 500 from the deployed route while every test, which loads one copy, is green. The
// driver's own error is the `cause`; its `code` is the SQLSTATE and its `constraint` the
// name a guard raised with. Never the message: it holds the statement and
// its parameters.
export function pgFailure(error: unknown): { code?: string; constraint?: string } {
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  if (typeof cause !== "object" || cause === null) {
    return { code: undefined, constraint: undefined };
  }
  const { code, constraint } = cause as { code?: unknown; constraint?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    constraint: typeof constraint === "string" ? constraint : undefined,
  };
}
