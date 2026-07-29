import { useState } from 'react';
import type { UatTestRun, UatTimelineEvent } from '@/types/uat';

interface Props {
  run: UatTestRun;
}

type TimelineFilter = 'all' | 'browser' | 'network' | 'assertion' | 'agent';

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'browser', label: 'Browser' },
  { key: 'network', label: 'Network' },
  { key: 'assertion', label: 'Assertions' },
  { key: 'agent', label: 'Agents' },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActiveRunPanel({ run }: Props) {
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const filteredTimeline = run.timeline.filter((e) =>
    timelineFilter === 'all' ? true : e.category === timelineFilter
  );

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success': return 'ri-check-line text-green-600';
      case 'warning': return 'ri-alert-line text-amber-600';
      case 'error': return 'ri-close-line text-red-600';
      default: return 'ri-information-line text-foreground-600';
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'navigation': return 'ri-compass-3-line';
      case 'click': return 'ri-cursor-line';
      case 'form_entry': return 'ri-keyboard-line';
      case 'assertion': return 'ri-check-double-line';
      case 'console_error': return 'ri-terminal-box-line';
      case 'network_failure': return 'ri-wifi-off-line';
      case 'screenshot': return 'ri-camera-line';
      case 'agent_finding': return 'ri-robot-line';
      default: return 'ri-circle-line';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
      {/* Run header */}
      <div className="px-5 py-4 border-b border-background-200/70">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground-950">{run.projectName}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Running
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-foreground-600 flex-wrap">
              <span className="whitespace-nowrap">{run.baseUrl}</span>
              <span className="whitespace-nowrap">{run.environment.toUpperCase()}</span>
              <span className="whitespace-nowrap">Chromium · Desktop 1920×1080</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 border border-background-200/70 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-pause-line w-3.5 h-3.5 flex items-center justify-center" />
              Pause
            </button>
            {showStopConfirm ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-600 mr-1 whitespace-nowrap">Stop test?</span>
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="px-2 py-1 text-xs rounded border border-background-200/70 cursor-pointer whitespace-nowrap"
                >
                  No
                </button>
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600 cursor-pointer whitespace-nowrap"
                >
                  Yes, Stop
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowStopConfirm(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-stop-line w-3.5 h-3.5 flex items-center justify-center" />
                Stop Test
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress + counts */}
      <div className="px-5 py-3 border-b border-background-200/70">
        <div className="flex items-center gap-2 mb-2 text-xs text-foreground-600">
          <span>{run.currentJourney}</span>
          <span>&middot;</span>
          <span>{run.currentStep}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-background-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${run.progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-foreground-950 whitespace-nowrap">{run.progress}%</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-foreground-600">
          <span className="whitespace-nowrap">Elapsed: {formatDuration(run.duration)}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {run.passedCount} passed
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {run.failedCount} failed
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {run.warningCount} warning
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-foreground-400" />
            {run.blockedCount} blocked
          </span>
        </div>
      </div>

      {/* Browser frame preview */}
      <div className="px-5 py-3 border-b border-background-200/70">
        <div className="rounded-md border border-background-300/60 overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-background-100 border-b border-background-200/70">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <div className="flex-1 mx-2 px-3 py-1 bg-white rounded text-xs text-foreground-600 truncate border border-background-200/70">
              {run.baseUrl}/dashboard
            </div>
          </div>
          {/* Screenshot area */}
          <div className="relative bg-background-50 h-48 flex items-center justify-center">
            <img
              src="https://readdy.ai/api/search-image?query=Professional%20software%20testing%20dashboard%20web%20application%20interface%20with%20sidebar%20navigation%2C%20KPI%20cards%2C%20test%20results%20table%2C%20white%20and%20light%20gray%20background%2C%20clean%20modern%20enterprise%20UI%20design%2C%20minimal%20color%20palette%2C%20professional%20QA%20tool%20interface&width=1440&height=720&seq=uat-browser-preview&orientation=landscape"
              alt="Browser preview"
              className="w-full h-48 object-cover object-top"
            />
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
              Desktop 1920×1080 · {formatTimestamp(run.timeline[run.timeline.length - 1]?.timestamp || run.startTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-foreground-950 uppercase tracking-wide">Live Activity</h4>
          <div className="flex items-center gap-1 bg-background-100 rounded-full p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTimelineFilter(f.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  timelineFilter === f.key
                    ? 'bg-white text-foreground-950 shadow-sm'
                    : 'text-foreground-600 hover:text-foreground-950'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-foreground-600">No events matching filter</p>
          </div>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto">
            {filteredTimeline.map((event) => (
              <div key={event.id} className="flex items-start gap-2 py-1.5 border-b border-background-100 last:border-0">
                <div className="w-5 h-5 rounded-full bg-background-100 flex items-center justify-center shrink-0 mt-0.5">
                  <i className={`${typeIcon(event.type)} text-xs`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <i className={`${statusIcon(event.status)} text-xs`} />
                    <span className="text-xs text-foreground-950 truncate">{event.message}</span>
                  </div>
                  {event.detail && (
                    <p className="text-xs text-foreground-600 mt-0.5">{event.detail}</p>
                  )}
                </div>
                <span className="text-xs text-foreground-500 whitespace-nowrap shrink-0">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}