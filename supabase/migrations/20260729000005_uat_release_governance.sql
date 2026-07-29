-- ============================================================
-- DFP UAT Agent — Release Governance Migration
-- ============================================================
-- Adds human release approval gate with:
--   - uat_release_candidates (release tracking)
--   - uat_release_approvals (approval decisions)
--   - uat_risk_acceptances (risk exceptions)
--   - uat_release_gate_checks (server-side gate evaluation)
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. uat_release_candidates
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS uat_release_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES uat_projects(id) ON DELETE SET NULL,
  test_run_id UUID REFERENCES uat_test_runs(id) ON DELETE SET NULL,
  release_name TEXT NOT NULL,
  release_version TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'uat',
  target_build_reference TEXT NOT NULL,
  application_git_sha TEXT NOT NULL,
  application_branch TEXT NOT NULL DEFAULT 'main',
  test_plan_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','testing','review_required','not_ready','ready_with_warnings',
      'ready_for_approval','approval_pending','approved_for_release',
      'release_rejected','risk_acceptance_required','risk_accepted',
      'approval_expired','approval_invalidated','released',
      'release_failed','rolled_back'
    )),
  readiness_score INTEGER NOT NULL DEFAULT 0,
  critical_bug_count INTEGER NOT NULL DEFAULT 0,
  high_bug_count INTEGER NOT NULL DEFAULT 0,
  medium_bug_count INTEGER NOT NULL DEFAULT 0,
  low_bug_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  blocking_issue_count INTEGER NOT NULL DEFAULT 0,
  required_retest_count INTEGER NOT NULL DEFAULT 0,
  ai_recommendation TEXT
    CHECK (ai_recommendation IS NULL OR ai_recommendation IN (
      'not_ready','ready_with_warnings','ready_for_human_review'
    )),
  ai_recommendation_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_candidates_status ON uat_release_candidates(status);
CREATE INDEX IF NOT EXISTS idx_release_candidates_project ON uat_release_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_release_candidates_test_run ON uat_release_candidates(test_run_id);
CREATE INDEX IF NOT EXISTS idx_release_candidates_git_sha ON uat_release_candidates(application_git_sha);
CREATE INDEX IF NOT EXISTS idx_release_candidates_created_at ON uat_release_candidates(created_at);

-- ----------------------------------------------------------
-- 2. uat_release_approvals
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS uat_release_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_candidate_id UUID NOT NULL REFERENCES uat_release_candidates(id) ON DELETE CASCADE,
  decision TEXT NOT NULL
    CHECK (decision IN (
      'approve','reject','request_retest','accept_risk',
      'withdraw_approval','invalidate_approval'
    )),
  decision_status TEXT NOT NULL DEFAULT 'pending',
  approved_build_reference TEXT NOT NULL,
  approved_git_sha TEXT NOT NULL,
  approved_test_run_id UUID REFERENCES uat_test_runs(id) ON DELETE SET NULL,
  approved_fingerprint_hash TEXT NOT NULL,
  decision_note TEXT NOT NULL,
  conditions TEXT,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  withdrawn_by TEXT,
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_approvals_candidate ON uat_release_approvals(release_candidate_id);
CREATE INDEX IF NOT EXISTS idx_release_approvals_decision ON uat_release_approvals(decision);
CREATE INDEX IF NOT EXISTS idx_release_approvals_expires ON uat_release_approvals(expires_at);
CREATE INDEX IF NOT EXISTS idx_release_approvals_approved_by ON uat_release_approvals(approved_by);

-- ----------------------------------------------------------
-- 3. uat_risk_acceptances
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS uat_risk_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_candidate_id UUID NOT NULL REFERENCES uat_release_candidates(id) ON DELETE CASCADE,
  bug_id UUID REFERENCES uat_bug_reports(id) ON DELETE SET NULL,
  risk_level TEXT NOT NULL,
  risk_summary TEXT NOT NULL,
  business_justification TEXT NOT NULL,
  mitigation_plan TEXT NOT NULL,
  monitoring_plan TEXT,
  planned_fix_date DATE,
  review_date DATE NOT NULL,
  accepted_by TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  second_approver TEXT,
  withdrawn_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_acceptances_candidate ON uat_risk_acceptances(release_candidate_id);
