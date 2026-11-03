-- The application's runtime role (ARCHITECTURE invariants 4 and 5). Created here, in SQL,
-- never through the Neon console, CLI or API: those make a role a member of neon_superuser,
-- which has BYPASSRLS. Roles are cluster-wide, so a database replayed on a server that already
-- has the role finds it and moves on. No password in the repository: Juan Pablo sets it once
-- per environment with ALTER ROLE trader_app PASSWORD in psql. NOINHERIT: it gains nothing
-- from any role it is later granted. Attributes are stated only at creation; an existing
-- role's drift is the startup guard's to catch, because altering SUPERUSER or BYPASSRLS needs
-- privileges the Neon owner may not hold. Created with `generate --custom`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trader_app') THEN
    CREATE ROLE trader_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO trader_app;
--> statement-breakpoint
-- Per-table, and stated again by every migration that adds a table: no default privileges,
-- so an append-only table never inherits UPDATE. TRUNCATE is granted nowhere. DELETE only
-- where the domain deletes: crew membership removal (crews.ts), a draft invoice and its lines
-- (invoices.ts, invoice-line-items.ts). The company row and its counter row are created by
-- onboarding as the owner, so the app role neither inserts them nor deletes them.
GRANT SELECT, UPDATE ON companies, invoice_counters TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users, crews, customers, jobs, pay_rates, pay_periods,
  approvals, materials, photos TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON crew_members TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices, invoice_line_items TO trader_app;
--> statement-breakpoint
-- The append-only tables: the 0002/0010/0012 triggers refuse UPDATE, DELETE and TRUNCATE for
-- every role; withholding the privilege refuses them earlier, with 42501.
GRANT SELECT, INSERT ON work_session_events, credit_memos, audit_log TO trader_app;
