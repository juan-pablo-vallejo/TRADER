-- Identity binding on users (ARCHITECTURE invariant 6). Before the tenant is known the request
-- context must find the caller's own row, and on first sign-in bind the invited row to the
-- verified login. The server sets app.identity_subject and app.identity_email from the
-- identity adapter, never from request input, and clears both before it sets app.company_id.
-- Two permissive policies OR with users_tenant, so with the tenant unset the caller sees only
-- its own row, or its unbound invitation(s), and nothing else. No SECURITY DEFINER function:
-- it would run as the owner, which under FORCE sees nothing unless it bypasses RLS (an open
-- Stage 6 question on Neon). Created with `generate --custom`.
CREATE FUNCTION app_identity_subject() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.identity_subject', true), '')
$$;
--> statement-breakpoint
CREATE FUNCTION app_identity_email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.identity_email', true), '')
$$;
--> statement-breakpoint
-- The bound login's own row, or an unbound invitation to the verified email. Email is unique
-- per company only, so this can show invitations in two companies; the request context
-- refuses anything other than exactly one.
CREATE POLICY users_identity_select ON users FOR SELECT TO trader_app
  USING (identity_subject = public.app_identity_subject()
    OR (identity_subject IS NULL AND lower(email) = lower(public.app_identity_email())));
--> statement-breakpoint
-- Which rows a bind may reach, and that the result is bound to the verified subject. Rows
-- only: what else the UPDATE may change is the guard's job below.
CREATE POLICY users_identity_bind ON users FOR UPDATE TO trader_app
  USING (identity_subject IS NULL AND lower(email) = lower(public.app_identity_email()))
  WITH CHECK (identity_subject = public.app_identity_subject());
--> statement-breakpoint
-- Column protection, for every role. RLS selects rows, and trader_app holds table-level UPDATE
-- on users because admins edit role and deactivated_at, so neither a policy nor a column grant
-- can tell a bind from an admin edit. The guard does:
--   1. identity_subject changes only by a bind: NULL to the verified subject, tenant unset, and
--      every other column but updated_at unchanged. A whole-row comparison, so a column added
--      later is covered without editing this function. No path sets, changes or clears a
--      bound login; unbinding is a future decision.
--   2. With either identity setting present, the bind is the only update permitted.
-- The tenant path, the seed and the migrator set neither, and never touch identity_subject.
CREATE FUNCTION guard_user_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identity_subject IS DISTINCT FROM OLD.identity_subject THEN
    IF OLD.identity_subject IS NULL
      AND NEW.identity_subject = public.app_identity_subject()
      AND public.app_company_id() IS NULL
      AND (to_jsonb(NEW) - 'identity_subject' - 'updated_at')
        = (to_jsonb(OLD) - 'identity_subject' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'users: identity_subject changes only by binding an invited row, alone';
  END IF;
  IF public.app_identity_subject() IS NOT NULL OR public.app_identity_email() IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'users: under a sign-in identity the only permitted update is the bind';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_identity_guard BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_user_identity();
