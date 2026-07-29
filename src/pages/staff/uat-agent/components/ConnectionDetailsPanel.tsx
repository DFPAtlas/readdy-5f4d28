import { type ConnectionStatus } from '@/services/healthService';
import { getServiceDefinitions } from '@/config/services';

interface Props {
  connections: ConnectionStatus[];
  selectedServiceKey: string | null;
  onClose: () => void;
  onRetry: () => void;
  checking: boolean;
}

function statusBadge(status: ConnectionStatus['status']): { color: string; dot: string; label: string } {
  switch (status) {
    case 'online': return { color: 'text-green-600', dot: 'bg-green-500', label: 'Connected' };
    case 'degraded': return { color: 'text-amber-600', dot: 'bg-amber-500', label: 'Degraded' };
    case 'offline': return { color: 'text-red-600', dot: 'bg-red-400', label: 'Offline' };
    case 'checking': return { color: 'text-foreground-500', dot: 'bg-foreground-400 animate-pulse', label: 'Checking' };
    case 'not_configured': return { color: 'text-foreground-400', dot: 'bg-foreground-300', label: 'Not Configured' };
  }
}

function aiStatusLabel(status: ConnectionStatus['status'], message: string): string {
  if (status === 'online') return 'Connected';
  if (status === 'degraded' && message?.includes('Model Missing')) return 'Model Missing';
  if (status === 'degraded') return 'Loading Model';
  if (status === 'offline') return 'Offline';
  if (status === 'not_configured') return 'Not Configured';
  if (status === 'checking') return 'Checking';
  return 'Unknown';
}

export default function ConnectionDetailsPanel({ connections, selectedServiceKey, onClose, onRetry, checking }: Props) {
  const services = getServiceDefinitions();

  // Filter to show all services, but highlight the selected one
  const selectedService = selectedServiceKey
    ? connections.find((c) => c.key === selectedServiceKey)
    : connections[0];

  const formatTime = (iso: string | null): string => {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return '—';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-lg border border-background-200/70 shadow-lg w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-background-200/70">
          <div className="flex items-center gap-2">
            <i className="ri-pulse-line w-5 h-5 flex items-center justify-center text-foreground-600" />
            <h3 className="text-sm font-semibold text-foreground-950">Service Health</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-background-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center text-foreground-500" />
          </button>
        </div>

        {/* Selected service detail */}
        {selectedService && (
          <div className="px-5 py-4 border-b border-background-100">
            {(() => {
              const b = statusBadge(selectedService.status);
              const svcDef = services.find((s) => s.key === selectedService.key);
              const isAiService = selectedService.key === 'ai' || selectedService.key === 'ollama';
              const displayLabel = isAiService
                ? aiStatusLabel(selectedService.status, selectedService.message)
                : b.label;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground-950">{selectedService.displayName}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${b.color}`}>
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      {displayLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-xs text-foreground-600">
                    <span>Host</span>
                    <span className="text-foreground-950 font-mono truncate">{selectedService.safeHostLabel}</span>
                    <span>Last Checked</span>
                    <span className="text-foreground-950">{formatTime(selectedService.lastChecked)}</span>
                    <span>Latency</span>
                    <span className="text-foreground-950">{selectedService.latencyMs !== null ? `${selectedService.latencyMs}ms` : '—'}</span>
                    {isAiService && selectedService.message && (
                      <>
                        <span>Model</span>
                        <span className="text-foreground-950">{selectedService.message.replace('Connected — ', '')}</span>
                      </>
                    )}
                    {svcDef?.description && (
                      <>
                        <span>Description</span>
                        <span className="text-foreground-700">{svcDef.description}</span>
                      </>
                    )}
                  </div>
                  {selectedService.message && selectedService.status !== 'online' && !isAiService && (
                    <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-800">{selectedService.message}</p>
                    </div>
                  )}
                  {isAiService && selectedService.status === 'degraded' && (
                    <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-800">{selectedService.message}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* All services list */}
        <div className="px-5 py-3">
          <p className="text-xs font-medium text-foreground-500 mb-2">All Services</p>
          <div className="space-y-1">
            {connections.map((conn) => {
              const b = statusBadge(conn.status);
              const isActive = selectedServiceKey === conn.key;
              return (
                <div
                  key={conn.key}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                    isActive ? 'bg-primary-50/50' : 'hover:bg-background-100'
                  }`}
                >
                  <span className="text-foreground-800 font-medium">{conn.displayName}</span>
                  <span className={`inline-flex items-center gap-1 ${b.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-background-200/70 flex items-center justify-between">
          <p className="text-xs text-foreground-500">
            Auto-refreshes every 30s
          </p>
          <button
            onClick={onRetry}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
          >
            <i className={`ri-refresh-line w-3.5 h-3.5 flex items-center justify-center ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Retry Health Check'}
          </button>
        </div>
      </div>
    </div>
  );
}