-- Row-level security on every tenant table (ARCHITECTURE invariant 4). app_company_id() is
-- the one reader of app.company_id. current_setting(..., true) returns NULL when the setting
-- was never set in the session, but '' once any earlier transaction set it locally, and
-- ''::uuid raises 22P02; nullif maps both to NULL. company_id = NULL is never true, so a
-- request that forgot the tenant reads zero rows and writes none: fail closed, no error. A
-- malformed value still raises 22P02, also closed. Created with `generate --custom`.
CREATE FUNCTION app_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid
$$;
--> statement-breakpoint
-- The tenant itself: a company sees and edits only its own row.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY companies_tenant ON companies FOR ALL TO trader_app
  USING (id = public.app_company_id()) WITH CHECK (id = public.app_company_id());
--> statement-breakpoint
-- One policy per table, FOR ALL, USING equal to WITH CHECK, so a row can neither be read nor
-- written nor moved outside the tenant. FORCE so the owner obeys it too unless it bypasses RLS
-- by attribute (a superuser locally, neon_superuser on Neon): the owner is the migrator, never
-- the runtime role. Referential-integrity checks — foreign keys, cascades, uniques — bypass
-- row security by design, whoever owns the tables. The list is the
-- tables with company_id; the inventory test and the startup guard read the catalog, so a
-- table missing here fails both.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'crews', 'crew_members', 'customers', 'jobs',
    'work_session_events', 'pay_rates', 'pay_periods', 'approvals', 'materials', 'photos',
    'invoice_counters', 'invoices', 'invoice_line_items', 'credit_memos', 'audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO trader_app '
      'USING (company_id = public.app_company_id()) '
      'WITH CHECK (company_id = public.app_company_id())',
      t || '_tenant', t);
  END LOOP;
END
$$;
