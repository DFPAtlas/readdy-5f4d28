// ============================================================
// DFP UAT Agent — Frontend Data Types
// ============================================================

export type UatEnvironment = 'demo' | 'uat' | 'staging' | 'production';

// --- Expanded Run States ---
export type UatRunStatus =
  | 'draft'
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_worker'
  | 'waiting_for_ai'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'interrupted'
  | 'cancel_requested'
  | 'cancelled'
  | 'blocked'
  | 'expired'
  | 'retry_pending';

// --- Expanded Journey Result States ---
export type UatJourneyResultStatus =
  | 'pending'
  | 'queued'
  | 'starting'
  | 'running'
  | 'passed'
  | 'failed'
  | 'warning'
  | 'blocked'
  | 'interrupted'
  | 'cancelled'
  | 'retry_pending';

export type UatAgentState = 'waiting' | 'working' | 'completed' | 'warning' | 'failed';
export type UatSeverity = 'critical' | 'high' | 'medium' | 'low';
export type UatBugStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'false_positive' | 'risk_accepted';
export type UatTestMode = 'smoke' | 'journey' | 'full_uat' | 'release_comparison';
export type UatBrowser = 'chromium' | 'firefox' | 'webkit';
export type UatViewport = 'desktop' | 'tablet' | 'mobile';
export type UatEvidenceType = 'screenshot' | 'video' | 'trace' | 'console_log' | 'network_log' | 'accessibility' | 'visual_diff' | 'accessibility_report' | 'uat_report' | 'temporary_file' | 'other';
export type UatStepType =
  | 'navigate'
  | 'click'
  | 'fill_field'
  | 'select_option'
  | 'upload_file'
  | 'wait_for_element'
  | 'assert_text'
  | 'assert_url'
  | 'assert_element_visible'
  | 'assert_api_response'
  | 'capture_screenshot'
  | 'run_accessibility_scan';
export type UatReadinessStatus = 'ready' | 'ready_with_warnings' | 'not_ready' | 'blocked';
export type UatComparisonMode = 'overlay' | 'side_by_side' | 'slider';

// --- Recovery & Heartbeat Types ---

export type UatRunHealth = 'healthy' | 'delayed' | 'stale' | 'interrupted' | 'failed';
export type UatRecoveryEventType =
  | 'worker_registered'
  | 'worker_delayed'
  | 'worker_stale'
  | 'lease_acquired'
  | 'lease_renewed'
  | 'lease_expired'
  | 'run_interrupted'
  | 'recovery_scan_started'
  | 'recovery_scan_completed'
  | 'retry_requested'
  | 'retry_approved'
  | 'retry_rejected'
  | 'cancel_requested'
  | 'cancel_acknowledged'
  | 'emergency_stop_enabled'
  | 'emergency_stop_disabled';

export type UatRecoveryReason =
  | 'queue_timeout'
  | 'worker_start_timeout'
  | 'heartbeat_missing'
  | 'lease_expired'
  | 'progress_timeout'
  | 'callback_timeout'
  | 'ai_timeout'
  | 'cancel_timeout'
  | 'worker_offline'
  | 'vm_restart_detected'
  | 'unknown_interruption';

export type UatStepSafety =
  | 'safe_to_repeat'
  | 'repeat_with_validation'
  | 'requires_staff_approval'
  | 'never_repeat_automatically';

export type UatCheckpointId =
  | 'before_login'
  | 'after_login'
  | 'before_form_submission'
  | 'after_form_submission'
  | 'before_payment_redirect'
  | 'after_test_record_created'
  | 'before_cleanup';

export type UatRecoveryErrorCode =
  | 'RUN_QUEUE_TIMEOUT'
  | 'RUN_START_TIMEOUT'
  | 'RUN_HEARTBEAT_MISSING'
  | 'RUN_LEASE_EXPIRED'
  | 'RUN_PROGRESS_TIMEOUT'
  | 'RUN_CALLBACK_TIMEOUT'
  | 'RUN_CANCEL_TIMEOUT'
  | 'WORKER_OFFLINE'
  | 'WORKER_CAPACITY_REACHED'
  | 'RECOVERY_LOCK_UNAVAILABLE'
  | 'RECOVERY_REQUIRES_APPROVAL'
  | 'RETRY_LIMIT_REACHED'
  | 'UNSAFE_RETRY_BLOCKED';

// --- Evidence Retention & Storage Types ---

