-- ============================================================
-- DFP UAT Agent — Backup & Disaster Recovery Tables
-- Migration: 20260729000004
-- ============================================================
-- Creates backup tracking, restore testing, and DR readiness
-- tables with RLS. No secrets or keys are stored.
-- ============================================================

-- ============================================================
-- uat_backup_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS uat_backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type TEXT NOT NULL CHECK (
    backup_type IN (
      'supabase_database', 'supabase_storage',
      'n8n_database', 'n8n_workflows', 'n8n_encryption_key',
      'application_config', 'docker_config',
      'supabase_migrations', 'uat_reports',
      'playwright_config', 'full_system_manifest'
    )
  ),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN (
      'scheduled', 'running', 'completed',
      'verification_pending', 'verified', 'verification_failed',
      'restore_test_pending', 'restore_test_passed', 'restore_test_failed',
      'expired', 'deletion_pending', 'deleted', 'failed'
    )
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  source_service TEXT NOT NULL DEFAULT '',
  source_host_label TEXT NOT NULL DEFAULT '',
  storage_location_label TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_manifest_path TEXT,
  encrypted BOOLEAN NOT NULL DEFAULT false,

  verification_status TEXT NOT NULL DEFAULT 'verification_pending' CHECK (
    verification_status IN (
      'scheduled', 'running', 'completed', 'verification_pending',
      'verified', 'verification_failed', 'restore_test_pending',
      'restore_test_passed', 'restore_test_failed', 'failed'
    )
  ),
  verification_started_at TIMESTAMPTZ,
  verification_completed_at TIMESTAMPTZ,

  restore_test_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    restore_test_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  restore_tested_at TIMESTAMPTZ,
  restore_test_environment TEXT,

  local_copy BOOLEAN NOT NULL DEFAULT true,
  remote_copy BOOLEAN NOT NULL DEFAULT false,
  on_hold BOOLEAN NOT NULL DEFAULT false,

  error_code TEXT,
  safe_error_summary TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_type ON uat_backup_runs (backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_runs_status ON uat_backup_runs (status);
CREATE INDEX IF NOT EXISTS idx_backup_runs_verification ON uat_backup_runs (verification_status);
CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON uat_backup_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_runs_hold ON uat_backup_runs (on_hold) WHERE on_hold = true;

-- ============================================================
-- uat_backup_items
-- ============================================================
CREATE TABLE IF NOT EXISTS uat_backup_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_run_id UUID NOT NULL REFERENCES uat_backup_runs(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'file',
  safe_filename TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  encrypted BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending', 'verified', 'verification_failed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_items_run ON uat_backup_items (backup_run_id);
CREATE INDEX IF NOT EXISTS idx_backup_items_checksum ON uat_backup_items (checksum_sha256);

-- ============================================================
-- uat_restore_tests
-- ============================================================
CREATE TABLE IF NOT EXISTS uat_restore_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_run_id UUID NOT NULL REFERENCES uat_backup_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  test_environment TEXT NOT NULL DEFAULT 'isolated',
  database_restore_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    database_restore_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  storage_restore_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    storage_restore_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  n8n_restore_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    n8n_restore_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  application_start_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    application_start_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  health_check_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    health_check_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  smoke_test_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    smoke_test_status IN ('pending', 'running', 'passed', 'failed', 'cancelled')
  ),
  recovery_time_seconds INTEGER NOT NULL DEFAULT 0,
  recovery_point_age_seconds INTEGER NOT NULL DEFAULT 0,
  tested_by TEXT,
  approved_by TEXT,
  safe_summary TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restore_tests_backup ON uat_restore_tests (backup_run_id);
CREATE INDEX IF NOT EXISTS idx_restore_tests_status ON uat_restore_tests (status);
CREATE INDEX IF NOT EXISTS idx_restore_tests_created ON uat_restore_tests (created_at DESC);

-- ============================================================
-- uat_disaster_recovery_status
-- ============================================================
CREATE TABLE IF NOT EXISTS uat_disaster_recovery_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL UNIQUE,
  readiness_status TEXT NOT NULL DEFAULT 'not_ready' CHECK (
    readiness_status IN (
      'ready', 'ready_with_warnings', 'not_ready',
      'backup_missing', 'backup_stale',
      'verification_failed', 'restore_untested', 'restore_failed'
    )
  ),
  latest_backup_at TIMESTAMPTZ,
  latest_verified_backup_at TIMESTAMPTZ,
  latest_restore_test_at TIMESTAMPTZ,
  backup_age_seconds INTEGER NOT NULL DEFAULT 0,
  target_rpo_seconds INTEGER NOT NULL DEFAULT 86400,
  target_rto_seconds INTEGER NOT NULL DEFAULT 14400,
  current_rpo_status TEXT NOT NULL DEFAULT 'unknown' CHECK (
    current_rpo_status IN ('met', 'missed', 'unknown')
  ),
  current_rto_status TEXT NOT NULL DEFAULT 'unknown' CHECK (
    current_rto_status IN ('met', 'missed', 'unknown')
  ),
  blocking_issue TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dr_status_component ON uat_disaster_recovery_status (component);
CREATE INDEX IF NOT EXISTS idx_dr_status_readiness ON uat_disaster_recovery_status (readiness_status);

-- ============================================================
-- RLS Policies
-- ============================================================
-- Staff can read backup/DR data
-- Only authorized staff can start backups or approve restore tests
-- Service accounts write via server-side code

ALTER TABLE uat_backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_backup_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_restore_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_disaster_recovery_status ENABLE ROW LEVEL SECURITY;

-- Staff read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view backup runs' AND tablename = 'uat_backup_runs'
  ) THEN
    CREATE POLICY "Staff can view backup runs" ON uat_backup_runs FOR SELECT TO authenticated USING (public.is_staff_user());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view backup items' AND tablename = 'uat_backup_items'
  ) THEN
    CREATE POLICY "Staff can view backup items" ON uat_backup_items FOR SELECT TO authenticated USING (public.is_staff_user());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view restore tests' AND tablename = 'uat_restore_tests'
  ) THEN
    CREATE POLICY "Staff can view restore tests" ON uat_restore_tests FOR SELECT TO authenticated USING (public.is_staff_user());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view DR status' AND tablename = 'uat_disaster_recovery_status'
  ) THEN
    CREATE POLICY "Staff can view DR status" ON uat_disaster_recovery_status FOR SELECT TO authenticated USING (public.is_staff_user());
  END IF;
