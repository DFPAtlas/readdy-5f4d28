-- ============================================================
-- DFP UAT Agent — Evidence Retention & Storage Management
-- ============================================================
-- Created: 2026-07-29
-- Description: Extends uat_bug_evidence with retention metadata,
--   creates cleanup-run and cleanup-item tables, adds RLS.
-- ============================================================

-- ============================================================
-- 1. Extend uat_bug_evidence with retention and lifecycle fields
-- ============================================================

-- Add new columns (all nullable to preserve existing rows)
ALTER TABLE public.uat_bug_evidence
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.uat_test_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_result_id uuid REFERENCES public.uat_journey_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.uat_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
    CHECK (status IN (
      'pending_upload', 'uploading', 'available', 'upload_failed',
      'processing', 'retention_locked', 'scheduled_for_deletion',
      'deleting', 'deleted', 'deletion_failed', 'quarantined'
    )),
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS retention_reason text
    CHECK (retention_reason IN (
      'default_success_retention', 'default_failure_retention',
      'open_bug', 'approved_release', 'staff_pinned',
      'legal_hold', 'investigation_hold', 'manual_extension',
      'temporary_file', 'cleanup_candidate'
    )),
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by text,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text,
  ADD COLUMN IF NOT EXISTS legal_hold_by text,
  ADD COLUMN IF NOT EXISTS legal_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_by text,
  ADD COLUMN IF NOT EXISTS deletion_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_approved_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_error_code text,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rename existing columns where needed (if they differ from new schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_bug_evidence' AND column_name = 'mime_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_bug_evidence' AND column_name = 'content_type'
  ) THEN
    ALTER TABLE public.uat_bug_evidence RENAME COLUMN mime_type TO content_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_bug_evidence' AND column_name = 'file_size_bytes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_bug_evidence' AND column_name = 'size_bytes'
  ) THEN
    -- Keep file_size_bytes as is; add size_bytes as new
    NULL;
  END IF;
END;
$$;

-- Add size_bytes if file_size_bytes exists but size_bytes doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_bug_evidence' AND column_name = 'size_bytes'
  ) THEN
    ALTER TABLE public.uat_bug_evidence ADD COLUMN size_bytes bigint;
  END IF;
END;
$$;

-- Add missing evidence_type values to constraint
ALTER TABLE public.uat_bug_evidence
  DROP CONSTRAINT IF EXISTS uat_bug_evidence_evidence_type_check;
ALTER TABLE public.uat_bug_evidence
  ADD CONSTRAINT uat_bug_evidence_evidence_type_check
  CHECK (evidence_type IN (
    'screenshot', 'video', 'trace', 'console_log', 'network_log',
    'accessibility', 'visual_diff', 'accessibility_report', 'uat_report',
    'temporary_file', 'other'
  ));

-- ============================================================
-- Indexes for retention and cleanup queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_status ON public.uat_bug_evidence (status);
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_retention ON public.uat_bug_evidence (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_type ON public.uat_bug_evidence (evidence_type);
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_run ON public.uat_bug_evidence (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_bug_preserve ON public.uat_bug_evidence (bug_id) WHERE bug_id IS NOT NULL AND status NOT IN ('deleted', 'deletion_failed');
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_pinned ON public.uat_bug_evidence (pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_legal_hold ON public.uat_bug_evidence (legal_hold) WHERE legal_hold = true;
CREATE INDEX IF NOT EXISTS idx_uat_bug_evidence_deleted ON public.uat_bug_evidence (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 2. uat_evidence_cleanup_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.uat_evidence_cleanup_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending', 'scanning', 'awaiting_approval',
                      'approved', 'rejected', 'running',
                      'completed', 'failed'
                    )),
  dry_run           boolean NOT NULL DEFAULT true,
  started_at        timestamptz,
  completed_at      timestamptz,
  triggered_by      text,
  candidate_count   integer NOT NULL DEFAULT 0,
  candidate_size_bytes bigint NOT NULL DEFAULT 0,
  deleted_count     integer NOT NULL DEFAULT 0,
  deleted_size_bytes bigint NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  approval_required boolean NOT NULL DEFAULT false,
  approved_by       text,
  approved_at       timestamptz,
  error_summary     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_cleanup_runs_status ON public.uat_evidence_cleanup_runs (status);
CREATE INDEX IF NOT EXISTS idx_uat_cleanup_runs_created ON public.uat_evidence_cleanup_runs (created_at DESC);

ALTER TABLE public.uat_evidence_cleanup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cleanup runs"
  ON public.uat_evidence_cleanup_runs FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create cleanup runs"
  ON public.uat_evidence_cleanup_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can update cleanup runs"
  ON public.uat_evidence_cleanup_runs FOR UPDATE
  TO authenticated
  USING (public.is_staff_user());

-- ============================================================
-- 3. uat_evidence_cleanup_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.uat_evidence_cleanup_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleanup_run_id    uuid NOT NULL REFERENCES public.uat_evidence_cleanup_runs(id) ON DELETE CASCADE,
  evidence_id       uuid NOT NULL REFERENCES public.uat_bug_evidence(id) ON DELETE RESTRICT,
  decision          text NOT NULL
                    CHECK (decision IN (
                      'delete', 'skip_preserved', 'skip_pinned',
                      'skip_legal_hold', 'skip_open_bug',
                      'skip_approved_release', 'skip_uncertain',
                      'excluded_by_staff'
                    )),
  reason            text,
  size_bytes        bigint,
  status            text NOT NULL DEFAULT 'pending',
  error_code        text,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_cleanup_items_run ON public.uat_evidence_cleanup_items (cleanup_run_id);
CREATE INDEX IF NOT EXISTS idx_uat_cleanup_items_evidence ON public.uat_evidence_cleanup_items (evidence_id);
CREATE INDEX IF NOT EXISTS idx_uat_cleanup_items_decision ON public.uat_evidence_cleanup_items (decision);

ALTER TABLE public.uat_evidence_cleanup_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cleanup items"
  ON public.uat_evidence_cleanup_items FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can create cleanup items"
  ON public.uat_evidence_cleanup_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- 4. Update RLS on uat_bug_evidence to allow status transitions
-- ============================================================

-- Existing policies remain. Add admin-only policy for deletion actions.
CREATE POLICY "Admin can update evidence retention"
  ON public.uat_bug_evidence FOR UPDATE
  TO authenticated
  USING (public.is_staff_admin())
  WITH CHECK (public.is_staff_admin());

-- ============================================================
-- 5. Apply updated_at triggers to new tables
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_uat_evidence_cleanup_runs_updated_at'
  ) THEN
    CREATE TRIGGER trg_uat_evidence_cleanup_runs_updated_at
      BEFORE UPDATE ON public.uat_evidence_cleanup_runs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  -- uat_bug_evidence trigger may need to be (re)created
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_uat_bug_evidence_updated_at'
  ) THEN
    CREATE TRIGGER trg_uat_bug_evidence_updated_at
      BEFORE UPDATE ON public.uat_bug_evidence
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;