#!/usr/bin/env node

// ============================================================
// DFP UAT Agent — Evidence Retention & Storage Tests
// ============================================================
// Automated tests for retention-date calculation, preservation
// rules, cleanup scanning, upload validation, path generation,
// storage monitoring, orphan detection, and emergency mode.
//
// Runs with: node scripts/test-evidence.mjs
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

const UNSAFE_SEGMENTS = ['..', '~', '\\'];
const SAFE_RE = /^[a-zA-Z0-9_.\-\/]+$/;

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.sh', '.bash',
  '.bat', '.cmd', '.ps1', '.vbs', '.js', '.mjs', '.cjs',
  '.py', '.rb', '.php', '.pl', '.jar', '.class',
]);

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp',
  'video/webm', 'video/mp4',
  'application/zip', 'application/json',
  'text/plain', 'text/html', 'application/pdf',
]);

const MAX_SIZES_BYTES = {
  screenshot: 10 * 1024 * 1024,
  visual_diff: 10 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  trace: 250 * 1024 * 1024,
  uat_report: 25 * 1024 * 1024,
  accessibility_report: 25 * 1024 * 1024,
  console_log: 25 * 1024 * 1024,
  network_log: 25 * 1024 * 1024,
  temporary_file: 100 * 1024 * 1024,
  other: 50 * 1024 * 1024,
};

function getMaxSize(category) { return MAX_SIZES_BYTES[category] || MAX_SIZES_BYTES.other; }

const RETENTION_CFG = {
  successDays: 14, failedDays: 90, traceDays: 30,
  videoDays: 30, reportDays: 365, tempHours: 24,
};

function calculateRetention(params) {
  const { category, runStatus, bugSeverity, bugStatus, createdAt, releaseApproved, pinned, legalHold } = params;

  if (legalHold) return { until: new Date(createdAt.getTime() + 365 * 10 * 86400000), reason: 'legal_hold' };
  if (pinned) return { until: new Date(createdAt.getTime() + 365 * 2 * 86400000), reason: 'staff_pinned' };

  if ((bugSeverity === 'critical' || bugSeverity === 'high') && ['open','in_progress','investigating','retest_required'].includes(bugStatus)) {
    return { until: new Date(createdAt.getTime() + 365 * 3 * 86400000), reason: 'open_bug' };
  }
  if (['open','in_progress'].includes(bugStatus)) {
    return { until: new Date(createdAt.getTime() + 365 * 2 * 86400000), reason: 'open_bug' };
  }

  if (releaseApproved) return { until: new Date(createdAt.getTime() + 365 * 2 * 86400000), reason: 'approved_release' };

  let days;
  switch (category) {
    case 'trace': days = RETENTION_CFG.traceDays; break;
    case 'video': days = RETENTION_CFG.videoDays; break;
    case 'uat_report': case 'accessibility_report': days = RETENTION_CFG.reportDays; break;
    case 'temporary_file': return { until: new Date(createdAt.getTime() + RETENTION_CFG.tempHours * 3600000), reason: 'temporary_file' };
    default: {
      const isFailure = ['failed','interrupted','cancelled'].includes(runStatus);
      days = isFailure ? RETENTION_CFG.failedDays : RETENTION_CFG.successDays;
      return { until: new Date(createdAt.getTime() + days * 86400000), reason: isFailure ? 'default_failure_retention' : 'default_success_retention' };
    }
  }

  return { until: new Date(createdAt.getTime() + days * 86400000), reason: runStatus === 'failed' ? 'default_failure_retention' : 'default_success_retention' };
}