END
$$;

-- Admin write access (service role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin can manage backup runs' AND tablename = 'uat_backup_runs'
  ) THEN
    CREATE POLICY "Admin can manage backup runs" ON uat_backup_runs FOR ALL TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin can manage backup items' AND tablename = 'uat_backup_items'
  ) THEN
    CREATE POLICY "Admin can manage backup items" ON uat_backup_items FOR ALL TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin can manage restore tests' AND tablename = 'uat_restore_tests'
  ) THEN
    CREATE POLICY "Admin can manage restore tests" ON uat_restore_tests FOR ALL TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin can manage DR status' AND tablename = 'uat_disaster_recovery_status'
  ) THEN
    CREATE POLICY "Admin can manage DR status" ON uat_disaster_recovery_status FOR ALL TO authenticated USING (public.is_staff_admin()) WITH CHECK (public.is_staff_admin());
  END IF;
END
$$;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION uat_backup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_backup_runs_updated_at' AND tgrelid = 'uat_backup_runs'::regclass
  ) THEN
    CREATE TRIGGER set_backup_runs_updated_at
      BEFORE UPDATE ON uat_backup_runs
      FOR EACH ROW EXECUTE FUNCTION uat_backup_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_dr_status_updated_at' AND tgrelid = 'uat_disaster_recovery_status'::regclass
  ) THEN
    CREATE TRIGGER set_dr_status_updated_at
      BEFORE UPDATE ON uat_disaster_recovery_status
      FOR EACH ROW EXECUTE FUNCTION uat_backup_updated_at();
  END IF;
END
$$;