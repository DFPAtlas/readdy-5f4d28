// ============================================================
// DFP UAT Agent — Release Governance & Human Approval Gate
// ============================================================
// This module ensures that AI, n8n, and Playwright may RECOMMEND
// release readiness but can NEVER approve a production release.
// Only authorised human staff may approve.
// ============================================================

import type {
  UatReleaseState,
  UatApprovalDecision,
  UatGateCheckStatus,
  UatGateCheckType,
  UatAiRecommendation,
  UatReleaseErrorCode,
  UatReleaseCandidate,
  UatReleaseApproval,
  UatRiskAcceptance,
  UatReleaseGateCheck,
  UatReleaseSignoffReport,
  UatReleaseDashboardEntry,
} from '@/types/uat';
import type { ReleaseWebhookConfig, ReleaseWebhookDeliveryRecord } from '@/types/uat';

// ============================================================
// State Transition Map
// ============================================================

const VALID_RELEASE_TRANSITIONS: Record<UatReleaseState, UatReleaseState[]> = {
  draft: ['testing'],
  testing: ['review_required'],
  review_required: ['not_ready', 'ready_with_warnings', 'ready_for_approval'],
  not_ready: ['review_required', 'testing'],
  ready_with_warnings: ['approval_pending'],
  ready_for_approval: ['approval_pending'],
  approval_pending: ['approved_for_release', 'release_rejected', 'risk_acceptance_required'],
  approved_for_release: ['released', 'approval_expired', 'approval_invalidated'],
  release_rejected: ['review_required', 'testing'],
  risk_acceptance_required: ['risk_accepted'],
  risk_accepted: ['approval_pending'],
  approval_expired: ['review_required'],
  approval_invalidated: ['review_required'],
  released: ['release_failed', 'rolled_back'],
  release_failed: ['review_required'],
  rolled_back: ['review_required'],
};

/**
 * Validate that a state transition is allowed.
 */
