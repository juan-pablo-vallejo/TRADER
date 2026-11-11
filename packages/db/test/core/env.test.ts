import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { assertLocalDatabase, databaseConnection, parseDatabaseEnv } from "../../src/env";

const compose = {
  POSTGRES_USER: "trader",
  POSTGRES_PASSWORD: "secret",
  POSTGRES_DB: "trader",
};

describe("parseDatabaseEnv", () => {
  it("derives the local connection from the three compose variables", () => {
    expect(parseDatabaseEnv(compose)).toEqual({
      driver: "pg",
      poolMax: 10,
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
      poolMax: 10,
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

describe("DATABASE_POOL_MAX", () => {
  it("sizes the pool, and a blank value is the default", () => {
    expect(parseDatabaseEnv({ ...compose, DATABASE_POOL_MAX: "3" }).poolMax).toBe(3);
    expect(parseDatabaseEnv({ ...compose, DATABASE_POOL_MAX: "" }).poolMax).toBe(10);
  });

  it("rejects zero, a fraction and a word", () => {
    for (const DATABASE_POOL_MAX of ["0", "2.5", "many"]) {
      expect(() => parseDatabaseEnv({ ...compose, DATABASE_POOL_MAX })).toThrow(ZodError);
    }
  });
});

describe("assertLocalDatabase", () => {
  it("passes on the compose variables, and on a blank DATABASE_URL", () => {
    expect(() => assertLocalDatabase(compose, "tests")).not.toThrow();
    expect(() =>
      assertLocalDatabase({ ...compose, DATABASE_URL: "" }, "tests"),
    ).not.toThrow();
  });

  it("refuses when DATABASE_URL is set, without printing it", () => {
    const env = { ...compose, DATABASE_URL: "postgres://u:hunter2@h/d" };
    expect(() => assertLocalDatabase(env, "tests")).toThrow(/DATABASE_URL is set/);
    try {
      assertLocalDatabase(env, "tests");
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});
