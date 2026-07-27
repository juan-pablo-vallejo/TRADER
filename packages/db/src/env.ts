/**
 * Database connection resolution, in one place so the driver switch and the
 * migration-vs-runtime URL distinction are not scattered.
 */

const isTrue = (v: string | undefined) => v === "true" || v === "1";

export const useLocalPostgres = (): boolean => isTrue(process.env.USE_LOCAL_POSTGRES);

/**
 * Connection string for the application at runtime.
 *
 * Local: a plain Postgres server (docker compose).
 * Neon: the POOLED string — many short-lived serverless invocations.
 */
export function runtimeDatabaseUrl(): string {
  const url = useLocalPostgres()
    ? process.env.LOCAL_DATABASE_URL
    : process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      useLocalPostgres()
        ? "LOCAL_DATABASE_URL is not set (USE_LOCAL_POSTGRES=true). Run `pnpm db:up`."
        : "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return url;
}

/**
 * Connection string for DDL (drizzle-kit generate/migrate).
 *
 * On Neon this must be the UNPOOLED/direct string: running DDL through PgBouncer
 * in transaction-pooling mode is a well-known foot-gun — session-scoped state that
 * migrations rely on does not survive statement-level pooling. Falls back to the
 * runtime URL locally, where there is no pooler.
 */
export function migrationDatabaseUrl(): string {
  if (useLocalPostgres()) return runtimeDatabaseUrl();

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Migrations need Neon's direct (unpooled) connection string.",
    );
  }
  return url;
}
