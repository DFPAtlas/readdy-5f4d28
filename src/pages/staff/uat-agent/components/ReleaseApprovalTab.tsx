import { useState } from 'react';
import type { UatReleaseDashboardEntry, UatReleaseState, UatAiRecommendation, ReleaseWebhookDeliveryStatus } from '@/types/uat';

// ============================================================
// Mock release candidates for demo
// ============================================================

interface MockReleaseEntry extends UatReleaseDashboardEntry {
  webhookStatus?: ReleaseWebhookDeliveryStatus;
  webhookAttemptCount?: number;
}

const MOCK_RELEASES: MockReleaseEntry[] = [
  {
    releaseId: 'rel-v2-4-1',
    releaseName: 'DFP Tester v2.4.1',
    releaseVersion: '2.4.1',
    buildReference: 'v2.4.1-rc3',
    gitSha: 'a3f8c2e1d9b4',
    testRunId: 'run-active',
    status: 'review_required',
    readinessScore: 72,
    aiRecommendation: 'ready_with_warnings',
    blockingIssues: 1,
    warningCount: 3,
    requiredRetests: 2,
    latestDecision: null,
    approvedBy: null,
    approvalExpiry: null,
    createdAt: '2026-07-29T10:00:00Z',
    webhookStatus: undefined,
  },
  {
    releaseId: 'rel-v2-4-0',
    releaseName: 'DFP Tester v2.4.0',
    releaseVersion: '2.4.0',
    buildReference: 'v2.4.0-final',
    gitSha: 'b7d1a5f3e2c8',
    testRunId: 'run-smoke-latest',
    status: 'approved_for_release',
    readinessScore: 95,
    aiRecommendation: 'ready_for_human_review',
    blockingIssues: 0,
    warningCount: 0,
    requiredRetests: 0,
    latestDecision: 'approve',
    approvedBy: 'Sarah Chen',
    approvalExpiry: '2026-08-01T10:12:00Z',
    createdAt: '2026-07-28T09:45:00Z',
    webhookStatus: 'delivered',
    webhookAttemptCount: 1,
  },
  {
    releaseId: 'rel-v2-3-5',
    releaseName: 'DFP Tester v2.3.5',
    releaseVersion: '2.3.5',
    buildReference: 'v2.3.5-final',
    gitSha: 'e4f6a8c1d2b3',
    testRunId: 'run-failed-release',
    status: 'release_rejected',
    readinessScore: 42,
    aiRecommendation: 'not_ready',
    blockingIssues: 3,
    warningCount: 5,
    requiredRetests: 4,
    latestDecision: 'reject',
    approvedBy: 'Marcus Webb',
    approvalExpiry: null,
    createdAt: '2026-07-27T14:00:00Z',
    webhookStatus: 'delivered',
    webhookAttemptCount: 1,
  },
];

const AI_LABELS: Record<UatAiRecommendation, string> = {
  not_ready: 'Not Ready',
  ready_with_warnings: 'Ready with Warnings',
  ready_for_human_review: 'Ready for Human Review',
};

const WEBHOOK_STATUS_MAP: Record<ReleaseWebhookDeliveryStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: 'text-foreground-500', icon: 'ri-mail-line' },
  sending: { label: 'Sending', color: 'text-amber-600', icon: 'ri-mail-send-line' },
  delivered: { label: 'Delivered', color: 'text-green-600', icon: 'ri-check-double-line' },
  delivery_failed: { label: 'Failed', color: 'text-red-600', icon: 'ri-mail-close-line' },
  retrying: { label: 'Retrying', color: 'text-amber-600', icon: 'ri-refresh-line' },
  max_retries_exceeded: { label: 'Max Retries', color: 'text-red-600', icon: 'ri-error-warning-line' },
  acknowledged: { label: 'Acknowledged', color: 'text-green-600', icon: 'ri-check-double-line' },
};

