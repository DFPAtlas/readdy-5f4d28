import type { UatDashboard } from '@/types/uat';
import ActiveRunPanel from './ActiveRunPanel';
import AgentTeamPanel from './AgentTeamPanel';
import ReleaseReadinessCard from './ReleaseReadinessCard';
import RecentRunsTable from './RecentRunsTable';

interface Props {
  data: UatDashboard | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function OverviewTab({ data, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <i className="ri-error-warning-line text-red-600 text-xl" />
        </div>
        <p className="text-sm text-foreground-950 font-medium mb-1">Connection unavailable</p>
        <p className="text-xs text-foreground-600 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-background-200/70 p-5 h-80">
              <div className="h-5 w-40 bg-background-100 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-background-100 rounded" />
                <div className="h-3 w-3/4 bg-background-100 rounded" />
                <div className="h-3 w-1/2 bg-background-100 rounded" />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-background-200/70 p-5 h-48">
              <div className="h-5 w-32 bg-background-100 rounded mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-background-100 rounded" />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-background-200/70 p-5 h-96">
            <div className="h-5 w-28 bg-background-100 rounded mb-4" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-background-100" />
                <div className="flex-1">
                  <div className="h-3 w-32 bg-background-100 rounded mb-1" />
                  <div className="h-2 w-20 bg-background-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main grid: Centre + Right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Centre area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Test Run */}
          {data.activeRun ? (
            <ActiveRunPanel run={data.activeRun} />
          ) : (
            <div className="bg-white rounded-lg border border-background-200/70 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
                <i className="ri-play-circle-line text-foreground-400 text-xl" />
              </div>
              <p className="text-sm font-medium text-foreground-950 mb-1">No active test runs</p>
              <p className="text-xs text-foreground-600">Start a new test to see live progress here.</p>
            </div>
          )}

          {/* Release Readiness */}
          <ReleaseReadinessCard readiness={data.releaseReadiness} />
        </div>

        {/* Right rail — Agent Team */}
        <AgentTeamPanel agents={data.agentTeam} />
      </div>

      {/* Recent Runs */}
      <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-3 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Recent Runs</h3>
        </div>
        <RecentRunsTable runs={data.recentRuns} />
      </div>
    </div>
  );
}