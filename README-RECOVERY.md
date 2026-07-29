# DFP UAT Agent — Recovery Guide

## 1. Heartbeat Architecture

The Playwright worker sends a signed heartbeat every 30 seconds while a test is active.

### Heartbeat Flow

```
Playwright Worker → POST /api/internal/uat/worker-heartbeat → DFP UAT Server
```

Each heartbeat carries:

| Field | Description |
|-------|-------------|
| `workerInstanceId` | Unique worker identifier |
| `workerType` | Always `playwright` for browser workers |
| `status` | `idle`, `busy`, `degraded`, or `offline` |
| `activeRunIds` | Currently executing run IDs |
| `activeJourneyResultIds` | Currently executing journey result IDs |
| `capacity` | Max concurrent browser sessions |

Heartbeats are signed with HMAC-SHA256 (`UAT_WEBHOOK_SECRET`) and include idempotency keys.

### Timeouts (configurable via `.env`)

| Setting | Default | Purpose |
|---------|---------|---------|
| `UAT_WORKER_HEARTBEAT_INTERVAL_SECONDS` | 30 | How often the worker sends a heartbeat |
| `UAT_WORKER_DELAYED_AFTER_SECONDS` | 90 | When a worker is considered delayed |
| `UAT_WORKER_STALE_AFTER_SECONDS` | 180 | When a worker is considered stale |

---

## 2. Execution Leases

A lease ensures only one worker or n8n execution controls a run at a time.

### Lease Lifecycle

1. Worker acquires lease before starting execution (atomic operation)
2. Heartbeats renew the lease every 30 seconds  
3. Expired leases (180s+) are detected by the recovery scanner
4. Completed/cancelled/blocked runs release their leases
5. Old workers cannot update a run after losing the lease

### Lease Fields

| Field | Purpose |
|-------|---------|
| `workerInstanceId` | Which worker holds the lease |
| `leaseAcquiredAt` | When the lease was taken |
| `leaseExpiresAt` | When the lease expires (now + 300s default) |

---

## 3. Stale-Run Classification

The recovery scanner classifies runs as:

| Health | Meaning | Action |
|--------|---------|--------|
| `healthy` | Normal operation | None |
| `delayed` | Heartbeat missing, not yet stale | Log warning |
| `stale` | Lease expired / progress stopped / heartbeat missing | Mark interrupted if recoverable |

### Timeout Scenarios

| Reason | Timeout | Config |
|--------|---------|--------|
| Queue timeout | 900s | `UAT_QUEUE_TIMEOUT_SECONDS` |
| Start timeout | 300s | `UAT_RUN_START_TIMEOUT_SECONDS` |
| Heartbeat missing (stale) | 180s | `UAT_WORKER_STALE_AFTER_SECONDS` |
| Heartbeat missing (delayed) | 90s | `UAT_WORKER_DELAYED_AFTER_SECONDS` |
| Progress timeout | 600s | `UAT_RUN_IDLE_TIMEOUT_SECONDS` |
| Cancel timeout | 120s | `UAT_CANCEL_TIMEOUT_SECONDS` |

---

## 4. Recovery Scanner

Runs every 60 seconds. Detects stale runs and marks recoverable ones as interrupted.

**Important**: The scanner does NOT automatically retry destructive steps. It only transitions runs to `interrupted` so staff can decide what to do.

### Manual Recovery Scan

On the Local Setup page (`/staff/uat-agent/local-setup`):

1. Go to "Recovery and Worker Status"
2. Click "Run Recovery Scan"
3. Review interrupted runs
4. Click "Resume Safe Journeys" for safe recoveries

---

## 5. Safe Checkpoints

Journey steps create checkpoints during execution. Recovery restarts from the last confirmed safe checkpoint.

### Checkpoint IDs

| Checkpoint | When Created |
|------------|-------------|
| `before_login` | Before attempting authentication |
| `after_login` | After successful login |
| `before_form_submission` | Before submitting a form |
| `after_form_submission` | After successful form submission |
| `before_payment_redirect` | Before redirecting to payment |
| `after_test_record_created` | After creating a test record |
| `before_cleanup` | Before cleanup operations |

### Step Safety Classification

| Safety Level | Examples | Recovery Action |
|-------------|----------|----------------|
| `safe_to_repeat` | Navigate, assert, screenshot, accessibility scan | Auto-repeat |
| `repeat_with_validation` | Fill field, select option, upload file | Repeat with validation |
| `requires_staff_approval` | Submit form, send email, create account | Staff approval needed |
| `never_repeat_automatically` | Payment capture, record deletion, production data | Never auto-repeat |

---

## 6. Retry Rules

### When to Retry

* Worker temporarily unavailable
* Browser crash
* Network timeout
* Supabase temporary outage
* Ollama timeout
* Lost callback
* VM restart

### When NOT to Retry

* Expected assertion failed
* Element genuinely missing
* Permission denied
* Domain blocked
* Production test blocked
* Invalid test plan
* Invalid credentials

