import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { UatReleaseCandidate, UatGateCheckStatus, UatReleaseGateCheck } from '@/types/uat';

// ============================================================
// Mock data for the review page
// ============================================================

const MOCK_CHECKS: UatReleaseGateCheck[] = [
  { id: 'gc-1', releaseCandidateId: 'rel-v2-4-1', checkType: 'latest_test_run_completed', status: 'passed', blocking: true, safeSummary: 'Test run completed successfully.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-2', releaseCandidateId: 'rel-v2-4-1', checkType: 'test_run_matches_build', status: 'passed', blocking: true, safeSummary: 'Test run was executed against v2.4.1-rc3.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-3', releaseCandidateId: 'rel-v2-4-1', checkType: 'git_sha_matches_build', status: 'passed', blocking: true, safeSummary: 'Git SHA a3f8c2e1 matches the target build.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-4', releaseCandidateId: 'rel-v2-4-1', checkType: 'required_test_plan_completed', status: 'passed', blocking: true, safeSummary: 'All required journeys completed.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-5', releaseCandidateId: 'rel-v2-4-1', checkType: 'no_unresolved_critical_bugs', status: 'failed', blocking: true, safeSummary: '1 unresolved critical bug: Wizard Continue button unresponsive.', evidenceReference: 'bug-001', checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-6', releaseCandidateId: 'rel-v2-4-1', checkType: 'high_bug_policy_satisfied', status: 'failed', blocking: true, safeSummary: '2 high-severity bugs require resolution or risk acceptance.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-7', releaseCandidateId: 'rel-v2-4-1', checkType: 'required_retests_completed', status: 'failed', blocking: true, safeSummary: '2 retests pending.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-8', releaseCandidateId: 'rel-v2-4-1', checkType: 'evidence_upload_complete', status: 'warning', blocking: false, safeSummary: '1 evidence file still uploading.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-9', releaseCandidateId: 'rel-v2-4-1', checkType: 'backup_status_acceptable', status: 'warning', blocking: false, safeSummary: 'No recent verified backup found.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-10', releaseCandidateId: 'rel-v2-4-1', checkType: 'restore_readiness_acceptable', status: 'warning', blocking: false, safeSummary: 'Restore readiness not verified recently.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-11', releaseCandidateId: 'rel-v2-4-1', checkType: 'playwright_fingerprint_complete', status: 'passed', blocking: false, safeSummary: 'Browser fingerprint captured.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-12', releaseCandidateId: 'rel-v2-4-1', checkType: 'security_checks_passed', status: 'passed', blocking: true, safeSummary: 'Security review passed.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-13', releaseCandidateId: 'rel-v2-4-1', checkType: 'production_testing_permission_valid', status: 'not_applicable', blocking: true, safeSummary: 'Not a production release.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
  { id: 'gc-14', releaseCandidateId: 'rel-v2-4-1', checkType: 'approval_not_expired', status: 'passed', blocking: true, safeSummary: 'No expired approvals.', evidenceReference: null, checkedAt: '2026-07-29T10:30:00Z', createdAt: '2026-07-29T10:30:00Z' },
];

const MOCK_CANDIDATE: UatReleaseCandidate & { projectName: string } = {
  id: 'rel-v2-4-1',
  projectId: 'proj-dfp-tester',
  projectName: 'DFP Tester Application',
  testRunId: 'run-active',
  releaseName: 'DFP Tester v2.4.1',
  releaseVersion: '2.4.1',
  environment: 'uat',
  targetBuildReference: 'v2.4.1-rc3',
  applicationGitSha: 'a3f8c2e1d9b4f7a6c5e3d2b1',
  applicationBranch: 'release/2.4.1',
  testPlanVersion: '1.3',
  status: 'review_required',
  readinessScore: 72,
  criticalBugCount: 1,
  highBugCount: 2,
  mediumBugCount: 2,
  lowBugCount: 1,
  warningCount: 3,
  blockingIssueCount: 1,
  requiredRetestCount: 2,
  aiRecommendation: 'ready_with_warnings',
  aiRecommendationSummary: 'AI recommends release with warnings. The critical wizard bug and two high-severity security/performance issues need attention. Evidence upload is nearly complete. Backup status needs verification.',
  createdBy: 'Sarah Chen',
  createdAt: '2026-07-29T10:00:00Z',
  updatedAt: '2026-07-29T10:30:00Z',
};

const AUDIT_TIMELINE = [
  { event: 'release_candidate_created', actor: 'Sarah Chen', timestamp: '2026-07-29T10:00:00Z', details: 'Release candidate created for v2.4.1-rc3' },
  { event: 'release_gate_evaluated', actor: 'System', timestamp: '2026-07-29T10:30:00Z', details: 'Gate checks evaluated: 3 blocking failures, 3 warnings' },
  { event: 'release_ready_for_review', actor: 'System', timestamp: '2026-07-29T10:30:01Z', details: 'Release moved to review_required' },
];

const CHECK_LABELS: Record<string, string> = {
  latest_test_run_completed: 'Latest test run completed',
  test_run_matches_build: 'Test run matches build',
  git_sha_matches_build: 'Git SHA matches build',
  required_test_plan_completed: 'Required test plan completed',
  no_unresolved_critical_bugs: 'No unresolved critical bugs',
  high_bug_policy_satisfied: 'High bug policy satisfied',
  required_retests_completed: 'Required retests completed',
  evidence_upload_complete: 'Evidence upload complete',
  backup_status_acceptable: 'Backup status acceptable',
  restore_readiness_acceptable: 'Restore readiness acceptable',
  playwright_fingerprint_complete: 'Playwright fingerprint complete',
  security_checks_passed: 'Security checks passed',
  production_testing_permission_valid: 'Production testing permission valid',
  approval_not_expired: 'Approval not expired',
};

function statusDot(status: UatGateCheckStatus): string {
  switch (status) {
    case 'passed': return 'bg-green-500';
    case 'warning': return 'bg-amber-500';
    case 'failed': return 'bg-red-500';
    case 'not_applicable': return 'bg-foreground-300';
    case 'unknown': return 'bg-foreground-400';
  }
}

export default function ReleaseReviewPage() {
  const navigate = useNavigate();
  const { releaseId } = useParams<{ releaseId: string }>();
  const [showApprove, setShowApprove] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');

  const release = MOCK_CANDIDATE;
  const checks = MOCK_CHECKS;
  const blockingFailed = checks.filter((c) => c.blocking && c.status === 'failed');
  const warnings = checks.filter((c) => c.status === 'warning');

  // Mock webhook delivery record for approved releases
  const mockWebhookDelivery = release.status === 'approved_for_release' || release.status === 'released' ? {
    id: 'wh-approval-001',
    releaseCandidateId: release.id,
    approvalId: 'approval-001',
    eventType: 'release.approved' as const,
    endpointUrl: 'https://deploy.digitalfootprint.co.uk',
    status: 'delivered' as const,
    attemptCount: 1,
    lastAttemptAt: '2026-07-29T10:12:05Z',
    deliveredAt: '2026-07-29T10:12:05Z',
    responseStatusCode: 200,
    responseBodyPreview: '{"status":"received","event":"release.approved"}',
    safeError: null,
    nextRetryAt: null,
    requestId: 'req-abc123',
    idempotencyKey: `release-webhook:${release.id}:approval-001:release.approved`,
    bodyHash: 'a1b2c3d4e5f6...',
    createdAt: '2026-07-29T10:12:00Z',
    updatedAt: '2026-07-29T10:12:05Z',
  } : null;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-background-200/70">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-foreground-600 mb-2">
            <span className="hover:text-foreground-950 cursor-pointer whitespace-nowrap" onClick={() => navigate('/staff')}>Staff</span>
            <i className="ri-arrow-right-s-line w-3 h-3 flex items-center justify-center" />
            <span className="hover:text-foreground-950 cursor-pointer whitespace-nowrap" onClick={() => navigate('/staff/uat-agent')}>UAT Agent</span>
            <i className="ri-arrow-right-s-line w-3 h-3 flex items-center justify-center" />
            <span className="text-foreground-950 font-medium whitespace-nowrap">Release Review</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground-950">{release.releaseName}</h1>
              <p className="mt-0.5 text-sm text-foreground-600">
                Build <code className="text-xs bg-background-100 px-1 rounded">{release.targetBuildReference}</code> — Git SHA <code className="text-xs bg-background-100 px-1 rounded">{release.applicationGitSha.substring(0, 12)}</code>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                Review Required
              </span>
              <button
                onClick={() => setShowApprove(true)}
                disabled={blockingFailed.length > 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-check-line w-3.5 h-3.5 flex items-center justify-center" />
                Approve Release
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-red-200">
                <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center" />
                Reject Release
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-5xl space-y-6 pb-20">
        {/* AI vs Human */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-background-200/70 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="ri-brain-line text-amber-600 text-sm" />
              </div>
              <span className="text-xs font-semibold text-foreground-950">AI Recommendation</span>
            </div>
            <p className="text-sm font-medium text-amber-700 mb-1">Ready with Warnings</p>
            <p className="text-xs text-foreground-600">{release.aiRecommendationSummary}</p>
          </div>
          <div className="bg-white rounded-lg border border-background-200/70 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-foreground-100 flex items-center justify-center">
                <i className="ri-user-star-line text-foreground-600 text-sm" />
              </div>
              <span className="text-xs font-semibold text-foreground-950">Human Decision</span>
            </div>
            <p className="text-sm font-medium text-foreground-500 mb-1">Pending</p>
            <p className="text-xs text-foreground-600">Awaiting authorised staff review and approval.</p>
          </div>
        </div>

        {/* Locked Build Info */}
        <section>
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Locked Build Reference</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Release Name', value: release.releaseName },
                { label: 'Version', value: release.releaseVersion },
                { label: 'Build Reference', value: release.targetBuildReference },
                { label: 'Git SHA', value: release.applicationGitSha },
                { label: 'Branch', value: release.applicationBranch },
                { label: 'Environment', value: release.environment },
                { label: 'Test Plan Version', value: release.testPlanVersion },
                { label: 'Project', value: release.projectName },
                { label: 'Test Run', value: release.testRunId },
                { label: 'Created By', value: release.createdBy },
                { label: 'Created', value: new Date(release.createdAt).toLocaleDateString() },
                { label: 'Readiness Score', value: `${release.readinessScore}/100` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                  <p className="text-sm font-medium text-foreground-950 break-all font-mono">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Gate Checks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-950">Gate Checks ({checks.length})</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {checks.filter((c) => c.status === 'passed').length} passed
              </span>
              <span className="inline-flex items-center gap-1 text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {warnings.length} warnings
              </span>
              <span className="inline-flex items-center gap-1 text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {checks.filter((c) => c.status === 'failed').length} failed
              </span>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="divide-y divide-background-100">
              {checks.map((check) => (
                <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot(check.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground-950">{CHECK_LABELS[check.checkType] || check.checkType}</p>
                      {check.blocking && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium whitespace-nowrap">Blocking</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-600 mt-0.5">{check.safeSummary}</p>
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap px-2 py-0.5 rounded ${
                    check.status === 'passed' ? 'bg-green-50 text-green-700' :
                    check.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                    check.status === 'failed' ? 'bg-red-50 text-red-700' :
                    'bg-foreground-100 text-foreground-500'
                  }`}>
                    {check.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bug summary */}
        <section>
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Bug Summary</h2>
          <div className="bg-white rounded-lg border border-background-200/70 p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Critical', count: release.criticalBugCount, color: 'text-red-600' },
                { label: 'High', count: release.highBugCount, color: 'text-orange-600' },
                { label: 'Medium', count: release.mediumBugCount, color: 'text-amber-600' },
                { label: 'Low', count: release.lowBugCount, color: 'text-foreground-600' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-foreground-500">{item.label}</p>
                  <p className={`text-lg font-semibold ${item.color}`}>{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audit Timeline */}
        <section>
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Audit Timeline</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="divide-y divide-background-100">
              {AUDIT_TIMELINE.map((entry, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-background-100 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="ri-record-circle-line text-foreground-500 text-xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground-950">{entry.event.replace(/_/g, ' ')}</p>
                      <span className="text-xs text-foreground-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-foreground-600">
                      <span className="font-medium">{entry.actor}</span> — {entry.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Webhook Delivery */}
        {mockWebhookDelivery && (
          <section>
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Deployment Webhook</h2>
            <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-3 h-3 rounded-full ${
                    mockWebhookDelivery.status === 'delivered' || mockWebhookDelivery.status === 'acknowledged' ? 'bg-green-500' :
                    mockWebhookDelivery.status === 'delivery_failed' || mockWebhookDelivery.status === 'max_retries_exceeded' ? 'bg-red-500' :
                    'bg-amber-500'
                  }`} />
                  <span className="text-sm font-semibold text-foreground-950">
                    {mockWebhookDelivery.status === 'delivered' ? 'Webhook Delivered' :
                     mockWebhookDelivery.status === 'acknowledged' ? 'Webhook Acknowledged' :
                     mockWebhookDelivery.status === 'delivery_failed' ? 'Delivery Failed' :
                     mockWebhookDelivery.status}
                  </span>
                  <span className="text-xs text-foreground-500">
                    — {new Date(mockWebhookDelivery.lastAttemptAt || '').toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: 'Event', value: mockWebhookDelivery.eventType },
                    { label: 'Endpoint', value: mockWebhookDelivery.endpointUrl },
                    { label: 'Status Code', value: String(mockWebhookDelivery.responseStatusCode || '—') },
                    { label: 'Attempts', value: String(mockWebhookDelivery.attemptCount) },
                    { label: 'Request ID', value: mockWebhookDelivery.requestId },
                    { label: 'Idempotency Key', value: mockWebhookDelivery.idempotencyKey },
                    { label: 'Signing', value: 'HMAC-SHA256 v1' },
                    { label: 'Response', value: mockWebhookDelivery.responseBodyPreview || '—' },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-foreground-500 block mb-0.5">{item.label}</span>
                      <span className="text-foreground-950 font-medium font-mono break-all">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-accent-50 border border-accent-200 rounded-md p-3">
                  <p className="text-xs text-accent-700">
                    <i className="ri-information-line w-3 h-3 inline-flex items-center justify-center mr-1" />
                    This signed webhook was dispatched to notify the deployment system. The webhook does not deploy automatically — the deployment system verifies the HMAC-SHA256 signature and decides the appropriate action.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Actions */}
        <section>
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Request Retest', icon: 'ri-loop-left-line' },
              { label: 'Accept Risk', icon: 'ri-shield-flash-line' },
              { label: 'Generate Sign-Off Report', icon: 'ri-file-download-line' },
            ].map((btn) => (
              <button key={btn.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className={`${btn.icon} w-3.5 h-3.5 flex items-center justify-center`} />
                {btn.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Approval Dialog */}
      {showApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-background-200/70">
              <h3 className="text-sm font-semibold text-foreground-950">Approve Release — {release.releaseName}</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-background-100 rounded-md p-3 text-xs space-y-1">
                <p><span className="text-foreground-500">Build:</span> <span className="font-mono text-foreground-950">{release.targetBuildReference}</span></p>
                <p><span className="text-foreground-500">Git SHA:</span> <span className="font-mono text-foreground-950">{release.applicationGitSha}</span></p>
                <p><span className="text-foreground-500">Blocking Issues:</span> <span className="text-red-600 font-medium">{blockingFailed.length}</span></p>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground-950 block mb-1">Decision Note (required)</label>
                <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Your review summary and reason for approval..." maxLength={500} rows={3} className="w-full text-xs border border-background-200/70 rounded-md px-3 py-2 bg-white text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none" />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={approvalChecked} onChange={(e) => setApprovalChecked(e.target.checked)} className="mt-0.5 accent-primary-500" />
                <span className="text-xs text-foreground-700">I confirm that I have reviewed the UAT results, evidence, unresolved risks and exact build reference shown above.</span>
              </label>
            </div>
            <div className="p-5 border-t border-background-200/70 flex items-center justify-end gap-2">
              <button onClick={() => setShowApprove(false)} className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors">Cancel</button>
              <button disabled={!approvalChecked || !decisionNote.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Confirm Approval</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}