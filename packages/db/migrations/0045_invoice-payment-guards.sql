-- Recorded payments (0044): guards, tenancy and privileges (ARCHITECTURE, Payments and
-- delivery; TASKS R7). Created with `generate --custom`; drizzle-kit never sees triggers,
-- row-level security, policies or grants.
--
-- A payment is against an issued invoice that is not void, in its currency. The invoice's
-- row is locked FOR NO KEY UPDATE, so two payments of one invoice, and a payment and a void
-- of it, are judged one after the other. The payments that stand — neither reversed nor a
-- reversal — never total more than the invoice: its lines and its tax, which issue froze.
-- A reversal names a standing payment of the same invoice, for its amount.
CREATE FUNCTION check_invoice_payment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv record;
  target record;
  standing bigint;
  total bigint;
BEGIN
  SELECT i.issued_at, i.voided_at, i.tax_cents INTO inv FROM invoices i
    WHERE i.company_id = NEW.company_id AND i.id = NEW.invoice_id FOR NO KEY UPDATE;
  -- An invoice that is missing, or another company's, is the foreign key's to refuse.
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF inv.issued_at IS NULL OR inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_payments: a payment is against an issued invoice that is not void',
      CONSTRAINT = 'invoice_payments_invoice_issued';
  END IF;
  IF NEW.reverses_payment_id IS NOT NULL THEN
    SELECT p.invoice_id, p.amount_cents, p.reverses_payment_id INTO target
      FROM invoice_payments p
      WHERE p.company_id = NEW.company_id AND p.id = NEW.reverses_payment_id;
    IF FOUND AND (target.invoice_id <> NEW.invoice_id
        OR target.reverses_payment_id IS NOT NULL
        OR target.amount_cents <> NEW.amount_cents) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoice_payments: a reversal names a payment of the same invoice, for its amount',
        CONSTRAINT = 'invoice_payments_reversal';
    END IF;
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(p.amount_cents), 0) INTO standing FROM invoice_payments p
    WHERE p.invoice_id = NEW.invoice_id AND p.reverses_payment_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM invoice_payments r WHERE r.reverses_payment_id = p.id);
  SELECT coalesce(sum(l.amount_cents), 0) + inv.tax_cents INTO total FROM invoice_line_items l
    WHERE l.invoice_id = NEW.invoice_id;
  IF standing + NEW.amount_cents > total THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_payments: payments never total more than the invoice',
      CONSTRAINT = 'invoice_payments_not_overpaid';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_payments_check_insert BEFORE INSERT ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION check_invoice_payment_insert();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_update BEFORE UPDATE ON invoice_payments
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_delete BEFORE DELETE ON invoice_payments
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_truncate BEFORE TRUNCATE ON invoice_payments
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_payments_tenant ON invoice_payments FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON invoice_payments TO trader_app;
