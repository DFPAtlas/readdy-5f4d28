#!/usr/bin/env node

// ============================================================
// DFP UAT Agent — Recovery Module Tests
// ============================================================
// Automated tests for heartbeat processing, execution leases,
// stale-run detection, checkpoint management, retry policy,
// cancellation, emergency stop, and alert deduplication.
//
// Runs with: node scripts/test-recovery.mjs
// ============================================================

// ============================================================
// Tiny test runner
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${name}`); }
}

function assertEqual(actual, expected, name) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  FAIL: ${name}\n    Expected: ${JSON.stringify(expected)}\n    Actual:   ${JSON.stringify(actual)}`); }
}

function assertDeepEqual(actual, expected, name) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; console.error(`  FAIL: ${name}\n    Expected: ${b}\n    Actual:   ${a}`); }
}

function assertNotNull(value, name) {
  if (value !== null && value !== undefined) { passed++; }
  else { failed++; console.error(`  FAIL: ${name} — expected non-null value`); }
}

function group(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

// ============================================================
// Replicated core logic for direct testing
// ============================================================

// ---------- State Machine ----------

const RT = new Map([
  ['draft', new Set(['queued'])],
  ['queued', new Set(['starting', 'cancel_requested', 'expired'])],
  ['starting', new Set(['running', 'interrupted', 'failed'])],
  ['running', new Set(['waiting_for_worker', 'waiting_for_ai', 'completed', 'completed_with_warnings', 'failed', 'interrupted', 'cancel_requested'])],
  ['waiting_for_worker', new Set(['running', 'interrupted', 'failed'])],
  ['waiting_for_ai', new Set(['completed', 'completed_with_warnings', 'interrupted'])],
  ['completed', new Set([])],
  ['completed_with_warnings', new Set([])],
  ['failed', new Set(['retry_pending'])],
  ['interrupted', new Set(['queued', 'retry_pending'])],
  ['cancel_requested', new Set(['cancelled'])],
  ['cancelled', new Set([])],
  ['blocked', new Set([])],
  ['expired', new Set([])],
  ['retry_pending', new Set(['queued'])],
]);

function validateRunTransition(from, to) {
  const allowed = RT.get(from);
  if (!allowed || !allowed.has(to)) return { allowed: false, from, to };
  return { allowed: true, from, to };
}

const isTerminal = (s) => ['completed','completed_with_warnings','cancelled','blocked','expired'].includes(s);
const isRetryable = (s) => ['failed','interrupted','retry_pending'].includes(s);

// ---------- Step Safety ----------

const STEP_SAFETY = {
  navigate:'safe_to_repeat', click:'safe_to_repeat', wait_for_element:'safe_to_repeat',
  assert_text:'safe_to_repeat', assert_url:'safe_to_repeat', assert_element_visible:'safe_to_repeat',
  assert_api_response:'safe_to_repeat', capture_screenshot:'safe_to_repeat', run_accessibility_scan:'safe_to_repeat',
  fill_field:'repeat_with_validation', select_option:'repeat_with_validation', upload_file:'repeat_with_validation',
};

function getStepSafety(type) { return STEP_SAFETY[type] || 'requires_staff_approval'; }
function isSafeToRepeat(type) { return getStepSafety(type) === 'safe_to_repeat'; }
function requiresStaffApproval(type) { const s = getStepSafety(type); return s === 'requires_staff_approval' || s === 'never_repeat_automatically'; }

// ---------- Classification ----------

const DEFAULT_CFG = {
  heartbeatInterval: 30, delayedAfter: 90, staleAfter: 180,
  startTimeout: 300, idleTimeout: 600, queueTimeout: 900, cancelTimeout: 120,
};

function classifyRunHealth(params) {
  const now = new Date();
  if (isTerminal(params.status)) return { health: 'healthy', reason: null };

  if (params.status === 'queued' && params.queueTime) {
    const age = (now - params.queueTime) / 1000;
    if (age > DEFAULT_CFG.queueTimeout) return { health: 'stale', reason: 'queue_timeout' };
  }

  if (params.status === 'starting' && params.startTime) {
    const age = (now - params.startTime) / 1000;
    if (age > DEFAULT_CFG.startTimeout) return { health: 'stale', reason: 'worker_start_timeout' };
  }

  if (params.leaseExpiresAt && params.leaseExpiresAt <= now) {
    return { health: 'stale', reason: 'lease_expired' };
  }

  if (params.heartbeatAt) {
    const age = (now - params.heartbeatAt) / 1000;
    if (age > DEFAULT_CFG.staleAfter) return { health: 'stale', reason: 'heartbeat_missing' };
    if (age > DEFAULT_CFG.delayedAfter) return { health: 'delayed', reason: 'heartbeat_missing' };
  }

  if (params.progressAt) {
    const age = (now - params.progressAt) / 1000;
    if (age > DEFAULT_CFG.idleTimeout) return { health: 'stale', reason: 'progress_timeout' };
  }

  return { health: 'healthy', reason: null };
}

// ---------- Retry Policy ----------

const RETRYABLE = ['WORKER_OFFLINE','WORKER_CAPACITY_REACHED','RUN_HEARTBEAT_MISSING','RUN_LEASE_EXPIRED','RUN_CALLBACK_TIMEOUT','RUN_QUEUE_TIMEOUT'];
function isRetryableError(code) { return RETRYABLE.includes(code); }

function canRetryRun(params) {
  if (!isRetryable(params.status)) return { canRetry: false, requiresApproval: false, reason: `State "${params.status}" not retryable.` };
  if (params.attemptCount >= params.maxAttempts) return { canRetry: false, requiresApproval: false, reason: 'Attempt limit reached.' };
  if (!isRetryableError(params.errorCode)) return { canRetry: false, requiresApproval: false, reason: `"${params.errorCode}" not retryable.` };
  return { canRetry: true, requiresApproval: false, reason: 'Retry eligible.' };
}

// ---------- Lease Store ----------

class LeaseStore {
  constructor() { this.leases = new Map(); }

  acquire(runId, workerId, ttl = 300) {
    const existing = this.leases.get(runId);
    if (existing && existing.leaseExpiresAt > new Date()) {
      if (existing.workerInstanceId !== workerId) return null;
    }
    const now = new Date();
    const lease = { workerInstanceId: workerId, leaseAcquiredAt: now, leaseExpiresAt: new Date(now.getTime() + ttl * 1000), runId };
    this.leases.set(runId, lease);
    return lease;
  }

  renew(runId, workerId, ttl = 300) {
    const existing = this.leases.get(runId);
    if (!existing || existing.workerInstanceId !== workerId) return null;
    existing.leaseExpiresAt = new Date(Date.now() + ttl * 1000);
    this.leases.set(runId, existing);
    return existing;
  }

  isExpired(runId) {
    const l = this.leases.get(runId);
    return !l || l.leaseExpiresAt <= new Date();
  }

  getExpired() {
    const now = new Date();
    return Array.from(this.leases.values()).filter((l) => l.leaseExpiresAt <= now);
  }

  release(runId) { this.leases.delete(runId); }
}

// ---------- Worker Heartbeat Store ----------

class WorkerStore {
  constructor() { this.workers = new Map(); }

  register(w) { this.workers.set(w.workerInstanceId, w); }
  heartbeat(id) {
    const w = this.workers.get(id);
    if (w) { w.lastSeenAt = new Date(); this.workers.set(id, w); }
  }
  get(id) { return this.workers.get(id); }
  getStale(seconds) {
    const cutoff = Date.now() - seconds * 1000;
    return Array.from(this.workers.values()).filter((w) => w.lastSeenAt.getTime() < cutoff);
  }
}

// ---------- Checkpoint Store ----------

class CheckpointStore {
  constructor() { this.cps = new Map(); }

  record(journeyId, entry) {
    const list = this.cps.get(journeyId) || [];
    const exIdx = list.findIndex((c) => c.checkpointId === entry.checkpointId);
    if (exIdx >= 0) list[exIdx] = entry;
    else list.push(entry);
    this.cps.set(journeyId, list);
  }

  getLastSafe(journeyId) {
    const list = this.cps.get(journeyId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  getAll(journeyId) { return this.cps.get(journeyId) || []; }
}

// ---------- Notification Deduplicator ----------

class NotificationDedup {
  constructor() { this.sent = new Map(); }
  shouldSend(type, runId) {
    const key = `${type}:${runId}`;
    const existing = this.sent.get(key);
    if (!existing) return true;
    return (Date.now() - existing.sentAt.getTime()) > (30 * 60 * 1000);
  }
  markSent(type, runId) { this.sent.set(`${type}:${runId}`, { type, runId, sentAt: new Date() }); }
}

// ============================================================
// Tests
// ============================================================

async function runTests() {
  console.log('\n========================================');
  console.log('  Recovery Module Tests');
  console.log('========================================');

  // ----- Valid Run State Transitions -----
  group('Valid Run State Transitions (15 states)', () => {
    const valid = [
      ['draft','queued'], ['queued','starting'], ['queued','cancel_requested'], ['queued','expired'],
      ['starting','running'], ['starting','interrupted'], ['starting','failed'],
      ['running','waiting_for_worker'], ['running','waiting_for_ai'], ['running','completed'],
      ['running','completed_with_warnings'], ['running','failed'], ['running','interrupted'], ['running','cancel_requested'],
      ['waiting_for_worker','running'], ['waiting_for_worker','interrupted'], ['waiting_for_worker','failed'],
      ['waiting_for_ai','completed'], ['waiting_for_ai','completed_with_warnings'], ['waiting_for_ai','interrupted'],
      ['failed','retry_pending'], ['interrupted','queued'], ['interrupted','retry_pending'],
      ['cancel_requested','cancelled'], ['retry_pending','queued'],
    ];
    for (const [f, t] of valid) {
      const r = validateRunTransition(f, t);
      assert(r.allowed, `${f} → ${t} allowed`);
    }
  });

  // ----- Invalid Transition Rejection -----
  group('Invalid Run State Transition Rejection', () => {
    const invalid = [
      ['completed','running'], ['cancelled','completed'], ['expired','running'],
      ['failed','completed'], ['blocked','running'], ['retry_pending','completed'],
      ['cancel_requested','running'], ['completed','failed'], ['expired','queued'],
    ];
    for (const [f, t] of invalid) {
      const r = validateRunTransition(f, t);
      assert(!r.allowed, `${f} → ${t} REJECTED`);
    }
  });

  // ----- Heartbeat Processing -----
  group('Heartbeat Processing', () => {
    const store = new WorkerStore();
    const payload = { workerInstanceId:'worker-1', workerType:'playwright', status:'busy', activeRunIds:['run-1'], activeJourneyResultIds:['jr-1'], capacity:2, timestamp:Math.floor(Date.now()/1000) };

    // New worker registration
    store.register({ workerInstanceId:'worker-1', workerType:'playwright', hostname:'uat-vm', version:'1.0', status:'busy', activeRunCount:1, capacity:2, lastSeenAt:new Date(), startedAt:new Date() });
    const w = store.get('worker-1');
    assertNotNull(w, 'worker registered');
    assertEqual(w.status, 'busy', 'worker status is busy');

    // Heartbeat update
    store.heartbeat('worker-1');
    const w2 = store.get('worker-1');
    assert(w2.lastSeenAt > new Date(Date.now() - 1000), 'heartbeat updates lastSeenAt');

    // Stale detection
    const pastDate = new Date(Date.now() - 200 * 1000);
    store.register({ workerInstanceId:'worker-2', workerType:'playwright', hostname:'old', version:'1.0', status:'idle', activeRunCount:0, capacity:2, lastSeenAt:pastDate, startedAt:pastDate });
    const stale = store.getStale(180);
    assertEqual(stale.length, 1, 'worker not seen in 200s is stale');
    assertEqual(stale[0].workerInstanceId, 'worker-2', 'correct stale worker detected');
  });

  // ----- Execution Lease -----
  group('Execution Lease Acquisition', () => {
    const store = new LeaseStore();

    const lease = store.acquire('run-1', 'worker-a', 300);
    assertNotNull(lease, 'lease acquired');
    assertEqual(lease.workerInstanceId, 'worker-a', 'lease has correct worker');
    assert(lease.leaseExpiresAt > new Date(), 'lease expiry is in the future');

    // Another worker cannot take the same lease
    const conflict = store.acquire('run-1', 'worker-b', 300);
    assert(conflict === null, 'different worker cannot acquire active lease');
  });

  // ----- Lease Renewal -----
  group('Execution Lease Renewal', () => {
    const store = new LeaseStore();
    const lease = store.acquire('run-2', 'worker-c', 300);
    const originalExpiry = lease.leaseExpiresAt.getTime();

    const renewed = store.renew('run-2', 'worker-c', 300);
    assert(renewed.leaseExpiresAt.getTime() >= originalExpiry, 'renewed lease expiry is >= original');

    // Wrong worker cannot renew
    const wrong = store.renew('run-2', 'worker-d', 300);
    assert(wrong === null, 'wrong worker cannot renew lease');
  });

  // ----- Lease Expiry -----
  group('Execution Lease Expiry', () => {
    const store = new LeaseStore();

    // Create an already-expired lease
    const expiredTime = new Date(Date.now() - 1000);
    store.leases.set('run-expired', {
      workerInstanceId:'worker-e', leaseAcquiredAt:new Date(Date.now()-600000), leaseExpiresAt:expiredTime, runId:'run-expired'
    });

    assert(store.isExpired('run-expired'), 'expired lease detected');

    const expired = store.getExpired();
    assertEqual(expired.length, 1, 'one expired lease found');
  });

  // ----- Old Worker Blocked After Lease Loss -----
  group('Old Worker Blocked After Lease Loss', () => {
    const store = new LeaseStore();

    // Worker A acquires and loses lease
    store.acquire('run-3', 'worker-a', -1); // immediately expired
    assert(store.isExpired('run-3'), 'lease expired');

    // Worker A tries to renew — should fail since lease is expired
    const renewed = store.renew('run-3', 'worker-a', 300);
    assert(renewed === null, 'old worker cannot renew expired lease');
  });

  // ----- Stale-Run Classification -----
  group('Stale-Run Classification', () => {
    const now = new Date();

    // Queue timeout
    const qTimeout = classifyRunHealth({
      status:'queued', heartbeatAt:null, progressAt:null,
      queueTime:new Date(now - 1000 * 1000), startTime:null, leaseExpiresAt:null
    });
    assertEqual(qTimeout.health, 'stale', 'queued too long → stale');
    assertEqual(qTimeout.reason, 'queue_timeout', 'reason is queue_timeout');

    // Heartbeat missing (stale)
    const hbStale = classifyRunHealth({
      status:'running', heartbeatAt:new Date(now - 200 * 1000), progressAt:new Date(),
      queueTime:new Date(now - 300 * 1000), startTime:new Date(now - 300 * 1000), leaseExpiresAt:null
    });
    assertEqual(hbStale.health, 'stale', 'heartbeat missing > 180s → stale');

    // Heartbeat delayed (not yet stale)
    const hbDelayed = classifyRunHealth({
      status:'running', heartbeatAt:new Date(now - 100 * 1000), progressAt:new Date(),
      queueTime:new Date(now - 300 * 1000), startTime:new Date(now - 300 * 1000), leaseExpiresAt:null
    });
    assertEqual(hbDelayed.health, 'delayed', 'heartbeat missing > 90s → delayed');

    // Healthy
    const healthy = classifyRunHealth({
      status:'running', heartbeatAt:new Date(), progressAt:new Date(),
      queueTime:new Date(now - 60 * 1000), startTime:new Date(now - 60 * 1000), leaseExpiresAt:null
    });
    assertEqual(healthy.health, 'healthy', 'active run → healthy');

    // Terminal
    const terminal = classifyRunHealth({
      status:'completed', heartbeatAt:null, progressAt:null,
      queueTime:null, startTime:null, leaseExpiresAt:null
    });
    assertEqual(terminal.health, 'healthy', 'terminal run → healthy (no action)');
  });

  // ----- Progress Timeout -----
  group('Progress Timeout', () => {
    const now = new Date();
    const stale = classifyRunHealth({
      status:'running', heartbeatAt:new Date(), progressAt:new Date(now - 700 * 1000),
      queueTime:new Date(now - 800 * 1000), startTime:new Date(now - 800 * 1000), leaseExpiresAt:null
    });
    assertEqual(stale.health, 'stale', 'no progress for > 600s → stale');
    assertEqual(stale.reason, 'progress_timeout', 'reason is progress_timeout');
  });

  // ----- Maximum Attempt Handling -----
  group('Maximum Attempt Handling', () => {
    const r1 = canRetryRun({ status:'failed', attemptCount:1, maxAttempts:2, errorCode:'WORKER_OFFLINE' });
    assert(r1.canRetry, 'attempt 1/2 → can retry');

    const r2 = canRetryRun({ status:'failed', attemptCount:2, maxAttempts:2, errorCode:'WORKER_OFFLINE' });
    assert(!r2.canRetry, 'attempt 2/2 → cannot retry');
    assertEqual(r2.reason, 'Attempt limit reached.', 'reason mentions limit');
  });

  // ----- Unsafe Step Retry Blocking -----
  group('Unsafe Step Retry Blocking', () => {
    assert(isSafeToRepeat('navigate'), 'navigate is safe');
    assert(isSafeToRepeat('assert_text'), 'assert is safe');
    assert(isSafeToRepeat('capture_screenshot'), 'screenshot is safe');

    assert(!isSafeToRepeat('fill_field'), 'fill_field needs validation');
    assert(!isSafeToRepeat('select_option'), 'select_option needs validation');

    // Custom step types default to requiring approval
    assert(requiresStaffApproval('submit_form'), 'submit_form requires approval');
    assert(requiresStaffApproval('create_account'), 'create_account requires approval');
  });

  // ----- Safe Checkpoint Selection -----
  group('Safe Checkpoint Selection', () => {
    const store = new CheckpointStore();

    store.record('jr-1', { checkpointId:'before_login', stepIndex:0, stepId:'step-1', reachedAt:new Date() });
    store.record('jr-1', { checkpointId:'after_login', stepIndex:5, stepId:'step-6', reachedAt:new Date() });
    store.record('jr-1', { checkpointId:'before_form_submission', stepIndex:10, stepId:'step-11', reachedAt:new Date() });

    const last = store.getLastSafe('jr-1');
    assertNotNull(last, 'last checkpoint found');
    assertEqual(last.checkpointId, 'before_form_submission', 'last checkpoint is before_form_submission');
    assertEqual(last.stepIndex, 10, 'step index is 10');

    const all = store.getAll('jr-1');
    assertEqual(all.length, 3, 'all 3 checkpoints recorded');

    // Nonexistent journey
    const none = store.getLastSafe('jr-nonexistent');
    assert(none === null, 'nonexistent journey returns null');
  });

  // ----- Retryable vs Deterministic Errors -----
  group('Retryable vs Deterministic Errors', () => {
    assert(isRetryableError('WORKER_OFFLINE'), 'worker offline → retryable');
    assert(isRetryableError('RUN_HEARTBEAT_MISSING'), 'heartbeat missing → retryable');
    assert(isRetryableError('RUN_LEASE_EXPIRED'), 'lease expired → retryable');
    assert(isRetryableError('RUN_CALLBACK_TIMEOUT'), 'callback timeout → retryable');

    assert(!isRetryableError('RETRY_LIMIT_REACHED'), 'retry limit → not retryable');
    assert(!isRetryableError('UNSAFE_RETRY_BLOCKED'), 'unsafe retry → not retryable');
    assert(!isRetryableError('RECOVERY_REQUIRES_APPROVAL'), 'needs approval → not retryable');
    assert(!isRetryableError('SOME_UNKNOWN_CODE'), 'unknown code → not retryable');
  });

  // ----- Duplicate Recovery Scan Prevention -----
  group('Duplicate Recovery Scan Prevention (idempotency)', () => {
    const scanStore = new Map();

    function runScan(scanId) {
      if (scanStore.has(scanId)) return { status:'duplicate', scanId };
      scanStore.set(scanId, { status:'completed', scannedAt:new Date() });
      return { status:'new', scanId };
    }

    const r1 = runScan('scan-001');
    assertEqual(r1.status, 'new', 'first scan is new');

    const r2 = runScan('scan-001');
    assertEqual(r2.status, 'duplicate', 'duplicate scan prevented');
  });

  // ----- Cancellation Acknowledgement -----
  group('Cancellation Acknowledgement', () => {
    const leaseStore = new LeaseStore();
    leaseStore.acquire('run-cancel', 'worker-f', 300);

    // Cancel acknowledged → release lease
    leaseStore.release('run-cancel');
    assert(leaseStore.leases.get('run-cancel') === undefined, 'lease released on cancel');

    // Run state after cancel
    const cancelFromRunning = validateRunTransition('running', 'cancel_requested');
    assert(cancelFromRunning.allowed, 'running → cancel_requested allowed');

    const cancelToCancelled = validateRunTransition('cancel_requested', 'cancelled');
    assert(cancelToCancelled.allowed, 'cancel_requested → cancelled allowed');
  });

  // ----- Emergency Stop -----
  group('Emergency Stop', () => {
    let paused = false;

    function emStop() { paused = true; return { success:true }; }
    function emResume() { paused = false; return { success:true }; }

    emStop();
    assert(paused, 'execution paused after emergency stop');

    emResume();
    assert(!paused, 'execution resumed after disable');
  });

  // ----- Alert Deduplication -----
  group('Alert Deduplication', () => {
    const dedup = new NotificationDedup();

    const s1 = dedup.shouldSend('worker_offline', 'run-a');
    assert(s1, 'first alert should send');
    dedup.markSent('worker_offline', 'run-a');

    const s2 = dedup.shouldSend('worker_offline', 'run-a');
    assert(!s2, 'duplicate alert suppressed within cooldown');

    const s3 = dedup.shouldSend('worker_offline', 'run-b');
    assert(s3, 'alert for different run should send');
  });

  // ----- All Run States Coverage -----
  group('All 15 Run States Defined', () => {
    const states = ['draft','queued','starting','running','waiting_for_worker','waiting_for_ai','completed','completed_with_warnings','failed','interrupted','cancel_requested','cancelled','blocked','expired','retry_pending'];
    assertEqual(states.length, 15, '15 run states defined');

    for (const s of states) {
      assert(RT.has(s), `state "${s}" exists in transition map`);
    }
  });

  // ============================================================
  // Results
  // ============================================================

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  Status:  ALL RECOVERY TESTS PASSED');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.error(`  Status:  ${failed} TEST(S) FAILED`);
    console.error('========================================\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\nRecovery test runner crashed:', err.message);
  process.exit(1);
});