export type EvidenceCategory =
  | 'screenshot'
  | 'visual_diff'
  | 'video'
  | 'trace'
  | 'console_log'
  | 'network_log'
  | 'accessibility_report'
  | 'uat_report'
  | 'temporary_file'
  | 'other';

export type EvidenceState =
  | 'pending_upload'
  | 'uploading'
  | 'available'
  | 'upload_failed'
  | 'processing'
  | 'retention_locked'
  | 'scheduled_for_deletion'
  | 'deleting'
  | 'deleted'
  | 'deletion_failed'
  | 'quarantined';

export type RetentionReason =
  | 'default_success_retention'
  | 'default_failure_retention'
  | 'open_bug'
  | 'approved_release'
  | 'staff_pinned'
  | 'legal_hold'
  | 'investigation_hold'
  | 'manual_extension'
  | 'temporary_file'
  | 'cleanup_candidate';

export type StorageHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export type CleanupRunStatus = 'pending' | 'scanning' | 'awaiting_approval' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed';

export type CleanupDecision = 'delete' | 'skip_preserved' | 'skip_pinned' | 'skip_legal_hold' | 'skip_open_bug' | 'skip_approved_release' | 'skip_uncertain' | 'excluded_by_staff';

export type EvidenceStorageErrorCode =
  | 'EVIDENCE_FILE_TOO_LARGE'
  | 'EVIDENCE_TYPE_NOT_ALLOWED'
  | 'EVIDENCE_PATH_INVALID'
  | 'EVIDENCE_UPLOAD_FAILED'
  | 'EVIDENCE_CHECKSUM_MISMATCH'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_RETENTION_LOCKED'
  | 'EVIDENCE_LEGAL_HOLD'
  | 'EVIDENCE_DELETE_FAILED'
  | 'CLEANUP_APPROVAL_REQUIRED'
  | 'CLEANUP_LOCK_UNAVAILABLE'
  | 'CLEANUP_ALREADY_COMPLETED'
  | 'STORAGE_WARNING'
  | 'STORAGE_CRITICAL'
  | 'STORAGE_BUCKET_MISSING'
  | 'STORAGE_PERMISSION_DENIED'
  | 'ORPHAN_REVIEW_REQUIRED';

export type AuditEventType =
  | 'evidence_uploaded'
  | 'evidence_upload_failed'
  | 'evidence_pinned'
  | 'evidence_unpinned'
  | 'retention_extended'
  | 'legal_hold_added'
  | 'legal_hold_removed'
  | 'cleanup_preview_created'
  | 'cleanup_approved'
  | 'cleanup_rejected'
  | 'cleanup_started'
  | 'evidence_deleted'
  | 'evidence_deletion_failed'
  | 'orphan_detected'
  | 'storage_warning_triggered'
  | 'storage_critical_triggered'
  | 'storage_emergency_enabled'
  | 'storage_emergency_disabled';

// --- Core Entities ---

export interface UatProject {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultEnvironment: UatEnvironment;
  createdAt: string;
  updatedAt: string;
}

export interface UatTestPlan {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  baseEnvironment: UatEnvironment;
  journeys: UatJourney[];
  devices: UatViewport[];
  browsers: UatBrowser[];
  retryCount: number;
  stopOnCritical: boolean;
  notificationRules: UatNotificationRule[];
  enabled: boolean;
  lastRunId: string | null;
  lastRunDate: string | null;
  lastPassRate: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UatJourney {
  id: string;
  planId: string;
  name: string;
  description: string;
  userRole: string;
  order: number;
  steps: UatJourneyStep[];
  createdAt: string;
  updatedAt: string;
}

export interface UatJourneyStep {
  id: string;
  journeyId: string;
  stepNumber: number;
  name: string;
  type: UatStepType;
  selectorStrategy: string;
  value: string;
  expectedResult: string;
  timeout: number;
  retryCount: number;
  required: boolean;
  maskValue: boolean;
  /** Step classification for recovery safety */
  safety?: UatStepSafety;
  /** Checkpoint this step creates (if any) */
  checkpoint?: UatCheckpointId;
}

export interface UatTestRun {
  id: string;
  projectId: string;
  projectName: string;
  baseUrl: string;
  environment: UatEnvironment;
  testPlanId: string;
  testPlanName: string;
  testMode: UatTestMode;
  browsers: UatBrowser[];
  viewports: UatViewport[];
  releaseReference: string | null;
  triggeredBy: string;
  status: UatRunStatus;
  startTime: string;
  endTime: string | null;
  duration: number;
  currentJourney: string | null;
  currentStep: string | null;
  progress: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  blockedCount: number;
  totalSteps: number;
  passRate: number;
  bugsFound: number;
  journeyResults: UatJourneyResult[];
  agentStatuses: UatAgentStatus[];
  safetyPolicy: UatSafetyPolicy;
  timeline: UatTimelineEvent[];

