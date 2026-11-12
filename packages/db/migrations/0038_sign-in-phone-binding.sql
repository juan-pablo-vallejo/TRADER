-- Identity binding by phone number (ARCHITECTURE, 2026-11-12 Release 0.1 sign-in). 0015 let a
-- first sign-in find and bind an invitation by its verified email; an invitation may now name
-- a mobile number instead, so the request context also sets app.identity_phone from the
-- identity adapter, and clears it with the other two before it sets app.company_id. Additive:
-- 0015's policies stay as they are and two more permissive ones OR with them. Created with
-- `generate --custom`.
CREATE FUNCTION app_identity_phone() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.identity_phone', true), '')
$$;
--> statement-breakpoint
-- An unbound invitation to the verified number. Exact match: both sides are E.164
-- (users_sign_in_phone_e164). The number is unique per company only, so this can show
-- invitations in two companies; the request context refuses anything other than exactly one.
CREATE POLICY users_identity_select_phone ON users FOR SELECT TO trader_app
  USING (identity_subject IS NULL AND sign_in_phone = public.app_identity_phone());
--> statement-breakpoint
CREATE POLICY users_identity_bind_phone ON users FOR UPDATE TO trader_app
  USING (identity_subject IS NULL AND sign_in_phone = public.app_identity_phone())
  WITH CHECK (identity_subject = public.app_identity_subject());
--> statement-breakpoint
-- 0015's guard, with the phone setting counted as a sign-in identity in its second rule. Its
-- first rule compares the whole row, so a bind cannot change sign_in_phone either.
CREATE OR REPLACE FUNCTION guard_user_identity() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF public.app_identity_subject() IS NOT NULL
    OR public.app_identity_email() IS NOT NULL
    OR public.app_identity_phone() IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'users: under a sign-in identity the only permitted update is the bind';
  END IF;
  RETURN NEW;
END;
$$;
