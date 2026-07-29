import type { UatDashboard } from '@/types/uat';

interface Props {
  readiness: UatDashboard['releaseReadiness'];
}

export default function ReleaseReadinessCard({ readiness }: Props) {
  const statusConfig = {
    ready: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Ready', icon: 'ri-check-line' },
    ready_with_warnings: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Ready with Warnings', icon: 'ri-alert-line' },
    not_ready: { color: 'bg-red-100 text-red-700 border-red-200', label: 'Not Ready', icon: 'ri-close-line' },
    blocked: { color: 'bg-red-200 text-red-800 border-red-300', label: 'Blocked', icon: 'ri-forbid-line' },
  };

  const config = statusConfig[readiness.status];

  const scoreColor = readiness.score >= 80 ? 'text-green-600' : readiness.score >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200/70">
        <h3 className="text-sm font-semibold text-foreground-950">Release Readiness</h3>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-4 mb-4">
          {/* Score ring */}
          <div className="relative w-16 h-16 shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-background-100" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(readiness.score / 100) * 175.93} 175.93`}
                className={scoreColor}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor}`}>
              {readiness.score}
            </span>
          </div>
          <div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium border ${config.color}`}>
              <i className={`${config.icon} w-3 h-3 flex items-center justify-center`} />
              {config.label}
            </span>
            {readiness.blockingIssues > 0 && (
              <p className="text-xs text-red-600 mt-1 whitespace-nowrap">
                {readiness.blockingIssues} blocking issue{readiness.blockingIssues !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Bug breakdown */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 rounded-md bg-red-50">
            <p className="text-lg font-semibold text-red-700">{readiness.criticalCount}</p>
            <p className="text-xs text-red-600">Critical</p>
          </div>
          <div className="text-center p-2 rounded-md bg-orange-50">
            <p className="text-lg font-semibold text-orange-700">{readiness.highCount}</p>
            <p className="text-xs text-orange-600">High</p>
          </div>
          <div className="text-center p-2 rounded-md bg-amber-50">
            <p className="text-lg font-semibold text-amber-700">{readiness.mediumCount}</p>
            <p className="text-xs text-amber-600">Medium</p>
          </div>
          <div className="text-center p-2 rounded-md bg-secondary-50">
            <p className="text-lg font-semibold text-secondary-700">{readiness.lowCount}</p>
            <p className="text-xs text-secondary-600">Low</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs text-foreground-600 mb-4">
          <div className="flex justify-between">
            <span>Required retests:</span>
            <span className="font-medium text-foreground-950">{readiness.requiredRetests}</span>
          </div>
          <div className="flex justify-between">
            <span>Last successful full test:</span>
            <span className="font-medium text-foreground-950">
              {readiness.lastSuccessfulFullTest
                ? new Date(readiness.lastSuccessfulFullTest).toLocaleDateString('en-GB')
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center" />
            Generate UAT Report
          </button>
          <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 border border-background-200/70 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-check-double-line w-3.5 h-3.5 flex items-center justify-center" />
            Mark Baseline Approved
          </button>
        </div>
      </div>
    </div>
  );
}