  // --- Recovery fields ---
  heartbeatAt: string | null;
  leaseAcquiredAt: string | null;
  leaseExpiresAt: string | null;
  lastProgressAt: string | null;
  lastWorkerContactAt: string | null;
  lastCallbackAt: string | null;
  attemptCount: number;
  maximumAttempts: number;
  recoveryCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  recoverable: boolean;
  recoveryStatus: string | null;
  recoveryRequestedAt: string | null;
  recoveryRequestedBy: string | null;
  interruptedAt: string | null;
  interruptionReason: string | null;
  cancelRequestedAt: string | null;
  cancelledAt: string | null;
  workerInstanceId: string | null;
  n8nExecutionId: string | null;
}

export interface UatJourneyResult {
  id: string;
  runId: string;
  journeyId: string;
  journeyName: string;
  browser: UatBrowser;
  viewport: UatViewport;
  status: UatJourneyResultStatus;
  startTime: string;
  endTime: string | null;
  duration: number;
  stepResults: UatStepResult[];
  agentFindings: UatFinding[];
  screenshotCount: number;
  videoAvailable: boolean;
  traceAvailable: boolean;

  // --- Recovery fields ---
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  maximumAttempts: number;
  lastStepIndex: number;
  lastCompletedStepId: string | null;
  lastSafeCheckpoint: UatCheckpointId | null;
  recoverable: boolean;
  interruptionReason: string | null;
  workerInstanceId: string | null;
}

export interface UatStepResult {
  id: string;
  journeyResultId: string;
  stepNumber: number;
  stepName: string;
  type: UatStepType;
  status: 'passed' | 'failed' | 'warning' | 'blocked' | 'skipped';
  actualValue: string;
  expectedValue: string;
  screenshotId: string | null;
  errorMessage: string | null;
  duration: number;
  timestamp: string;
}

export interface UatTimelineEvent {
  id: string;
  runId: string;
  timestamp: string;
  type: 'navigation' | 'click' | 'form_entry' | 'assertion' | 'console_error' | 'network_failure' | 'screenshot' | 'agent_finding' | 'heartbeat' | 'recovery';
  category: 'browser' | 'network' | 'assertion' | 'agent' | 'system';
  message: string;
  detail: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export interface UatAgentStatus {
  id: string;
  runId: string;
  name: string;
  role: string;
  state: UatAgentState;
  currentTask: string;
  lastActivity: string;
  findingCount: number;
  findings: UatFinding[];
}

export interface UatFinding {
  id: string;
  agentId: string;
  agentName: string;
  category: string;
  severity: UatSeverity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  timestamp: string;
}

export interface UatBug {
  id: string;
  title: string;
  severity: UatSeverity;
  confidence: number;
  status: UatBugStatus;
  category: string;
  projectId: string;
  projectName: string;
  pageUrl: string;
  journeyName: string;
  browser: UatBrowser;
  device: UatViewport;
  expectedResult: string;
  actualResult: string;
  reproductionSteps: string[];
  screenshotId: string | null;
  consoleErrors: string[];
  failedRequests: UatFailedRequest[];
  accessibilityRule: string | null;
  duplicateFingerprint: string;
  firstDetected: string;
  lastDetected: string;
  occurrenceCount: number;
  agentRecommendation: string;
  assignedTo: string | null;
  staffNotes: string;
  linkedRunId: string;
  linkedRunName: string;
  environment: UatEnvironment;
}

export interface UatFailedRequest {
  url: string;
  method: string;
  statusCode: number;
  responseBody: string;
}

export interface UatEvidence {
  id: string;
  runId: string;
  journeyId: string;
  journeyName: string;
  bugId: string | null;
  type: UatEvidenceType;
  title: string;
  url: string;
  browser: UatBrowser;
  device: UatViewport;
  timestamp: string;
  fileSize: string;
  sensitive: boolean;
  maskedUrl: string | null;
}

export interface EvidenceRecord {
  id: string;
  runId: string;
  journeyResultId: string | null;
  bugId: string | null;
  projectId: string;
  evidenceType: EvidenceCategory;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status: EvidenceState;
  retentionUntil: string;
  retentionReason: RetentionReason;
  pinned: boolean;
  pinnedBy: string | null;
  pinnedAt: string | null;
  legalHold: boolean;
  legalHoldReason: string | null;
  legalHoldBy: string | null;
  legalHoldAt: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: string | null;
  deletionApprovedAt: string | null;
  deletionApprovedBy: string | null;
  deletedAt: string | null;
  deletionErrorCode: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceCleanupRun {
  id: string;
  status: CleanupRunStatus;
  dryRun: boolean;
  startedAt: string | null;
  completedAt: string | null;
  triggeredBy: string;
  candidateCount: number;
  candidateSizeBytes: number;
  deletedCount: number;
  deletedSizeBytes: number;
  skippedCount: number;
  failedCount: number;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  errorSummary: string | null;
  createdAt: string;
}

export interface EvidenceCleanupItem {
  id: string;
  cleanupRunId: string;
  evidenceId: string;
  decision: CleanupDecision;
  reason: string;
  sizeBytes: number;
  status: string;
  errorCode: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface StorageMetrics {
  totalObjects: number;
  totalSizeBytes: number;
  sizeByProject: Record<string, number>;
  sizeByEvidenceType: Record<string, number>;
  sizeByStatus: Record<string, number>;
  oldestRetainedAt: string | null;
  cleanupCandidateCount: number;
  cleanupCandidateSizeBytes: number;
  orphanedCount: number;
  failedUploadCount: number;
  deletionFailureCount: number;
  health: StorageHealth;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  maxStorageBytes: number;
  storageEmergencyMode: boolean;
}

export interface RetentionConfig {
  successEvidenceRetentionDays: number;
  failedEvidenceRetentionDays: number;
  traceRetentionDays: number;
  videoRetentionDays: number;
  reportRetentionDays: number;
  tempFileRetentionHours: number;
}

export interface CleanupConfig {
  enabled: boolean;
  batchSize: number;
  scanIntervalHours: number;
  gracePeriodHours: number;
  dryRunDefault: boolean;
  requireApprovalAboveGb: number;
}

export interface UploadValidationResult {
  allowed: boolean;
  errorCode: EvidenceStorageErrorCode | null;
  message: string;
}

export interface CleanupPreview {
  candidateCount: number;
  candidateSizeBytes: number;
  evidenceTypes: EvidenceCategory[];
  projectsAffected: string[];
  oldestCandidate: string | null;
  selectionReasons: string[];
  preservationReasons: string[];
  approvalRequired: boolean;
  approvalThresholdGb: number;
}

export interface OrphanReport {
  totalOrphans: number;
  storageOrphans: number;
  recordOrphans: number;
  stuckUploads: number;
  safeToDeleteCount: number;
  needsReviewCount: number;
}

export interface UatVisualBaseline {
  id: string;
  journeyName: string;
  stepName: string;
  viewport: UatViewport;
  browser: UatBrowser;
  baselineUrl: string;
  currentUrl: string;
  diffUrl: string | null;
  differencePercentage: number;
  status: 'approved' | 'pending_review' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  approvalHistory: UatBaselineApproval[];
  lastCompared: string;
}

export interface UatBaselineApproval {
  id: string;
  approvedBy: string;
  approvedAt: string;
  note: string;
  action: 'approved' | 'rejected';
}

export interface UatSafetyPolicy {
  useSyntheticData: boolean;
  prefixRecords: string;
  blockExternalDomains: boolean;
  disableDestructiveActions: boolean;
  stripeTestModeOnly: boolean;
  maskSensitiveData: boolean;
  cleanupAfterRun: boolean;
  productionApproved: boolean;
  allowedActions: string[];
  blockedActions: string[];
}

export interface UatNotificationRule {
  id: string;
  event: string;
  channel: 'email' | 'slack' | 'teams';
  recipients: string[];
  enabled: boolean;
}

export interface UatSettings {
  n8nConnected: boolean;
  n8nEndpoint: string;
  n8nApiKeyMasked: string;
  browserWorkerConnected: boolean;
  browserWorkerEndpoint: string;
  defaultMaxPages: number;
  defaultMaxActions: number;
  defaultTimeout: number;
  approvedDomains: string[];
  blockedDomains: string[];
  testAccounts: UatTestAccount[];
  retentionDays: number;
  productionAllowed: boolean;
  productionApprovers: string[];
}

export interface UatTestAccount {
  id: string;
  role: string;
  email: string;
  description: string;
}

// --- Recovery Entities ---

export interface UatWorkerHeartbeat {
  id: string;
  workerInstanceId: string;
  workerType: string;
  hostname: string;
  version: string;
  status: string;
  activeRunCount: number;
  capacity: number;
  lastSeenAt: string;
  startedAt: string;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface UatWorkerHeartbeatPayload {
  workerInstanceId: string;
  workerType: string;
  status: string;
  activeRunIds: string[];
  activeJourneyResultIds: string[];
  capacity: number;
  timestamp: number;
}

export interface UatRecoveryEvent {
  id: string;
  runId: string;
  journeyResultId: string | null;
  eventType: UatRecoveryEventType;
  detectedAt: string;
  detectedBy: string;
  previousStatus: string;
  newStatus: string;
  reasonCode: string;
  safeSummary: string;
  automatic: boolean;
  approvedBy: string | null;
  createdAt: string;
}

export interface UatExecutionLease {
  workerInstanceId: string;
  leaseAcquiredAt: string;
  leaseExpiresAt: string;
  runId: string;
}

export interface UatRecoveryScanResult {
  scanId: string;
  scannedAt: string;
  totalRunsChecked: number;
  interruptedDetected: number;
  staleDetected: number;
  recoveredCount: number;
  details: UatRecoveryEvent[];
  errors: string[];
}

export interface UatCheckpointEntry {
  checkpointId: UatCheckpointId;
  journeyResultId: string;
  stepIndex: number;
  stepId: string;
  reachedAt: string;
  safeToResume: boolean;
}

// --- API Payloads ---

export interface CreateUatRunPayload {
  projectId: string;
  baseUrl: string;
  environment: UatEnvironment;
  testPlanId: string;
  testMode: UatTestMode;
  browsers: UatBrowser[];
  viewports: UatViewport[];
  releaseReference: string | null;
  maxPages: number;
  maxActions: number;
  includeAccessibilityScan: boolean;
  includeVisualComparison: boolean;
  includeConsoleNetworkCapture: boolean;
  userRoles: string[];
  journeyIds: string[];
  safetyPolicy: UatSafetyPolicy;
}

export interface CreateTestPlanPayload {
  name: string;
  projectId: string;
  baseEnvironment: UatEnvironment;
  journeys: Omit<UatJourney, 'id' | 'planId' | 'createdAt' | 'updatedAt'>[];
  devices: UatViewport[];
  browsers: UatBrowser[];
  retryCount: number;
  stopOnCritical: boolean;
  notificationRules: UatNotificationRule[];
  enabled: boolean;
}

export interface UpdateTestPlanPayload extends Partial<CreateTestPlanPayload> {
  id: string;
}

export interface UpdateUatBugPayload {
  id: string;
  status?: UatBugStatus;
  assignedTo?: string | null;
  staffNotes?: string;
}

export interface UatBugFilters {
  severity?: UatSeverity;
  status?: UatBugStatus;
  projectId?: string;
  environment?: UatEnvironment;
  category?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface UatEvidenceFilters {
  runId?: string;
  journeyId?: string;
  bugId?: string;
  type?: UatEvidenceType;
  browser?: UatBrowser;
  device?: UatViewport;
}

export interface UatDashboard {
  activeRuns: number;
  passRate: number;
  passRateChange: number;
  openCriticalBugs: number;
  openCriticalBugsChange: number;
  testsRunThisWeek: number;
  testsRunThisWeekChange: number;
  releaseReadiness: {
    score: number;
    status: UatReadinessStatus;
    blockingIssues: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    requiredRetests: number;
    lastSuccessfulFullTest: string | null;
  };
  activeRun: UatTestRun | null;
  agentTeam: UatAgentStatus[];
  recentRuns: UatTestRun[];

