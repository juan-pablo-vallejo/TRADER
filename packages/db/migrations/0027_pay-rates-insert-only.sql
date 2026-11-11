-- Pay rates are insert-only (ARCHITECTURE, roster API: one row per user and effective date, a
-- rate superseded by a later row, no UPDATE path in code). 0013 granted trader_app UPDATE on
-- pay_rates along with the roster tables, before that rule existed; no statement uses it.
-- Revoked here so the privilege says what the rule says: a changed rate is a new row, and a
-- rate that payroll already read cannot be rewritten through the application's connection.
-- A grant withdrawn from the application role removes no data and no column (invariant 8).
-- Created with `generate --custom`; drizzle-kit never sees grants.
REVOKE UPDATE ON pay_rates FROM trader_app;
