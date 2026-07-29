-- ============================================================
-- DFP UAT Agent — Initial Database Migration
-- ============================================================
-- Created: 2026-07-29
-- Description: Core UAT Agent schema with RLS, indexes, and constraints.
-- 
-- ⚠️  IMPORTANT: This migration is idempotent where possible.
--    Run with: supabase migration up
--    Do NOT run automatically in production.
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Helper: staff role check function
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IN ('staff', 'admin'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ============================================================
-- 1. uat_projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_projects (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  description   text,
  approved_base_urls text[] NOT NULL DEFAULT '{}'::text[],
  environment   text NOT NULL DEFAULT 'uat'
                CHECK (environment IN ('demo', 'uat', 'staging', 'production')),
  enabled       boolean NOT NULL DEFAULT true,
  default_safety_policy jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_projects_enabled ON public.uat_projects (enabled) WHERE enabled = true;

ALTER TABLE public.uat_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view projects"
  ON public.uat_projects FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create projects"
  ON public.uat_projects FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update projects"
  ON public.uat_projects FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can delete projects"
  ON public.uat_projects FOR DELETE
  TO authenticated
  USING (public.is_staff_admin());

-- ============================================================
-- 2. uat_test_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_test_plans (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      uuid NOT NULL REFERENCES public.uat_projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  test_mode       text NOT NULL DEFAULT 'full_uat'
                  CHECK (test_mode IN ('smoke', 'journey', 'full_uat', 'release_comparison')),
  stop_on_critical boolean NOT NULL DEFAULT true,
  retry_count     integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  retry_delay_ms  integer NOT NULL DEFAULT 0 CHECK (retry_delay_ms >= 0),
  enabled         boolean NOT NULL DEFAULT true,
  notification_rules jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_test_plans_project ON public.uat_test_plans (project_id);
CREATE INDEX IF NOT EXISTS idx_uat_test_plans_enabled ON public.uat_test_plans (enabled) WHERE enabled = true;

ALTER TABLE public.uat_test_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view test plans"
  ON public.uat_test_plans FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create test plans"
  ON public.uat_test_plans FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update test plans"
  ON public.uat_test_plans FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can delete test plans"
  ON public.uat_test_plans FOR DELETE
  TO authenticated
  USING (public.is_staff_admin());

-- ============================================================
-- 3. uat_test_journeys
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_test_journeys (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         uuid NOT NULL REFERENCES public.uat_test_plans(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  test_role_ref   text,
  execution_order integer NOT NULL DEFAULT 0,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, execution_order)
);

CREATE INDEX IF NOT EXISTS idx_uat_test_journeys_plan ON public.uat_test_journeys (plan_id);

ALTER TABLE public.uat_test_journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view journeys"
  ON public.uat_test_journeys FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create journeys"
  ON public.uat_test_journeys FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update journeys"
  ON public.uat_test_journeys FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can delete journeys"
  ON public.uat_test_journeys FOR DELETE
  TO authenticated
  USING (public.is_staff_admin());

-- ============================================================
-- 4. uat_journey_steps
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_journey_steps (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id        uuid NOT NULL REFERENCES public.uat_test_journeys(id) ON DELETE CASCADE,
  step_order        integer NOT NULL,
  step_type         text NOT NULL
                    CHECK (step_type IN (
                      'navigate', 'click', 'fill_field', 'select_option',
                      'upload_file', 'wait_for_element', 'assert_text',
                      'assert_url', 'assert_element_visible', 'assert_api_response',
                      'capture_screenshot', 'run_accessibility_scan'
                    )),
  name              text NOT NULL,
  selector_strategy text,
  selector_value    text,
  input_value_ref   text,
  expected_result   text,
  timeout_ms        integer NOT NULL DEFAULT 5000 CHECK (timeout_ms >= 0),
  retry_count       integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  required          boolean NOT NULL DEFAULT true,
  mask_value        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_uat_journey_steps_journey ON public.uat_journey_steps (journey_id);

ALTER TABLE public.uat_journey_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view journey steps"
  ON public.uat_journey_steps FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create journey steps"
  ON public.uat_journey_steps FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update journey steps"
  ON public.uat_journey_steps FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can delete journey steps"
  ON public.uat_journey_steps FOR DELETE
  TO authenticated
  USING (public.is_staff_admin());

-- ============================================================
-- 5. uat_test_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_test_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        uuid NOT NULL REFERENCES public.uat_projects(id) ON DELETE RESTRICT,
  plan_id           uuid REFERENCES public.uat_test_plans(id) ON DELETE SET NULL,
  triggered_by      text,
  environment       text NOT NULL DEFAULT 'uat'
                    CHECK (environment IN ('demo', 'uat', 'staging', 'production')),
  build_reference   text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'paused', 'completed',
                                      'completed_with_warnings', 'failed', 'cancelled', 'blocked')),
  test_mode         text CHECK (test_mode IN ('smoke', 'journey', 'full_uat', 'release_comparison')),
  browsers          text[] NOT NULL DEFAULT '{chromium}',
  viewports         text[] NOT NULL DEFAULT '{desktop}',
  safety_snapshot   jsonb,
  start_time        timestamptz,
  end_time          timestamptz,
  duration_ms       integer DEFAULT 0,
  current_journey_id uuid,
  current_step_id   uuid,
  progress          numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_steps       integer NOT NULL DEFAULT 0,
  passed_count      integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  warning_count     integer NOT NULL DEFAULT 0,
  blocked_count     integer NOT NULL DEFAULT 0,
  pass_rate         numeric(5,2) NOT NULL DEFAULT 0 CHECK (pass_rate >= 0 AND pass_rate <= 100),
  bugs_found        integer NOT NULL DEFAULT 0,
  readiness_score   integer CHECK (readiness_score >= 0 AND readiness_score <= 100),
  n8n_execution_ref text,
  browser_worker_ref text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_test_runs_project ON public.uat_test_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_uat_test_runs_status ON public.uat_test_runs (status);
CREATE INDEX IF NOT EXISTS idx_uat_test_runs_created ON public.uat_test_runs (created_at DESC);

ALTER TABLE public.uat_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view test runs"
  ON public.uat_test_runs FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create test runs"
  ON public.uat_test_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update test runs"
  ON public.uat_test_runs FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

-- ============================================================
-- 6. uat_journey_results
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_journey_results (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id            uuid NOT NULL REFERENCES public.uat_test_runs(id) ON DELETE CASCADE,
  journey_id        uuid REFERENCES public.uat_test_journeys(id) ON DELETE SET NULL,
  journey_name      text NOT NULL,
  browser           text NOT NULL,
  viewport          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'passed', 'failed', 'warning', 'blocked', 'skipped')),
  start_time        timestamptz,
  end_time          timestamptz,
  duration_ms       integer DEFAULT 0,
  screenshot_count  integer NOT NULL DEFAULT 0,
  video_available   boolean NOT NULL DEFAULT false,
  trace_available   boolean NOT NULL DEFAULT false,
  step_results      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_journey_results_run ON public.uat_journey_results (run_id);

ALTER TABLE public.uat_journey_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view journey results"
  ON public.uat_journey_results FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create journey results"
  ON public.uat_journey_results FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update journey results"
  ON public.uat_journey_results FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

-- ============================================================
-- 7. uat_agent_findings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_agent_findings (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id            uuid NOT NULL REFERENCES public.uat_test_runs(id) ON DELETE CASCADE,
  journey_result_id uuid REFERENCES public.uat_journey_results(id) ON DELETE SET NULL,
  agent_type        text NOT NULL
                    CHECK (agent_type IN (
                      'uat_controller', 'functional_tester', 'ux_visual_reviewer',
                      'accessibility_reviewer', 'security_privacy_reviewer', 'bug_triage_agent'
                    )),
  category          text,
  severity          text CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence        numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  title             text NOT NULL,
  summary           text,
  evidence_refs     text[],
  suggested_action  text,
  fingerprint       text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_agent_findings_run ON public.uat_agent_findings (run_id);
CREATE INDEX IF NOT EXISTS idx_uat_agent_findings_fingerprint ON public.uat_agent_findings (fingerprint);

ALTER TABLE public.uat_agent_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view agent findings"
  ON public.uat_agent_findings FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create agent findings"
  ON public.uat_agent_findings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- 8. uat_bug_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_bug_reports (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  fingerprint         text NOT NULL UNIQUE,
  title               text NOT NULL,
  severity            text CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category            text,
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'false_positive', 'risk_accepted')),
  expected_result     text,
  actual_result       text,
  reproduction_steps  text[],
  first_detected      timestamptz NOT NULL DEFAULT now(),
  last_detected       timestamptz NOT NULL DEFAULT now(),
  occurrence_count    integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  assigned_to         text,
  resolution_summary  text,
  false_positive      boolean NOT NULL DEFAULT false,
  retest_requested    boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_bug_reports_status ON public.uat_bug_reports (status);
CREATE INDEX IF NOT EXISTS idx_uat_bug_reports_severity ON public.uat_bug_reports (severity);

ALTER TABLE public.uat_bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view bug reports"
  ON public.uat_bug_reports FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create bug reports"
  ON public.uat_bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update bug reports"
  ON public.uat_bug_reports FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

-- ============================================================
-- 9. uat_bug_occurrences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_bug_occurrences (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id        uuid NOT NULL REFERENCES public.uat_bug_reports(id) ON DELETE CASCADE,
  run_id        uuid REFERENCES public.uat_test_runs(id) ON DELETE SET NULL,
  page_url      text,
  journey_name  text,
  browser       text,
  device        text,
  environment   text CHECK (environment IN ('demo', 'uat', 'staging', 'production')),
  detected_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_bug_occurrences_bug ON public.uat_bug_occurrences (bug_id);
CREATE INDEX IF NOT EXISTS idx_uat_bug_occurrences_run ON public.uat_bug_occurrences (run_id);

ALTER TABLE public.uat_bug_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view bug occurrences"
  ON public.uat_bug_occurrences FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create bug occurrences"
  ON public.uat_bug_occurrences FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- 10. uat_bug_evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_bug_evidence (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id          uuid NOT NULL REFERENCES public.uat_bug_reports(id) ON DELETE CASCADE,
  occurrence_id   uuid REFERENCES public.uat_bug_occurrences(id) ON DELETE SET NULL,
  evidence_type   text NOT NULL
                  CHECK (evidence_type IN (
                    'screenshot', 'video', 'trace', 'console_log',
                    'network_log', 'accessibility', 'visual_diff'
                  )),
  storage_path    text NOT NULL,
  file_size_bytes bigint,
  mime_type       text,
  sensitive       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_bug ON public.uat_bug_evidence (bug_id);

ALTER TABLE public.uat_bug_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view bug evidence"
  ON public.uat_bug_evidence FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create bug evidence"
  ON public.uat_bug_evidence FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- 11. uat_visual_baselines
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_visual_baselines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      uuid NOT NULL REFERENCES public.uat_projects(id) ON DELETE CASCADE,
  page_or_journey text NOT NULL,
  browser         text NOT NULL,
  viewport        text NOT NULL,
  storage_path    text NOT NULL,
  approved_by     text,
  approved_at     timestamptz,
  approval_note   text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_visual_baselines_project ON public.uat_visual_baselines (project_id);
CREATE INDEX IF NOT EXISTS idx_uat_visual_baselines_active ON public.uat_visual_baselines (active) WHERE active = true;

ALTER TABLE public.uat_visual_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view baselines"
  ON public.uat_visual_baselines FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create baselines"
  ON public.uat_visual_baselines FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update baselines"
  ON public.uat_visual_baselines FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

-- ============================================================
-- 12. uat_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_settings (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key           text NOT NULL UNIQUE,
  value         jsonb NOT NULL,
  description   text,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uat_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view settings"
  ON public.uat_settings FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can update settings"
  ON public.uat_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can modify settings"
  ON public.uat_settings FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Admin can delete settings"
  ON public.uat_settings FOR DELETE
  TO authenticated
  USING (public.is_staff_admin());

-- ============================================================
-- 13. uat_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uat_audit_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type    text NOT NULL,
  actor         text,
  target_type   text,
  target_id     uuid,
  details       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_audit_log_event ON public.uat_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_uat_audit_log_target ON public.uat_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_uat_audit_log_created ON public.uat_audit_log (created_at DESC);

ALTER TABLE public.uat_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view audit log"
  ON public.uat_audit_log FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can insert audit log"
  ON public.uat_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- Updated-at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND table_name LIKE 'uat_%'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;