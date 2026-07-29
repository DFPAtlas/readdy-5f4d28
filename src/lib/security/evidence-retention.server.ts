// ============================================================
// DFP UAT Agent — Evidence Retention & Storage Management
// ============================================================
// Handles retention calculation, storage monitoring, upload
// validation, storage path generation, cleanup scanning,
// orphan detection, and emergency storage mode.
//
// NEVER expose secrets, tokens, storage URLs, or private paths.
// ============================================================

import { createRequestId } from './request-signing.server';

// ============================================================
// Types
// ============================================================

export type EvidenceCategory =
  | 'screenshot' | 'visual_diff' | 'video' | 'trace'
  | 'console_log' | 'network_log' | 'accessibility_report'
  | 'uat_report' | 'temporary_file' | 'other';

export type EvidenceState =
  | 'pending_upload' | 'uploading' | 'available' | 'upload_failed'
  | 'processing' | 'retention_locked' | 'scheduled_for_deletion'
  | 'deleting' | 'deleted' | 'deletion_failed' | 'quarantined';

export type RetentionReason =
  | 'default_success_retention' | 'default_failure_retention'
  | 'open_bug' | 'approved_release' | 'staff_pinned'
  | 'legal_hold' | 'investigation_hold' | 'manual_extension'
  | 'temporary_file' | 'cleanup_candidate';

export type StorageHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export type CleanupRunStatus =
  | 'pending' | 'scanning' | 'awaiting_approval'
  | 'approved' | 'rejected' | 'running'
  | 'completed' | 'failed';

export type CleanupDecision =
  | 'delete' | 'skip_preserved' | 'skip_pinned'
  | 'skip_legal_hold' | 'skip_open_bug'
  | 'skip_approved_release' | 'skip_uncertain'
  | 'excluded_by_staff';

export type EvidenceErrorCode =
  | 'EVIDENCE_FILE_TOO_LARGE' | 'EVIDENCE_TYPE_NOT_ALLOWED'
  | 'EVIDENCE_PATH_INVALID' | 'EVIDENCE_UPLOAD_FAILED'
  | 'EVIDENCE_CHECKSUM_MISMATCH' | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_RETENTION_LOCKED' | 'EVIDENCE_LEGAL_HOLD'
  | 'EVIDENCE_DELETE_FAILED' | 'CLEANUP_APPROVAL_REQUIRED'
  | 'CLEANUP_LOCK_UNAVAILABLE' | 'CLEANUP_ALREADY_COMPLETED'
  | 'STORAGE_WARNING' | 'STORAGE_CRITICAL'
  | 'STORAGE_BUCKET_MISSING' | 'STORAGE_PERMISSION_DENIED'
  | 'ORPHAN_REVIEW_REQUIRED';

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_RETENTION_CONFIG = {
  successEvidenceRetentionDays: 14,
  failedEvidenceRetentionDays: 90,
  traceRetentionDays: 30,
  videoRetentionDays: 30,
  reportRetentionDays: 365,
  tempFileRetentionHours: 24,
};

export const DEFAULT_STORAGE_CONFIG = {
  maxEvidenceStorageGb: 100,
  warningPercent: 75,
  criticalPercent: 90,
  maxScreenshotMb: 10,
  maxVideoMb: 250,
  maxTraceMb: 250,
  maxReportMb: 25,
};

export const DEFAULT_CLEANUP_CONFIG = {
  enabled: true,
  batchSize: 100,
  scanIntervalHours: 6,
  gracePeriodHours: 24,
  dryRunDefault: true,
  requireApprovalAboveGb: 10,
};

// ============================================================
// Allowed MIME Types
// ============================================================

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/webm',
  'video/mp4',
  'application/zip',
  'application/json',
  'text/plain',
  'text/html',
  'application/pdf',
]);

export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.dll', '.so', '.dylib', '.sh', '.bash',
  '.bat', '.cmd', '.ps1', '.vbs', '.js', '.mjs', '.cjs',
  '.py', '.rb', '.php', '.pl', '.jar', '.class',
]);

// ============================================================
// Max File Sizes by Category (bytes)
// ============================================================

