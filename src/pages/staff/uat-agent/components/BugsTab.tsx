import { useState, useEffect } from 'react';
import type { UatBug, UatSeverity, UatBugStatus, UatEnvironment } from '@/types/uat';
import { listUatBugs, updateUatBug } from '@/services/uatAgentService';
import BugDetailDrawer from './BugDetailDrawer';

const severityStyles: Record<UatSeverity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-secondary-100 text-secondary-700 border-secondary-200',
};

const statusStyles: Record<UatBugStatus, string> = {
  open: 'bg-red-100 text-red-700 border-red-200',
  in_progress: 'bg-accent-100 text-accent-700 border-accent-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-foreground-100 text-foreground-600 border-foreground-200',
  false_positive: 'bg-purple-100 text-purple-700 border-purple-200',
  risk_accepted: 'bg-amber-100 text-amber-700 border-amber-200',
};

export default function BugsTab() {
  const [bugs, setBugs] = useState<UatBug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBug, setSelectedBug] = useState<UatBug | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchBugs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUatBugs();
      setBugs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bugs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBugs(); }, []);

  const filtered = bugs.filter((b) => {
    if (severityFilter && b.severity !== severityFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (search && !b.title.toLowerCase().includes(search.toLowerCase()) && !b.id.includes(search)) return false;
    return true;
  });

  const handleBugUpdate = async (id: string, payload: Parameters<typeof updateUatBug>[1]) => {
    try {
      const updated = await updateUatBug(id, payload);
      setBugs((prev) => prev.map((b) => (b.id === id ? updated : b)));
      if (selectedBug?.id === id) setSelectedBug(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bug');
    }
  };

  if (loading) {
    return <div className="py-4 animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="bg-white rounded-lg border border-background-200/70 h-16"/>)}</div>;
  }

  if (error) {
    return <div className="text-center py-16"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={fetchBugs} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">Retry</button></div>;
  }

  return (
    <div className="space-y-4 py-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-500 text-sm" />
          <input type="text" placeholder="Search bugs..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300" />
        </div>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Bugs table */}
      <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-background-200/70 bg-background-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Severity</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Title</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Project</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Browser</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">First Detected</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Occurrences</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Assigned</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((bug) => (
              <tr key={bug.id} className="border-b border-background-100 hover:bg-background-50">
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${severityStyles[bug.severity]}`}>
                    {bug.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusStyles[bug.status]}`}>
                    {bug.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground-950 max-w-xs truncate">{bug.title}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{bug.projectName}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{bug.browser} · {bug.device}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{new Date(bug.firstDetected).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{bug.occurrenceCount}</td>
                <td className="px-4 py-2.5 text-xs text-foreground-600 whitespace-nowrap">{bug.assignedTo || '—'}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => setSelectedBug(bug)}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10">
            <p className="text-xs text-foreground-600">No bugs match filters</p>
          </div>
        )}
      </div>

      {/* Bug detail drawer */}
      {selectedBug && (
        <BugDetailDrawer
          bug={selectedBug}
          onClose={() => setSelectedBug(null)}
          onUpdate={(payload) => handleBugUpdate(selectedBug.id, payload)}
        />
      )}
    </div>
  );
}