CREATE INDEX IF NOT EXISTS idx_risk_acceptances_bug ON uat_risk_acceptances(bug_id);
CREATE INDEX IF NOT EXISTS idx_risk_acceptances_status ON uat_risk_acceptances(status);
CREATE INDEX IF NOT EXISTS idx_risk_acceptances_expires ON uat_risk_acceptances(expires_at);

-- ----------------------------------------------------------
-- 4. uat_release_gate_checks
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS uat_release_gate_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_candidate_id UUID NOT NULL REFERENCES uat_release_candidates(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL
    CHECK (check_type IN (
      'latest_test_run_completed','test_run_matches_build','git_sha_matches_build',
      'required_test_plan_completed','no_unresolved_critical_bugs',
      'high_bug_policy_satisfied','required_retests_completed',
      'evidence_upload_complete','backup_status_acceptable',
      'restore_readiness_acceptable','playwright_fingerprint_complete',
      'security_checks_passed','production_testing_permission_valid',
      'approval_not_expired'
    )),
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('passed','warning','failed','not_applicable','unknown')),
  blocking BOOLEAN NOT NULL DEFAULT false,
  safe_summary TEXT NOT NULL DEFAULT '',
  evidence_reference TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_checks_candidate ON uat_release_gate_checks(release_candidate_id);
CREATE INDEX IF NOT EXISTS idx_gate_checks_type ON uat_release_gate_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_gate_checks_status ON uat_release_gate_checks(status);

-- ----------------------------------------------------------
-- 5. Updated-at triggers
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_uat_release_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_uat_release_candidates') THEN
    CREATE TRIGGER trg_update_uat_release_candidates
      BEFORE UPDATE ON uat_release_candidates
      FOR EACH ROW EXECUTE FUNCTION update_uat_release_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_uat_release_approvals') THEN
    CREATE TRIGGER trg_update_uat_release_approvals
      BEFORE UPDATE ON uat_release_approvals
      FOR EACH ROW EXECUTE FUNCTION update_uat_release_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_uat_risk_acceptances') THEN
    CREATE TRIGGER trg_update_uat_risk_acceptances
      BEFORE UPDATE ON uat_risk_acceptances
      FOR EACH ROW EXECUTE FUNCTION update_uat_release_updated_at();
  END IF;
END;
$$;

-- ----------------------------------------------------------
-- 6. RLS Policies
-- ----------------------------------------------------------
ALTER TABLE uat_release_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_risk_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_release_gate_checks ENABLE ROW LEVEL SECURITY;

-- Staff can read all release data
CREATE POLICY read_release_candidates ON uat_release_candidates FOR SELECT TO authenticated USING (public.is_staff_user());
CREATE POLICY read_release_approvals ON uat_release_approvals FOR SELECT TO authenticated USING (public.is_staff_user());
CREATE POLICY read_risk_acceptances ON uat_risk_acceptances FOR SELECT TO authenticated USING (public.is_staff_user());
CREATE POLICY read_gate_checks ON uat_release_gate_checks FOR SELECT TO authenticated USING (public.is_staff_user());

-- Only authorised staff can insert/update release data
-- (Actual permission enforcement happens server-side via API routes)
CREATE POLICY insert_release_candidates ON uat_release_candidates FOR INSERT TO authenticated WITH CHECK (public.is_staff_user());
CREATE POLICY update_release_candidates ON uat_release_candidates FOR UPDATE TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());
CREATE POLICY insert_release_approvals ON uat_release_approvals FOR INSERT TO authenticated WITH CHECK (public.is_staff_admin());
CREATE POLICY update_release_approvals ON uat_release_approvals FOR UPDATE TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
CREATE POLICY insert_risk_acceptances ON uat_risk_acceptances FOR INSERT TO authenticated WITH CHECK (public.is_staff_admin());
CREATE POLICY update_risk_acceptances ON uat_risk_acceptances FOR UPDATE TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
CREATE POLICY insert_gate_checks ON uat_release_gate_checks FOR INSERT TO authenticated WITH CHECK (public.is_staff_admin());

COMMIT;