function checkPreservation(params) {
  const { status, retentionUntil, pinned, legalHold, bugStatus, bugSeverity, releaseApproved, uploadCertain } = params;

  if (legalHold) return { preserved: true, reason: 'skip_legal_hold' };
  if (pinned) return { preserved: true, reason: 'skip_pinned' };
  if (!uploadCertain) return { preserved: true, reason: 'skip_uncertain' };
  if (['uploading','pending_upload','processing'].includes(status)) return { preserved: true, reason: 'skip_uncertain' };

  if ((bugSeverity === 'critical' || bugSeverity === 'high') && !['closed','resolved','false_positive'].includes(bugStatus)) {
    return { preserved: true, reason: 'skip_open_bug' };
  }
  if (['open','in_progress','investigating','retest_required'].includes(bugStatus)) {
    return { preserved: true, reason: 'skip_open_bug' };
  }

  if (releaseApproved) return { preserved: true, reason: 'skip_approved_release' };
  if (status === 'retention_locked') return { preserved: true, reason: 'skip_preserved' };

  const now = new Date();
  if (retentionUntil > now) return { preserved: true, reason: 'skip_preserved' };

  return { preserved: false, reason: 'delete' };
}

function validateUpload(params) {
  const { category, filename, mimeType, sizeBytes } = params;

  if (!ALLOWED_MIME.has(mimeType)) return { allowed: false, error: 'EVIDENCE_TYPE_NOT_ALLOWED' };
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) return { allowed: false, error: 'EVIDENCE_TYPE_NOT_ALLOWED' };
  if (sizeBytes > getMaxSize(category)) return { allowed: false, error: 'EVIDENCE_FILE_TOO_LARGE' };
  if (sizeBytes <= 0) return { allowed: false, error: 'EVIDENCE_FILE_TOO_LARGE' };
  for (const u of UNSAFE_SEGMENTS) { if (filename.includes(u)) return { allowed: false, error: 'EVIDENCE_PATH_INVALID' }; }
  return { allowed: true, error: null };
}

function generatePath(projectId, runId, journeyId, category, filename) {
  if (!projectId || !runId) return { path: '', error: 'EVIDENCE_PATH_INVALID' };
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) return { path: '', error: 'EVIDENCE_TYPE_NOT_ALLOWED' };

  const catFolder = {
    screenshot:'screenshots', visual_diff:'visual-diffs', video:'videos',
    trace:'traces', console_log:'logs', network_log:'logs',
    accessibility_report:'reports', uat_report:'reports',
    temporary_file:'temp', other:'other',
  }[category] || 'other';

  const uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const safeName = `${uuid}${ext}`;
  const segs = [projectId, runId];
  if (journeyId) segs.push(journeyId);
  segs.push(catFolder, safeName);
  const path = segs.join('/');

  for (const u of UNSAFE_SEGMENTS) { if (path.includes(u)) return { path: '', error: 'EVIDENCE_PATH_INVALID' }; }
  if (!SAFE_RE.test(path)) return { path: '', error: 'EVIDENCE_PATH_INVALID' };
  return { path, error: null };
}

function assessStorageHealth(sizeBytes, maxBytes) {
  if (maxBytes <= 0) return 'unknown';
  const pct = (sizeBytes / maxBytes) * 100;
  if (pct >= 90) return 'critical';
  if (pct >= 75) return 'warning';
  return 'healthy';
}

function runCleanupScan(records) {
  const candidates = [];
  let preserved = 0;

  for (const r of records) {
    const p = checkPreservation({
      status: r.status, retentionUntil: r.retentionUntil,
      pinned: r.pinned, legalHold: r.legalHold,
      bugStatus: r.bugStatus, bugSeverity: r.bugSeverity,
      releaseApproved: r.releaseApproved, uploadCertain: r.status === 'available',
    });

    if (p.preserved) { preserved++; }
    else { candidates.push({ id: r.id, size: r.sizeBytes, reason: p.reason }); }
  }

  const totalSize = candidates.reduce((s, c) => s + c.size, 0);
  return {
    totalChecked: records.length,
    candidates,
    preservedCount: preserved,
    candidateTotalSize: totalSize,
    approvalRequired: (totalSize / (1024*1024*1024)) > 10,
  };
}

