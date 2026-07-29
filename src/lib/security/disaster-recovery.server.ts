// ============================================================
// DFP UAT Agent — Disaster Recovery & Backup Management
// ============================================================
// Handles backup scheduling, verification, restore testing,
// RPO/RTO tracking, manifest generation, retention, and
// recovery readiness assessment.
//
// NEVER expose secrets, tokens, paths containing keys,
// or private file contents.
// ============================================================

import { createRequestId } from './request-signing.server';

// ============================================================
// Types
// ============================================================

export type BackupCategory =
  | 'supabase_database' | 'supabase_storage'
  | 'n8n_database' | 'n8n_workflows' | 'n8n_encryption_key'
  | 'application_config' | 'docker_config'
  | 'supabase_migrations' | 'uat_reports'
  | 'playwright_config' | 'full_system_manifest';

export type BackupStatus =
  | 'scheduled' | 'running' | 'completed'
  | 'verification_pending' | 'verified' | 'verification_failed'
  | 'restore_test_pending' | 'restore_test_passed' | 'restore_test_failed'
  | 'expired' | 'deletion_pending' | 'deleted' | 'failed';

export type RecoveryReadiness =
  | 'ready' | 'ready_with_warnings' | 'not_ready'
  | 'backup_missing' | 'backup_stale'
  | 'verification_failed' | 'restore_untested' | 'restore_failed';

export type BackupRestoreTestStatus =
  | 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';

export type BackendRecoveryErrorCode =
  | 'BACKUP_SOURCE_UNAVAILABLE' | 'BACKUP_DESTINATION_UNAVAILABLE'
  | 'BACKUP_LOCK_UNAVAILABLE' | 'BACKUP_FILE_EMPTY'
  | 'BACKUP_CHECKSUM_FAILED' | 'BACKUP_ARCHIVE_INVALID'
  | 'BACKUP_ENCRYPTION_FAILED' | 'BACKUP_REMOTE_COPY_FAILED'
  | 'BACKUP_MANIFEST_INVALID' | 'BACKUP_STALE'
  | 'RESTORE_ENVIRONMENT_FAILED' | 'RESTORE_DATABASE_FAILED'
  | 'RESTORE_STORAGE_FAILED' | 'RESTORE_N8N_FAILED'
  | 'RESTORE_HEALTH_CHECK_FAILED' | 'RESTORE_SMOKE_TEST_FAILED'
  | 'RESTORE_CLEANUP_FAILED' | 'RPO_TARGET_MISSED' | 'RTO_TARGET_MISSED';

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_BACKUP_CONFIG = {
  backupRoot: '/var/backups/dfp-uat',
  remotePath: '/mnt/atlas-vault/dfp-uat',
  encryptionEnabled: true,
  databaseBackupIntervalHours: 24,
  storageBackupIntervalHours: 24,
  configBackupIntervalHours: 24,
  fullBackupIntervalDays: 7,
  dailyRetention: 7,
  weeklyRetention: 4,
  monthlyRetention: 3,
  verifyEnabled: true,
  verifyChecksum: true,
  verifyArchive: true,
  restoreTestIntervalDays: 30,
  warningAfterHours: 30,
  criticalAfterHours: 48,
  targetRpoHours: 24,
  targetRtoHours: 4,
};

// ============================================================
// Backup In-Memory Store (mirrors DB tables)
// ============================================================

interface BackupRunRecord {
  id: string;
  backupType: BackupCategory;
  status: BackupStatus;
  startedAt: Date;
  completedAt: Date | null;
  sourceService: string;
  sourceHostLabel: string;
  storageLocationLabel: string;
  fileCount: number;
  totalSizeBytes: number;
  checksumManifestPath: string | null;
  encrypted: boolean;
  verificationStatus: BackupStatus;
  verificationStartedAt: Date | null;
  verificationCompletedAt: Date | null;
  restoreTestStatus: BackupRestoreTestStatus;
  restoreTestedAt: Date | null;
  restoreTestEnvironment: string | null;
  errorCode: string | null;
  safeErrorSummary: string | null;
  triggeredBy: string;
  createdAt: Date;
  updatedAt: Date;
  localCopy: boolean;
  remoteCopy: boolean;
  onHold: boolean;
}

