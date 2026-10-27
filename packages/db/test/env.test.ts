import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { databaseConnection, parseDatabaseEnv } from "../src/env";

const compose = {
  POSTGRES_USER: "trader",
  POSTGRES_PASSWORD: "secret",
  POSTGRES_DB: "trader",
};

describe("parseDatabaseEnv", () => {
  it("derives the local connection from the three compose variables", () => {
    expect(parseDatabaseEnv(compose)).toEqual({
      driver: "pg",
      connection: {
        host: "127.0.0.1",
        port: 5432,
        user: "trader",
        password: "secret",
        database: "trader",
        ssl: false,
      },
    });
  });

  it("accepts DATABASE_URL alone, with no POSTGRES_* variables", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: "postgres://u:p@h/d" })).toEqual({
      driver: "pg",
      connection: { connectionString: "postgres://u:p@h/d" },
    });
  });

  it("prefers DATABASE_URL over the compose variables when both are set", () => {
    const env = { ...compose, DATABASE_URL: "postgres://u:p@h/d" };
    expect(databaseConnection(env)).toEqual({ connectionString: "postgres://u:p@h/d" });
  });

  it("rejects the derived form without a password", () => {
    const { POSTGRES_PASSWORD: _omitted, ...noPassword } = compose;
    expect(() => parseDatabaseEnv(noPassword)).toThrow(ZodError);
    expect(() => parseDatabaseEnv({ ...compose, POSTGRES_PASSWORD: "" })).toThrow(
      ZodError,
    );
  });

  it("rejects a driver other than pg", () => {
    expect(() => parseDatabaseEnv({ ...compose, DATABASE_DRIVER: "neon" })).toThrow(
      ZodError,
    );
  });
});