const STATUS_BADGES: Record<UatReleaseState, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-foreground-100 text-foreground-600' },
  testing: { label: 'Testing', color: 'bg-secondary-100 text-secondary-700' },
  review_required: { label: 'Review Required', color: 'bg-amber-100 text-amber-700' },
  not_ready: { label: 'Not Ready', color: 'bg-red-100 text-red-700' },
  ready_with_warnings: { label: 'Ready with Warnings', color: 'bg-amber-100 text-amber-700' },
  ready_for_approval: { label: 'Ready for Approval', color: 'bg-green-100 text-green-700' },
  approval_pending: { label: 'Approval Pending', color: 'bg-accent-100 text-accent-700' },
  approved_for_release: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  release_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  risk_acceptance_required: { label: 'Risk Acceptance Required', color: 'bg-orange-100 text-orange-700' },
  risk_accepted: { label: 'Risk Accepted', color: 'bg-accent-100 text-accent-700' },
  approval_expired: { label: 'Approval Expired', color: 'bg-foreground-100 text-foreground-600' },
  approval_invalidated: { label: 'Invalidated', color: 'bg-red-100 text-red-700' },
  released: { label: 'Released', color: 'bg-green-100 text-green-700' },
  release_failed: { label: 'Release Failed', color: 'bg-red-100 text-red-700' },
  rolled_back: { label: 'Rolled Back', color: 'bg-amber-100 text-amber-700' },
};

