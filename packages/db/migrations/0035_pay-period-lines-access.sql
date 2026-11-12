-- pay_period_lines (0034): what a close exported is never rewritten (PRD, Labor: a closed pay
-- period and its export are immutable; V1-D03), it belongs to one tenant, and the application
-- role may read and add it and nothing else. Created with `generate --custom`; drizzle-kit
-- never sees triggers, row-level security, policies or grants.
-- Append-only as 0002 and 0017: a later change to exported hours is an adjustment line in a
-- later period, never an edit of this one.
CREATE TRIGGER pay_period_lines_no_update BEFORE UPDATE ON pay_period_lines
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER pay_period_lines_no_delete BEFORE DELETE ON pay_period_lines
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER pay_period_lines_no_truncate BEFORE TRUNCATE ON pay_period_lines
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Row-level security as 0014, 0017, 0020, 0029 and 0031.
ALTER TABLE pay_period_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pay_period_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pay_period_lines_tenant ON pay_period_lines FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
-- Stated per table (0013): an append-only table never inherits UPDATE or DELETE.
GRANT SELECT, INSERT ON pay_period_lines TO trader_app;