export function getMaxSizeByCategory(category: EvidenceCategory): number {
  const cfg = DEFAULT_STORAGE_CONFIG;
  switch (category) {
    case 'screenshot': return cfg.maxScreenshotMb * 1024 * 1024;
    case 'visual_diff': return cfg.maxScreenshotMb * 1024 * 1024;
    case 'video': return cfg.maxVideoMb * 1024 * 1024;
    case 'trace': return cfg.maxTraceMb * 1024 * 1024;
    case 'uat_report': return cfg.maxReportMb * 1024 * 1024;
    case 'accessibility_report': return cfg.maxReportMb * 1024 * 1024;
    case 'console_log': return 25 * 1024 * 1024;
    case 'network_log': return 25 * 1024 * 1024;
    case 'temporary_file': return 100 * 1024 * 1024;
    default: return 50 * 1024 * 1024;
  }
}

// ============================================================
// Storage Path Generation
// ============================================================

const PATH_SAFE_RE = /^[a-zA-Z0-9_.\-\/]+$/;
const UNSAFE_SEGMENTS = ['..', '~', '\\'];

export function generateStoragePath(params: {
  projectId: string;
  runId: string;
  journeyResultId?: string;
  category: EvidenceCategory;
  originalFilename: string;
}): { path: string; error: EvidenceErrorCode | null } {
  const { projectId, runId, journeyResultId, category, originalFilename } = params;

  // Validate inputs
  if (!projectId || !runId) {
    return { path: '', error: 'EVIDENCE_PATH_INVALID' };
  }

  // Sanitize filename
  const ext = originalFilename.includes('.') ? originalFilename.slice(originalFilename.lastIndexOf('.')) : '';
  const safeExt = ext.toLowerCase();
  if (BLOCKED_EXTENSIONS.has(safeExt)) {
    return { path: '', error: 'EVIDENCE_TYPE_NOT_ALLOWED' };
  }

  // Generate UUID-based filename for security
  const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const safeFilename = `${uuid}${safeExt}`;

  // Build path segments
  const segments = [projectId, runId];
  if (journeyResultId) segments.push(journeyResultId);

  // Category subfolder
  const categoryFolder = getCategoryFolder(category);
  if (categoryFolder) segments.push(categoryFolder);

  segments.push(safeFilename);
  const path = segments.join('/');

  // Reject path traversal and unsafe patterns
  for (const unsafe of UNSAFE_SEGMENTS) {
    if (path.includes(unsafe)) return { path: '', error: 'EVIDENCE_PATH_INVALID' };
  }
  if (!PATH_SAFE_RE.test(path)) return { path: '', error: 'EVIDENCE_PATH_INVALID' };

  return { path, error: null };
}

function getCategoryFolder(category: EvidenceCategory): string {
  switch (category) {
    case 'screenshot': return 'screenshots';
    case 'visual_diff': return 'visual-diffs';
    case 'video': return 'videos';
    case 'trace': return 'traces';
    case 'console_log': return 'logs';
    case 'network_log': return 'logs';
    case 'accessibility_report': return 'reports';
    case 'uat_report': return 'reports';
    case 'temporary_file': return 'temp';
    default: return 'other';
  }
}

// ============================================================
// Upload Validation
// ============================================================

export interface UploadValidationParams {
  category: EvidenceCategory;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  runId: string;
  journeyResultId?: string;
}

export interface UploadValidationResult {
  allowed: boolean;
  errorCode: EvidenceErrorCode | null;
  message: string;
}