export function isValidReleaseTransition(from: UatReleaseState, to: UatReleaseState): boolean {
  const allowed = VALID_RELEASE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Try a state transition. Returns the new state or throws with the error code.
 */
export function transitionReleaseState(
  current: UatReleaseState,
  next: UatReleaseState,
): { ok: true; newState: UatReleaseState } | { ok: false; errorCode: UatReleaseErrorCode } {
  if (isValidReleaseTransition(current, next)) {
    return { ok: true, newState: next };
  }
  return { ok: false, errorCode: 'RELEASE_INVALID_TRANSITION' };
}

// ============================================================
// Gate Check Definitions
// ============================================================

interface GateCheckDefinition {
  checkType: UatGateCheckType;
  label: string;
  blocking: boolean;
  description: string;
}

export const GATE_CHECK_DEFINITIONS: GateCheckDefinition[] = [
  {
    checkType: 'latest_test_run_completed',
    label: 'Latest test run completed',
    blocking: true,
    description: 'The most recent test run associated with this release must have completed.',
  },
  {
    checkType: 'test_run_matches_build',
    label: 'Test run matches build',
    blocking: true,
    description: 'The test run must be executed against the exact target build reference.',
  },
  {
    checkType: 'git_sha_matches_build',
    label: 'Git SHA matches build',
    blocking: true,
    description: 'The Git commit SHA of the test run must match the target build.',
  },
  {
    checkType: 'required_test_plan_completed',
    label: 'Required test plan completed',
    blocking: true,
    description: 'All required journeys in the test plan must have been executed.',
  },
  {
    checkType: 'no_unresolved_critical_bugs',
    label: 'No unresolved critical bugs',
    blocking: true,
    description: 'There must be zero unresolved critical-severity bugs linked to this release.',
  },
  {
    checkType: 'high_bug_policy_satisfied',
    label: 'High bug policy satisfied',
    blocking: true,
    description: 'All high-severity bugs must be either resolved or have an accepted risk exception.',
  },
  {
    checkType: 'required_retests_completed',
    label: 'Required retests completed',
    blocking: true,
    description: 'All retests requested since the last approval attempt must be completed.',
  },
  {
    checkType: 'evidence_upload_complete',
    label: 'Evidence upload complete',
    blocking: false,
    description: 'All evidence files from the test run must be fully uploaded.',
  },
  {
    checkType: 'backup_status_acceptable',
    label: 'Backup status acceptable',
    blocking: false,
    description: 'A verified backup must exist for the current state before approving release.',
  },
  {
    checkType: 'restore_readiness_acceptable',
    label: 'Restore readiness acceptable',
    blocking: false,
    description: 'Disaster recovery restore readiness should be at an acceptable level.',
  },
  {
    checkType: 'playwright_fingerprint_complete',
    label: 'Playwright fingerprint complete',
    blocking: false,
    description: 'Browser environment fingerprint data must be captured for the test run.',
  },
  {
    checkType: 'security_checks_passed',
    label: 'Security checks passed',
    blocking: true,
    description: 'Security review must not have unresolved critical or high findings.',
  },
  {
    checkType: 'production_testing_permission_valid',
    label: 'Production testing permission valid',
    blocking: true,
    description: 'If targeting production, explicit production testing permission must be present.',
  },
  {
    checkType: 'approval_not_expired',
    label: 'Approval not expired',
    blocking: true,
    description: 'Any previous approval must not have expired or been invalidated.',
  },
];

// ============================================================
// AI Recommendation Validation
// ============================================================

const ALLOWED_AI_RECOMMENDATIONS: UatAiRecommendation[] = [
  'not_ready',
  'ready_with_warnings',
  'ready_for_human_review',
];

const FORBIDDEN_AI_OUTPUTS = ['approved_for_release', 'risk_accepted', 'released'] as const;

/**
 * Validate that AI output is advisory only and cannot set approval states.
 */
export function validateAiRecommendation(raw: string): UatAiRecommendation {
  // Block any attempt to return forbidden states
  const lowerRaw = raw.toLowerCase().trim();
  for (const forbidden of FORBIDDEN_AI_OUTPUTS) {
    if (lowerRaw.includes(forbidden.toLowerCase())) {
      return 'not_ready';
    }
  }

  if (ALLOWED_AI_RECOMMENDATIONS.includes(raw as UatAiRecommendation)) {
    return raw as UatAiRecommendation;
  }

  // Default safe value
  return 'not_ready';
}

// ============================================================
// Gate Check Evaluator
// ============================================================

export interface GateCheckContext {
  releaseCandidate: UatReleaseCandidate;
  latestRunStatus: string | null;
  runMatchesBuild: boolean;
  gitShaMatches: boolean;
  testPlanCompleted: boolean;
  hasUnresolvedCriticalBugs: boolean;
  highBugPolicySatisfied: boolean;
  requiredRetestsCompleted: boolean;
  evidenceUploadComplete: boolean;
  backupStatusAcceptable: boolean;
  restoreReadinessAcceptable: boolean;
  playwrightFingerprintComplete: boolean;
  securityChecksPassed: boolean;
  productionTestingValid: boolean;
  approvalNotExpired: boolean;
}

export function evaluateGateChecks(ctx: GateCheckContext): UatReleaseGateCheck[] {
  const now = new Date().toISOString();
  const checks: UatReleaseGateCheck[] = [];

  const addCheck = (
    checkType: UatGateCheckType,
    result: { status: UatGateCheckStatus; summary: string },
    blocking: boolean,
  ) => {
    checks.push({
      id: `gate-${ctx.releaseCandidate.id}-${checkType}`,
      releaseCandidateId: ctx.releaseCandidate.id,
      checkType,
      status: result.status,
      blocking,
      safeSummary: result.summary,
      evidenceReference: null,
      checkedAt: now,
      createdAt: now,
    });
  };

  // 1. Latest test run completed
  addCheck(
    'latest_test_run_completed',
    ctx.latestRunStatus === 'completed' || ctx.latestRunStatus === 'completed_with_warnings'
      ? { status: 'passed', summary: `Test run status: ${ctx.latestRunStatus}` }
      : { status: 'failed', summary: `Test run not completed. Current status: ${ctx.latestRunStatus ?? 'unknown'}` },
    true,
  );

  // 2. Test run matches build
  addCheck(
    'test_run_matches_build',
    ctx.runMatchesBuild
      ? { status: 'passed', summary: 'Test run was executed against the target build.' }
      : { status: 'failed', summary: 'Test run build reference does not match the release target build.' },
    true,
  );

  // 3. Git SHA matches build
  addCheck(
    'git_sha_matches_build',
    ctx.gitShaMatches
      ? { status: 'passed', summary: 'Git SHA matches the target build.' }
      : { status: 'failed', summary: 'Git SHA does not match the target build reference.' },
    true,
  );

  // 4. Required test plan completed
  addCheck(
    'required_test_plan_completed',
    ctx.testPlanCompleted
      ? { status: 'passed', summary: 'All required test plan journeys have been executed.' }
      : { status: 'failed', summary: 'Not all required test plan journeys have been completed.' },
    true,
  );

  // 5. No unresolved critical bugs
  addCheck(
    'no_unresolved_critical_bugs',
    !ctx.hasUnresolvedCriticalBugs
      ? { status: 'passed', summary: 'No unresolved critical bugs.' }
      : { status: 'failed', summary: `Unresolved critical bugs exist. Count: ${ctx.releaseCandidate.criticalBugCount}.` },
    true,
  );

  // 6. High bug policy satisfied
  addCheck(
    'high_bug_policy_satisfied',
    ctx.highBugPolicySatisfied
      ? { status: 'passed', summary: 'All high bugs are resolved or have accepted risk.' }
      : { status: ctx.releaseCandidate.highBugCount > 0 ? 'failed' : 'not_applicable', summary: ctx.releaseCandidate.highBugCount > 0 ? `${ctx.releaseCandidate.highBugCount} high-severity bugs require resolution or risk acceptance.` : 'No high bugs.' },
    true,
  );

  // 7. Required retests completed
  addCheck(
    'required_retests_completed',
    ctx.requiredRetestsCompleted
      ? { status: 'passed', summary: 'All required retests have been completed.' }
      : { status: 'failed', summary: `${ctx.releaseCandidate.requiredRetestCount} retests still required.` },
    true,
  );

  // 8. Evidence upload complete
  addCheck(
    'evidence_upload_complete',
    ctx.evidenceUploadComplete
      ? { status: 'passed', summary: 'All evidence files have been uploaded.' }
      : { status: 'warning', summary: 'Some evidence files may not be fully uploaded.' },
    false,
  );

  // 9. Backup status acceptable
  addCheck(
    'backup_status_acceptable',
    ctx.backupStatusAcceptable
      ? { status: 'passed', summary: 'A verified backup exists.' }
      : { status: 'warning', summary: 'No recent verified backup found.' },
    false,
  );

  // 10. Restore readiness acceptable
  addCheck(
    'restore_readiness_acceptable',
    ctx.restoreReadinessAcceptable
      ? { status: 'passed', summary: 'Disaster recovery readiness is acceptable.' }
      : { status: 'warning', summary: 'Restore readiness has not been verified recently.' },
    false,
  );

  // 11. Playwright fingerprint complete
  addCheck(
    'playwright_fingerprint_complete',
    ctx.playwrightFingerprintComplete
      ? { status: 'passed', summary: 'Browser environment fingerprint captured.' }
      : { status: 'warning', summary: 'Browser fingerprint data incomplete.' },
    false,
  );

  // 12. Security checks passed
  addCheck(
    'security_checks_passed',
    ctx.securityChecksPassed
      ? { status: 'passed', summary: 'Security review passed with no critical or high findings.' }
      : { status: 'failed', summary: 'Security review has unresolved findings.' },
    true,
  );

  // 13. Production testing permission valid
  addCheck(
    'production_testing_permission_valid',
    ctx.productionTestingValid
      ? { status: 'passed', summary: 'Production testing permission is valid.' }
      : { status: ctx.releaseCandidate.environment === 'production' ? 'failed' : 'not_applicable', summary: ctx.releaseCandidate.environment === 'production' ? 'Production testing permission is not granted.' : 'Not a production release.' },
    true,
  );

  // 14. Approval not expired
  addCheck(
    'approval_not_expired',
    ctx.approvalNotExpired
      ? { status: 'passed', summary: 'No expired or invalidated approvals.' }
      : { status: 'failed', summary: 'Previous approval has expired or been invalidated.' },
    true,
  );

  return checks;
}

/**
 * Determine if all blocking gate checks are passed.
 */
export function canApproveFromGateChecks(checks: UatReleaseGateCheck[]): boolean {
  return checks.every((check) => {
    if (!check.blocking) return true;
    return check.status === 'passed';
  });
}

/**
 * Summary of gate check results.
 */
export function gateCheckSummary(checks: UatReleaseGateCheck[]): {
  passedCount: number;
  warningCount: number;
  failedCount: number;
  blockingFailed: UatGateCheckType[];
  warnings: UatGateCheckType[];
} {
  const blockingFailed = checks
    .filter((c) => c.blocking && c.status === 'failed')
    .map((c) => c.checkType);
  const warnings = checks
    .filter((c) => c.status === 'warning')
    .map((c) => c.checkType);

  return {
    passedCount: checks.filter((c) => c.status === 'passed').length,
    warningCount: warnings.length,
    failedCount: checks.filter((c) => c.status === 'failed').length,
    blockingFailed,
    warnings,
  };
}

// ============================================================
// Approval Engine
// ============================================================

export interface ApprovalContext {
  releaseCandidate: UatReleaseCandidate;
  approvingStaffId: string;
  approvingStaffName: string;
  decision: UatApprovalDecision;
  decisionNote: string;
  warningAcknowledgement: boolean;
  currentBuildReference: string;
  currentGitSha: string;
  fingerprintHash: string;
  approvalExpiryHours: number;
  requireSeparateApprover: boolean;
}

export interface ApprovalResult {
  ok: boolean;
  errorCode?: UatReleaseErrorCode;
  message?: string;
  approval?: Partial<UatReleaseApproval>;
}

/**
 * Validate and create an approval decision.
 * Enforces all human-approval rules server-side.
 */
export function validateApproval(ctx: ApprovalContext): ApprovalResult {
  // 1. AI can never approve
  if (ctx.approvingStaffId === 'ai' || ctx.approvingStaffId.startsWith('ai-') || ctx.approvingStaffId === 'n8n' || ctx.approvingStaffId === 'playwright') {
    return { ok: false, errorCode: 'RELEASE_PERMISSION_DENIED', message: 'AI, n8n, and Playwright cannot approve releases.' };
  }

  // 2. Build reference must match
  if (ctx.currentBuildReference !== ctx.releaseCandidate.targetBuildReference) {
    return { ok: false, errorCode: 'RELEASE_BUILD_MISMATCH', message: 'Current build does not match the release candidate target build.' };
  }

  // 3. Git SHA must match
  if (ctx.currentGitSha !== ctx.releaseCandidate.applicationGitSha) {
    return { ok: false, errorCode: 'RELEASE_GIT_SHA_MISMATCH', message: 'Current Git SHA does not match the release candidate.' };
  }

  // 4. Separation of duties
  if (ctx.requireSeparateApprover && ctx.approvingStaffName === ctx.releaseCandidate.createdBy) {
    return { ok: false, errorCode: 'RELEASE_SEPARATE_APPROVER_REQUIRED', message: 'The creator of the release candidate cannot be the final approver.' };
  }

  // 5. Decision note is required
  if (!ctx.decisionNote || ctx.decisionNote.trim().length === 0) {
    return { ok: false, errorCode: 'RELEASE_PERMISSION_DENIED', message: 'A decision note is required.' };
  }

  // 6. Release must be in an approvable state
  const approvableStates: UatReleaseState[] = ['approval_pending', 'ready_for_approval', 'ready_with_warnings', 'risk_accepted'];
  if (!approvableStates.includes(ctx.releaseCandidate.status)) {
    return { ok: false, errorCode: 'RELEASE_INVALID_TRANSITION', message: `Release is in '${ctx.releaseCandidate.status}' state and cannot be approved.` };
  }

  // 7. Warning acknowledgement
  if (ctx.releaseCandidate.warningCount > 0 && !ctx.warningAcknowledgement) {
    return { ok: false, errorCode: 'RELEASE_GATE_FAILED', message: 'Warning acknowledgement is required when warnings are present.' };
  }

  // 8. Build approval record
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ctx.approvalExpiryHours * 60 * 60 * 1000).toISOString();

  return {
    ok: true,
    approval: {
      releaseCandidateId: ctx.releaseCandidate.id,
      decision: ctx.decision,
      decisionStatus: ctx.decision === 'approve' ? 'approved' : ctx.decision === 'reject' ? 'rejected' : 'pending',
      approvedBuildReference: ctx.currentBuildReference,
      approvedGitSha: ctx.currentGitSha,
      approvedTestRunId: ctx.releaseCandidate.testRunId,
      approvedFingerprintHash: ctx.fingerprintHash,
      decisionNote: ctx.decisionNote,
      conditions: null,
      approvedBy: ctx.approvingStaffName,
      approvedAt: now,
      expiresAt: ctx.decision === 'approve' ? expiresAt : null,
    },
  };
}

