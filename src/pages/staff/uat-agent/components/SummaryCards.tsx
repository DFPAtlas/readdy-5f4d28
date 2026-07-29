import type { UatDashboard } from '@/types/uat';

interface Props {
  data: UatDashboard | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-background-200/70 p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-background-100" />
        <div className="h-3 w-20 bg-background-100 rounded" />
      </div>
      <div className="h-7 w-16 bg-background-100 rounded mb-2" />
      <div className="h-3 w-24 bg-background-100 rounded" />
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-lg border border-background-200/70 p-4 text-center">
      <p className="text-xs text-foreground-600">No {label.toLowerCase()} data yet</p>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-white rounded-lg border border-red-200 p-4 text-center">
      <p className="text-xs text-red-600 mb-2">Failed to load</p>
      <button onClick={onRetry} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">
        Retry
      </button>
    </div>
  );
}

const CARDS = [
  {
    key: 'activeRuns' as const,
    label: 'Active Runs',
    icon: 'ri-play-circle-line',
    value: (d: UatDashboard) => d.activeRuns,
    sub: () => 'Currently executing',
    color: 'bg-accent-100 text-accent-700',
  },
  {
    key: 'passRate' as const,
    label: 'Pass Rate',
    icon: 'ri-check-double-line',
    value: (d: UatDashboard) => `${d.passRate}%`,
    sub: (d: UatDashboard) => d.passRateChange > 0 ? `+${d.passRateChange}% this week` : `${d.passRateChange}% this week`,
    color: 'bg-green-100 text-green-700',
  },
  {
    key: 'openCriticalBugs' as const,
    label: 'Open Critical Bugs',
    icon: 'ri-error-warning-line',
    value: (d: UatDashboard) => d.openCriticalBugs,
    sub: (d: UatDashboard) => d.openCriticalBugsChange > 0 ? `+${d.openCriticalBugsChange} new` : 'No change',
    color: 'bg-red-100 text-red-700',
  },
  {
    key: 'testsRunThisWeek' as const,
    label: 'Tests Run This Week',
    icon: 'ri-bar-chart-line',
    value: (d: UatDashboard) => d.testsRunThisWeek,
    sub: (d: UatDashboard) => `+${d.testsRunThisWeekChange} from last week`,
    color: 'bg-secondary-100 text-secondary-700',
  },
  {
    key: 'releaseReadiness' as const,
    label: 'Release Readiness',
    icon: 'ri-rocket-line',
    value: (d: UatDashboard) => `${d.releaseReadiness.score}/100`,
    sub: (d: UatDashboard) => {
      const labels = { ready: 'Ready to ship', ready_with_warnings: 'Ready with warnings', not_ready: 'Not ready', blocked: 'Blocked' };
      return labels[d.releaseReadiness.status];
    },
    color: 'bg-primary-100 text-primary-700',
  },
];

export default function SummaryCards({ data, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARDS.map((card) => (
          <ErrorCard key={card.key} onRetry={onRetry} />
        ))}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARDS.map((card) => (
          <SkeletonCard key={card.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARDS.map((card) => (
        <div key={card.key} className="bg-white rounded-lg border border-background-200/70 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
              <i className={`${card.icon} text-sm`} />
            </div>
            <span className="text-xs text-foreground-600 whitespace-nowrap">{card.label}</span>
          </div>
          <p className="text-xl font-semibold text-foreground-950">{card.value(data)}</p>
          <p className="text-xs text-foreground-600 mt-0.5">{card.sub(data)}</p>
        </div>
      ))}
    </div>
  );
}