export function validateUpload(params: UploadValidationParams): UploadValidationResult {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
    return { allowed: false, errorCode: 'EVIDENCE_TYPE_NOT_ALLOWED', message: `MIME type "${params.mimeType}" is not allowed.` };
  }

  // Check file extension
  const ext = params.filename.includes('.') ? params.filename.slice(params.filename.lastIndexOf('.')).toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { allowed: false, errorCode: 'EVIDENCE_TYPE_NOT_ALLOWED', message: `File extension "${ext}" is not allowed.` };
  }

  // Check file size
  const maxSize = getMaxSizeByCategory(params.category);
  if (params.sizeBytes > maxSize) {
    const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
    return { allowed: false, errorCode: 'EVIDENCE_FILE_TOO_LARGE', message: `File exceeds maximum size of ${maxMb}MB for ${params.category}.` };
  }

  // Check size is positive
  if (params.sizeBytes <= 0) {
    return { allowed: false, errorCode: 'EVIDENCE_FILE_TOO_LARGE', message: 'File size must be greater than zero.' };
  }

  // Prevent path traversal in filename
  for (const unsafe of UNSAFE_SEGMENTS) {
    if (params.filename.includes(unsafe)) {
      return { allowed: false, errorCode: 'EVIDENCE_PATH_INVALID', message: 'Filename contains unsafe characters.' };
    }
  }

  return { allowed: true, errorCode: null, message: 'Upload validated.' };
}

// ============================================================
// SHA-256 Checksum (browser-compatible)
// ============================================================

export async function computeChecksum(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Retention Calculation
// ============================================================

export interface RetentionParams {
  category: EvidenceCategory;
  runStatus: string; // 'completed' | 'completed_with_warnings' | 'failed' | etc.
  bugSeverity?: string;
  bugStatus?: string;
  createdAt: Date;
  releaseApproved?: boolean;
  pinned?: boolean;
  legalHold?: boolean;
}

export function calculateRetention(params: RetentionParams): {
  retentionUntil: Date;
  reason: RetentionReason;
} {
  const cfg = DEFAULT_RETENTION_CONFIG;
  const { category, runStatus, bugSeverity, bugStatus, createdAt, releaseApproved, pinned, legalHold } = params;

  // Legal hold overrides everything
  if (legalHold) {
    return { retentionUntil: new Date(createdAt.getTime() + 365 * 10 * 24 * 60 * 60 * 1000), reason: 'legal_hold' };
  }

  // Pinned evidence — extended retention
  if (pinned) {
    return { retentionUntil: new Date(createdAt.getTime() + 365 * 2 * 24 * 60 * 60 * 1000), reason: 'staff_pinned' };
  }

  // Open bug — preserve
  if (bugSeverity === 'critical' || bugSeverity === 'high') {
    if (bugStatus === 'open' || bugStatus === 'in_progress' || bugStatus === 'investigating' || bugStatus === 'retest_required') {
      return { retentionUntil: new Date(createdAt.getTime() + 365 * 3 * 24 * 60 * 60 * 1000), reason: 'open_bug' };
    }
  }

  if (bugStatus === 'open' || bugStatus === 'in_progress') {
    return { retentionUntil: new Date(createdAt.getTime() + 365 * 2 * 24 * 60 * 60 * 1000), reason: 'open_bug' };
  }

  // Approved release — preserve
  if (releaseApproved) {
    return { retentionUntil: new Date(createdAt.getTime() + 365 * 2 * 24 * 60 * 60 * 1000), reason: 'approved_release' };
  }

  // Category-based retention
  let retentionDays: number;
  switch (category) {
    case 'trace': retentionDays = cfg.traceRetentionDays; break;
    case 'video': retentionDays = cfg.videoRetentionDays; break;
    case 'uat_report': retentionDays = cfg.reportRetentionDays; break;
    case 'accessibility_report': retentionDays = cfg.reportRetentionDays; break;
    case 'temporary_file': {
      const hours = cfg.tempFileRetentionHours;
      return { retentionUntil: new Date(createdAt.getTime() + hours * 60 * 60 * 1000), reason: 'temporary_file' };
    }
    default: {
      const isFailure = runStatus === 'failed' || runStatus === 'interrupted' || runStatus === 'cancelled';
      retentionDays = isFailure ? cfg.failedEvidenceRetentionDays : cfg.successEvidenceRetentionDays;
      break;
    }
  }

  const reason = runStatus === 'failed' || runStatus === 'interrupted'
    ? 'default_failure_retention'
    : 'default_success_retention';

  return {
    retentionUntil: new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000),
    reason,
  };
}

// ============================================================
// Preservation Rules
// ============================================================

