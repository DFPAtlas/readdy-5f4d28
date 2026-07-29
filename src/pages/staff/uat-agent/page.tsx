import { useState, useEffect, useCallback } from 'react';
import type { UatDashboard, UatEnvironment } from '@/types/uat';
import { isMockModeActive } from '@/services/uatAgentService';
import { getEnvironmentConfig, isMockMode as envIsMockMode } from '@/config/environment';
import { runHealthChecks, computeOverallStatus } from '@/services/healthService';
import type { ConnectionStatus } from '@/services/healthService';
import SummaryCards from './components/SummaryCards';
import OverviewTab from './components/OverviewTab';
import TestPlansTab from './components/TestPlansTab';
import TestRunsTab from './components/TestRunsTab';
import BugsTab from './components/BugsTab';
import EvidenceTab from './components/EvidenceTab';
import VisualBaselinesTab from './components/VisualBaselinesTab';
import SettingsTab from './components/SettingsTab';
import StartTestWizard from './components/StartTestWizard';
import ConnectionDetailsPanel from './components/ConnectionDetailsPanel';
import ReleaseApprovalTab from './components/ReleaseApprovalTab';

type TabKey = 'overview' | 'test-plans' | 'test-runs' | 'bugs' | 'evidence' | 'visual-baselines' | 'release-approval' | 'settings';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
  { key: 'test-plans', label: 'Test Plans', icon: 'ri-file-list-3-line' },
  { key: 'test-runs', label: 'Test Runs', icon: 'ri-play-list-line' },
  { key: 'bugs', label: 'Bugs', icon: 'ri-bug-line' },
  { key: 'evidence', label: 'Evidence', icon: 'ri-image-line' },
  { key: 'visual-baselines', label: 'Visual Baselines', icon: 'ri-contrast-2-line' },
  { key: 'release-approval', label: 'Release Approval', icon: 'ri-shield-check-line' },
  { key: 'settings', label: 'Settings', icon: 'ri-settings-3-line' },
];