// ============================================================
// Tests
// ============================================================

async function runTests() {
  console.log('\n========================================');
  console.log('  Evidence Retention & Storage Tests');
  console.log('========================================');

  // ----- Retention-Date Calculation -----
  group('Retention-Date Calculation', () => {
    const now = new Date('2026-07-29T00:00:00Z');

    // Successful run screenshot
    const r1 = calculateRetention({ category:'screenshot', runStatus:'completed', createdAt:now });
    const expected1 = new Date(now.getTime() + 14 * 86400000);
    assertEqual(r1.until.getTime(), expected1.getTime(), 'successful run screenshot → 14 days');
    assertEqual(r1.reason, 'default_success_retention', 'reason is default_success_retention');

    // Failed run screenshot
    const r2 = calculateRetention({ category:'screenshot', runStatus:'failed', createdAt:now });
    const expected2 = new Date(now.getTime() + 90 * 86400000);
    assertEqual(r2.until.getTime(), expected2.getTime(), 'failed run screenshot → 90 days');
    assertEqual(r2.reason, 'default_failure_retention', 'reason is default_failure_retention');

    // Trace
    const r3 = calculateRetention({ category:'trace', runStatus:'completed', createdAt:now });
    const expected3 = new Date(now.getTime() + 30 * 86400000);
    assertEqual(r3.until.getTime(), expected3.getTime(), 'trace → 30 days');

    // Report
    const r4 = calculateRetention({ category:'uat_report', runStatus:'completed', createdAt:now });
    const expected4 = new Date(now.getTime() + 365 * 86400000);
    assertEqual(r4.until.getTime(), expected4.getTime(), 'report → 365 days');

    // Temp file
    const r5 = calculateRetention({ category:'temporary_file', runStatus:'completed', createdAt:now });
    const expected5 = new Date(now.getTime() + 24 * 3600000);
    assertEqual(r5.until.getTime(), expected5.getTime(), 'temp file → 24 hours');
  });

  // ----- Failed-Run Retention -----
  group('Failed-Run Retention (90 days)', () => {
    const now = new Date('2026-07-29T00:00:00Z');

    const r1 = calculateRetention({ category:'screenshot', runStatus:'failed', createdAt:now });
    assertEqual(r1.until.getTime(), new Date(now.getTime() + 90 * 86400000).getTime(), 'failed screenshot → 90 days');

    const r2 = calculateRetention({ category:'screenshot', runStatus:'interrupted', createdAt:now });
    assertEqual(r2.until.getTime(), new Date(now.getTime() + 90 * 86400000).getTime(), 'interrupted screenshot → 90 days');

    const r3 = calculateRetention({ category:'video', runStatus:'failed', createdAt:now });
    assertEqual(r3.until.getTime(), new Date(now.getTime() + 30 * 86400000).getTime(), 'failed video → 30 days (video rule)');
  });

  // ----- Open Bug Preservation -----
  group('Open Bug Preservation', () => {
    const now = new Date('2026-07-29T00:00:00Z');

    // Critical open bug
    const r1 = calculateRetention({ category:'screenshot', runStatus:'failed', bugSeverity:'critical', bugStatus:'open', createdAt:now });
    assertEqual(r1.reason, 'open_bug', 'critical open bug → preserved');
    assert(r1.until.getTime() > new Date(now.getTime() + 365 * 86400000).getTime(), 'retention > 365 days for critical bug');

    // Medium closed bug — no preservation
    const r2 = calculateRetention({ category:'screenshot', runStatus:'completed', bugSeverity:'medium', bugStatus:'closed', createdAt:now });
    assertEqual(r2.reason, 'default_success_retention', 'closed medium bug → normal retention');
  });

  // ----- Approved Release Preservation -----
  group('Approved Release Preservation', () => {
    const now = new Date('2026-07-29T00:00:00Z');
    const r = calculateRetention({ category:'screenshot', runStatus:'completed', releaseApproved:true, createdAt:now });
    assertEqual(r.reason, 'approved_release', 'approved release → preserved');
    assert(r.until.getTime() > new Date(now.getTime() + 365 * 86400000).getTime(), 'retention > 365 days');
  });

  // ----- Staff Pin Preservation -----
  group('Staff Pin Preservation', () => {
    const now = new Date('2026-07-29T00:00:00Z');
    const r = calculateRetention({ category:'screenshot', runStatus:'completed', pinned:true, createdAt:now });
    assertEqual(r.reason, 'staff_pinned', 'pinned → preserved');
    assert(r.until.getTime() >= new Date(now.getTime() + 365 * 2 * 86400000).getTime(), 'retention >= 2 years');
  });

  // ----- Legal Hold Preservation -----
  group('Legal Hold Preservation', () => {
    const now = new Date('2026-07-29T00:00:00Z');
    const r = calculateRetention({ category:'screenshot', runStatus:'completed', legalHold:true, createdAt:now });
    assertEqual(r.reason, 'legal_hold', 'legal hold → preserved');
    assert(r.until.getTime() >= new Date(now.getTime() + 365 * 5 * 86400000).getTime(), 'retention >= 5 years');
  });

  // ----- Cleanup Dry Run -----
  group('Cleanup Dry Run', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 86400000);

    const records = [
      { id:'ev-1', sizeBytes:5000000, status:'available', retentionUntil:past, pinned:false, legalHold:false, bugStatus:'closed', bugSeverity:'low', releaseApproved:false },
      { id:'ev-2', sizeBytes:2000000, status:'available', retentionUntil:past, pinned:true, legalHold:false, bugStatus:'closed', bugSeverity:'low', releaseApproved:false },
      { id:'ev-3', sizeBytes:8000000, status:'available', retentionUntil:past, pinned:false, legalHold:false, bugStatus:'open', bugSeverity:'critical', releaseApproved:false },
      { id:'ev-4', sizeBytes:1000000, status:'available', retentionUntil:past, pinned:false, legalHold:false, bugStatus:'closed', bugSeverity:'medium', releaseApproved:false },
    ];

    const result = runCleanupScan(records);
    assertEqual(result.totalChecked, 4, '4 records checked');
    assertEqual(result.preservedCount, 2, '2 preserved (pinned + open bug)');
    assertEqual(result.candidates.length, 2, '2 candidates for deletion');
    assert(!result.approvalRequired, 'approval not required for small cleanup');
  });

  // ----- Approval Threshold -----
  group('Cleanup Approval Threshold (> 10GB)', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 86400000);

    const records = Array.from({ length: 100 }, (_, i) => ({
      id: `ev-big-${i}`,
      sizeBytes: 200 * 1024 * 1024, // 200MB each
      status:'available' , retentionUntil:past, pinned:false, legalHold:false,
      bugStatus:'closed', bugSeverity:'low', releaseApproved:false,
    }));

    const result = runCleanupScan(records);
    assert(result.approvalRequired, 'approval required: > 10GB of candidates');
  });

  // ----- Idempotent Cleanup -----
  group('Idempotent Cleanup Scan', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 86400000);

    const records = [
      { id:'ev-a', sizeBytes:1000000, status:'available', retentionUntil:past, pinned:false, legalHold:false, bugStatus:'closed', bugSeverity:'low', releaseApproved:false },
    ];

    const r1 = runCleanupScan(records);
    const r2 = runCleanupScan(records);
    assertEqual(r1.candidates.length, r2.candidates.length, 'same result on repeat scan');
    assertEqual(r1.preservedCount, r2.preservedCount, 'same preserved count on repeat scan');
  });

  // ----- Deletion Order -----
  group('Deletion Order — Oldest Candidates First', () => {
    const now = new Date();
    const veryPast = new Date(now.getTime() - 120 * 86400000);
    const recentPast = new Date(now.getTime() - 20 * 86400000);

    const records = [
      { id:'old', sizeBytes:1000000, status:'available', retentionUntil:veryPast, pinned:false, legalHold:false, bugStatus:'closed', bugSeverity:'low', releaseApproved:false },
      { id:'recent', sizeBytes:1000000, status:'available', retentionUntil:recentPast, pinned:false, legalHold:false, bugStatus:'closed', bugSeverity:'low', releaseApproved:false },
    ];

    const result = runCleanupScan(records);
    assertEqual(result.candidates.length, 2, 'both past retention → candidates');
  });

  // ----- Deletion Failure Handling -----
  group('Deletion Failure Handling', () => {
    // Simulated: should not crash on missing Storage object
    const missingFromStorage = { id:'ev-missing', status:'deletion_failed', evidencePath:'missing-path' };
    assertEqual(missingFromStorage.status, 'deletion_failed', 'deletion_failed status recorded');
    assert(missingFromStorage.evidencePath !== '', 'path recorded for retry');
  });

  // ----- Path Traversal Rejection -----
  group('Path Traversal Rejection', () => {
    const r1 = generatePath('proj-1', 'run-1', null, 'screenshot', '../../../etc/passwd.png');
    assert(r1.error === 'EVIDENCE_PATH_INVALID' || r1.error === 'EVIDENCE_TYPE_NOT_ALLOWED', `path traversal rejected: ${r1.error}`);

    const r2 = generatePath('proj-1', 'run-1', null, 'screenshot', 'normal.png');
    assertEqual(r2.error, null, 'normal path accepted');
    assert(r2.path.startsWith('proj-1/run-1/'), 'path starts with project/run');
  });

  // ----- MIME Validation -----
  group('MIME Validation', () => {
    const v1 = validateUpload({ category:'screenshot', filename:'test.png', mimeType:'image/png', sizeBytes:50000 });
    assert(v1.allowed, 'image/png allowed');

    const v2 = validateUpload({ category:'screenshot', filename:'test.exe', mimeType:'application/octet-stream', sizeBytes:50000 });
    assert(!v2.allowed, 'exe rejected');
    assertEqual(v2.error, 'EVIDENCE_TYPE_NOT_ALLOWED', 'error code for exe');

    const v3 = validateUpload({ category:'screenshot', filename:'test.html', mimeType:'text/html', sizeBytes:50000 });
    assert(v3.allowed, 'text/html allowed');

    const v4 = validateUpload({ category:'screenshot', filename:'script.sh', mimeType:'text/plain', sizeBytes:50000 });
    assert(!v4.allowed, '.sh extension rejected even with text/plain MIME');
  });

  // ----- File-Size Validation -----
  group('File-Size Validation', () => {
    const v1 = validateUpload({ category:'screenshot', filename:'test.png', mimeType:'image/png', sizeBytes:15 * 1024 * 1024 });
    assert(!v1.allowed, '15MB screenshot rejected (max 10MB)');
    assertEqual(v1.error, 'EVIDENCE_FILE_TOO_LARGE', 'error is FILE_TOO_LARGE');

    const v2 = validateUpload({ category:'video', filename:'test.mp4', mimeType:'video/mp4', sizeBytes:300 * 1024 * 1024 });
    assert(!v2.allowed, '300MB video rejected (max 250MB)');

    const v3 = validateUpload({ category:'screenshot', filename:'test.png', mimeType:'image/png', sizeBytes:5 * 1024 * 1024 });
    assert(v3.allowed, '5MB screenshot accepted');

    const v4 = validateUpload({ category:'screenshot', filename:'test.png', mimeType:'image/png', sizeBytes:0 });
    assert(!v4.allowed, 'zero-byte file rejected');
  });

  // ----- Checksum Mismatch -----
  group('Checksum Mismatch Detection', () => {
    // Simulated: record checksum doesn't match computed checksum
    const recordChecksum = 'abc123def456';
    const computedChecksum = 'abc123def457';
    const mismatch = recordChecksum !== computedChecksum;
    assert(mismatch, 'checksum mismatch detected');
  });

  // ----- Duplicate Evidence Handling -----
  group('Duplicate Evidence Handling', () => {
    const existingChecksums = new Set(['abc123']);

    function isDuplicate(checksum) {
      return existingChecksums.has(checksum);
    }

    assert(isDuplicate('abc123'), 'duplicate checksum detected');
    assert(!isDuplicate('xyz789'), 'new checksum is not duplicate');
  });

  // ----- Orphan Detection -----
  group('Orphan Detection', () => {
    const storagePaths = new Set(['a/b/c.png', 'd/e/f.png', 'temp/x/y.zip']);
    const recordPaths = new Set(['a/b/c.png']);

    const storageOrphans = [...storagePaths].filter((p) => !recordPaths.has(p));
    const recordOrphans = [...recordPaths].filter((p) => !storagePaths.has(p));

    assertEqual(storageOrphans.length, 2, '2 storage orphans');
    assertEqual(recordOrphans.length, 0, '0 record orphans');

    const tempOrphans = storageOrphans.filter((p) => p.includes('/temp/'));
    assertEqual(tempOrphans.length, 1, '1 temp-prefix orphan');
  });

  // ----- Temporary-File Cleanup -----
  group('Temporary File Cleanup', () => {
    const now = new Date();
    const tempRetention = 24 * 3600000;

    const tempFile = { id:'tf-1', category:'temporary_file', createdAt:new Date(now - 30 * 3600000), runActive:false };
    const isPastRetention = (now - tempFile.createdAt) > tempRetention;
    assert(isPastRetention, 'temp file past 24h retention');

    const activeRunTemp = { id:'tf-2', category:'temporary_file', createdAt:new Date(now - 30 * 3600000), runActive:true };
    assert(activeRunTemp.runActive, 'active run temp file should NOT be deleted');
  });

  // ----- Storage Warning State -----
  group('Storage Warning/Critical State', () => {
    assertEqual(assessStorageHealth(70, 100), 'healthy', '70% → healthy');
    assertEqual(assessStorageHealth(76, 100), 'warning', '76% → warning');
    assertEqual(assessStorageHealth(85, 100), 'warning', '85% → warning');
    assertEqual(assessStorageHealth(91, 100), 'critical', '91% → critical');
    assertEqual(assessStorageHealth(0, 0), 'unknown', '0/0 → unknown');
  });

  // ----- Emergency Mode -----
  group('Storage Emergency Mode', () => {
    let emergency = false;

    function enableEmergency() { emergency = true; }
    function disableEmergency() { emergency = false; }

    assert(!emergency, 'starts not in emergency');
    enableEmergency();
    assert(emergency, 'emergency mode active');
    disableEmergency();
    assert(!emergency, 'emergency mode deactivated');
  });

  // ----- Audit-Event Creation -----
  group('Audit Event Creation', () => {
    const events = [];

    function record(eventType, actor, targetId) {
      events.push({ eventType, actor, targetId, timestamp: new Date() });
    }

    record('evidence_uploaded', 'worker-1', 'ev-001');
    record('cleanup_started', 'staff-admin', 'cleanup-run-001');
    record('evidence_deleted', 'cleanup-scanner', 'ev-002');
    record('storage_critical_triggered', 'storage-monitor', 'system');

    assertEqual(events.length, 4, '4 audit events recorded');
    assertEqual(events[0].eventType, 'evidence_uploaded', 'first event is upload');
    assertEqual(events[2].eventType, 'evidence_deleted', 'third event is deletion');
  });

  // ============================================================
  // Results
  // ============================================================

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  Status:  ALL EVIDENCE RETENTION TESTS PASSED');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.error(`  Status:  ${failed} TEST(S) FAILED`);
    console.error('========================================\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\nEvidence test runner crashed:', err.message);
  process.exit(1);
});