-- ============================================================
-- DFP UAT Agent — Recovery Schema Migration
-- ============================================================
-- Adds heartbeat, lease, recovery, and checkpoint support to
-- existing UAT tables. Creates worker heartbeat and recovery
-- event tables. All tables have RLS enabled.
-- ============================================================

-- ============================================================
-- 1. Extend uat_test_runs
-- ============================================================

ALTER TABLE uat_test_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_acquired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_worker_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_callback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS maximum_attempts INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS recovery_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS recoverable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recovery_status TEXT,
  ADD COLUMN IF NOT EXISTS recovery_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS interrupted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interruption_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;

-- Indexes for recovery queries
CREATE INDEX IF NOT EXISTS idx_uat_runs_heartbeat ON uat_test_runs(heartbeat_at) WHERE heartbeat_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_runs_lease_expiry ON uat_test_runs(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_runs_worker ON uat_test_runs(worker_instance_id) WHERE worker_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_runs_recovery_status ON uat_test_runs(recovery_status) WHERE recovery_status IS NOT NULL;

-- Add status constraint to include new states
ALTER TABLE uat_test_runs
  DROP CONSTRAINT IF EXISTS uat_test_runs_status_check;

ALTER TABLE uat_test_runs
  ADD CONSTRAINT uat_test_runs_status_check CHECK (
    status IN (
      'draft', 'queued', 'starting', 'running',
      'waiting_for_worker', 'waiting_for_ai',
      'completed', 'completed_with_warnings',
      'failed', 'interrupted',
      'cancel_requested', 'cancelled',
      'blocked', 'expired', 'retry_pending'
    )
  );

-- ============================================================
-- 2. Extend uat_journey_results
-- ============================================================

ALTER TABLE uat_journey_results
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS maximum_attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_step_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_completed_step_id UUID,
  ADD COLUMN IF NOT EXISTS last_safe_checkpoint TEXT,
  ADD COLUMN IF NOT EXISTS recoverable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS interruption_reason TEXT,
  ADD COLUMN IF NOT EXISTS worker_instance_id TEXT;

CREATE INDEX IF NOT EXISTS idx_uat_journey_results_heartbeat ON uat_journey_results(heartbeat_at) WHERE heartbeat_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_journey_results_checkpoint ON uat_journey_results(last_safe_checkpoint) WHERE last_safe_checkpoint IS NOT NULL;

-- Update status constraint for journey results
ALTER TABLE uat_journey_results
  DROP CONSTRAINT IF EXISTS uat_journey_results_status_check;

ALTER TABLE uat_journey_results
  ADD CONSTRAINT uat_journey_results_status_check CHECK (
    status IN (
      'pending', 'queued', 'starting', 'running',
      'passed', 'failed', 'warning',
      'blocked', 'interrupted', 'cancelled', 'retry_pending'
    )
  );

-- ============================================================
-- 3. Create uat_worker_heartbeats
-- ============================================================

CREATE TABLE IF NOT EXISTS uat_worker_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_instance_id TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'playwright',
  hostname TEXT,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  active_run_count INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 2,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uat_worker_hb_instance ON uat_worker_heartbeats(worker_instance_id);
CREATE INDEX IF NOT EXISTS idx_uat_worker_hb_seen ON uat_worker_heartbeats(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_uat_worker_hb_status ON uat_worker_heartbeats(status);

-- ============================================================
-- 4. Create uat_recovery_events
-- ============================================================

CREATE TABLE IF NOT EXISTS uat_recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  journey_result_id UUID,
  event_type TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by TEXT NOT NULL DEFAULT 'system',
  previous_status TEXT,
  new_status TEXT,
  reason_code TEXT,
  safe_summary TEXT,
  automatic BOOLEAN NOT NULL DEFAULT true,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_recovery_events_run ON uat_recovery_events(run_id);
CREATE INDEX IF NOT EXISTS idx_uat_recovery_events_type ON uat_recovery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_uat_recovery_events_detected ON uat_recovery_events(detected_at);

-- ============================================================
-- 5. Add RLS policies
-- ============================================================

-- Worker heartbeats: read-only for staff, write via service role
ALTER TABLE uat_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read worker heartbeats" ON uat_worker_heartbeats;
CREATE POLICY "Staff can read worker heartbeats" ON uat_worker_heartbeats
  FOR SELECT TO authenticated
  USING (true);

-- Recovery events: read-only for staff, write via service role
ALTER TABLE uat_recovery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read recovery events" ON uat_recovery_events;
CREATE POLICY "Staff can read recovery events" ON uat_recovery_events
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 6. Update trigger for uat_worker_heartbeats
-- ============================================================

CREATE OR REPLACE FUNCTION update_worker_hb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uat_worker_hb_updated ON uat_worker_heartbeats;
CREATE TRIGGER trg_uat_worker_hb_updated
  BEFORE UPDATE ON uat_worker_heartbeats
  FOR EACH ROW EXECUTE FUNCTION update_worker_hb_updated_at();