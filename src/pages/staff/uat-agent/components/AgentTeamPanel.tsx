import { useState } from 'react';
import type { UatAgentStatus, UatFinding } from '@/types/uat';

interface Props {
  agents: UatAgentStatus[];
}

const stateStyles: Record<string, string> = {
  waiting: 'bg-foreground-200 text-foreground-700',
  working: 'bg-accent-100 text-accent-700',
  completed: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

const stateIcons: Record<string, string> = {
  waiting: 'ri-time-line',
  working: 'ri-loader-4-line animate-spin',
  completed: 'ri-check-line',
  warning: 'ri-alert-line',
  failed: 'ri-close-line',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function FindingCard({ finding }: { finding: UatFinding }) {
  const severityStyles = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  };

  return (
    <div className={`p-2.5 rounded-md border text-xs ${severityStyles[finding.severity]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold uppercase whitespace-nowrap">{finding.severity}</span>
        <span className="text-foreground-500">{finding.category}</span>
      </div>
      <p className="font-medium text-foreground-950 mb-0.5">{finding.title}</p>
      <p className="text-foreground-600">{finding.summary}</p>
    </div>
  );
}

export default function AgentTeamPanel({ agents }: Props) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-background-200/70 p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-2">
          <i className="ri-robot-line text-foreground-400 text-lg" />
        </div>
        <p className="text-xs text-foreground-600">No agent activity</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
      <div className="px-4 py-3 border-b border-background-200/70">
        <div className="flex items-center gap-2">
          <i className="ri-robot-line text-primary-600 w-4 h-4 flex items-center justify-center" />
          <h3 className="text-sm font-semibold text-foreground-950">Agent Team</h3>
          <span className="text-xs text-foreground-600 bg-background-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {agents.length}
          </span>
        </div>
      </div>

      <div className="divide-y divide-background-100">
        {agents.map((agent) => (
          <div key={agent.id}>
            <button
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-background-50 transition-colors text-left cursor-pointer"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${stateStyles[agent.state]}`}>
                <i className={`${stateIcons[agent.state]} text-sm`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground-950 truncate">{agent.name}</span>
                  {agent.findingCount > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {agent.findingCount} finding{agent.findingCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground-600 mt-0.5 truncate">{agent.currentTask}</p>
                <p className="text-xs text-foreground-500 mt-0.5 whitespace-nowrap">{formatRelativeTime(agent.lastActivity)}</p>
              </div>
              {expandedAgent === agent.id ? (
                <i className="ri-arrow-up-s-line text-foreground-500 text-sm w-4 h-4 flex items-center justify-center" />
              ) : (
                <i className="ri-arrow-down-s-line text-foreground-500 text-sm w-4 h-4 flex items-center justify-center" />
              )}
            </button>

            {/* Expanded findings */}
            {expandedAgent === agent.id && agent.findings.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {agent.findings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}