interface RestoreTestRecord {
  id: string;
  backupRunId: string;
  status: BackupRestoreTestStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  testEnvironment: string;
  databaseRestoreStatus: BackupRestoreTestStatus;
  storageRestoreStatus: BackupRestoreTestStatus;
  n8nRestoreStatus: BackupRestoreTestStatus;
  applicationStartStatus: BackupRestoreTestStatus;
  healthCheckStatus: BackupRestoreTestStatus;
  smokeTestStatus: BackupRestoreTestStatus;
  recoveryTimeSeconds: number;
  recoveryPointAgeSeconds: number;
  testedBy: string | null;
  approvedBy: string | null;
  safeSummary: string | null;
  errorCode: string | null;
  createdAt: Date;
}

interface DRStatusRecord {
  id: string;
  component: string;
  readinessStatus: RecoveryReadiness;
  latestBackupAt: Date | null;
  latestVerifiedBackupAt: Date | null;
  latestRestoreTestAt: Date | null;
  backupAgeSeconds: number;
  targetRpoSeconds: number;
  targetRtoSeconds: number;
  currentRpoStatus: 'met' | 'missed' | 'unknown';
  currentRtoStatus: 'met' | 'missed' | 'unknown';
  blockingIssue: string | null;
  updatedAt: Date;
}

class BackupStore {
  private runs: Map<string, BackupRunRecord> = new Map();
  private restoreTests: Map<string, RestoreTestRecord> = new Map();
  private drStatuses: Map<string, DRStatusRecord> = new Map();
  private lock: string | null = null;