// ============================================================
// Risk Acceptance Validation
// ============================================================

export interface RiskAcceptanceContext {
  bugSeverity: string;
  allowHighRisk: boolean;
  allowCriticalRisk: boolean;
  requireSecondApprover: boolean;
  acceptedBy: string;
  secondApprover?: string | null;
}

export function validateRiskAcceptance(ctx: RiskAcceptanceContext): { ok: boolean; errorCode?: UatReleaseErrorCode; message?: string } {
  // Critical risk acceptance is disabled by default
  if (ctx.bugSeverity === 'critical' && !ctx.allowCriticalRisk) {
    return { ok: false, errorCode: 'RISK_ACCEPTANCE_NOT_ALLOWED', message: 'Critical risk acceptance is disabled.' };
  }

  // High risk requires explicit permission
  if (ctx.bugSeverity === 'high' && !ctx.allowHighRisk) {
    return { ok: false, errorCode: 'RISK_ACCEPTANCE_NOT_ALLOWED', message: 'High-risk acceptance is not currently permitted.' };
  }

  // High risk requires second approver
  if (ctx.bugSeverity === 'high' && ctx.requireSecondApprover && !ctx.secondApprover) {
    return { ok: false, errorCode: 'RELEASE_SECOND_APPROVER_REQUIRED', message: 'High-risk acceptance requires a second authorised reviewer.' };
  }

  return { ok: true };
}

