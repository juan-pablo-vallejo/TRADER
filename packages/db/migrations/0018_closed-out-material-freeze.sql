-- A material a submitted closeout covered is locked (PRD, Day closeout): its facts never
-- change again; a later change is a correcting entry (a scheduled Stage 3 task). The receipt
-- total is not something the foreman reviews — the office fills it in later (PRD, Materials
-- and photos) — so cost_cents and currency stay writable, with materials_cost_complete still
-- pairing them. Whole-row comparison, as 0015's guard, so a column added later is frozen
-- without editing this function. DELETE is refused outright; trader_app holds no DELETE on
-- materials anyway (42501 first), and TRUNCATE is refused by the membership foreign key.
-- Membership is looked up under the caller's RLS: a member shares its material's company.
-- Created with `generate --custom`.
CREATE FUNCTION reject_closed_out_material_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM day_closeout_materials m
    WHERE m.company_id = OLD.company_id AND m.material_id = OLD.id
  ) AND (
    -- Explicit, though NEW is NULL on DELETE and the comparison below would refuse it too.
    TG_OP = 'DELETE'
    OR (to_jsonb(NEW) - 'cost_cents' - 'currency' - 'updated_at')
      IS DISTINCT FROM (to_jsonb(OLD) - 'cost_cents' - 'currency' - 'updated_at')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = format('materials: a closed-out material is frozen: %s rejected', TG_OP),
      CONSTRAINT = 'materials_closed_out_frozen',
      HINT = 'Record a correcting entry instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER materials_closed_out_frozen BEFORE UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION reject_closed_out_material_change();
