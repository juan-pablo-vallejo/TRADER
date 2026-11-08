// TASKS:48 ("never the pilot's database"): the demo writes only into a database it created on
// the local compose server, named by the pattern; every other destination is refused before a
// connection is opened, and the configured development database receives nothing but the
// create and drop of that name.
import { createDb, type Db } from "@trader/db";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  DEMO_DB_PATTERN,
  demoTargetEnv,
  DemoTargetRefused,
  prepareTarget,
  recovery,
} from "../src/demo/target";
import { MIGRATIONS, spyOnQueries, uniqueDemoName } from "./demo-helpers";

const compose = { POSTGRES_USER: "u", POSTGRES_PASSWORD: "p", POSTGRES_DB: "trader" };

describe("demo target (pure)", () => {
  it("refuses the deployed shape, foreign names, blank configuration and the development database", () => {
    const refused = (env: Record<string, string | undefined>, name: string) => {
      try {
        demoTargetEnv(env, name);
      } catch (error) {
        expect(error).toBeInstanceOf(DemoTargetRefused);
        return (error as Error).message;
      }
      throw new Error("expected a refusal");
    };
    expect(
      refused({ ...compose, DATABASE_URL: "postgres://neon.example/db" }, "trader_demo"),
    ).toMatch(/DATABASE_URL is set/);
    expect(refused(compose, "trader")).toMatch(/not a demo database name/);
    expect(refused(compose, "")).toMatch(/not a demo database name/);
    expect(refused(compose, "trader_demo; drop database trader")).toMatch(
      /not a demo database name/,
    );
    expect(refused(compose, "TRADER_DEMO")).toMatch(/not a demo database name/);
    expect(refused({ ...compose, POSTGRES_DB: "" }, "trader_demo")).toMatch(
      /compose variables are incomplete/,
    );
    expect(refused({ ...compose, POSTGRES_DB: "trader_demo" }, "trader_demo")).toMatch(
      /configured development database/,
    );
  });

  it("hands back the compose environment pointed at the demo database", () => {
    expect(demoTargetEnv({ ...compose, DATABASE_URL: "" }, "trader_demo_ab12")).toEqual({
      ...compose,
      POSTGRES_DB: "trader_demo_ab12",
      DATABASE_URL: "",
    });
    expect(DEMO_DB_PATTERN.test("trader_demo")).toBe(true);
    expect(DEMO_DB_PATTERN.test("trader_demo_0123456789abcdef")).toBe(true);
    expect(DEMO_DB_PATTERN.test("trader_demo_0123456789abcdef0")).toBe(false);
    expect(recovery("trader_demo")).toBe("pnpm demo --reset");
    expect(recovery("trader_demo_x")).toBe("pnpm demo --reset --db trader_demo_x");
  });
});

describe("demo target (database)", () => {
  const name = uniqueDemoName();
  const pools: Db[] = [];
  const statements: string[] = [];
  // Every pool the module opens, with its statements recorded by the database it was opened on.
  const factory = (env: Record<string, string | undefined>) => {
    const db = createDb(env);
    pools.push(db);
    spyOnQueries(db, (text) => statements.push(`${env.POSTGRES_DB}: ${text}`));
    return db;
  };
  const onDevelopment = () =>
    statements
      .filter((s) => s.startsWith(`${process.env.POSTGRES_DB}: `))
      .map((s) =>
        s
          .slice(s.indexOf(": ") + 2)
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase(),
      );
  const admin = createDb();
  afterAll(async () => {
    await admin.$client.end();
  });
  const exists = async () => {
    const { rows } = await admin.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_database where datname = ${name}`,
    );
    return rows[0]!.n === 1;
  };

  it("creates and migrates the demo database, the app pool as trader_app; an existing one is refused unless reset", async () => {
    const target = await prepareTarget({
      env: process.env,
      name,
      reset: false,
      migrationsFolder: MIGRATIONS,
      createDb: factory,
    });
    expect(target.name).toBe(name);
    expect(await exists()).toBe(true);
    expect(onDevelopment()).toEqual([
      "select count(*)::int as n from pg_database where datname = $1",
      `create database "${name}"`,
    ]);
    const companies = await target.owner.execute<{ n: number }>(
      sql`select count(*)::int as n from companies`,
    );
    expect(companies.rows[0]!.n).toBe(0);
    const role = await target.app.execute<{ who: string }>(
      sql`select current_user as who`,
    );
    expect(role.rows[0]!.who).toBe("trader_app");

    statements.length = 0;
    await expect(
      prepareTarget({
        env: process.env,
        name,
        reset: false,
        migrationsFolder: MIGRATIONS,
        createDb: factory,
      }),
    ).rejects.toThrow(/already exists.*pnpm demo --reset --db/);
    expect(onDevelopment()).toEqual([
      "select count(*)::int as n from pg_database where datname = $1",
    ]);

    await target.close();
    statements.length = 0;
    const again = await prepareTarget({
      env: process.env,
      name,
      reset: true,
      migrationsFolder: MIGRATIONS,
      createDb: factory,
    });
    const dev = onDevelopment();
    expect(dev[0]).toBe("select count(*)::int as n from pg_database where datname = $1");
    expect(dev.at(-1)).toBe(`create database "${name}"`);
    expect(dev).toContain(`drop database "${name}"`);
    expect(
      dev.filter((s) => !s.startsWith("select count(*)::int as n from pg_stat_activity")),
    ).toHaveLength(3);

    await again.drop();
    expect(await exists()).toBe(false);
  }, 60_000);
});