// ============================================================
// Build Locking
// ============================================================

export interface BuildLock {
  releaseCandidateId: string;
  testRunId: string;
  targetBuildReference: string;
  applicationGitSha: string;
  applicationVersion: string;
  testPlanVersion: string;
  fingerprintHash: string;
  lockedAt: string;
}

export function createBuildLock(candidate: UatReleaseCandidate, fingerprintHash: string): BuildLock {
  return {
    releaseCandidateId: candidate.id,
    testRunId: candidate.testRunId,
    targetBuildReference: candidate.targetBuildReference,
    applicationGitSha: candidate.applicationGitSha,
    applicationVersion: candidate.releaseVersion,
    testPlanVersion: candidate.testPlanVersion,
    fingerprintHash,
    lockedAt: new Date().toISOString(),
  };
}

export function isBuildLockValid(
  lock: BuildLock,
  currentBuildReference: string,
  currentGitSha: string,
): boolean {
  return lock.targetBuildReference === currentBuildReference && lock.applicationGitSha === currentGitSha;
}

// ============================================================
// Sign-Off Report Generator
// ============================================================

export interface SignoffReportContext {
  releaseCandidate: UatReleaseCandidate;
  approval: UatReleaseApproval;
  riskAcceptances: UatRiskAcceptance[];
  gateChecks: UatReleaseGateCheck[];
  passFailTotals: { passed: number; failed: number; warnings: number; blocked: number };
  browserProfiles: string[];
  environmentFingerprints: string[];
  testDates: { started: string; completed: string | null };
}