  // --- Runs ---
  addRun(run: BackupRunRecord): void { this.runs.set(run.id, run); }
  getRun(id: string): BackupRunRecord | undefined { return this.runs.get(id); }
  getAllRuns(): BackupRunRecord[] {
    return Array.from(this.runs.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  getRunsByType(type: BackupCategory): BackupRunRecord[] {
    return this.getAllRuns().filter((r) => r.backupType === type);
  }

  // --- Restore Tests ---
  addRestoreTest(test: RestoreTestRecord): void { this.restoreTests.set(test.id, test); }
  getRestoreTest(id: string): RestoreTestRecord | undefined { return this.restoreTests.get(id); }
  getAllRestoreTests(): RestoreTestRecord[] {
    return Array.from(this.restoreTests.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // --- DR Status ---
  setDRStatus(status: DRStatusRecord): void { this.drStatuses.set(status.component, status); }
  getDRStatus(component: string): DRStatusRecord | undefined { return this.drStatuses.get(component); }
  getAllDRStatuses(): DRStatusRecord[] { return Array.from(this.drStatuses.values()); }

  // --- Lock ---
  acquireLock(lockId: string): boolean {
    if (this.lock) return false;
    this.lock = lockId;
    return true;
  }
  releaseLock(): void { this.lock = null; }
  isLocked(): boolean { return this.lock !== null; }

  // --- Clear ---
  clear(): void {
    this.runs.clear();
    this.restoreTests.clear();
    this.drStatuses.clear();
    this.lock = null;
  }
}

let backupStore: BackupStore | null = null;
const getStore = (): BackupStore => { if (!backupStore) backupStore = new BackupStore(); return backupStore; };

// ============================================================
// Backup Lock (prevent overlapping backup runs)
// ============================================================

export function acquireBackupLock(lockId: string): boolean {
  return getStore().acquireLock(lockId);
}

export function releaseBackupLock(): void {
  getStore().releaseLock();
}

export function isBackupLocked(): boolean {
  return getStore().isLocked();
}

// ============================================================
// Manifest Generation
// ============================================================

export interface ManifestParams {
  backupId: string;
  backupType: BackupCategory;
  appVersion?: string;
  gitCommitSha?: string;
  supabaseMigrationVersion?: string;
  n8nVersion?: string;
  postgresVersions?: string[];
  dockerImageVersions?: string[];
  encrypted?: boolean;
  sourceHostLabel?: string;
}

export interface ManifestFileEntry {
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface BackupManifest {
  backupId: string;
  backupType: BackupCategory;
  createdAt: string;
  appVersion: string;
  gitCommitSha: string;
  supabaseMigrationVersion: string;
  n8nVersion: string;
  postgresVersions: string[];
  dockerImageVersions: string[];
  fileList: ManifestFileEntry[];
  encrypted: boolean;
  sourceHostLabel: string;
}

export function generateManifest(params: ManifestParams, files: ManifestFileEntry[]): BackupManifest {
  const cfg = DEFAULT_BACKUP_CONFIG;
  return {
    backupId: params.backupId,
    backupType: params.backupType,
    createdAt: new Date().toISOString(),
    appVersion: params.appVersion || 'unknown',
    gitCommitSha: params.gitCommitSha || 'unknown',
    supabaseMigrationVersion: params.supabaseMigrationVersion || 'unknown',
    n8nVersion: params.n8nVersion || 'unknown',
    postgresVersions: params.postgresVersions || [],
    dockerImageVersions: params.dockerImageVersions || [],
    fileList: files,
    encrypted: params.encrypted !== undefined ? params.encrypted : cfg.encryptionEnabled,
    sourceHostLabel: params.sourceHostLabel || 'uat-vm',
  };
}

// ============================================================
// Checksum (simulated for server module — real impl uses crypto)
// ============================================================

export async function computeBackupChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Backup Runner (simulated state transitions)
// ============================================================

export interface CreateBackupParams {
  backupType: BackupCategory;
  triggeredBy: string;
  sourceHostLabel?: string;
  encrypted?: boolean;
}

export function createBackupRun(params: CreateBackupParams): BackupRunRecord {
  const cfg = DEFAULT_BACKUP_CONFIG;
  const runId = `backup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const record: BackupRunRecord = {
    id: runId,
    backupType: params.backupType,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    sourceService: params.backupType,
    sourceHostLabel: params.sourceHostLabel || 'uat-vm',
    storageLocationLabel: cfg.backupRoot,
    fileCount: 0,
    totalSizeBytes: 0,
    checksumManifestPath: null,
    encrypted: params.encrypted !== undefined ? params.encrypted : cfg.encryptionEnabled,
    verificationStatus: 'verification_pending',
    verificationStartedAt: null,
    verificationCompletedAt: null,
    restoreTestStatus: 'pending',
    restoreTestedAt: null,
    restoreTestEnvironment: null,
    errorCode: null,
    safeErrorSummary: null,
    triggeredBy: params.triggeredBy,
    createdAt: new Date(),
    updatedAt: new Date(),
    localCopy: true,
    remoteCopy: false,
    onHold: false,
  };
  getStore().addRun(record);
  return record;
}

export function completeBackupRun(
  runId: string,
  params: { fileCount: number; totalSizeBytes: number; manifestPath?: string }
): BackupRunRecord | undefined {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return undefined;
  run.status = 'completed';
  run.completedAt = new Date();
  run.fileCount = params.fileCount;
  run.totalSizeBytes = params.totalSizeBytes;
  run.checksumManifestPath = params.manifestPath || null;
  run.verificationStatus = 'verification_pending';
  run.updatedAt = new Date();
  store.addRun(run);
  return run;
}

export function failBackupRun(runId: string, errorCode: BackendRecoveryErrorCode, summary: string): BackupRunRecord | undefined {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return undefined;
  run.status = 'failed';
  run.completedAt = new Date();
  run.errorCode = errorCode;
  run.safeErrorSummary = summary;
  run.updatedAt = new Date();
  store.addRun(run);
  return run;
}

// ============================================================
// Backup Verification
// ============================================================

export interface VerificationParams {
  runId: string;
  fileExists: boolean;
  fileSizeBytes: number;
  archiveValid: boolean;
  checksumMatches: boolean;
  manifestMatches: boolean;
  decryptable: boolean;
  componentsPresent: string[];
  componentsMissing: string[];
}

export interface BackupVerificationResult {
  backupId: string;
  verified: boolean;
  checksumsMatch: boolean;
  archiveValid: boolean;
  manifestMatches: boolean;
  componentsPresent: string[];
  componentsMissing: string[];
  errors: string[];
  verifiedAt: string;
}

export function verifyBackupRun(runId: string, params: VerificationParams): BackupVerificationResult | null {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return null;

  const cfg = DEFAULT_BACKUP_CONFIG;
  run.verificationStartedAt = new Date();
  const errors: string[] = [];

  if (!params.fileExists) errors.push('Backup file does not exist');
  if (params.fileSizeBytes <= 0) errors.push(`Backup file is empty or zero bytes (${params.fileSizeBytes} bytes)`);
  if (!params.archiveValid) errors.push('Archive is invalid or cannot be opened');
  if (!params.checksumMatches) errors.push('SHA-256 checksum does not match');
  if (!params.manifestMatches) errors.push('Manifest does not match file list');
  if (!params.decryptable && run.encrypted) errors.push('Encrypted backup cannot be decrypted');

  const verified = errors.length === 0;

  if (params.componentsMissing.length > 0) {
    errors.push(`Missing components: ${params.componentsMissing.join(', ')}`);
  }

  run.verificationStatus = verified ? 'verified' : 'verification_failed';
  run.verificationCompletedAt = new Date();
  run.updatedAt = new Date();
  store.addRun(run);

  return {
    backupId: runId,
    verified,
    checksumsMatch: params.checksumMatches,
    archiveValid: params.archiveValid,
    manifestMatches: params.manifestMatches,
    componentsPresent: params.componentsPresent,
    componentsMissing: params.componentsMissing,
    errors,
    verifiedAt: new Date().toISOString(),
  };
}

// ============================================================
// Remote Copy
// ============================================================

export function markRemoteCopy(runId: string, success: boolean, errorCode?: BackendRecoveryErrorCode): BackupRunRecord | undefined {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return undefined;
  run.remoteCopy = success;
  if (!success && errorCode) {
    run.errorCode = errorCode;
    run.safeErrorSummary = 'Remote copy to Atlas Vault failed';
  }
  run.updatedAt = new Date();
  store.addRun(run);
  return run;
}

// ============================================================
// Restore Testing
// ============================================================

export interface RestoreTestParams {
  backupRunId: string;
  testEnvironment: string;
  testedBy?: string;
}

export function createRestoreTest(params: RestoreTestParams): RestoreTestRecord | null {
  const store = getStore();
  const run = store.getRun(params.backupRunId);
  if (!run) return null;
  if (run.verificationStatus !== 'verified') return null;

  const testId = `restore-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const record: RestoreTestRecord = {
    id: testId,
    backupRunId: params.backupRunId,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    testEnvironment: params.testEnvironment,
    databaseRestoreStatus: 'pending',
    storageRestoreStatus: 'pending',
    n8nRestoreStatus: 'pending',
    applicationStartStatus: 'pending',
    healthCheckStatus: 'pending',
    smokeTestStatus: 'pending',
    recoveryTimeSeconds: 0,
    recoveryPointAgeSeconds: 0,
    testedBy: params.testedBy || null,
    approvedBy: null,
    safeSummary: null,
    errorCode: null,
    createdAt: new Date(),
  };
  store.addRestoreTest(record);

  run.restoreTestStatus = 'pending';
  store.addRun(run);

  return record;
}

export function completeRestoreTest(
  testId: string,
  params: {
    passed: boolean;
    recoveryTimeSeconds: number;
    recoveryPointAgeSeconds: number;
    databaseRestoreStatus: BackupRestoreTestStatus;
    storageRestoreStatus: BackupRestoreTestStatus;
    n8nRestoreStatus: BackupRestoreTestStatus;
    applicationStartStatus: BackupRestoreTestStatus;
    healthCheckStatus: BackupRestoreTestStatus;
    smokeTestStatus: BackupRestoreTestStatus;
    summary?: string;
    errorCode?: BackendRecoveryErrorCode;
  }
): RestoreTestRecord | null {
  const store = getStore();
  const test = store.getRestoreTest(testId);
  if (!test) return null;

  test.status = params.passed ? 'passed' : 'failed';
  test.completedAt = new Date();
  test.recoveryTimeSeconds = params.recoveryTimeSeconds;
  test.recoveryPointAgeSeconds = params.recoveryPointAgeSeconds;
  test.databaseRestoreStatus = params.databaseRestoreStatus;
  test.storageRestoreStatus = params.storageRestoreStatus;
  test.n8nRestoreStatus = params.n8nRestoreStatus;
  test.applicationStartStatus = params.applicationStartStatus;
  test.healthCheckStatus = params.healthCheckStatus;
  test.smokeTestStatus = params.smokeTestStatus;
  test.safeSummary = params.summary || null;
  test.errorCode = params.errorCode || null;
  store.addRestoreTest(test);

  // Update parent backup run
  const run = store.getRun(test.backupRunId);
  if (run) {
    run.restoreTestStatus = params.passed ? 'passed' : 'failed';
    run.restoreTestedAt = new Date();
    run.restoreTestEnvironment = test.testEnvironment;
    store.addRun(run);
  }

  return test;
}

// ============================================================
// Retention Management
// ============================================================

export interface RetentionResult {
  toKeep: string[];
  toDelete: string[];
  preservedNewest: string;
  skipped: Array<{ id: string; reason: string }>;
}

export function applyRetentionPolicy(params: {
  runs: BackupRunRecord[];
  dailyRetention: number;
  weeklyRetention: number;
  monthlyRetention: number;
}): RetentionResult {
  const { runs, dailyRetention, weeklyRetention, monthlyRetention } = params;
  const cfg = DEFAULT_BACKUP_CONFIG;

  // Only consider completed/verified runs, not on hold
  const eligible = runs
    .filter((r) => r.status === 'completed' || r.verificationStatus === 'verified')
    .filter((r) => !r.onHold)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (eligible.length === 0) {
    return { toKeep: [], toDelete: [], preservedNewest: '', skipped: [] };
  }

  const toKeep: Set<string> = new Set();
  const skipped: Array<{ id: string; reason: string }> = [];

  // Always preserve newest verified
  const newest = eligible[0];
  toKeep.add(newest.id);

  // Daily retention (most recent N daily backups)
  let dailyCount = 0;
  const seenDays: Set<string> = new Set();
  for (const r of eligible) {
    if (dailyCount >= dailyRetention) break;
    const day = r.createdAt.toISOString().split('T')[0];
    if (!seenDays.has(day)) {
      seenDays.add(day);
      toKeep.add(r.id);
      dailyCount++;
    }
  }

  // Weekly retention
  let weeklyCount = 0;
  const seenWeeks: Set<string> = new Set();
  for (const r of eligible) {
    if (weeklyCount >= weeklyRetention) break;
    const d = r.createdAt;
    const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).toISOString().split('T')[0];
    if (!seenWeeks.has(weekStart)) {
      seenWeeks.add(weekStart);
      toKeep.add(r.id);
      weeklyCount++;
    }
  }

  // Monthly retention
  let monthlyCount = 0;
  const seenMonths: Set<string> = new Set();
  for (const r of eligible) {
    if (monthlyCount >= monthlyRetention) break;
    const monthKey = `${r.createdAt.getFullYear()}-${r.createdAt.getMonth()}`;
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      toKeep.add(r.id);
      monthlyCount++;
    }
  }

  // Skip: on hold
  const onHold = runs.filter((r) => r.onHold).map((r) => r.id);
  onHold.forEach((id) => { skipped.push({ id, reason: 'Backup is on investigation or legal hold' }); });

  // Skip: active restore test
  const activeTests = Array.from(getStore().getAllRestoreTests().values())
    .filter((t) => t.status === 'running')
    .map((t) => t.backupRunId);
  activeTests.forEach((id) => {
    if (!toKeep.has(id)) {
      toKeep.add(id);
      skipped.push({ id, reason: 'Backup is currently used by an active restore test' });
    }
  });

  const toDelete = eligible.filter((r) => !toKeep.has(r.id)).map((r) => r.id);

  return {
    toKeep: Array.from(toKeep),
    toDelete,
    preservedNewest: newest.id,
    skipped,
  };
}

// ============================================================
// RPO / RTO Calculation
// ============================================================

export interface RpoRtoResult {
  rpoMet: boolean;
  rtoMet: boolean;
  rpoSeconds: number;
  rtoSeconds: number;
  targetRpoSeconds: number;
  targetRtoSeconds: number;
  latestBackupAge: number;
  latestVerifiedAge: number;
  latestRestoreTime: number;
}

export function calculateRpoRto(params: {
  latestBackupAt: Date | null;
  latestVerifiedAt: Date | null;
  latestRestoreTime: number | null;
  targetRpoHours: number;
  targetRtoHours: number;
}): RpoRtoResult {
  const cfg = DEFAULT_BACKUP_CONFIG;
  const targetRpo = params.targetRpoHours || cfg.targetRpoHours;
  const targetRto = params.targetRtoHours || cfg.targetRtoHours;
  const now = new Date();

  const latestBackupAge = params.latestBackupAt
    ? Math.floor((now.getTime() - params.latestBackupAt.getTime()) / 1000)
    : Number.MAX_SAFE_INTEGER;

  const latestVerifiedAge = params.latestVerifiedAt
    ? Math.floor((now.getTime() - params.latestVerifiedAt.getTime()) / 1000)
    : Number.MAX_SAFE_INTEGER;

  const latestRestoreTime = params.latestRestoreTime || 0;

  const rpoMet = latestVerifiedAge <= targetRpo * 3600;
  const rtoMet = latestRestoreTime > 0 && latestRestoreTime <= targetRto * 3600;

  return {
    rpoMet,
    rtoMet,
    rpoSeconds: latestVerifiedAge,
    rtoSeconds: latestRestoreTime,
    targetRpoSeconds: targetRpo * 3600,
    targetRtoSeconds: targetRto * 3600,
    latestBackupAge,
    latestVerifiedAge,
    latestRestoreTime,
  };
}

// ============================================================
// Recovery Readiness Assessment
// ============================================================

export interface ReadinessAssessmentParams {
  component: string;
  latestBackupAt: Date | null;
  latestVerifiedAt: Date | null;
  latestRestoreTestAt: Date | null;
  latestRestoreTestPassed: boolean | null;
  targetRpoHours: number;
  targetRtoHours: number;
}

export function assessRecoveryReadiness(params: ReadinessAssessmentParams): RecoveryReadiness {
  const cfg = DEFAULT_BACKUP_CONFIG;
  const now = new Date();

  // No backup at all
  if (!params.latestBackupAt) return 'backup_missing';

  // Backup too old (stale)
  const backupAgeHours = (now.getTime() - params.latestBackupAt.getTime()) / (1000 * 3600);
  if (backupAgeHours > cfg.criticalAfterHours) return 'backup_stale';

  // No verified backup
  if (!params.latestVerifiedAt) return 'verification_failed';

  // Verification failed on latest
  const verifiedAgeHours = (now.getTime() - params.latestVerifiedAt.getTime()) / (1000 * 3600);
  if (verifiedAgeHours > cfg.warningAfterHours && verifiedAgeHours <= cfg.criticalAfterHours) {
    return 'ready_with_warnings';
  }

  // No restore test
  if (!params.latestRestoreTestAt) return 'restore_untested';

  // Restore test failed
  if (params.latestRestoreTestPassed === false) return 'restore_failed';

  // Restore test is old
  const restoreAgeDays = (now.getTime() - params.latestRestoreTestAt.getTime()) / (1000 * 3600 * 24);
  if (restoreAgeDays > cfg.restoreTestIntervalDays) return 'ready_with_warnings';

  // RPO check
  if (verifiedAgeHours > params.targetRpoHours) return 'ready_with_warnings';

  return 'ready';
}

// ============================================================
// DR Status Management
// ============================================================

export function updateDRStatus(params: {
  component: string;
  readinessStatus: RecoveryReadiness;
  latestBackupAt: Date | null;
  latestVerifiedAt: Date | null;
  latestRestoreTestAt: Date | null;
  backupAgeSeconds: number;
  targetRpoHours: number;
  targetRtoHours: number;
  blockingIssue?: string;
}): DRStatusRecord {
  const cfg = DEFAULT_BACKUP_CONFIG;
  const now = new Date();
  const targetRpoSeconds = params.targetRpoHours * 3600;
  const targetRtoSeconds = params.targetRtoHours * 3600;

  const record: DRStatusRecord = {
    id: `dr-${params.component}-${Date.now().toString(36)}`,
    component: params.component,
    readinessStatus: params.readinessStatus,
    latestBackupAt: params.latestBackupAt,
    latestVerifiedBackupAt: params.latestVerifiedAt,
    latestRestoreTestAt: params.latestRestoreTestAt,
    backupAgeSeconds: params.backupAgeSeconds,
    targetRpoSeconds,
    targetRtoSeconds,
    currentRpoStatus: params.backupAgeSeconds <= targetRpoSeconds ? 'met' : 'missed',
    currentRtoStatus: 'unknown',
    blockingIssue: params.blockingIssue || null,
    updatedAt: now,
  };
  getStore().setDRStatus(record);
  return record;
}

// ============================================================
// Recovery Readiness Report
// ============================================================

export interface RecoveryReadinessReport {
  generatedAt: string;
  overallReadiness: RecoveryReadiness;
  componentStatuses: DRStatusRecord[];
  latestBackupByComponent: Record<string, string | null>;
  latestVerifiedByComponent: Record<string, string | null>;
  latestRestoreTestByComponent: Record<string, string | null>;
  rpoResult: 'met' | 'missed' | 'unknown';
  rtoResult: 'met' | 'missed' | 'unknown';
  missingComponents: string[];
  failedVerifications: string[];
  storageAvailability: { local: boolean; remote: boolean };
  recommendedActions: string[];
  approvedBy: string | null;
}

export function generateRecoveryReport(components: string[]): RecoveryReadinessReport {
  const store = getStore();
  const allStatuses = store.getAllDRStatuses();
  const allRuns = store.getAllRuns();

  const componentStatuses: DRStatusRecord[] = [];
  const latestBackupByComponent: Record<string, string | null> = {};
  const latestVerifiedByComponent: Record<string, string | null> = {};
  const latestRestoreTestByComponent: Record<string, string | null> = {};
  const missingComponents: string[] = [];
  const failedVerifications: string[] = [];
  const recommendedActions: string[] = [];

  let worstReadiness: RecoveryReadiness = 'ready';

  for (const comp of components) {
    const status = allStatuses.find((s) => s.component === comp);
    if (!status) {
      missingComponents.push(comp);
      worstReadiness = 'not_ready';
      latestBackupByComponent[comp] = null;
      latestVerifiedByComponent[comp] = null;
      latestRestoreTestByComponent[comp] = null;
      continue;
    }

    componentStatuses.push(status);
    latestBackupByComponent[comp] = status.latestBackupAt?.toISOString() || null;
    latestVerifiedByComponent[comp] = status.latestVerifiedBackupAt?.toISOString() || null;
    latestRestoreTestByComponent[comp] = status.latestRestoreTestAt?.toISOString() || null;

    if (status.readinessStatus !== 'ready' && status.readinessStatus !== 'ready_with_warnings') {
      if (status.readinessStatus === 'backup_missing') worstReadiness = 'not_ready';
      else if (status.readinessStatus === 'backup_stale') worstReadiness = 'backup_stale';
      else if (status.readinessStatus === 'verification_failed') {
        worstReadiness = 'verification_failed';
        failedVerifications.push(comp);
      } else if (status.readinessStatus === 'restore_failed') worstReadiness = 'restore_failed';
      else if (status.readinessStatus === 'restore_untested' && worstReadiness === 'ready') worstReadiness = 'restore_untested';
    }

    if (status.currentRpoStatus === 'missed') {
      recommendedActions.push(`RPO missed for ${comp}: run a new backup`);
    }

    if (status.blockingIssue) {
      recommendedActions.push(`${comp}: ${status.blockingIssue}`);
    }
  }

  // Check local vs remote storage
  const hasLocal = allRuns.some((r) => r.localCopy);
  const hasRemote = allRuns.some((r) => r.remoteCopy);
  if (!hasRemote) {
    recommendedActions.push('No remote backup copies exist — configure Atlas Vault sync');
    if (worstReadiness === 'ready') worstReadiness = 'ready_with_warnings';
  }

  // RPO/RTO from first component with data
  let rpoResult: 'met' | 'missed' | 'unknown' = 'unknown';
  let rtoResult: 'met' | 'missed' | 'unknown' = 'unknown';
  if (componentStatuses.length > 0) {
    rpoResult = componentStatuses[0].currentRpoStatus;
    rtoResult = componentStatuses[0].currentRtoStatus;
  }

  return {
    generatedAt: new Date().toISOString(),
    overallReadiness: worstReadiness,
    componentStatuses,
    latestBackupByComponent,
    latestVerifiedByComponent,
    latestRestoreTestByComponent,
    rpoResult,
    rtoResult,
    missingComponents,
    failedVerifications,
    storageAvailability: { local: hasLocal, remote: hasRemote },
    recommendedActions,
    approvedBy: null,
  };
}

// ============================================================
// Backup Hold Management
// ============================================================

export function addBackupHold(runId: string): boolean {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return false;
  run.onHold = true;
  run.updatedAt = new Date();
  store.addRun(run);
  return true;
}

export function removeBackupHold(runId: string): boolean {
  const store = getStore();
  const run = store.getRun(runId);
  if (!run) return false;
  run.onHold = false;
  run.updatedAt = new Date();
  store.addRun(run);
  return true;
}

// ============================================================
// Stale Backup Detection
// ============================================================

export interface StaleBackupDetectionResult {
  staleBackups: string[];
  missedSchedules: BackupCategory[];
  warnings: string[];
}

export function detectStaleBackups(): StaleBackupDetectionResult {
  const cfg = DEFAULT_BACKUP_CONFIG;
  const store = getStore();
  const allRuns = store.getAllRuns();
  const now = new Date();
  const staleBackups: string[] = [];
  const warnings: string[] = [];

  // Check each category
  const categories: BackupCategory[] = [
    'supabase_database', 'supabase_storage', 'n8n_database',
    'n8n_encryption_key', 'application_config',
  ];

  const missedSchedules: BackupCategory[] = [];

  for (const cat of categories) {
    const latest = allRuns.find((r) => r.backupType === cat && (r.status === 'completed' || r.status === 'verified'));
    if (!latest) {
      missedSchedules.push(cat);
      warnings.push(`${cat}: no completed backup found`);
      continue;
    }

    const ageHours = (now.getTime() - latest.createdAt.getTime()) / (1000 * 3600);
    const maxAge = cat === 'n8n_encryption_key' || cat === 'application_config'
      ? cfg.configBackupIntervalHours
      : cfg.databaseBackupIntervalHours;

    if (ageHours > maxAge * 2) {
      staleBackups.push(latest.id);
      if (ageHours > cfg.criticalAfterHours) {
        warnings.push(`${cat}: CRITICAL — last backup ${ageHours.toFixed(1)}h ago (limit: ${cfg.criticalAfterHours}h)`);
      } else if (ageHours > cfg.warningAfterHours) {
        warnings.push(`${cat}: WARNING — last backup ${ageHours.toFixed(1)}h ago (limit: ${cfg.warningAfterHours}h)`);
      }
    }
  }

  return { staleBackups, missedSchedules, warnings };
}

// ============================================================
// Alert Deduplication
// ============================================================

interface AlertEntry { type: string; sentAt: Date; }

class BackupAlertDedup {
  private alerts: Map<string, AlertEntry> = new Map();
  private cooldownMs: number;

  constructor(cooldownMinutes: number = 30) { this.cooldownMs = cooldownMinutes * 60 * 1000; }

  shouldSend(type: string): boolean {
    const existing = this.alerts.get(type);
    if (!existing) return true;
    return (Date.now() - existing.sentAt.getTime()) > this.cooldownMs;
  }
  markSent(type: string): void { this.alerts.set(type, { type, sentAt: new Date() }); }
  clear(): void { this.alerts.clear(); }
}

let backupAlerts: BackupAlertDedup | null = null;
const getBackupAlerts = () => { if (!backupAlerts) backupAlerts = new BackupAlertDedup(); return backupAlerts; };

export function shouldSendBackupAlert(type: string): boolean { return getBackupAlerts().shouldSend(type); }
export function markBackupAlertSent(type: string): void { getBackupAlerts().markSent(type); }

// ============================================================
// Audit Events
// ============================================================

interface AuditRecord { id: string; timestamp: Date; eventType: string; actor: string; targetId: string; summary: string; }

class AuditLog {
  private events: AuditRecord[] = [];
  record(event: AuditRecord): void { this.events.push(event); }
  getRecent(limit: number = 50): AuditRecord[] { return this.events.slice(-limit).reverse(); }
}

let auditLog: AuditLog | null = null;
const getAuditLog = () => { if (!auditLog) auditLog = new AuditLog(); return auditLog; };

export function recordBackupAudit(eventType: string, actor: string, targetId: string, summary: string): void {
  getAuditLog().record({ id: createRequestId(), timestamp: new Date(), eventType, actor, targetId, summary });
}

export function getBackupAuditEvents(limit?: number): AuditRecord[] { return getAuditLog().getRecent(limit || 50); }

// ============================================================
// Cleanup
// ============================================================

export function clearBackupStores(): void {
  backupStore = null;
  backupAlerts = null;
  auditLog = null;
}