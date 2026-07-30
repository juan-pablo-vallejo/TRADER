/**
 * Server-side (Postgres) schema.
 *
 * The device-side SQLite schema arrives in Phase 1 under `src/schema-sqlite/`.
 * Drizzle's `pg-core` and `sqlite-core` are separate dialects, so those are two
 * definitions sharing the enums and types declared here — one ORM and one
 * migration tool, not one schema file.
 */
export * from "./_shared";
export * from "./enums";

export * from "./companies";
export * from "./users";
export * from "./crews";
export * from "./customers";
export * from "./jobs";
export * from "./workSessionEvents";
export * from "./materials";
export * from "./invoices";
export * from "./auditLog";
