-- Reference counter generator: AAP/FNPL/YYYY/NNNN
CREATE OR REPLACE FUNCTION next_reference(
  target_year integer DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Nairobi'))::integer
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_val integer;
BEGIN
  INSERT INTO reference_counters (year, last_value, created_at, updated_at)
  VALUES (target_year, 1, now(), now())
  ON CONFLICT (year) DO UPDATE
    SET last_value = reference_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO next_val;

  RETURN format('AAP/FNPL/%s/%s', target_year, lpad(next_val::text, 4, '0'));
END;
$$;--> statement-breakpoint

-- Job card sequential numbering starting at 1708
CREATE SEQUENCE IF NOT EXISTS job_cards_job_no_seq START WITH 1708 INCREMENT BY 1;--> statement-breakpoint
ALTER TABLE job_cards ALTER COLUMN job_no SET DEFAULT nextval('job_cards_job_no_seq');--> statement-breakpoint

-- Trigger 1: reject direct applications.status writes outside transition()
CREATE OR REPLACE FUNCTION guard_application_status_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.allow_status_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct update to applications.status is forbidden; use transition()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_applications_status_guard
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION guard_application_status_write();--> statement-breakpoint

-- Trigger 2a: immutable documents once issued
CREATE OR REPLACE FUNCTION guard_immutable_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.immutable = true OR OLD.status = 'issued' THEN
    RAISE EXCEPTION 'Issued documents are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_documents_immutable
BEFORE UPDATE OR DELETE ON documents
FOR EACH ROW
EXECUTE FUNCTION guard_immutable_document();--> statement-breakpoint

-- Trigger 2b: signatures are immutable
CREATE OR REPLACE FUNCTION guard_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is forbidden', TG_TABLE_NAME, TG_OP;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_signatures_append_only
BEFORE UPDATE OR DELETE ON signatures
FOR EACH ROW
EXECUTE FUNCTION guard_append_only();--> statement-breakpoint

-- Trigger 2c: lender_submissions.package is immutable after insert
CREATE OR REPLACE FUNCTION guard_lender_submission_package()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lender_submissions rows cannot be deleted';
  END IF;
  IF NEW.package IS DISTINCT FROM OLD.package THEN
    RAISE EXCEPTION 'lender_submissions.package is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_lender_submissions_package_immutable
BEFORE UPDATE OR DELETE ON lender_submissions
FOR EACH ROW
EXECUTE FUNCTION guard_lender_submission_package();--> statement-breakpoint

-- Trigger 2d: signed scopes and their scope_items are immutable (R9)
CREATE OR REPLACE FUNCTION guard_signed_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Signed scopes cannot be deleted';
    END IF;
    -- Allow only transitioning a signed scope to superseded when a new version replaces it
    IF NOT (
      NEW.status = 'superseded'
      AND NEW.subtotal_kes = OLD.subtotal_kes
      AND NEW.vat_kes = OLD.vat_kes
      AND NEW.total_kes = OLD.total_kes
      AND NEW.signature_id IS NOT DISTINCT FROM OLD.signature_id
    ) THEN
      RAISE EXCEPTION 'Signed scopes are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_scopes_signed_immutable
BEFORE UPDATE OR DELETE ON scopes
FOR EACH ROW
EXECUTE FUNCTION guard_signed_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_signed_scope_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status text;
  target_scope_id uuid;
BEGIN
  target_scope_id := COALESCE(NEW.scope_id, OLD.scope_id);
  SELECT status INTO parent_status FROM scopes WHERE id = target_scope_id;
  IF parent_status IN ('signed', 'superseded') THEN
    RAISE EXCEPTION 'Items on a signed scope are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_scope_items_signed_immutable
BEFORE INSERT OR UPDATE OR DELETE ON scope_items
FOR EACH ROW
EXECUTE FUNCTION guard_signed_scope_items();--> statement-breakpoint

-- Trigger 3: append-only audit_log, status_history, auth_events
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION guard_append_only();--> statement-breakpoint

CREATE TRIGGER trg_status_history_append_only
BEFORE UPDATE OR DELETE ON status_history
FOR EACH ROW
EXECUTE FUNCTION guard_append_only();--> statement-breakpoint

CREATE TRIGGER trg_auth_events_append_only
BEFORE UPDATE OR DELETE ON auth_events
FOR EACH ROW
EXECUTE FUNCTION guard_append_only();--> statement-breakpoint

-- Trigger 5: fee_payments.amount_kes must equal inspection_fee_kes setting at insert
CREATE OR REPLACE FUNCTION guard_fee_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_fee integer;
BEGIN
  SELECT COALESCE((value)::integer, 1500) INTO expected_fee
  FROM settings
  WHERE key = 'inspection_fee_kes';

  IF expected_fee IS NULL THEN
    expected_fee := 1500;
  END IF;

  IF NEW.amount_kes <> expected_fee THEN
    RAISE EXCEPTION 'fee_payments.amount_kes (%) must equal inspection_fee_kes setting (%)', NEW.amount_kes, expected_fee;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_fee_payments_amount_check
BEFORE INSERT ON fee_payments
FOR EACH ROW
EXECUTE FUNCTION guard_fee_payment_amount();--> statement-breakpoint

-- Helper functions for RLS policies
CREATE OR REPLACE FUNCTION app_kind() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(current_setting('app.kind', true), ''); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT COALESCE(current_setting('app.user_id', true), ''); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_customer_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.customer_id', true), '')::uuid; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_lender_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.lender_id', true), '')::uuid; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_has_role(target_role text) RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT target_role = ANY(string_to_array(COALESCE(current_setting('app.roles', true), ''), ',')); $$;--> statement-breakpoint

