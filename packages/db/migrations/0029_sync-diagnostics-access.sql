-- sync_diagnostics (0028): tenancy and the application role's privileges (ARCHITECTURE, sync
-- protocol: rejected-record diagnostics). Created with `generate --custom`; drizzle-kit never
-- sees row-level security, policies or grants.
-- Row-level security as 0014, 0017 and 0020.
ALTER TABLE sync_diagnostics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sync_diagnostics FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sync_diagnostics_tenant ON sync_diagnostics FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
-- SELECT and INSERT as any fact table, and DELETE, which no other fact table has: a line is
-- kept for a bounded period and the writer deletes its own company's expired ones. No UPDATE:
-- a line is never edited. No append-only guard for the same reason DELETE is granted.
GRANT SELECT, INSERT, DELETE ON sync_diagnostics TO trader_app;
