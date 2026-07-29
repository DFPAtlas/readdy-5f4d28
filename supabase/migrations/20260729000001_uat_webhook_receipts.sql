-- ============================================================
-- DFP UAT Agent — Webhook Receipts Migration
-- ============================================================
-- Created: 2026-07-29
-- Description: Stores webhook receipt records for idempotency
--              and replay protection.
--
-- NOTES:
--   - Never stores request bodies, tokens, signatures, or
--     authorization headers.
--   - RLS: normal staff users cannot write directly.
--     Only controlled server/service operations may insert.
--   - Unique constraint on request_id prevents replays.
--   - Idempotency key index for fast duplicate lookups.
--   - Expiry index for automatic cleanup.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.uat_webhook_receipts (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id          text NOT NULL UNIQUE,
  idempotency_key     text NOT NULL,
  source_service      text NOT NULL,
  destination_service text NOT NULL,
  request_path        text NOT NULL,
  request_method      text NOT NULL,
  body_hash           text NOT NULL,
  status              text NOT NULL DEFAULT 'processing'
                      CHECK (status IN ('processing', 'completed', 'duplicate', 'expired')),
  first_received_at   timestamptz NOT NULL DEFAULT now(),
  last_received_at    timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  response_code       integer,
  run_id              uuid REFERENCES public.uat_test_runs(id) ON DELETE SET NULL,
  repeat_count        integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_uat_webhook_receipts_idempotency
  ON public.uat_webhook_receipts (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_uat_webhook_receipts_expires
  ON public.uat_webhook_receipts (expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_uat_webhook_receipts_run
  ON public.uat_webhook_receipts (run_id)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uat_webhook_receipts_service
  ON public.uat_webhook_receipts (source_service, destination_service);

-- Enable RLS
ALTER TABLE public.uat_webhook_receipts ENABLE ROW LEVEL SECURITY;

-- Staff can view receipts (read-only — for admin dashboard)
CREATE POLICY "Staff can view webhook receipts"
  ON public.uat_webhook_receipts FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

-- Only service accounts / admin can insert (write is controlled
-- by server-side code, not normal staff users).
-- Normal staff INSERT is denied — the server/service layer
-- handles this through admin/service clients.
CREATE POLICY "Admin can insert webhook receipts"
  ON public.uat_webhook_receipts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_admin());

-- Admin can update receipt status (e.g., mark completed)
CREATE POLICY "Admin can update webhook receipts"
  ON public.uat_webhook_receipts FOR UPDATE
  TO authenticated
  USING (public.is_staff_admin());

-- Nobody can delete receipts directly (retention handled
-- by scheduled cleanup, not ad-hoc deletes).
-- No DELETE policy = denied by default.

-- Updated-at trigger for last_received_at
CREATE OR REPLACE FUNCTION public.update_webhook_receipt_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.last_received_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uat_webhook_receipts_updated ON public.uat_webhook_receipts;
CREATE TRIGGER trg_uat_webhook_receipts_updated
  BEFORE UPDATE ON public.uat_webhook_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_webhook_receipt_timestamp();

-- Comment for documentation
COMMENT ON TABLE public.uat_webhook_receipts IS
  'Idempotency and replay protection records for internal UAT webhook communication. Never stores request bodies, tokens, signatures, or authorization headers.';