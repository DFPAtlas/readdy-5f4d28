import { useState } from 'react';
import type { UatTestRun } from '@/types/uat';

interface Props {
  runs: UatTestRun[];
}

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

export default function RecentRunsTable({ runs }: Props) {
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = runs.filter((r) => {
    if (search && !r.projectName.toLowerCase().includes(search.toLowerCase()) && !r.id.includes(search)) return false;
    if (envFilter && r.environment !== envFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  if (runs.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-foreground-600">No test runs yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="px-4 py-3 flex flex-col sm:flex-row gap-2 border-b border-background-200/70">
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
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          <option value="">All environments</option>
          <option value="demo">Demo</option>
          <option value="uat">UAT</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-background-200/70 bg-background-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Run ID</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Project</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Environment</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Triggered By</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Start Time</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Duration</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Pass Rate</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Bugs</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run) => (
              <tr key={run.id} className="border-b border-background-100 hover:bg-background-50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-700 whitespace-nowrap">{run.id}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-950 whitespace-nowrap">{run.projectName}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-700 uppercase whitespace-nowrap">{run.environment}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground-700 whitespace-nowrap">{run.triggeredBy}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">
                  {new Date(run.startTime).toLocaleString('en-GB')}
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{formatDuration(run.duration)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${run.passRate >= 80 ? 'text-green-600' : run.passRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {run.passRate}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{run.bugsFound}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusStyles[run.status]}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <button className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs text-foreground-600">No runs match the current filters</p>
        </div>
      )}
    </div>
  );
}