  // --- Recovery info ---
  recoveryStatus?: UatRecoveryDashboard;
}

export interface UatRecoveryDashboard {
  workerInstances: UatWorkerHeartbeat[];
  delayedRuns: number;
  interruptedRuns: number;
  staleLeases: number;
  pendingCancellations: number;
  lastRecoveryScan: string | null;
  executionPaused: boolean;
}

// --- Backup & Disaster Recovery Types ---

export type BackupCategory =
  | 'supabase_database'
  | 'supabase_storage'
  | 'n8n_database'
  | 'n8n_workflows'
  | 'n8n_encryption_key'
  | 'application_config'
  | 'docker_config'
  | 'supabase_migrations'
  | 'uat_reports'
  | 'playwright_config'
  | 'full_system_manifest';

export type BackupStatus =
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'verification_pending'
  | 'verified'
  | 'verification_failed'
  | 'restore_test_pending'
  | 'restore_test_passed'
  | 'restore_test_failed'
  | 'expired'
  | 'deletion_pending'
  | 'deleted'
  | 'failed';

export type RecoveryReadiness =
  | 'ready'
  | 'ready_with_warnings'
  | 'not_ready'
  | 'backup_missing'
  | 'backup_stale'
  | 'verification_failed'
  | 'restore_untested'
  | 'restore_failed';

export type BackupRestoreTestStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled';

export type BackendRecoveryErrorCode =
  | 'BACKUP_SOURCE_UNAVAILABLE'
  | 'BACKUP_DESTINATION_UNAVAILABLE'
  | 'BACKUP_LOCK_UNAVAILABLE'
  | 'BACKUP_FILE_EMPTY'
  | 'BACKUP_CHECKSUM_FAILED'
  | 'BACKUP_ARCHIVE_INVALID'
  | 'BACKUP_ENCRYPTION_FAILED'
  | 'BACKUP_REMOTE_COPY_FAILED'
  | 'BACKUP_MANIFEST_INVALID'
  | 'BACKUP_STALE'
  | 'RESTORE_ENVIRONMENT_FAILED'
  | 'RESTORE_DATABASE_FAILED'
  | 'RESTORE_STORAGE_FAILED'
  | 'RESTORE_N8N_FAILED'
  | 'RESTORE_HEALTH_CHECK_FAILED'
  | 'RESTORE_SMOKE_TEST_FAILED'
  | 'RESTORE_CLEANUP_FAILED'
  | 'RPO_TARGET_MISSED'
  | 'RTO_TARGET_MISSED';

export type BackupAuditEventType =
  | 'backup_started'
  | 'backup_completed'
  | 'backup_failed'
  | 'backup_verification_started'
  | 'backup_verified'
  | 'backup_verification_failed'
  | 'backup_copy_started'
  | 'backup_copy_failed'
  | 'restore_test_started'
  | 'restore_test_passed'
  | 'restore_test_failed'
  | 'backup_retention_deleted'
  | 'recovery_report_generated'
  | 'backup_hold_added'
  | 'backup_hold_removed';

export interface UatBackupRun {
  id: string;
  backupType: BackupCategory;
  status: BackupStatus;
  startedAt: string | null;
  completedAt: string | null;
  sourceService: string;
  sourceHostLabel: string;
  storageLocationLabel: string;
  fileCount: number;
  totalSizeBytes: number;
  checksumManifestPath: string | null;
  encrypted: boolean;
  verificationStatus: BackupStatus;
  verificationStartedAt: string | null;
  verificationCompletedAt: string | null;
  restoreTestStatus: BackupRestoreTestStatus;
  restoreTestedAt: string | null;
  restoreTestEnvironment: string | null;
  errorCode: string | null;
  safeErrorSummary: string | null;
  triggeredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UatBackupItem {
  id: string;
  backupRunId: string;
  itemType: string;
  safeFilename: string;
  relativePath: string;
  sizeBytes: number;
  checksumSha256: string;
  encrypted: boolean;
  verificationStatus: BackupStatus;
  createdAt: string;
}

export interface UatRestoreTest {
  id: string;
  backupRunId: string;
  status: BackupRestoreTestStatus;
  startedAt: string | null;
  completedAt: string | null;
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
  createdAt: string;
}

export interface UatDisasterRecoveryStatus {
  id: string;
  component: string;
  readinessStatus: RecoveryReadiness;
  latestBackupAt: string | null;
  latestVerifiedBackupAt: string | null;
  latestRestoreTestAt: string | null;
  backupAgeSeconds: number;
  targetRpoSeconds: number;
  targetRtoSeconds: number;
  currentRpoStatus: 'met' | 'missed' | 'unknown';
  currentRtoStatus: 'met' | 'missed' | 'unknown';
  blockingIssue: string | null;
  updatedAt: string;
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
  fileList: Array<{ filename: string; sizeBytes: number; checksumSha256: string }>;
  encrypted: boolean;
  sourceHostLabel: string;
}

export interface RecoveryReadinessReport {
  generatedAt: string;
  overallReadiness: RecoveryReadiness;
  componentStatuses: UatDisasterRecoveryStatus[];
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

export interface BackupRetentionConfig {
  dailyRetention: number;
  weeklyRetention: number;
  monthlyRetention: number;
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

// --- Release Governance Types ---

export type UatReleaseState =
  | 'draft'
  | 'testing'
  | 'review_required'
  | 'not_ready'
  | 'ready_with_warnings'
  | 'ready_for_approval'
  | 'approval_pending'
  | 'approved_for_release'
  | 'release_rejected'
  | 'risk_acceptance_required'
  | 'risk_accepted'
  | 'approval_expired'
  | 'approval_invalidated'
  | 'released'
  | 'release_failed'
  | 'rolled_back';

export type UatApprovalDecision =
  | 'approve'
  | 'reject'
  | 'request_retest'
  | 'accept_risk'
  | 'withdraw_approval'
  | 'invalidate_approval';

export type UatGateCheckStatus =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'not_applicable'
  | 'unknown';

export type UatGateCheckType =
  | 'latest_test_run_completed'
  | 'test_run_matches_build'
  | 'git_sha_matches_build'
  | 'required_test_plan_completed'
  | 'no_unresolved_critical_bugs'
  | 'high_bug_policy_satisfied'
  | 'required_retests_completed'
  | 'evidence_upload_complete'
  | 'backup_status_acceptable'
  | 'restore_readiness_acceptable'
  | 'playwright_fingerprint_complete'
  | 'security_checks_passed'
  | 'production_testing_permission_valid'
  | 'approval_not_expired';

export type UatAiRecommendation =
  | 'not_ready'
  | 'ready_with_warnings'
  | 'ready_for_human_review';

export type UatReleaseErrorCode =
  | 'RELEASE_BUILD_MISMATCH'
  | 'RELEASE_GIT_SHA_MISMATCH'
  | 'RELEASE_GATE_FAILED'
  | 'RELEASE_BLOCKED_BY_CRITICAL_BUG'
  | 'RELEASE_HIGH_RISK_APPROVAL_REQUIRED'
  | 'RELEASE_RETEST_REQUIRED'
  | 'RELEASE_PERMISSION_DENIED'
  | 'RELEASE_SEPARATE_APPROVER_REQUIRED'
  | 'RELEASE_SECOND_APPROVER_REQUIRED'
  | 'RELEASE_APPROVAL_EXPIRED'
  | 'RELEASE_APPROVAL_INVALIDATED'
  | 'RELEASE_INVALID_TRANSITION'
  | 'RISK_ACCEPTANCE_NOT_ALLOWED'
  | 'RISK_ACCEPTANCE_EXPIRED'
  | 'SIGNOFF_REPORT_FAILED';

export type UatReleaseAuditEventType =
  | 'release_candidate_created'
  | 'release_gate_evaluated'
  | 'release_ready_for_review'
  | 'release_approval_requested'
  | 'release_approved'
  | 'release_rejected'
  | 'retest_requested'
  | 'risk_acceptance_requested'
  | 'risk_accepted'
  | 'risk_acceptance_rejected'
  | 'approval_expired'
  | 'approval_invalidated'
  | 'approval_withdrawn'
  | 'release_marked_released'
  | 'release_failed'
  | 'release_rolled_back'
  | 'signoff_report_generated';

export interface UatReleaseCandidate {
  id: string;
  projectId: string;
  projectName?: string;
  testRunId: string;
  releaseName: string;
  releaseVersion: string;
  environment: string;
  targetBuildReference: string;
  applicationGitSha: string;
  applicationBranch: string;
  testPlanVersion: string;
  status: UatReleaseState;
  readinessScore: number;
  criticalBugCount: number;
  highBugCount: number;
  mediumBugCount: number;
  lowBugCount: number;
  warningCount: number;
  blockingIssueCount: number;
  requiredRetestCount: number;
  aiRecommendation: UatAiRecommendation | null;
  aiRecommendationSummary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Computed/generated fields
  gateChecks?: UatReleaseGateCheck[];
  approvals?: UatReleaseApproval[];
  riskAcceptances?: UatRiskAcceptance[];
  latestApproval?: UatReleaseApproval | null;
}

export interface UatReleaseApproval {
  id: string;
  releaseCandidateId: string;
  decision: UatApprovalDecision;
  decisionStatus: string;
  approvedBuildReference: string;
  approvedGitSha: string;
  approvedTestRunId: string;
  approvedFingerprintHash: string;
  decisionNote: string;
  conditions: string | null;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UatRiskAcceptance {
  id: string;
  releaseCandidateId: string;
  bugId: string;
  bugTitle?: string;
  bugSeverity?: UatSeverity;
  riskLevel: string;
  riskSummary: string;
  businessJustification: string;
  mitigationPlan: string;
  monitoringPlan?: string;
  plannedFixDate?: string | null;
  reviewDate: string;
  acceptedBy: string;
  acceptedAt: string;
  expiresAt: string;
  secondApprover?: string | null;
  withdrawnAt: string | null;
  status: 'active' | 'expired' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface UatReleaseGateCheck {
  id: string;
  releaseCandidateId: string;
  checkType: UatGateCheckType;
  status: UatGateCheckStatus;
  blocking: boolean;
  safeSummary: string;
  evidenceReference: string | null;
  checkedAt: string;
  createdAt: string;
}

export interface UatReleaseSignoffReport {
  reportId: string;
  generatedAt: string;
  projectName: string;
  releaseName: string;
  releaseVersion: string;
  buildReference: string;
  gitSha: string;
  testPlanVersion: string;
  testRunId: string;
  testDates: { started: string; completed: string | null };
  browserProfiles: string[];
  environmentFingerprints: string[];
  passFailTotals: { passed: number; failed: number; warnings: number; blocked: number };
  openBugTotals: { critical: number; high: number; medium: number; low: number };
  blockingIssues: string[];
  acceptedRisks: Array<{ bugId: string; bugTitle: string; riskLevel: string; acceptedBy: string; expiresAt: string }>;
  retestsCompleted: number;
  aiRecommendation: UatAiRecommendation | null;
  humanDecision: UatApprovalDecision | null;
  approverNames: string[];
  approvalTimestamp: string | null;
  approvalExpiry: string | null;
  conditions: string | null;
  auditReference: string;
  reportChecksum: string;
  disclaimer: string;
}

export interface UatReleaseDashboardEntry {
  releaseId: string;
  releaseName: string;
  releaseVersion: string;
  buildReference: string;
  gitSha: string;
  testRunId: string;
  status: UatReleaseState;
  readinessScore: number;
  aiRecommendation: UatAiRecommendation | null;
  blockingIssues: number;
  warningCount: number;
  requiredRetests: number;
  latestDecision: UatApprovalDecision | null;
  approvedBy: string | null;
  approvalExpiry: string | null;
  createdAt: string;
}

// --- Release Webhook Dispatch Types ---

export type ReleaseWebhookDeliveryStatus =
  | 'pending'
  | 'sending'
  | 'delivered'
  | 'delivery_failed'
  | 'retrying'
  | 'max_retries_exceeded'
  | 'acknowledged';

export type ReleaseWebhookEventType =
  | 'release.approved'
  | 'release.rejected'
  | 'release.rolled_back'
  | 'release.retest_requested';

export interface ReleaseWebhookPayload {
  event: ReleaseWebhookEventType;
  releaseCandidateId: string;
  projectId: string;
  buildReference: string;
  gitSha: string;
  approvalId: string;
  approvedAt: string;
  expiryAt: string | null;
  approvedBy: string;
  conditions: string | null;
  releaseVersion: string;
  environment: string;
  decision: string;
  timestamp: string;
  fingerprintHash: string;
}

export interface ReleaseWebhookConfig {
  enabled: boolean;
  endpointUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  requireValidSignature: boolean;
  secretName: string;
}

export interface ReleaseWebhookDeliveryRecord {
  id: string;
  releaseCandidateId: string;
  approvalId: string;
  eventType: ReleaseWebhookEventType;
  endpointUrl: string;
  status: ReleaseWebhookDeliveryStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  responseStatusCode: number | null;
  responseBodyPreview: string | null;
  safeError: string | null;
  nextRetryAt: string | null;
  requestId: string;
  idempotencyKey: string;
  bodyHash: string;
  createdAt: string;
  updatedAt: string;
}

export type ReleaseWebhookErrorCode =
  | 'WEBHOOK_DISABLED'
  | 'WEBHOOK_ENDPOINT_NOT_CONFIGURED'
  | 'WEBHOOK_SIGNING_FAILED'
  | 'WEBHOOK_DELIVERY_FAILED'
  | 'WEBHOOK_MAX_RETRIES_EXCEEDED'
  | 'WEBHOOK_RESPONSE_INVALID'
  | 'WEBHOOK_NO_APPROVAL_FOUND'
  | 'WEBHOOK_SECRET_MISSING';

export type ReleaseWebhookAuditEventType =
  | 'webhook_dispatched'
  | 'webhook_delivered'
  | 'webhook_delivery_failed'
  | 'webhook_retry_scheduled'
  | 'webhook_max_retries_exceeded'
  | 'webhook_acknowledged';

// NOTE: Keep this comment as the last line to prevent accidental type removal