-- Row-Level Security (RLS) policies
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scopes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE repayment_terms ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE lender_submissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE lender_decisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Applications RLS
CREATE POLICY applications_system_all ON applications
  USING (app_kind() = 'system') WITH CHECK (app_kind() = 'system');--> statement-breakpoint
CREATE POLICY applications_customer_own ON applications
  USING (app_kind() = 'customer' AND customer_id = app_customer_id())
  WITH CHECK (app_kind() = 'customer' AND customer_id = app_customer_id());--> statement-breakpoint
CREATE POLICY applications_staff_access ON applications
  USING (app_kind() = 'staff' AND (app_has_role('admin') OR app_has_role('ops_reviewer') OR app_has_role('ops_approver') OR app_has_role('accounts') OR app_has_role('garage') OR app_has_role('assessor')))
  WITH CHECK (app_kind() = 'staff');--> statement-breakpoint
CREATE POLICY applications_lender_own ON applications
  FOR SELECT
  USING (
    app_kind() = 'lender'
    AND lender_id = app_lender_id()
    AND EXISTS (
      SELECT 1 FROM lender_submissions ls
      WHERE ls.application_id = applications.id AND ls.lender_id = app_lender_id()
    )
  );--> statement-breakpoint

-- Child tables following applications access (bookings, consents, uploads, scopes, documents, offers, repayment_terms)
CREATE POLICY bookings_rls ON bookings
  USING (
    app_kind() = 'system'
    OR app_kind() = 'staff'
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = bookings.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = bookings.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY consents_rls ON consents
  USING (
    app_kind() = 'system'
    OR app_kind() = 'staff'
    OR (app_kind() = 'customer' AND customer_id = app_customer_id())
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = consents.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY uploads_rls ON uploads
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND NOT (app_has_role('assessor') AND NOT app_has_role('admin') AND NOT app_has_role('ops_reviewer')))
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = uploads.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = uploads.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY scopes_rls ON scopes
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND NOT (app_has_role('assessor') AND NOT app_has_role('admin') AND NOT app_has_role('ops_reviewer')))
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = scopes.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = scopes.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY documents_rls ON documents
  USING (
    app_kind() = 'system'
    OR app_kind() = 'staff'
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = documents.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = documents.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY offers_rls ON offers
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND NOT (app_has_role('assessor') AND NOT app_has_role('admin')))
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = offers.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = offers.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

CREATE POLICY repayment_terms_rls ON repayment_terms
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND NOT (app_has_role('assessor') AND NOT app_has_role('admin')))
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = repayment_terms.application_id AND a.customer_id = app_customer_id()))
    OR (app_kind() = 'lender' AND EXISTS (SELECT 1 FROM applications a JOIN lender_submissions ls ON ls.application_id = a.id WHERE a.id = repayment_terms.application_id AND a.lender_id = app_lender_id() AND ls.lender_id = app_lender_id()))
  );--> statement-breakpoint

-- Inspections, findings, inspection_photos RLS (lenders read via documents package only)
CREATE POLICY inspections_rls ON inspections
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND (app_has_role('admin') OR app_has_role('ops_reviewer') OR app_has_role('ops_approver')))
    OR (app_kind() = 'staff' AND app_has_role('assessor') AND assessor_id = app_user_id())
    OR (app_kind() = 'customer' AND status = 'released' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = inspections.application_id AND a.customer_id = app_customer_id()))
  );--> statement-breakpoint

CREATE POLICY findings_rls ON findings
  USING (
    app_kind() = 'system'
    OR EXISTS (SELECT 1 FROM inspections i WHERE i.id = findings.inspection_id)
  );--> statement-breakpoint

CREATE POLICY inspection_photos_rls ON inspection_photos
  USING (
    app_kind() = 'system'
    OR EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_photos.inspection_id)
  );--> statement-breakpoint

-- Lender submissions and decisions RLS
CREATE POLICY lender_submissions_rls ON lender_submissions
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'lender' AND lender_id = app_lender_id())
    OR (app_kind() = 'staff' AND (app_has_role('admin') OR app_has_role('ops_reviewer') OR app_has_role('ops_approver') OR app_has_role('accounts')))
  );--> statement-breakpoint

CREATE POLICY lender_decisions_rls ON lender_decisions
  USING (
    app_kind() = 'system'
    OR EXISTS (SELECT 1 FROM lender_submissions ls WHERE ls.id = lender_decisions.submission_id)
  );--> statement-breakpoint

-- Fee payments RLS
CREATE POLICY fee_payments_rls ON fee_payments
  USING (
    app_kind() = 'system'
    OR (app_kind() = 'staff' AND (app_has_role('admin') OR app_has_role('accounts')))
    OR (app_kind() = 'customer' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = fee_payments.application_id AND a.customer_id = app_customer_id()))
  );--> statement-breakpoint

-- Audit log and auth events RLS: admin read, any app context insert
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT
  USING (app_kind() = 'system' OR (app_kind() = 'staff' AND app_has_role('admin')));--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (true);--> statement-breakpoint

CREATE POLICY auth_events_select ON auth_events
  FOR SELECT
  USING (app_kind() = 'system' OR (app_kind() = 'staff' AND app_has_role('admin')));--> statement-breakpoint
CREATE POLICY auth_events_insert ON auth_events
  FOR INSERT
  WITH CHECK (true);