export function generateSignoffReport(ctx: SignoffReportContext): UatReleaseSignoffReport {
  const now = new Date().toISOString();
  const blockingFailed = ctx.gateChecks.filter((c) => c.blocking && c.status === 'failed');

  const report: UatReleaseSignoffReport = {
    reportId: `signoff-${ctx.releaseCandidate.id}-${Date.now()}`,
    generatedAt: now,
    projectName: ctx.releaseCandidate.projectName ?? 'Unknown',
    releaseName: ctx.releaseCandidate.releaseName,
    releaseVersion: ctx.releaseCandidate.releaseVersion,
    buildReference: ctx.approval.approvedBuildReference,
    gitSha: ctx.approval.approvedGitSha,
    testPlanVersion: ctx.releaseCandidate.testPlanVersion,
    testRunId: ctx.releaseCandidate.testRunId,
    testDates: ctx.testDates,
    browserProfiles: ctx.browserProfiles,
    environmentFingerprints: ctx.environmentFingerprints,
    passFailTotals: ctx.passFailTotals,
    openBugTotals: {
      critical: ctx.releaseCandidate.criticalBugCount,
      high: ctx.releaseCandidate.highBugCount,
      medium: ctx.releaseCandidate.mediumBugCount,
      low: ctx.releaseCandidate.lowBugCount,
    },
    blockingIssues: blockingFailed.map((c) => c.safeSummary),
    acceptedRisks: ctx.riskAcceptances
      .filter((r) => r.status === 'active')
      .map((r) => ({
        bugId: r.bugId,
        bugTitle: r.bugTitle ?? 'Unknown',
        riskLevel: r.riskLevel,
        acceptedBy: r.acceptedBy,
        expiresAt: r.expiresAt,
      })),
    retestsCompleted: ctx.releaseCandidate.requiredRetestCount,
    aiRecommendation: ctx.releaseCandidate.aiRecommendation,
    humanDecision: ctx.approval.decision,
    approverNames: [ctx.approval.approvedBy],
    approvalTimestamp: ctx.approval.approvedAt,
    approvalExpiry: ctx.approval.expiresAt,
    conditions: ctx.approval.conditions,
    auditReference: `uat-release-${ctx.releaseCandidate.id}`,
    reportChecksum: computeSimpleChecksum(`${ctx.releaseCandidate.id}-${ctx.approval.approvedAt}-${ctx.approval.approvedBuildReference}`),
    disclaimer: 'AI analysis is advisory. Final approval was made by authorised DFP staff.',
  };

  return report;
}

function computeSimpleChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `sha256sim:${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// ============================================================
// Release Governance Config
// ============================================================

export interface ReleaseGovernanceConfig {
  requireSeparateApprover: boolean;
  approvalExpiryHours: number;
  requireSecondApproverForRisk: boolean;
  allowHighRiskAcceptance: boolean;
  allowCriticalRiskAcceptance: boolean;
}

export function getDefaultGovernanceConfig(): ReleaseGovernanceConfig {
  return {
    requireSeparateApprover: true,
    approvalExpiryHours: 72,
    requireSecondApproverForRisk: true,
    allowHighRiskAcceptance: true,
    allowCriticalRiskAcceptance: false,
  };
}

// ============================================================
// Audit Event Helpers
// ============================================================

export function createAuditEntry(
  eventType: string,
  releaseId: string,
  actor: string,
  details: string,
): { eventType: string; releaseId: string; actor: string; details: string; timestamp: string } {
  return {
    eventType,
    releaseId,
    actor,
    details,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// Release Status Classification
// ============================================================

export function classifyReleaseStatus(
  candidate: UatReleaseCandidate,
  gateChecks: UatReleaseGateCheck[],
): { status: UatReleaseState; reason: string } {
  const summary = gateCheckSummary(gateChecks);

  // If already in a terminal-ish state, keep it
  const terminalStates: UatReleaseState[] = ['released', 'release_failed', 'rolled_back', 'approval_expired', 'approval_invalidated'];
  if (terminalStates.includes(candidate.status)) {
    return { status: candidate.status, reason: 'Already in terminal state.' };
  }

  // Blocking failures
  if (summary.blockingFailed.length > 0) {
    return { status: 'not_ready', reason: `${summary.blockingFailed.length} blocking gate checks failed: ${summary.blockingFailed.join(', ')}` };
  }

  // Warnings present
  if (summary.warningCount > 0) {
    return { status: 'ready_with_warnings', reason: `${summary.warningCount} warning(s) present. Staff acknowledgement required.` };
  }

  return { status: 'ready_for_approval', reason: 'All gate checks passed.' };
}

// ============================================================
// Post-Approval Webhook Integration
// ============================================================

export interface ApprovalWithWebhookResult {
  approvalOk: boolean;
  approvalErrorCode?: UatReleaseErrorCode;
  approvalMessage?: string;
  approval?: Partial<UatReleaseApproval>;
  webhookDispatched: boolean;
  webhookDelivery?: ReleaseWebhookDeliveryRecord;
  webhookError?: string;
}

/**
 * Orchestrate approval validation + webhook dispatch.
 * This is the main entry point for the approval flow — call this
 * after the approval record is persisted to the database.
 *
 * The webhook dispatch is fire-and-forget from the approval's
 * perspective. A failed webhook does NOT invalidate the approval.
 * The deployment system can verify the signed payload independently.
 */
export async function completeApprovalWithWebhook(
  approvalResult: ApprovalResult,
  candidate: UatReleaseCandidate,
  webhookConfig: ReleaseWebhookConfig,
  signingSecret: string,
  webhookPath?: string,
  dispatchFn?: (ctx: {
    candidate: UatReleaseCandidate;
    approval: Partial<UatReleaseApproval>;
    config: ReleaseWebhookConfig;
    signingSecret: string;
    path?: string;
  }) => Promise<{ ok: boolean; deliveryRecord: ReleaseWebhookDeliveryRecord; errorCode?: string }>,
): Promise<ApprovalWithWebhookResult> {
  if (!approvalResult.ok || !approvalResult.approval) {
    return {
      approvalOk: false,
      approvalErrorCode: approvalResult.errorCode,
      approvalMessage: approvalResult.message,
      webhookDispatched: false,
    };
  }

  const approval = approvalResult.approval as UatReleaseApproval;

  // Only fire webhook for approve decisions
  if (approval.decision !== 'approve') {
    return {
      approvalOk: true,
      approval: approvalResult.approval,
      webhookDispatched: false,
      webhookError: 'Webhook only dispatched for approval decisions.',
    };
  }

  // Guard: webhook must be enabled and configured
  if (!webhookConfig.enabled) {
    return {
      approvalOk: true,
      approval: approvalResult.approval,
      webhookDispatched: false,
      webhookError: 'Webhook dispatch is disabled in configuration.',
    };
  }

  if (!webhookConfig.endpointUrl) {
    return {
      approvalOk: true,
      approval: approvalResult.approval,
      webhookDispatched: false,
      webhookError: 'No webhook endpoint URL configured.',
    };
  }

  // Dispatch the webhook
  try {
    if (dispatchFn) {
      const result = await dispatchFn({
        candidate,
        approval,
        config: webhookConfig,
        signingSecret,
        path: webhookPath,
      });

      return {
        approvalOk: true,
        approval: approvalResult.approval,
        webhookDispatched: result.ok,
        webhookDelivery: result.deliveryRecord,
        webhookError: result.ok ? undefined : (result.errorCode || 'Webhook delivery failed'),
      };
    }

    // Fallback: no dispatch function provided
    return {
      approvalOk: true,
      approval: approvalResult.approval,
      webhookDispatched: false,
      webhookError: 'No webhook dispatch function available.',
    };
  } catch (err: unknown) {
    // Webhook failure does NOT invalidate the approval
    return {
      approvalOk: true,
      approval: approvalResult.approval,
      webhookDispatched: false,
      webhookError: err instanceof Error ? err.message : 'Unknown webhook dispatch error',
    };
  }
}