export default function ReleaseApprovalTab() {
  const [releases] = useState<MockReleaseEntry[]>(MOCK_RELEASES);
  const [selectedRelease, setSelectedRelease] = useState<MockReleaseEntry | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [webhookDialogRelease, setWebhookDialogRelease] = useState<MockReleaseEntry | null>(null);

  const handleApprove = (release: MockReleaseEntry) => {
    setSelectedRelease(release);
    setApprovalChecked(false);
    setWarningAcknowledged(false);
    setDecisionNote('');
    setShowApprovalDialog(true);
  };

  const handleReject = (release: MockReleaseEntry) => {
    setSelectedRelease(release);
    setDecisionNote('');
    setShowRejectionDialog(true);
  };

  const handleConfirmApproval = () => {
    setShowApprovalDialog(false);
    // Simulate webhook dispatch
    const updated = [...releases];
    const idx = updated.findIndex((r) => r.releaseId === selectedRelease?.releaseId);
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        status: 'approved_for_release',
        latestDecision: 'approve',
        approvedBy: 'Current User',
        approvalExpiry: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        webhookStatus: 'delivered',
        webhookAttemptCount: 1,
      };
    }
    setSelectedRelease(null);
  };

  const handleConfirmRejection = () => {
    setShowRejectionDialog(false);
    const updated = [...releases];
    const idx = updated.findIndex((r) => r.releaseId === selectedRelease?.releaseId);
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        status: 'release_rejected',
        latestDecision: 'reject',
        approvedBy: 'Current User',
        webhookStatus: 'delivered',
        webhookAttemptCount: 1,
      };
    }
    setSelectedRelease(null);
  };

  const getWebhookStatusEl = (r: MockReleaseEntry) => {
    if (!r.webhookStatus) return <span className="text-xs text-foreground-400 whitespace-nowrap">—</span>;
    const info = WEBHOOK_STATUS_MAP[r.webhookStatus];
    if (!info) return <span className="text-xs text-foreground-400 whitespace-nowrap">—</span>;
    return (
      <button
        onClick={() => { setWebhookDialogRelease(r); setShowWebhookDialog(true); }}
        className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer hover:underline ${info.color}`}
        title={`${r.webhookAttemptCount ? r.webhookAttemptCount + ' attempt(s) — click for details' : 'Click for delivery details'}`}
      >
        <i className={`${info.icon} w-3 h-3 flex items-center justify-center`} />
        {info.label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground-950">Release Approval</h2>
          <p className="text-xs text-foreground-600 mt-0.5">
            AI recommends — humans decide. Only authorised staff may approve production releases.
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap transition-colors">
          <i className="ri-add-line w-3.5 h-3.5 flex items-center justify-center" />
          Create Release Candidate
        </button>
      </div>

      {/* Release list */}
      <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Release</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Version / Build</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Git SHA</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">AI Recommendation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Human Decision</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Blocking</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Webhook</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const statusBadge = STATUS_BADGES[r.status] || { label: r.status, color: 'bg-foreground-100 text-foreground-600' };
                return (
                  <tr key={r.releaseId} className="border-b border-background-100 hover:bg-background-50">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-foreground-950 whitespace-nowrap">{r.releaseName}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-foreground-700 font-mono whitespace-nowrap">{r.releaseVersion} / {r.buildReference}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-foreground-500 font-mono whitespace-nowrap">{r.gitSha.substring(0, 8)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs whitespace-nowrap ${
                        r.aiRecommendation === 'ready_for_human_review' ? 'text-green-600 font-medium' :
                        r.aiRecommendation === 'ready_with_warnings' ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {r.aiRecommendation ? AI_LABELS[r.aiRecommendation] : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.latestDecision ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium whitespace-nowrap ${r.latestDecision === 'approve' ? 'text-green-600' : 'text-red-600'}`}>
                            {r.latestDecision === 'approve' ? 'Approved' : 'Rejected'}
                          </span>
                          {r.approvedBy && (
                            <span className="text-xs text-foreground-500 whitespace-nowrap">by {r.approvedBy}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground-400 whitespace-nowrap">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-background-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.readinessScore >= 80 ? 'bg-green-500' : r.readinessScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${r.readinessScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-foreground-700 whitespace-nowrap">{r.readinessScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium whitespace-nowrap ${r.blockingIssues > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {r.blockingIssues > 0 ? `${r.blockingIssues} blocking` : 'None'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {getWebhookStatusEl(r)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {(r.status === 'review_required' || r.status === 'ready_with_warnings' || r.status === 'ready_for_approval' || r.status === 'approval_pending') && (
                          <>
                            <button
                              onClick={() => handleApprove(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded cursor-pointer whitespace-nowrap transition-colors"
                            >
                              <i className="ri-check-line w-3 h-3 flex items-center justify-center" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded cursor-pointer whitespace-nowrap transition-colors border border-red-200"
                            >
                              <i className="ri-close-line w-3 h-3 flex items-center justify-center" />
                              Reject
                            </button>
                          </>
                        )}
                        {r.status === 'approved_for_release' && (
                          <button className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded cursor-pointer whitespace-nowrap transition-colors border border-amber-200">
                            <i className="ri-arrow-go-back-line w-3 h-3 flex items-center justify-center" />
                            Withdraw
                          </button>
                        )}
                        <button className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground-600 bg-background-100 hover:bg-background-200/70 rounded cursor-pointer whitespace-nowrap transition-colors">
                          <i className="ri-file-list-3-line w-3 h-3 flex items-center justify-center" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-background-200/70 p-4">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <i className="ri-alert-line text-amber-600 text-xs" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground-950 mb-1">AI Recommendation</p>
              <p className="text-xs text-foreground-600">
                AI analysis is advisory only. AI may return <code className="text-xs bg-background-100 px-1 rounded">not_ready</code>, <code className="text-xs bg-background-100 px-1 rounded">ready_with_warnings</code>, or <code className="text-xs bg-background-100 px-1 rounded">ready_for_human_review</code>. AI can never set <code className="text-xs bg-background-100 px-1 rounded">approved_for_release</code> or <code className="text-xs bg-background-100 px-1 rounded">released</code>.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-background-200/70 p-4">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <i className="ri-user-star-line text-green-600 text-xs" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground-950 mb-1">Human Decision</p>
              <p className="text-xs text-foreground-600">
                Only authorised staff with release-approval permission may approve. Approval locks to exact build and Git SHA. Separation of duties is enforced — the release creator cannot be the final approver.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-background-200/70 p-4">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-accent-100 flex items-center justify-center shrink-0 mt-0.5">
              <i className="ri-webhook-line text-accent-600 text-xs" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground-950 mb-1">Deployment Webhook</p>
              <p className="text-xs text-foreground-600">
                On approval, a signed <code className="text-xs bg-background-100 px-1 rounded">release.approved</code> event is dispatched to the deployment system with build reference, Git SHA, and approval metadata. Uses HMAC-SHA256 signing. The webhook notifies — it does not deploy automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Dialog */}
      {showApprovalDialog && selectedRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-background-200/70">
              <h3 className="text-sm font-semibold text-foreground-950">Approve Release</h3>
              <p className="text-xs text-foreground-600 mt-0.5">Review the locked build details and confirm your decision. A signed webhook will be dispatched on approval.</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Build lock info */}
              <div className="bg-background-100 rounded-md p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground-950">Locked Build Reference</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Release', value: selectedRelease.releaseName },
                    { label: 'Version', value: selectedRelease.releaseVersion },
                    { label: 'Build', value: selectedRelease.buildReference },
                    { label: 'Git SHA', value: selectedRelease.gitSha },
                    { label: 'Test Run', value: selectedRelease.testRunId },
                    { label: 'Score', value: `${selectedRelease.readinessScore}/100` },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-foreground-500">{item.label}</span>
                      <span className="text-foreground-950 font-medium ml-1">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gate check summary */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground-950">Gate Check Summary</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Blocking Issues', value: selectedRelease.blockingIssues, fail: selectedRelease.blockingIssues > 0 },
                    { label: 'Warnings', value: selectedRelease.warningCount, fail: false },
                    { label: 'Required Retests', value: selectedRelease.requiredRetests, fail: selectedRelease.requiredRetests > 0 },
                    { label: 'AI Recommendation', value: selectedRelease.aiRecommendation ? AI_LABELS[selectedRelease.aiRecommendation] : '—', fail: false },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.fail ? 'bg-red-500' : 'bg-green-500'}`} />
                      <span className="text-xs text-foreground-600">{item.label}:</span>
                      <span className="text-xs font-medium text-foreground-950">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Webhook preview */}
              <div className="bg-accent-50 border border-accent-200 rounded-md p-3">
                <div className="flex items-center gap-2 mb-1">
                  <i className="ri-webhook-line text-accent-600 text-sm w-4 h-4 flex items-center justify-center" />
                  <span className="text-xs font-semibold text-accent-800">Deployment Webhook</span>
                </div>
                <p className="text-xs text-accent-700">
                  On confirmation, a signed <code className="text-xs bg-accent-100 px-1 rounded">release.approved</code> event will be dispatched to the configured deployment endpoint. The webhook does not deploy automatically — it only notifies.
                </p>
              </div>

              {/* Warning acknowledgement */}
              {selectedRelease.warningCount > 0 && (
                <label className="flex items-start gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-md p-3">
                  <input
                    type="checkbox"
                    checked={warningAcknowledged}
                    onChange={(e) => setWarningAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span className="text-xs text-amber-800">
                    I acknowledge the {selectedRelease.warningCount} warning(s) present in this release and accept the associated risk.
                  </span>
                </label>
              )}

              {/* Decision note */}
              <div>
                <label className="text-xs font-medium text-foreground-950 block mb-1">Decision Note (required)</label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Describe your review findings and reason for approval..."
                  maxLength={500}
                  rows={3}
                  className="w-full text-xs border border-background-200/70 rounded-md px-3 py-2 bg-white text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
                />
              </div>

              {/* Final confirmation */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approvalChecked}
                  onChange={(e) => setApprovalChecked(e.target.checked)}
                  className="mt-0.5 accent-primary-500"
                />
                <span className="text-xs text-foreground-700">
                  I confirm that I have reviewed the UAT results, evidence, unresolved risks and exact build reference shown above.
                </span>
              </label>

              {/* Approval expiry info */}
              <div className="bg-green-50 border border-green-200 rounded-md p-2.5">
                <p className="text-xs text-green-700">
                  <i className="ri-time-line w-3 h-3 inline-flex items-center justify-center mr-1" />
                  This approval will expire in 72 hours or when a new build is pushed. A signed deployment webhook will be dispatched immediately.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-background-200/70 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowApprovalDialog(false); setSelectedRelease(null); }}
                className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproval}
                disabled={!approvalChecked || !decisionNote.trim() || (selectedRelease.warningCount > 0 && !warningAcknowledged)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Approval &amp; Dispatch Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Dialog */}
      {showRejectionDialog && selectedRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-lg mx-4">
            <div className="p-5 border-b border-background-200/70">
              <h3 className="text-sm font-semibold text-foreground-950">Reject Release</h3>
              <p className="text-xs text-foreground-600 mt-0.5">Provide a reason and required fixes. Test results and evidence are preserved.</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-background-100 rounded-md p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Release', value: selectedRelease.releaseName },
                    { label: 'Build', value: selectedRelease.buildReference },
                    { label: 'Git SHA', value: selectedRelease.gitSha },
                    { label: 'Score', value: `${selectedRelease.readinessScore}/100` },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-foreground-500">{item.label}</span>
                      <span className="text-foreground-950 font-medium ml-1">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-950 block mb-1">Rejection Reason (required)</label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Why is this release being rejected? What fixes are required?"
                  maxLength={500}
                  rows={3}
                  className="w-full text-xs border border-background-200/70 rounded-md px-3 py-2 bg-white text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-red-300 resize-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-background-200/70 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowRejectionDialog(false); setSelectedRelease(null); }}
                className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejection}
                disabled={!decisionNote.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Delivery Details Dialog */}
      {showWebhookDialog && webhookDialogRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-md mx-4">
            <div className="p-5 border-b border-background-200/70">
              <h3 className="text-sm font-semibold text-foreground-950">Webhook Delivery — {webhookDialogRelease.releaseName}</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: 'Event', value: 'release.approved' },
                  { label: 'Status', value: WEBHOOK_STATUS_MAP[webhookDialogRelease.webhookStatus || 'pending']?.label || 'Unknown' },
                  { label: 'Attempts', value: String(webhookDialogRelease.webhookAttemptCount || 0) },
                  { label: 'Endpoint', value: 'https://deploy.digitalfootprint.co.uk' },
                  { label: 'Signing', value: 'HMAC-SHA256 v1' },
                  { label: 'Request ID', value: 'req-m29kf8x1-a2b3c4d5' },
                  { label: 'Body Hash', value: 'a1b2c3...e5f6' },
                  { label: 'Response', value: 'HTTP 200 (preview unavailable)' },
                ].map((item) => (
                  <div key={item.label}>
                    <span className="text-foreground-500 block">{item.label}</span>
                    <span className="text-foreground-950 font-medium font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-background-100 rounded-md p-3">
                <p className="text-xs font-medium text-foreground-950 mb-1">Payload (safe preview)</p>
                <pre className="text-xs text-foreground-600 font-mono whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
{`{
  "event": "release.approved",
  "releaseCandidateId": "${webhookDialogRelease.releaseId}",
  "buildReference": "${webhookDialogRelease.buildReference}",
  "gitSha": "${webhookDialogRelease.gitSha}",
  "approvedBy": "${webhookDialogRelease.approvedBy || 'Current User'}",
  "timestamp": "${new Date().toISOString()}"
}`}
                </pre>
                <p className="text-xs text-foreground-500 mt-2">Credentials, tokens, and private URLs are never included in the payload.</p>
              </div>
            </div>
            <div className="p-5 border-t border-background-200/70 flex items-center justify-end">
              <button
                onClick={() => { setShowWebhookDialog(false); setWebhookDialogRelease(null); }}
                className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}