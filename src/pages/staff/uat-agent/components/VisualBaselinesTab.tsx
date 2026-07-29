import { useState, useEffect } from 'react';
import type { UatVisualBaseline, UatComparisonMode } from '@/types/uat';
import { listVisualBaselines, approveVisualBaseline } from '@/services/uatAgentService';

const statusStyles: Record<string, string> = {
  approved: 'bg-green-100 text-green-700 border-green-200',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export default function VisualBaselinesTab() {
  const [baselines, setBaselines] = useState<UatVisualBaseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<UatComparisonMode>('side_by_side');
  const [approveDialog, setApproveDialog] = useState<{ id: string; note: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBaselines = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVisualBaselines();
      setBaselines(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load baselines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBaselines(); }, []);

  const handleApprove = async () => {
    if (!approveDialog) return;
    try {
      const updated = await approveVisualBaseline(approveDialog.id, approveDialog.note);
      setBaselines((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setApproveDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  const filtered = statusFilter ? baselines.filter((b) => b.status === statusFilter) : baselines;

  if (loading) {
    return <div className="py-4 space-y-4 animate-pulse">
      {[1,2,3].map((i) => <div key={i} className="bg-white rounded-lg border border-background-200/70 h-40" />)}
    </div>;
  }

  if (error) {
    return <div className="text-center py-16"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={fetchBaselines} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">Retry</button></div>;
  }

  return (
    <div className="space-y-4 py-4">
      {/* Filter + comparison mode toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer">
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending_review">Pending Review</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs text-foreground-600">{filtered.length} baseline{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1 bg-background-100 rounded-full p-0.5">
          {(['side_by_side', 'overlay', 'slider'] as UatComparisonMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setComparisonMode(mode)}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                comparisonMode === mode ? 'bg-white text-foreground-950 shadow-sm' : 'text-foreground-600 hover:text-foreground-950'
              }`}
            >
              {mode === 'side_by_side' ? 'Side by Side' : mode === 'overlay' ? 'Overlay' : 'Slider'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-background-200/70">
          <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
            <i className="ri-contrast-2-line text-foreground-400 text-xl" />
          </div>
          <p className="text-sm text-foreground-950 font-medium">No visual baselines</p>
          <p className="text-xs text-foreground-600">Baselines are created during test runs with visual comparison enabled.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((baseline) => (
            <div key={baseline.id} className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-background-200/70 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground-950">
                    {baseline.journeyName} — {baseline.stepName}
                  </h4>
                  <p className="text-xs text-foreground-600 mt-0.5">
                    {baseline.browser} · {baseline.viewport} · Diff: {baseline.differencePercentage}%
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusStyles[baseline.status]}`}>
                  {baseline.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Comparison */}
              <div className="p-5">
                {comparisonMode === 'side_by_side' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-foreground-600 mb-1">Baseline (Approved)</p>
                      <div className="rounded-md border border-background-200/70 overflow-hidden">
                        <img src={baseline.baselineUrl} alt="Baseline" className="w-full h-40 object-cover object-top" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground-600 mb-1">Current</p>
                      <div className="rounded-md border border-background-200/70 overflow-hidden">
                        <img src={baseline.currentUrl} alt="Current" className="w-full h-40 object-cover object-top" />
                      </div>
                    </div>
                  </div>
                ) : comparisonMode === 'overlay' ? (
                  <div className="relative rounded-md border border-background-200/70 overflow-hidden">
                    <div className="absolute inset-0 opacity-50">
                      <img src={baseline.baselineUrl} alt="Baseline" className="w-full h-40 object-cover object-top" />
                    </div>
                    <img src={baseline.currentUrl} alt="Current" className="w-full h-40 object-cover object-top opacity-50" />
                  </div>
                ) : (
                  <div className="rounded-md border border-background-200/70 overflow-hidden relative">
                    <div className="absolute inset-0 w-1/2 overflow-hidden border-r-2 border-primary-500">
                      <img src={baseline.baselineUrl} alt="Baseline" className="w-full h-40 object-cover object-top" />
                    </div>
                    <img src={baseline.currentUrl} alt="Current" className="w-full h-40 object-cover object-top" />
                  </div>
                )}

                {/* Difference indicator */}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-1.5 bg-background-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(baseline.differencePercentage, 100)}%`,
                        background: baseline.differencePercentage < 1 ? '#22c55e' : baseline.differencePercentage < 5 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground-950 whitespace-nowrap">{baseline.differencePercentage}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-t border-background-200/70 flex items-center gap-2 flex-wrap">
                {baseline.status === 'pending_review' && (
                  <>
                    <button
                      onClick={() => setApproveDialog({ id: baseline.id, note: '' })}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Approve New Baseline
                    </button>
                    <button className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 cursor-pointer whitespace-nowrap">
                      Reject
                    </button>
                  </>
                )}
                {baseline.approvedBy && (
                  <p className="text-xs text-foreground-600 whitespace-nowrap">
                    Approved by {baseline.approvedBy} on {baseline.approvedAt ? new Date(baseline.approvedAt).toLocaleDateString('en-GB') : '—'}
                  </p>
                )}
              </div>

              {/* Approval history */}
              {baseline.approvalHistory.length > 0 && (
                <div className="px-5 py-3 border-t border-background-200/70 bg-background-50">
                  <p className="text-xs font-medium text-foreground-700 mb-2">Approval History</p>
                  <div className="space-y-1">
                    {baseline.approvalHistory.map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground-600">
                          {h.approvedBy} — {h.action}
                        </span>
                        <span className="text-foreground-500">{new Date(h.approvedAt).toLocaleDateString('en-GB')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve dialog */}
      {approveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-md">
            <div className="px-5 py-4 border-b border-background-200/70">
              <h3 className="text-sm font-semibold text-foreground-950">Approve New Baseline</h3>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-foreground-700 mb-1">Audit Note (required)</label>
              <textarea
                value={approveDialog.note}
                onChange={(e) => setApproveDialog({ ...approveDialog, note: e.target.value })}
                maxLength={500}
                className="w-full px-3 py-2 text-sm border border-background-200/70 rounded-md resize-none focus:outline-none focus:border-primary-300 h-20"
                placeholder="Describe why this baseline is being approved..."
              />
              <p className="text-xs text-foreground-500 text-right mt-1">{approveDialog.note.length}/500</p>
            </div>
            <div className="px-5 py-3 border-t border-background-200/70 flex items-center justify-end gap-2">
              <button onClick={() => setApproveDialog(null)} className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 rounded-md border border-background-200/70 cursor-pointer whitespace-nowrap">Cancel</button>
              <button onClick={handleApprove} className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap">Confirm Approval</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}