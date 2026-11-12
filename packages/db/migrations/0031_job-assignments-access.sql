-- job_assignments (0030): tenancy and the application role's privileges (ARCHITECTURE, Office
-- authority: dated assignments, V1-D07). Created with `generate --custom`; drizzle-kit never
-- sees row-level security, policies or grants.
-- Row-level security as 0014, 0017, 0020 and 0029.
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE job_assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY job_assignments_tenant ON job_assignments FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
-- A plan is not a fact: the office changes its day and times (UPDATE) and removes it (DELETE).
-- Nothing references a row and no ledger reads one, so neither can alter recorded labor.
GRANT SELECT, INSERT, UPDATE, DELETE ON job_assignments TO trader_app;