export interface PreservationCheckParams {
  evidenceStatus: EvidenceState;
  retentionUntil: Date;
  pinned: boolean;
  legalHold: boolean;
  bugStatus?: string;
  bugSeverity?: string;
  releaseApproved?: boolean;
  deletionPending: boolean;
  uploadCertain: boolean;
}

export interface PreservationResult {
  preserved: boolean;
  reason: CleanupDecision;
  description: string;
}

export function checkPreservation(params: PreservationCheckParams): PreservationResult {
  const { evidenceStatus, retentionUntil, pinned, legalHold, bugStatus, bugSeverity, releaseApproved, deletionPending, uploadCertain } = params;

  // Legal hold — never delete
  if (legalHold) {
    return { preserved: true, reason: 'skip_legal_hold', description: 'Evidence is under legal hold.' };
  }

  // Pinned — never delete
  if (pinned) {
    return { preserved: true, reason: 'skip_pinned', description: 'Evidence is staff-pinned.' };
  }

  // Uncertain upload state — do not delete
  if (!uploadCertain) {
    return { preserved: true, reason: 'skip_uncertain', description: 'Evidence upload state is uncertain.' };
  }

  if (evidenceStatus === 'uploading' || evidenceStatus === 'pending_upload' || evidenceStatus === 'processing') {
    return { preserved: true, reason: 'skip_uncertain', description: 'Evidence is still being uploaded or processed.' };
  }

  // Open critical/high bug
  if ((bugSeverity === 'critical' || bugSeverity === 'high') && bugStatus && bugStatus !== 'closed' && bugStatus !== 'resolved' && bugStatus !== 'false_positive') {
    return { preserved: true, reason: 'skip_open_bug', description: 'Evidence linked to unresolved critical/high-severity bug.' };
  }

  // Open bug of any severity
  if (bugStatus === 'open' || bugStatus === 'in_progress' || bugStatus === 'investigating' || bugStatus === 'retest_required') {
    return { preserved: true, reason: 'skip_open_bug', description: 'Evidence linked to open bug.' };
  }

  // Approved release
  if (releaseApproved) {
    return { preserved: true, reason: 'skip_approved_release', description: 'Evidence linked to approved release.' };
  }

  // Deletion approval pending
  if (deletionPending) {
    return { preserved: true, reason: 'skip_preserved', description: 'Deletion approval is pending.' };
  }

  // Retention-locked
  if (evidenceStatus === 'retention_locked') {
    return { preserved: true, reason: 'skip_preserved', description: 'Evidence is retention-locked.' };
  }

  // Check if retention date has passed
  const now = new Date();
  if (retentionUntil > now) {
    return { preserved: true, reason: 'skip_preserved', description: 'Retention period has not yet expired.' };
  }

  return { preserved: false, reason: 'delete', description: 'Evidence is past retention and has no preservation rules.' };
}

// ============================================================
// Storage Monitoring
// ============================================================

export interface StorageSnapshot {
  totalObjects: number;
  totalSizeBytes: number;
  maxAllowedBytes: number;
  usagePercent: number;
  health: StorageHealth;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
}

export function assessStorageHealth(totalSizeBytes: number, maxAllowedBytes: number): StorageHealth {
  if (maxAllowedBytes <= 0) return 'unknown';
  const percent = (totalSizeBytes / maxAllowedBytes) * 100;
  const cfg = DEFAULT_STORAGE_CONFIG;
  if (percent >= cfg.criticalPercent) return 'critical';
  if (percent >= cfg.warningPercent) return 'warning';
  return 'healthy';
}

export function getStorageSnapshot(params: {
  totalObjects: number;
  totalSizeBytes: number;
}): StorageSnapshot {
  const cfg = DEFAULT_STORAGE_CONFIG;
  const maxAllowed = cfg.maxEvidenceStorageGb * 1024 * 1024 * 1024;
  const percent = maxAllowed > 0 ? (params.totalSizeBytes / maxAllowed) * 100 : 0;
  const health = assessStorageHealth(params.totalSizeBytes, maxAllowed);

  return {
    totalObjects: params.totalObjects,
    totalSizeBytes: params.totalSizeBytes,
    maxAllowedBytes: maxAllowed,
    usagePercent: Math.round(percent * 100) / 100,
    health,
    warningThresholdPercent: cfg.warningPercent,
    criticalThresholdPercent: cfg.criticalPercent,
  };
}

