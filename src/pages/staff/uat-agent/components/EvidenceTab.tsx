import { useState, useEffect } from 'react';
import type { UatEvidence, UatEvidenceType } from '@/types/uat';
import { listEvidence } from '@/services/uatAgentService';

const typeLabels: Record<UatEvidenceType, { label: string; icon: string }> = {
  screenshot: { label: 'Screenshot', icon: 'ri-camera-line' },
  video: { label: 'Video', icon: 'ri-video-line' },
  trace: { label: 'Playwright Trace', icon: 'ri-braces-line' },
  console_log: { label: 'Console Log', icon: 'ri-terminal-box-line' },
  network_log: { label: 'Network Log', icon: 'ri-wifi-line' },
  accessibility: { label: 'Accessibility', icon: 'ri-shield-check-line' },
  visual_diff: { label: 'Visual Diff', icon: 'ri-contrast-2-line' },
  accessibility_report: { label: 'Accessibility Report', icon: 'ri-file-shield-2-line' },
  uat_report: { label: 'UAT Report', icon: 'ri-file-chart-line' },
  temporary_file: { label: 'Temporary File', icon: 'ri-file-warning-line' },
  other: { label: 'Other Evidence', icon: 'ri-attachment-2' },
};

export default function EvidenceTab() {
  const [evidence, setEvidence] = useState<UatEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEvidence();
      setEvidence(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvidence(); }, []);

  const filtered = typeFilter ? evidence.filter((e) => e.type === typeFilter) : evidence;

  if (loading) {
    return <div className="py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3].map((i) => <div key={i} className="bg-white rounded-lg border border-background-200/70 h-40 animate-pulse" />)}
    </div>;
  }

  if (error) {
    return <div className="text-center py-16"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={fetchEvidence} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">Retry</button></div>;
  }

  return (
    <div className="space-y-4 py-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-background-200/70 rounded-md bg-white focus:outline-none focus:border-primary-300 cursor-pointer"
        >
          <option value="">All types</option>
          {Object.entries(typeLabels).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <span className="text-xs text-foreground-600">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-background-200/70">
          <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
            <i className="ri-image-line text-foreground-400 text-xl" />
          </div>
          <p className="text-sm text-foreground-950 font-medium">No evidence yet</p>
          <p className="text-xs text-foreground-600">Evidence is collected during test runs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const typeInfo = typeLabels[item.type];
            return (
              <div key={item.id} className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
                {/* Thumbnail / placeholder */}
                <div className="h-36 bg-background-50 flex items-center justify-center relative">
                  {item.type === 'screenshot' ? (
                    <img src={item.url} alt={item.title} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="text-center">
                      <i className={`${typeInfo.icon} text-foreground-400 text-2xl w-8 h-8 flex items-center justify-center mx-auto`} />
                      <p className="text-xs text-foreground-600 mt-1">{typeInfo.label}</p>
                    </div>
                  )}
                  {item.sensitive && (
                    <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded whitespace-nowrap">
                      Masked
                    </span>
                  )}
                </div>

                <div className="p-3">
                  <h4 className="text-xs font-medium text-foreground-950 truncate">{item.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-xs text-foreground-600 flex-wrap">
                    <span className="whitespace-nowrap">{item.journeyName}</span>
                    <span>&middot;</span>
                    <span className="whitespace-nowrap">{item.browser} · {item.device}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-foreground-500 whitespace-nowrap">{new Date(item.timestamp).toLocaleString('en-GB')}</span>
                    <span className="text-xs text-foreground-500 whitespace-nowrap">{item.fileSize}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}