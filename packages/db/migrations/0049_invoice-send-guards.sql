-- Recorded invoice sends (0048): guards, tenancy and privileges (ARCHITECTURE, Payments and
-- delivery; TASKS R7). Created with `generate --custom`; drizzle-kit never sees triggers,
-- row-level security, policies or grants.
--
-- A send is of an issued invoice that is not void: a draft has no page to send, and a void
-- one is not sent to a customer. The lookup is inside the row's own company; an invoice
-- that is missing there is the foreign key's to refuse. A row is never changed or removed:
-- a send that failed stays a failed send, and sending again is another row.
CREATE FUNCTION check_invoice_send_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv record;
BEGIN
  SELECT i.issued_at, i.voided_at INTO inv FROM invoices i
    WHERE i.company_id = NEW.company_id AND i.id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF inv.issued_at IS NULL OR inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_sends: a send is of an issued invoice that is not void',
      CONSTRAINT = 'invoice_sends_invoice_issued';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_sends_check_insert BEFORE INSERT ON invoice_sends
  FOR EACH ROW EXECUTE FUNCTION check_invoice_send_insert();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_update BEFORE UPDATE ON invoice_sends
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_delete BEFORE DELETE ON invoice_sends
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_truncate BEFORE TRUNCATE ON invoice_sends
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE invoice_sends ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_sends FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_sends_tenant ON invoice_sends FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON invoice_sends TO trader_app;
