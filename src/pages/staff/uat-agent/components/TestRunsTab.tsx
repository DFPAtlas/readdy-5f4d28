import { useState, useEffect } from 'react';
import type { UatTestRun } from '@/types/uat';
import { mockRecentRuns } from '@/mocks/uatAgentMockData';

const statusStyles: Record<string, string> = {
  running: 'bg-accent-100 text-accent-700 border-accent-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-foreground-100 text-foreground-700 border-foreground-200',
  pending: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function TestRunsTab() {
  const [runs, setRuns] = useState<UatTestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<UatTestRun | null>(null);
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      await new Promise((r) => setTimeout(r, 400));
      setRuns(mockRecentRuns);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = runs.filter((r) => {
    if (search && !r.projectName.toLowerCase().includes(search.toLowerCase()) && !r.id.includes(search)) return false;
    if (envFilter && r.environment !== envFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return <div className="py-4 animate-pulse space-y-3">{[1,2,3].map((i) => <div key={i} className="bg-white rounded-lg border border-background-200/70 h-16" />)}</div>;
  }

  return (
    <div className="space-y-4 py-4">
      {selectedRun ? (
        /* Run Detail View */
        <div>
          <button
            onClick={() => setSelectedRun(null)}
            className="inline-flex items-center gap-1 text-xs text-foreground-600 hover:text-foreground-950 mb-4 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-left-line w-3 h-3 flex items-center justify-center" />
            Back to runs
          </button>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* Run summary header */}
            <div className="px-5 py-4 border-b border-background-200/70">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground-950">{selectedRun.projectName}</h3>
                  <p className="text-xs text-foreground-600 mt-0.5">{selectedRun.testPlanName} · {selectedRun.testMode.replace(/_/g, ' ')}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusStyles[selectedRun.status]}`}>
                  {selectedRun.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="text-center p-2 bg-background-50 rounded-md">
                  <p className="text-lg font-semibold text-foreground-950">{selectedRun.passRate}%</p>
                  <p className="text-xs text-foreground-600">Pass Rate</p>
                </div>
                <div className="text-center p-2 bg-background-50 rounded-md">
                  <p className="text-lg font-semibold text-green-600">{selectedRun.passedCount}</p>
                  <p className="text-xs text-foreground-600">Passed</p>
                </div>
                <div className="text-center p-2 bg-background-50 rounded-md">
                  <p className="text-lg font-semibold text-red-600">{selectedRun.failedCount}</p>
                  <p className="text-xs text-foreground-600">Failed</p>
                </div>
                <div className="text-center p-2 bg-background-50 rounded-md">
                  <p className="text-lg font-semibold text-foreground-950">{formatDuration(selectedRun.duration)}</p>
                  <p className="text-xs text-foreground-600">Duration</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-foreground-600">
                <span className="whitespace-nowrap">Triggered by: <strong className="text-foreground-950">{selectedRun.triggeredBy}</strong></span>
                <span className="whitespace-nowrap">Started: {new Date(selectedRun.startTime).toLocaleString('en-GB')}</span>
                <span className="whitespace-nowrap">Browsers: {selectedRun.browsers.join(', ')}</span>
                <span className="whitespace-nowrap">Viewports: {selectedRun.viewports.join(', ')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-background-200/70">
              <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 cursor-pointer whitespace-nowrap">
                <i className="ri-download-line w-3.5 h-3.5 flex items-center justify-center" />
                Download Report
              </button>
              <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 border border-background-200/70 cursor-pointer whitespace-nowrap">
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center" />
                Retest Failed Journeys
              </button>
            </div>

            {/* Content placeholder */}
            <div className="p-5 text-center text-xs text-foreground-600 py-12">
              Run detail with journey results, timeline, evidence, and agent outputs will appear here.
            </div>
          </div>
        </div>
      ) : (
        /* Runs list */
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-500 text-sm" />
              <input
                type="text"
                placeholder="Search runs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300"
              />
            </div>
            <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer">
              <option value="">All environments</option>
              <option value="demo">Demo</option>
              <option value="uat">UAT</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer">
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-200/70 bg-background-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Run ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Project</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Env</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Triggered By</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Start</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Duration</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Pass</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => (
                  <tr key={run.id} className="border-b border-background-100 hover:bg-background-50 cursor-pointer" onClick={() => setSelectedRun(run)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-700 whitespace-nowrap">{run.id}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-950 whitespace-nowrap">{run.projectName}</td>
                    <td className="px-4 py-2.5 text-xs uppercase whitespace-nowrap">{run.environment}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-700 whitespace-nowrap">{run.triggeredBy}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{new Date(run.startTime).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{formatDuration(run.duration)}</td>
                    <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                      <span className={run.passRate >= 80 ? 'text-green-600' : run.passRate >= 50 ? 'text-amber-600' : 'text-red-600'}>{run.passRate}%</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusStyles[run.status]}`}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-10"><p className="text-xs text-foreground-600">No runs match filters</p></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}