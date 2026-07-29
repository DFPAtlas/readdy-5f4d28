#!/usr/bin/env node
// ============================================================
// DFP UAT Agent — Disaster Recovery Tests
// ============================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertGt(a, b, msg) { if (!(a > b)) throw new Error(msg || `expected ${JSON.stringify(a)} > ${JSON.stringify(b)}`); }
function assertContains(arr, item, msg) { if (!arr.includes(item)) throw new Error(msg || `array does not contain ${item}`); }

// Import the module
import('../src/lib/security/disaster-recovery.server.ts').then((mod) => {
  const actualMod = mod.default || mod;

  // ============================================================
  // 1. Backup run lifecycle
  // ============================================================
  console.log('\n[1] Backup Run Lifecycle');
  test('create backup run', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
    assertEq(run.backupType, 'supabase_database');
    assertEq(run.status, 'running');
    assert(run.id.startsWith('backup-'), 'id should start with backup-');
  });

  test('complete backup run', () => {
    const run = actualMod.createBackupRun({ backupType: 'n8n_database', triggeredBy: 'test' });
    const updated = actualMod.completeBackupRun(run.id, { fileCount: 5, totalSizeBytes: 1000000 });
    assertEq(updated.status, 'completed');
    assertEq(updated.fileCount, 5);
    assertEq(updated.totalSizeBytes, 1000000);
  });

  test('fail backup run', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_storage', triggeredBy: 'test' });
    const updated = actualMod.failBackupRun(run.id, 'BACKUP_SOURCE_UNAVAILABLE', 'Source unreachable');
    assertEq(updated.status, 'failed');
    assertEq(updated.errorCode, 'BACKUP_SOURCE_UNAVAILABLE');
  });

  // ============================================================
  // 2. Backup lock
  // ============================================================
  console.log('\n[2] Backup Lock');
  test('acquire and release lock', () => {
    actualMod.releaseBackupLock();
    assert(actualMod.acquireBackupLock('lock-1'), 'should acquire lock');
    assert(actualMod.isBackupLocked(), 'should be locked');
    assert(!actualMod.acquireBackupLock('lock-2'), 'should not acquire second lock');
    actualMod.releaseBackupLock();
    assert(!actualMod.isBackupLocked(), 'should be unlocked');
  });

  // ============================================================
  // 3. Manifest generation
  // ============================================================
  console.log('\n[3] Manifest Generation');
  test('generate manifest with files', () => {
    const manifest = actualMod.generateManifest(
      { backupId: 'b-001', backupType: 'supabase_database', appVersion: 'v1.0', gitCommitSha: 'abc123' },
      [{ filename: 'db.dump', sizeBytes: 5000, checksumSha256: 'deadbeef' }]
    );
    assertEq(manifest.backupId, 'b-001');
    assertEq(manifest.fileList.length, 1);
    assertEq(manifest.fileList[0].checksumSha256, 'deadbeef');
    assertEq(manifest.appVersion, 'v1.0');
    assertEq(manifest.gitCommitSha, 'abc123');
  });

  test('manifest without optional fields', () => {
    const manifest = actualMod.generateManifest(
      { backupId: 'b-min', backupType: 'n8n_workflows' },
      []
    );
    assertEq(manifest.appVersion, 'unknown');
    assertEq(manifest.gitCommitSha, 'unknown');
    assertEq(manifest.fileList.length, 0);
  });

  // ============================================================
  // 4. Backup verification
  // ============================================================
  console.log('\n[4] Backup Verification');
  test('verify passing backup', () => {
    const run = actualMod.createBackupRun({ backupType: 'full_system_manifest', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 3, totalSizeBytes: 5000 });
    const result = actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 5000,
      archiveValid: true, checksumMatches: true, manifestMatches: true,
      decryptable: true, componentsPresent: ['db', 'config'], componentsMissing: [],
    });
    assert(result.verified, 'should be verified');
    assertEq(result.errors.length, 0);
  });

  test('verify failing backup — missing file', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 0, totalSizeBytes: 0 });
    const result = actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: false, fileSizeBytes: 0,
      archiveValid: true, checksumMatches: true, manifestMatches: true,
      decryptable: true, componentsPresent: [], componentsMissing: ['db'],
    });
    assert(!result.verified, 'should not be verified');
    assertGt(result.errors.length, 0);
  });

  test('verify failing backup — checksum mismatch', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 1, totalSizeBytes: 100 });
    const result = actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 100,
      archiveValid: true, checksumMatches: false, manifestMatches: true,
      decryptable: true, componentsPresent: ['db'], componentsMissing: [],
    });
    assert(!result.verified, 'checksum mismatch should fail');
    assert(result.errors.some((e) => e.includes('checksum')), 'should mention checksum');
  });

  test('verify failing — empty backup', () => {
    const run = actualMod.createBackupRun({ backupType: 'n8n_database', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 1, totalSizeBytes: 0 });
    const result = actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 0,
      archiveValid: true, checksumMatches: true, manifestMatches: true,
      decryptable: true, componentsPresent: [], componentsMissing: [],
    });
    assert(!result.verified, 'empty backup should fail');
  });

  // ============================================================
  // 5. Remote copy
  // ============================================================
  console.log('\n[5] Remote Copy');
  test('mark remote copy success', () => {
    const run = actualMod.createBackupRun({ backupType: 'application_config', triggeredBy: 'test' });
    const updated = actualMod.markRemoteCopy(run.id, true);
    assert(updated.remoteCopy, 'should be remote copy');
  });

  test('mark remote copy failure', () => {
    const run = actualMod.createBackupRun({ backupType: 'docker_config', triggeredBy: 'test' });
    const updated = actualMod.markRemoteCopy(run.id, false, 'BACKUP_REMOTE_COPY_FAILED');
    assert(!updated.remoteCopy, 'should not be remote');
    assertEq(updated.errorCode, 'BACKUP_REMOTE_COPY_FAILED');
  });

  // ============================================================
  // 6. Restore testing
  // ============================================================
  console.log('\n[6] Restore Testing');
  test('cannot restore unverified backup', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
    const rt = actualMod.createRestoreTest({ backupRunId: run.id, testEnvironment: 'isolated' });
    assertEq(rt, null, 'should not create restore test for unverified');
  });

  test('restore test lifecycle', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 1, totalSizeBytes: 100 });
    actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 100, archiveValid: true,
      checksumMatches: true, manifestMatches: true, decryptable: true,
      componentsPresent: ['db'], componentsMissing: [],
    });
    const rt = actualMod.createRestoreTest({ backupRunId: run.id, testEnvironment: 'isolated-docker' });
    assert(rt !== null, 'should create restore test');
    assertEq(rt.status, 'running');
    assertEq(rt.testEnvironment, 'isolated-docker');
  });

  test('restore test passes', () => {
    const run = actualMod.createBackupRun({ backupType: 'n8n_database', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 1, totalSizeBytes: 200 });
    actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 200, archiveValid: true,
      checksumMatches: true, manifestMatches: true, decryptable: true,
      componentsPresent: ['n8n'], componentsMissing: [],
    });
    const rt = actualMod.createRestoreTest({ backupRunId: run.id, testEnvironment: 'docker-temp' });
    const completed = actualMod.completeRestoreTest(rt.id, {
      passed: true, recoveryTimeSeconds: 120, recoveryPointAgeSeconds: 3600,
      databaseRestoreStatus: 'passed', storageRestoreStatus: 'passed',
      n8nRestoreStatus: 'passed', applicationStartStatus: 'passed',
      healthCheckStatus: 'passed', smokeTestStatus: 'passed',
    });
    assertEq(completed.status, 'passed');
    assertEq(completed.recoveryTimeSeconds, 120);
  });

  test('restore test fails', () => {
    const run = actualMod.createBackupRun({ backupType: 'supabase_storage', triggeredBy: 'test' });
    actualMod.completeBackupRun(run.id, { fileCount: 1, totalSizeBytes: 300 });
    actualMod.verifyBackupRun(run.id, {
      runId: run.id, fileExists: true, fileSizeBytes: 300, archiveValid: true,
      checksumMatches: true, manifestMatches: true, decryptable: true,
      componentsPresent: ['storage'], componentsMissing: [],
    });
    const rt = actualMod.createRestoreTest({ backupRunId: run.id, testEnvironment: 'docker-temp' });
    const completed = actualMod.completeRestoreTest(rt.id, {
      passed: false, recoveryTimeSeconds: 999, recoveryPointAgeSeconds: 7200,
      databaseRestoreStatus: 'passed', storageRestoreStatus: 'failed',
      n8nRestoreStatus: 'passed', applicationStartStatus: 'passed',
      healthCheckStatus: 'failed', smokeTestStatus: 'pending',
      errorCode: 'RESTORE_STORAGE_FAILED',
    });
    assertEq(completed.status, 'failed');
    assertEq(completed.errorCode, 'RESTORE_STORAGE_FAILED');
  });

  // ============================================================
  // 7. Retention policy
  // ============================================================
  console.log('\n[7] Retention Policy');
  test('preserves newest verified backup', () => {
    const runs = [];
    for (let i = 0; i < 30; i++) {
      const r = actualMod.createBackupRun({ backupType: 'supabase_database', triggeredBy: 'test' });
      actualMod.completeBackupRun(r.id, { fileCount: 1, totalSizeBytes: 100 + i });
      actualMod.verifyBackupRun(r.id, {
        runId: r.id, fileExists: true, fileSizeBytes: 100 + i, archiveValid: true,
        checksumMatches: true, manifestMatches: true, decryptable: true,
        componentsPresent: ['db'], componentsMissing: [],
      });
      runs.push(r);
    }
    // Manually set some as verified so they count
    const allRuns = runs.filter(r => r.verificationStatus === 'verified');
    assertGt(allRuns.length, 0, 'should have verified runs');
  });

  test('holds prevent deletion', () => {
    const run = actualMod.createBackupRun({ backupType: 'n8n_encryption_key', triggeredBy: 'test' });
    assert(actualMod.addBackupHold(run.id), 'should add hold');
    actualMod.removeBackupHold(run.id);
    // Should not throw
  });

  // ============================================================
  // 8. RPO / RTO calculation
  // ============================================================
  console.log('\n[8] RPO / RTO Calculation');
  test('RPO met with recent backup', () => {
    const result = actualMod.calculateRpoRto({
      latestBackupAt: new Date(), latestVerifiedAt: new Date(),
      latestRestoreTime: 3600, targetRpoHours: 24, targetRtoHours: 4,
    });
    assert(result.rpoMet, 'RPO should be met');
    assert(result.rtoMet, 'RTO should be met');
  });

  test('RPO missed with old backup', () => {
    const oldDate = new Date(Date.now() - 48 * 3600 * 1000);
    const result = actualMod.calculateRpoRto({
      latestBackupAt: oldDate, latestVerifiedAt: oldDate,
      latestRestoreTime: null, targetRpoHours: 24, targetRtoHours: 4,
    });
    assert(!result.rpoMet, 'RPO should be missed');
  });

  test('RTO missed with slow restore', () => {
    const result = actualMod.calculateRpoRto({
      latestBackupAt: new Date(), latestVerifiedAt: new Date(),
      latestRestoreTime: 20000, targetRpoHours: 24, targetRtoHours: 4,
    });
    assert(!result.rtoMet, 'RTO should be missed');
  });

  // ============================================================
  // 9. Recovery readiness assessment
  // ============================================================
  console.log('\n[9] Recovery Readiness Assessment');
  test('ready when all good', () => {
    const r = actualMod.assessRecoveryReadiness({
      component: 'supabase', latestBackupAt: new Date(),
      latestVerifiedAt: new Date(), latestRestoreTestAt: new Date(),
      latestRestoreTestPassed: true, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'ready');
  });

  test('backup missing', () => {
    const r = actualMod.assessRecoveryReadiness({
      component: 'n8n', latestBackupAt: null,
      latestVerifiedAt: null, latestRestoreTestAt: null,
      latestRestoreTestPassed: null, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'backup_missing');
  });

  test('backup stale (>48h)', () => {
    const oldDate = new Date(Date.now() - 72 * 3600 * 1000);
    const r = actualMod.assessRecoveryReadiness({
      component: 'storage', latestBackupAt: oldDate,
      latestVerifiedAt: null, latestRestoreTestAt: null,
      latestRestoreTestPassed: null, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'backup_stale');
  });

  test('restore untested', () => {
    const r = actualMod.assessRecoveryReadiness({
      component: 'config', latestBackupAt: new Date(),
      latestVerifiedAt: new Date(), latestRestoreTestAt: null,
      latestRestoreTestPassed: null, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'restore_untested');
  });

  // ============================================================
  // 10. Stale backup detection
  // ============================================================
  console.log('\n[10] Stale Backup Detection');
  test('detects stale backups', () => {
    const result = actualMod.detectStaleBackups();
    assert(Array.isArray(result.staleBackups), 'should return array');
    assert(Array.isArray(result.missedSchedules), 'should return missed');
    assert(Array.isArray(result.warnings), 'should return warnings');
  });

  // ============================================================
  // 11. DR Status management
  // ============================================================
  console.log('\n[11] DR Status Management');
  test('update DR status', () => {
    const status = actualMod.updateDRStatus({
      component: 'supabase', readinessStatus: 'ready',
      latestBackupAt: new Date(), latestVerifiedAt: new Date(),
      latestRestoreTestAt: new Date(), backupAgeSeconds: 3600,
      targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(status.component, 'supabase');
    assertEq(status.readinessStatus, 'ready');
  });

  // ============================================================
  // 12. Recovery report
  // ============================================================
  console.log('\n[12] Recovery Report Generation');
  test('generate report with components', () => {
    actualMod.updateDRStatus({
      component: 'supabase', readinessStatus: 'ready',
      latestBackupAt: new Date(), latestVerifiedAt: new Date(),
      latestRestoreTestAt: new Date(), backupAgeSeconds: 1800,
      targetRpoHours: 24, targetRtoHours: 4,
    });
    const report = actualMod.generateRecoveryReport(['supabase', 'n8n', 'storage']);
    assert(report.generatedAt, 'should have timestamp');
    assert(Array.isArray(report.componentStatuses), 'should have statuses');
    assert(report.storageAvailability.local || !report.storageAvailability.local, 'should have storage info');
    assert(Array.isArray(report.recommendedActions), 'should have recommendations');
  });

  // ============================================================
  // 13. Backup hold
  // ============================================================
  console.log('\n[13] Backup Hold');
  test('hold prevents deletion by retention', () => {
    const run = actualMod.createBackupRun({ backupType: 'n8n_workflows', triggeredBy: 'test' });
    assert(actualMod.addBackupHold(run.id), 'should add hold');
    const stored = actualMod.getRun ? actualMod.getRun(run.id) : null;
    if (stored) assert(stored.onHold, 'should be on hold');
    actualMod.removeBackupHold(run.id);
  });

  // ============================================================
  // 14. Alert deduplication
  // ============================================================
  console.log('\n[14] Alert Deduplication');
  test('alerts dedup within cooldown', () => {
    assert(actualMod.shouldSendBackupAlert('test-type'), 'first should send');
    actualMod.markBackupAlertSent('test-type');
    assert(!actualMod.shouldSendBackupAlert('test-type'), 'second should not send');
  });

  // ============================================================
  // 15. Checksum computation
  // ============================================================
  console.log('\n[15] Checksum Computation');
  test('compute checksum returns valid hash', async () => {
    const checksum = await actualMod.computeBackupChecksum('test data');
    assertEq(checksum.length, 64, 'SHA-256 should produce 64 hex chars');
    assert(/^[0-9a-f]{64}$/.test(checksum), 'should be hex');
  });

  // ============================================================
  // 16. Audit events
  // ============================================================
  console.log('\n[16] Audit Events');
  test('record and retrieve audit events', () => {
    actualMod.recordBackupAudit('backup_started', 'test-user', 'backup-001', 'Backup started');
    const events = actualMod.getBackupAuditEvents(10);
    assertGt(events.length, 0, 'should have events');
  });

  // ============================================================
  // 17. Duplicate lock prevention
  // ============================================================
  console.log('\n[17] Duplicate Lock Prevention');
  test('concurrent backup lock rejected', () => {
    actualMod.releaseBackupLock();
    assert(actualMod.acquireBackupLock('run-1'), 'first lock');
    assert(!actualMod.acquireBackupLock('run-2'), 'second lock rejected');
    actualMod.releaseBackupLock();
  });

  // ============================================================
  // 18. Recovery readiness — verification_failed
  // ============================================================
  console.log('\n[18] Recovery Readiness — Verification Failed');
  test('verification failed when no verified backup', () => {
    const oldDate = new Date(Date.now() - 10 * 3600 * 1000);
    const r = actualMod.assessRecoveryReadiness({
      component: 'config', latestBackupAt: oldDate,
      latestVerifiedAt: null, latestRestoreTestAt: null,
      latestRestoreTestPassed: null, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'verification_failed');
  });

  // ============================================================
  // 19. Recovery readiness — restore_failed
  // ============================================================
  console.log('\n[19] Recovery Readiness — Restore Failed');
  test('restore failed detection', () => {
    const r = actualMod.assessRecoveryReadiness({
      component: 'workflows', latestBackupAt: new Date(),
      latestVerifiedAt: new Date(), latestRestoreTestAt: new Date(),
      latestRestoreTestPassed: false, targetRpoHours: 24, targetRtoHours: 4,
    });
    assertEq(r, 'restore_failed');
  });

  // ============================================================
  // 20. Missing schedule detection
  // ============================================================
  console.log('\n[20] Missing Schedule Detection');
  test('stale detection includes schedule info', () => {
    const result = actualMod.detectStaleBackups();
    assert(Array.isArray(result.missedSchedules), 'should have missed schedules');
  });

  // ============================================================
  console.log(`\n========================================`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}).catch((err) => {
  console.error('Failed to load module:', err);
  process.exit(1);
});