// ============================================================
// Emergency Storage Mode
// ============================================================

let storageEmergencyMode = false;

export function isStorageEmergencyMode(): boolean { return storageEmergencyMode; }
export function setStorageEmergencyMode(active: boolean): void { storageEmergencyMode = active; }

// ============================================================
// Cleanup Scanner
// ============================================================

export interface CleanupCandidate {
  evidenceId: string;
  sizeBytes: number;
  category: EvidenceCategory;
  retentionUntil: Date;
  decision: CleanupDecision;
  reason: string;
}

export interface CleanupScanResult {
  scanId: string;
  scannedAt: Date;
  dryRun: boolean;
  totalChecked: number;
  candidates: CleanupCandidate[];
  preservedCount: number;
  candidateTotalSize: number;
  approvalRequired: boolean;
  approvalThresholdGb: number;
}

export function runCleanupScan(params: {
  evidenceRecords: Array<{
    id: string;
    sizeBytes: number;
    category: EvidenceCategory;
    retentionUntil: Date;
    status: EvidenceState;
    pinned: boolean;
    legalHold: boolean;
    bugStatus?: string;
    bugSeverity?: string;
    releaseApproved?: boolean;
  }>;
  dryRun?: boolean;
}): CleanupScanResult {
  const isDryRun = params.dryRun !== undefined ? params.dryRun : DEFAULT_CLEANUP_CONFIG.dryRunDefault;
  const scanId = `cleanup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cfg = DEFAULT_CLEANUP_CONFIG;

  const candidates: CleanupCandidate[] = [];
  let preservedCount = 0;
  let candidateTotalSize = 0;

  for (const record of params.evidenceRecords) {
    const preservation = checkPreservation({
      evidenceStatus: record.status,
      retentionUntil: record.retentionUntil,
      pinned: record.pinned,
      legalHold: record.legalHold,
      bugStatus: record.bugStatus,
      bugSeverity: record.bugSeverity,
      releaseApproved: record.releaseApproved,
      deletionPending: false,
      uploadCertain: record.status === 'available' || record.status === 'scheduled_for_deletion',
    });

    if (preservation.preserved) {
      preservedCount++;
    } else {
      candidates.push({
        evidenceId: record.id,
        sizeBytes: record.sizeBytes,
        category: record.category,
        retentionUntil: record.retentionUntil,
        decision: 'delete',
        reason: preservation.description,
      });
      candidateTotalSize += record.sizeBytes;
    }
  }

  const candidateSizeGb = candidateTotalSize / (1024 * 1024 * 1024);
  const approvalRequired = candidateSizeGb > cfg.requireApprovalAboveGb;

  return {
    scanId,
    scannedAt: new Date(),
    dryRun: isDryRun,
    totalChecked: params.evidenceRecords.length,
    candidates,
    preservedCount,
    candidateTotalSize,
    approvalRequired,
    approvalThresholdGb: cfg.requireApprovalAboveGb,
  };
}

// ============================================================
// Cleanup Lock (prevent concurrent cleanup runs)
// ============================================================

class CleanupLock {
  private activeScanId: string | null = null;
  private lockedAt: Date | null = null;

  acquire(scanId: string): boolean {
    if (this.activeScanId) return false;
    this.activeScanId = scanId;
    this.lockedAt = new Date();
    return true;
  }

  release(): void {
    this.activeScanId = null;
    this.lockedAt = null;
  }

  isLocked(): boolean { return this.activeScanId !== null; }
  getActiveScanId(): string | null { return this.activeScanId; }
}

let cleanupLock: CleanupLock | null = null;
const getCleanupLock = () => { if (!cleanupLock) cleanupLock = new CleanupLock(); return cleanupLock; };

export function acquireCleanupLock(scanId: string): boolean { return getCleanupLock().acquire(scanId); }
export function releaseCleanupLock(): void { getCleanupLock().release(); }
export function isCleanupLocked(): boolean { return getCleanupLock().isLocked(); }

// ============================================================
// Cleanup Runner (in-memory simulation)
// ============================================================

export interface CleanupRunRecord {
  runId: string;
  dryRun: boolean;
  status: CleanupRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  candidateCount: number;
  deletedCount: number;
  deletedSizeBytes: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

class CleanupRunStore {
  private runs: Map<string, CleanupRunRecord> = new Map();

  create(runId: string, dryRun: boolean): CleanupRunRecord {
    const record: CleanupRunRecord = {
      runId, dryRun, status: 'scanning', startedAt: new Date(), completedAt: null,
      candidateCount: 0, deletedCount: 0, deletedSizeBytes: 0, skippedCount: 0, failedCount: 0, errors: [],
    };
    this.runs.set(runId, record);
    return record;
  }

  update(runId: string, updates: Partial<CleanupRunRecord>): CleanupRunRecord | undefined {
    const record = this.runs.get(runId);
    if (!record) return undefined;
    Object.assign(record, updates);
    this.runs.set(runId, record);
    return record;
  }

  get(runId: string): CleanupRunRecord | undefined { return this.runs.get(runId); }
  getAll(): CleanupRunRecord[] { return Array.from(this.runs.values()); }
  getRecent(limit: number = 10): CleanupRunRecord[] {
    return Array.from(this.runs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }
}

let cleanupRunStore: CleanupRunStore | null = null;
const getCleanupRunStore = () => { if (!cleanupRunStore) cleanupRunStore = new CleanupRunStore(); return cleanupRunStore; };

export function simulateCleanupExecution(params: {
  candidates: CleanupCandidate[];
  dryRun: boolean;
}): CleanupRunRecord {
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const store = getCleanupRunStore();
  const record = store.create(runId, params.dryRun);

  if (params.dryRun) {
    record.candidateCount = params.candidates.length;
    record.completedAt = new Date();
    store.update(runId, record);
    return record;
  }

  let deleted = 0;
  let deletedSize = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of params.candidates) {
    // Simulate 95% success rate
    if (Math.random() < 0.95) {
      deleted++;
      deletedSize += candidate.sizeBytes;
    } else {
      failed++;
      record.errors.push(`Failed to delete ${candidate.evidenceId}: simulated deletion error`);
    }
  }

  record.candidateCount = params.candidates.length;
  record.deletedCount = deleted;
  record.deletedSizeBytes = deletedSize;
  record.skippedCount = skipped;
  record.failedCount = failed;
  record.status = 'completed';
  record.completedAt = new Date();
  store.update(runId, record);
  return record;
}

export function getCleanupHistory(limit?: number): CleanupRunRecord[] {
  return getCleanupRunStore().getRecent(limit || 10);
}

export function getLastCleanupRun(): CleanupRunRecord | undefined {
  const all = getCleanupRunStore().getAll();
  if (all.length === 0) return undefined;
  return all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
}

// ============================================================
// Orphan Detection
// ============================================================

export interface OrphanDetectionResult {
  totalOrphans: number;
  storageOrphans: number;
  recordOrphans: number;
  stuckUploads: number;
  safeToDelete: number;
  needsReview: number;
}

export function detectOrphans(params: {
  knownStoragePaths: Set<string>;
  knownRecordPaths: Set<string>;
  recordStatuses: Map<string, EvidenceState>;
}): OrphanDetectionResult {
  // Objects in storage without records
  const storageOrphans: string[] = [];
  for (const path of params.knownStoragePaths) {
    if (!params.knownRecordPaths.has(path)) {
      storageOrphans.push(path);
    }
  }

  // Records whose storage object is missing
  const recordOrphans: string[] = [];
  for (const path of params.knownRecordPaths) {
    if (!params.knownStoragePaths.has(path)) {
      recordOrphans.push(path);
    }
  }

  // Stuck uploads
  let stuckUploads = 0;
  for (const [path, status] of params.recordStatuses) {
    if (status === 'uploading' || status === 'pending_upload') {
      const age = 0; // Would need createdAt to determine age
      if (age > 24 * 60 * 60 * 1000) stuckUploads++; // stuck > 24h
    }
  }

  // Temporary-prefix orphans are safe to auto-delete
  const safeToDelete = storageOrphans.filter((p) => p.includes('/temp/') || p.includes('/temp-files/')).length;
  const needsReview = storageOrphans.length - safeToDelete;

  return {
    totalOrphans: storageOrphans.length + recordOrphans.length,
    storageOrphans: storageOrphans.length,
    recordOrphans: recordOrphans.length,
    stuckUploads,
    safeToDelete,
    needsReview,
  };
}

// ============================================================
// Alert Deduplication for Storage Alerts
// ============================================================

interface AlertRecord {
  type: string;
  sentAt: Date;
}

class StorageAlertDeduplicator {
  private sent: Map<string, AlertRecord> = new Map();
  private cooldownMs: number;

  constructor(cooldownMinutes: number = 30) {
    this.cooldownMs = cooldownMinutes * 60 * 1000;
  }

  shouldSend(type: string): boolean {
    const existing = this.sent.get(type);
    if (!existing) return true;
    return (Date.now() - existing.sentAt.getTime()) > this.cooldownMs;
  }

  markSent(type: string): void {
    this.sent.set(type, { type, sentAt: new Date() });
  }

  clear(): void { this.sent.clear(); }
}

let alertDedup: StorageAlertDeduplicator | null = null;
const getAlertDedup = () => { if (!alertDedup) alertDedup = new StorageAlertDeduplicator(); return alertDedup; };

export function shouldSendStorageAlert(type: string): boolean {
  return getAlertDedup().shouldSend(type);
}

export function markStorageAlertSent(type: string): void {
  getAlertDedup().markSent(type);
}

// ============================================================
// Audit Event Recording
// ============================================================

export type AuditEventType =
  | 'evidence_uploaded' | 'evidence_upload_failed'
  | 'evidence_pinned' | 'evidence_unpinned'
  | 'retention_extended' | 'legal_hold_added' | 'legal_hold_removed'
  | 'cleanup_preview_created' | 'cleanup_approved' | 'cleanup_rejected'
  | 'cleanup_started' | 'evidence_deleted' | 'evidence_deletion_failed'
  | 'orphan_detected' | 'storage_warning_triggered'
  | 'storage_critical_triggered' | 'storage_emergency_enabled'
  | 'storage_emergency_disabled';

interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  actor: string;
  targetId: string;
  summary: string;
}

class AuditEventStore {
  private events: AuditEvent[] = [];

  record(event: AuditEvent): void { this.events.push(event); }

  getRecent(limit: number = 50): AuditEvent[] {
    return this.events.slice(-limit).reverse();
  }

  getByType(eventType: AuditEventType, limit?: number): AuditEvent[] {
    return this.events
      .filter((e) => e.eventType === eventType)
      .slice(-(limit || 50))
      .reverse();
  }
}

let auditStore: AuditEventStore | null = null;
const getAuditStore = () => { if (!auditStore) auditStore = new AuditEventStore(); return auditStore; };

export function recordAuditEvent(eventType: AuditEventType, actor: string, targetId: string, summary: string): void {
  getAuditStore().record({
    id: createRequestId(),
    timestamp: new Date(),
    eventType,
    actor,
    targetId,
    summary,
  });
}

export function getAuditEvents(limit?: number): AuditEvent[] {
  return getAuditStore().getRecent(limit || 50);
}

// ============================================================
// Retention Extension
// ============================================================

export function extendRetention(params: {
  currentRetentionUntil: Date;
  extensionDays: number;
  reason: RetentionReason;
}): { newRetentionUntil: Date; reason: RetentionReason } {
  const now = new Date();
  const baseDate = params.currentRetentionUntil > now ? params.currentRetentionUntil : now;
  return {
    newRetentionUntil: new Date(baseDate.getTime() + params.extensionDays * 24 * 60 * 60 * 1000),
    reason: params.reason,
  };
}

// ============================================================
// Cleanup
// ============================================================

export function clearEvidenceRetentionStores(): void {
  cleanupLock = null;
  cleanupRunStore = null;
  alertDedup = null;
  auditStore = null;
  storageEmergencyMode = false;
}