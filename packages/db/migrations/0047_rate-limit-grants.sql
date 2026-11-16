-- rate_limit_windows (0046): the application role's privileges (ARCHITECTURE, Edge
-- protection). Created with `generate --custom`; drizzle-kit never sees grants. The table
-- carries no company_id and takes no row-level security: a request is counted before it has
-- a tenant, and a row is a hash and a number — nothing of a company, a person or an address.
-- The role counts (INSERT, UPDATE), reads the count back (SELECT) and deletes windows that
-- have ended (DELETE).
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_windows TO trader_app;