export default function UatAgentPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showWizard, setShowWizard] = useState(false);
  const [dashboardData, setDashboardData] = useState<UatDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Health check state
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [healthChecking, setHealthChecking] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null);

  const envConfig = getEnvironmentConfig();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getUatDashboard } = await import('@/services/uatAgentService');
      const data = await getUatDashboard();
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      const results = await runHealthChecks();
      setConnections(results);
    } catch {
      // Health check failures are non-fatal
    } finally {
      setHealthChecking(false);
    }
  }, []);

  // Load dashboard and health on first render
  useEffect(() => {
    fetchDashboard();
    checkHealth();
  }, [fetchDashboard, checkHealth]);

  // Poll health every 30 seconds
  useEffect(() => {
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const overallStatus = computeOverallStatus(connections);

  const getServiceStatus = (key: string): { connected: boolean; degraded: boolean; label: string; modelInfo?: string } => {
    const svc = connections.find((c) => c.key === key);
    if (!svc) return { connected: false, degraded: false, label: 'Not Configured' };
    if (svc.status === 'online') return { connected: true, degraded: false, label: 'Connected' };
    if (svc.status === 'degraded') {
      // Check if this is an AI model-missing degradation
      if (key === 'ai' && svc.message?.includes('Model Missing')) {
        return { connected: false, degraded: true, label: 'Model Missing' };
      }
      if (key === 'ollama' && svc.message?.includes('Model Missing')) {
        return { connected: false, degraded: true, label: 'Model Missing' };
      }
      return { connected: false, degraded: true, label: 'Degraded' };
    }
    if (svc.status === 'checking') return { connected: false, degraded: false, label: 'Checking...' };
    if (svc.status === 'not_configured') return { connected: false, degraded: false, label: 'Not Configured' };
    return { connected: false, degraded: false, label: 'Offline' };
  };

  const n8nState = getServiceStatus('n8n');
  const workerState = getServiceStatus('playwright');
  const dbState = getServiceStatus('supabase');
  const aiState = getServiceStatus('ai');

  const configuredEnvironment = import.meta.env.VITE_PUBLIC_UAT_ENVIRONMENT;
  const environment: UatEnvironment =
    configuredEnvironment === 'demo' ||
    configuredEnvironment === 'uat' ||
    configuredEnvironment === 'staging' ||
    configuredEnvironment === 'production'
      ? configuredEnvironment
      : 'uat';
  const mockActive = isMockModeActive();

  const environmentBadgeStyles: Record<UatEnvironment, string> = {
    demo: 'bg-secondary-100 text-secondary-700',
    uat: 'bg-accent-100 text-accent-800',
    staging: 'bg-amber-100 text-amber-700',
    production: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-full">
      {/* Page Header */}
      <div className="bg-white border-b border-background-200/70">
        <div className="px-4 md:px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-foreground-600 mb-2">
            <span className="hover:text-foreground-950 cursor-pointer whitespace-nowrap">Staff</span>
            <i className="ri-arrow-right-s-line w-3 h-3 flex items-center justify-center" />
            <span className="text-foreground-950 font-medium whitespace-nowrap">UAT Agent</span>
          </div>

          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground-950 whitespace-nowrap">AI UAT Agent</h1>
              <p className="mt-0.5 text-sm text-foreground-600">
                Run browser-based user acceptance tests, review evidence and decide whether a release is ready.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Environment badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${environmentBadgeStyles[environment]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${environment === 'production' ? 'bg-red-500' : environment === 'uat' ? 'bg-accent-500' : 'bg-secondary-500'}`} />
                {environment.toUpperCase()}
              </span>

              {/* Demo badge */}
              {mockActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                  <i className="ri-information-line w-3 h-3 flex items-center justify-center" />
                  Demo data
                </span>
              )}

              {/* Test Plans button */}
              <button
                onClick={() => setActiveTab('test-plans')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 border border-background-200/70 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-file-list-3-line w-3.5 h-3.5 flex items-center justify-center" />
                Test Plans
              </button>

              {/* Primary CTA */}
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-play-circle-line w-3.5 h-3.5 flex items-center justify-center" />
                Start New Test
              </button>
            </div>
          </div>

          {/* Connection indicators */}
          <div className="flex items-center gap-4 mt-3 text-xs text-foreground-600 flex-wrap">
            <span className="inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-foreground-950 transition-colors"
                  onClick={() => { setSelectedServiceKey('n8n'); setShowConnectionDetails(true); }}>
              <span className={`w-2 h-2 rounded-full ${n8nState.connected ? 'bg-green-500' : n8nState.degraded ? 'bg-amber-500' : 'bg-red-400'}`} />
              n8n {n8nState.label}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-foreground-950 transition-colors"
                  onClick={() => { setSelectedServiceKey('playwright'); setShowConnectionDetails(true); }}>
              <span className={`w-2 h-2 rounded-full ${workerState.connected ? 'bg-green-500' : workerState.degraded ? 'bg-amber-500' : 'bg-red-400'}`} />
              Browser Worker {workerState.label}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-foreground-950 transition-colors"
                  onClick={() => { setSelectedServiceKey('ai'); setShowConnectionDetails(true); }}>
              <span className={`w-2 h-2 rounded-full ${aiState.connected ? 'bg-green-500' : aiState.degraded ? 'bg-amber-500' : 'bg-red-400'}`} />
              AI Model {aiState.label}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-foreground-950 transition-colors"
                  onClick={() => { setSelectedServiceKey('supabase'); setShowConnectionDetails(true); }}>
              <span className={`w-2 h-2 rounded-full ${dbState.connected ? 'bg-green-500' : dbState.degraded ? 'bg-amber-500' : 'bg-red-400'}`} />
              Database {dbState.label}
            </span>
            <button
              onClick={checkHealth}
              disabled={healthChecking}
              className="inline-flex items-center gap-1 text-xs text-foreground-500 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <i className={`ri-refresh-line w-3 h-3 flex items-center justify-center ${healthChecking ? 'animate-spin' : ''}`} />
              {healthChecking ? 'Checking...' : 'Refresh'}
            </button>
            {overallStatus === 'degraded' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 whitespace-nowrap">
                Some services degraded
              </span>
            )}
            {overallStatus === 'offline' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 whitespace-nowrap">
                Services offline
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 md:px-6 flex items-center gap-1 overflow-x-auto border-t border-background-200/70">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors cursor-pointer
                ${activeTab === tab.key
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-foreground-600 hover:text-foreground-950 hover:border-background-300/60'
                }
              `}
            >
              <i className={`${tab.icon} w-4 h-4 flex items-center justify-center`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-4 md:px-6 py-4">
        <SummaryCards
          data={dashboardData}
          loading={loading}
          error={error}
          onRetry={fetchDashboard}
        />
      </div>

      {/* Tab Content */}
      <div className="px-4 md:px-6 pb-8">
        {activeTab === 'overview' && (
          <OverviewTab
            data={dashboardData}
            loading={loading}
            error={error}
            onRetry={fetchDashboard}
          />
        )}
        {activeTab === 'test-plans' && <TestPlansTab />}
        {activeTab === 'test-runs' && <TestRunsTab />}
        {activeTab === 'bugs' && <BugsTab />}
        {activeTab === 'evidence' && <EvidenceTab />}
        {activeTab === 'visual-baselines' && <VisualBaselinesTab />}
        {activeTab === 'release-approval' && <ReleaseApprovalTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Start Test Wizard Modal */}
      {showWizard && (
        <StartTestWizard
          onClose={() => setShowWizard(false)}
          onRunCreated={(_runId: string) => {
            setShowWizard(false);
            fetchDashboard();
            setActiveTab('test-runs');
          }}
        />
      )}

      {/* Connection Details Panel */}
      {showConnectionDetails && (
        <ConnectionDetailsPanel
          connections={connections}
          selectedServiceKey={selectedServiceKey}
          onClose={() => { setShowConnectionDetails(false); setSelectedServiceKey(null); }}
          onRetry={checkHealth}
          checking={healthChecking}
        />
      )}
    </div>
  );
}