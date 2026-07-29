import { useState } from 'react';
import type { UatBug, UatBugStatus, UpdateUatBugPayload } from '@/types/uat';

interface Props {
  bug: UatBug;
  onClose: () => void;
  onUpdate: (payload: UpdateUatBugPayload) => void;
}

const severityStyles: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-secondary-100 text-secondary-700 border-secondary-200',
};

export default function BugDetailDrawer({ bug, onClose, onUpdate }: Props) {
  const [staffNotes, setStaffNotes] = useState(bug.staffNotes);
  const [assignedTo, setAssignedTo] = useState(bug.assignedTo || '');

  const handleStatusChange = (status: UatBugStatus) => {
    onUpdate({ id: bug.id, status });
  };

  const handleSaveNotes = () => {
    onUpdate({ id: bug.id, staffNotes, assignedTo: assignedTo || null });
  };

  const statusOptions: { value: UatBugStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
    { value: 'false_positive', label: 'False Positive' },
    { value: 'risk_accepted', label: 'Risk Accepted' },
  ];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white border-l border-background-200/70 overflow-y-auto shadow-lg">
        <div className="sticky top-0 bg-white border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold text-foreground-950">Bug #{bug.id}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Title and badges */}
          <div>
            <h4 className="text-base font-semibold text-foreground-950 mb-2">{bug.title}</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${severityStyles[bug.severity]}`}>
                {bug.severity.toUpperCase()}
              </span>
              <span className="text-xs text-foreground-600">Confidence: {(bug.confidence * 100).toFixed(0)}%</span>
              <span className="text-xs bg-background-100 px-2 py-0.5 rounded whitespace-nowrap">{bug.category}</span>
            </div>
          </div>

          {/* Status control */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-2">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer whitespace-nowrap transition-colors ${
                    bug.status === opt.value
                      ? 'bg-primary-100 text-primary-700 border-primary-300'
                      : 'bg-white text-foreground-600 border-background-200/70 hover:bg-background-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Expected vs Actual */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-green-50 border border-green-200">
              <p className="text-xs font-medium text-green-700 mb-1">Expected Result</p>
              <p className="text-xs text-foreground-700">{bug.expectedResult}</p>
            </div>
            <div className="p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-700 mb-1">Actual Result</p>
              <p className="text-xs text-foreground-700">{bug.actualResult}</p>
            </div>
          </div>

          {/* Reproduction Steps */}
          <div>
            <p className="text-xs font-medium text-foreground-700 mb-2">Reproduction Steps</p>
            <ol className="space-y-1">
              {bug.reproductionSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground-700">
                  <span className="w-5 h-5 rounded-full bg-background-100 flex items-center justify-center text-xs font-medium shrink-0">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-foreground-500">Page URL:</span>
              <p className="text-foreground-700 font-mono break-all mt-0.5">{bug.pageUrl}</p>
            </div>
            <div>
              <span className="text-foreground-500">Browser / Device:</span>
              <p className="text-foreground-700">{bug.browser} · {bug.device}</p>
            </div>
            <div>
              <span className="text-foreground-500">First Detected:</span>
              <p className="text-foreground-700">{new Date(bug.firstDetected).toLocaleString('en-GB')}</p>
            </div>
            <div>
              <span className="text-foreground-500">Last Detected:</span>
              <p className="text-foreground-700">{new Date(bug.lastDetected).toLocaleString('en-GB')}</p>
            </div>
            <div>
              <span className="text-foreground-500">Occurrences:</span>
              <p className="text-foreground-700">{bug.occurrenceCount}</p>
            </div>
            <div>
              <span className="text-foreground-500">Linked Run:</span>
              <p className="text-foreground-700">{bug.linkedRunName}</p>
            </div>
            {bug.accessibilityRule && (
              <div className="col-span-2">
                <span className="text-foreground-500">Accessibility Rule:</span>
                <p className="text-foreground-700 mt-0.5">{bug.accessibilityRule}</p>
              </div>
            )}
          </div>

          {/* Console errors */}
          {bug.consoleErrors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground-700 mb-2">Console Errors</p>
              <div className="space-y-1">
                {bug.consoleErrors.map((err, i) => (
                  <div key={i} className="p-2 rounded bg-red-50 border border-red-100 text-xs font-mono text-red-700 break-all">
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed requests */}
          {bug.failedRequests.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground-700 mb-2">Failed Network Requests</p>
              <div className="space-y-1">
                {bug.failedRequests.map((req, i) => (
                  <div key={i} className="p-2 rounded bg-amber-50 border border-amber-100 text-xs">
                    <span className="font-medium">{req.method}</span> {req.url} — <span className="text-red-600">{req.statusCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Recommendation */}
          <div>
            <p className="text-xs font-medium text-foreground-700 mb-2">Agent Recommendation</p>
            <div className="p-3 rounded-md bg-accent-50 border border-accent-200 text-xs text-foreground-700">
              {bug.agentRecommendation}
            </div>
          </div>

          {/* Staff Notes and Assignment */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1">Assign to</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md mb-3 focus:outline-none focus:border-primary-300 cursor-pointer"
            >
              <option value="">Unassigned</option>
              <option value="Alex Kumar">Alex Kumar</option>
              <option value="Jordan Park">Jordan Park</option>
              <option value="Sarah Chen">Sarah Chen</option>
              <option value="Marcus Webb">Marcus Webb</option>
            </select>

            <label className="block text-xs font-medium text-foreground-700 mb-1">Staff Notes</label>
            <textarea
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              maxLength={500}
              className="w-full px-3 py-2 text-sm border border-background-200/70 rounded-md resize-none focus:outline-none focus:border-primary-300 h-20"
              placeholder="Add your notes here..."
            />
            <p className="text-xs text-foreground-500 text-right mt-1">{staffNotes.length}/500</p>

            <button
              onClick={handleSaveNotes}
              className="mt-2 px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}