### Retry Limits

| Level | Default Max | Config |
|-------|-------------|--------|
| Individual step | 1 | Per-step config |
| Journey | 1 | Per-journey config |
| Full run (automatic) | 0 | `UAT_DEFAULT_MAX_ATTEMPTS` |

### Exponential Backoff

```
30s → 60s → 120s
```

---

## 7. AI-Only Retry

If Ollama becomes unavailable during a test run:

1. Playwright results, screenshots, logs, and traces are preserved
2. AI review is marked as unavailable
3. Run moves to `completed_with_warnings`
4. Staff can retry AI review independently via:
   ```
   POST /api/uat/runs/[runId]/retry-ai
   ```
5. Playwright does NOT rerun — only AI analysis is retried

---

## 8. Worker Restart Behaviour

When the Playwright worker starts or restarts:

1. Generates or loads its worker instance ID
2. Registers itself via heartbeat
3. Reports any locally known unfinished jobs
4. Asks the controller if those jobs are still valid
5. Does NOT resume an old job without a valid lease
6. Cleans up orphaned browser processes
7. Preserves available trace and screenshot files

---

## 9. n8n Restart Reconciliation

After n8n restarts, run reconciliation to find active database runs and compare them with current n8n executions and worker heartbeats.

Supabase UAT run records are the system of record — n8n execution history is secondary.

**On the UAT VM**:

```bash
# After n8n restart
curl http://localhost:5678/healthz
# Visit /staff/uat-agent/local-setup → Recovery → Run Recovery Scan
```

---

## 10. VM Reboot Recovery Checklist

After the UAT VM reboots:

1. Confirm Supabase is healthy
2. Confirm n8n is healthy
3. Confirm the Playwright worker is healthy
4. Confirm Atlas-HaL Ollama is reachable:
   ```bash
   curl http://192.168.1.92:11434/api/tags
   ```
5. Run reconciliation
6. Review interrupted runs at `/staff/uat-agent/local-setup`
7. Resume only safe recoverable journeys
8. Run a smoke test

---

## 11. Emergency Stop

Available via the "Stop All UAT Tests" button on the Local Setup page.

**Requirements**:
- Elevated staff permission
- Confirmation dialog
- Reason required

**What happens**:
- New tests are blocked (`uat_execution_paused` flag)
- Active runs receive cancellation signals
- All evidence is preserved
- Audit event created
- Unrelated n8n workflows continue normally
- Supabase and Ollama remain running

To resume:

```bash
# Set VITE_PUBLIC_UAT_EXECUTION_PAUSED=false
# Or disable from the Recovery section on the Local Setup page
```

---

## 12. Diagnosing Stale Leases

If runs appear stuck:

1. Check the "Recovery and Worker Status" section on the Local Setup page
2. Look for "Stale Leases" count > 0
3. Run a manual recovery scan
4. Check worker heartbeat status — is the worker offline?
5. If the worker crashed:
   - Restart the worker
   - Run recovery scan
   - Review and resume interrupted runs

---

## 13. Diagnosing Missing Callbacks

If runs are stuck in `waiting_for_worker` state:

1. Check if the worker sent a heartbeat recently
2. Verify n8n is running and the workflow is active
3. Check n8n execution logs for errors
4. Verify network connectivity between services
5. Run a recovery scan — it will mark callback timeouts as interrupted

---

## 14. Retrying AI Without Rerunning Browsers

When AI analysis failed but browser testing completed successfully:

1. Go to the Test Runs tab
2. Find the run with `completed_with_warnings` status
3. Click the run to view details
4. Look for the "Retry AI Review" action
5. Or use the Recovery section: "Retry Failed AI Review"

This triggers AI re-analysis only — Playwright does not run again.

---

## 15. Recovery Verification Commands

```bash
# Run recovery tests
node scripts/test-recovery.mjs

# Run all security tests
node scripts/test-security.mjs

# Check repository safety (includes server-only var scanner)
node scripts/check-repository-safety.mjs

# Full pre-deploy verification (includes recovery tests)
npm run verify:deploy
```

---

## Configuration Reference

```env
# Heartbeat
UAT_WORKER_HEARTBEAT_INTERVAL_SECONDS=30
UAT_WORKER_DELAYED_AFTER_SECONDS=90
UAT_WORKER_STALE_AFTER_SECONDS=180

# Timeouts
UAT_RUN_START_TIMEOUT_SECONDS=300
UAT_RUN_IDLE_TIMEOUT_SECONDS=600
UAT_QUEUE_TIMEOUT_SECONDS=900
UAT_CANCEL_TIMEOUT_SECONDS=120

# Scanner
UAT_RECOVERY_SCAN_INTERVAL_SECONDS=60
UAT_DEFAULT_MAX_ATTEMPTS=2

# Alerts
UAT_ALERT_COOLDOWN_MINUTES=30

# Emergency Stop
VITE_PUBLIC_UAT_EXECUTION_PAUSED=false
```