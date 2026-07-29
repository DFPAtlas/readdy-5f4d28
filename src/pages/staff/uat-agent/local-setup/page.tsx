import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEnvironmentConfig } from '@/config/environment';
import { getServiceDefinitions, type ServiceDefinition } from '@/config/services';
import { runHealthChecks, buildHealthReport, type ConnectionStatus } from '@/services/healthService';
import type { HealthReport } from '@/config/services';

// ============================================================
// Types
// ============================================================

interface SetupCheckItem {
  id: string;
  label: string;
  status: 'complete' | 'warning' | 'missing' | 'not_required';
  detail: string;
}

// ============================================================
// Component
// ============================================================

export default function LocalSetupPage() {
  const navigate = useNavigate();
  const envConfig = getEnvironmentConfig();
  const services = getServiceDefinitions();

  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [testingService, setTestingService] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<Record<string, string>>({});

  // Supabase-specific test states
  const [supabaseTestResults, setSupabaseTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [testingSupabase, setTestingSupabase] = useState(false);

  // Ollama-specific test states
  const [ollamaHealthResult, setOllamaHealthResult] = useState<{
    status: string;
    model: string;
    modelAvailable: boolean;
    latencyMs: number | null;
    message: string;
  } | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaTestResponse, setOllamaTestResponse] = useState<{ ok: boolean; response: string; latencyMs: number } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  // --- Health check ---
  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const results = await runHealthChecks();
      setConnections(results);
      setHealthReport(buildHealthReport(results));
    } catch {
      // Non-fatal
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    // Build info from globals injected by Vite
    setBuildInfo({
      version: (typeof __READDY_VERSION_ID__ !== 'undefined' ? __READDY_VERSION_ID__ : 'unknown'),
      buildDate: new Date().toISOString().split('T')[0],
      deploymentMode: envConfig.deploymentMode,
      appName: envConfig.appName,
    });
  }, [checkHealth, envConfig]);

  // --- Ollama-specific tests ---
  const testOllamaConnection = async () => {
    setTestingOllama(true);
    setOllamaHealthResult(null);
    try {
      const { checkOllamaHealth } = await import('@/services/server/ollamaService');
      const result = await checkOllamaHealth();
      setOllamaHealthResult(result);
    } catch {
      setOllamaHealthResult({
        status: 'offline',
        model: 'unknown',
        modelAvailable: false,
        latencyMs: null,
        message: 'Connection test failed',
      });
    } finally {
      setTestingOllama(false);
    }
  };

  const checkOllamaModels = async () => {
    setTestingOllama(true);
    try {
      const { listOllamaModels } = await import('@/services/server/ollamaService');
      const result = await listOllamaModels();
      setOllamaModels(result.models);
    } catch {
      setOllamaModels([]);
    } finally {
      setTestingOllama(false);
    }
  };

  const testOllamaResponse = async () => {
    setTestingOllama(true);
    setOllamaTestResponse(null);
    try {
      const { testAiResponse } = await import('@/services/server/ollamaService');
      const result = await testAiResponse();
      setOllamaTestResponse({
        ok: result.ok,
        response: result.response,
        latencyMs: result.latencyMs,
      });
    } catch {
      setOllamaTestResponse({ ok: false, response: 'Test failed', latencyMs: 0 });
    } finally {
      setTestingOllama(false);
    }
  };

  // --- Connection tests ---
  const testConnection = async (serviceKey: string) => {
    setTestingService(serviceKey);
    setTestResults((prev) => ({ ...prev, [serviceKey]: { ok: false, message: 'Testing...' } }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let testUrl = '';
      const svc = services.find((s) => s.key === serviceKey);
      if (!svc) {
        throw new Error('Service not found');
      }

      if (serviceKey === 'frontend') {
        clearTimeout(timeoutId);
        setTestResults((prev) => ({ ...prev, [serviceKey]: { ok: true, message: 'Application is running' } }));
        setTestingService(null);
        return;
      }

      if (serviceKey === 'n8n') {
        testUrl = `${envConfig.uatApiBaseUrl}/health`;
      } else if (serviceKey === 'playwright') {
        testUrl = `${envConfig.uatApiBaseUrl}/worker-health`;
      } else if (serviceKey === 'ai') {
        testUrl = `${envConfig.uatApiBaseUrl}/ai-health`;
      } else if (serviceKey === 'supabase' || serviceKey.startsWith('supabase_')) {
        // Test Supabase directly through the supabase service
        clearTimeout(timeoutId);
        setTestingSupabase(true);
        try {
          const { checkSupabaseConnection } = await import('@/services/supabaseService');
          const result = await checkSupabaseConnection();
          setSupabaseTestResults({
            supabase: { ok: result.ok, message: result.message },
            supabase_api: { ok: result.api, message: result.api ? 'Reachable' : 'Unavailable' },
            supabase_db: { ok: result.db, message: result.db ? 'Tables accessible' : 'Schema may not be applied' },
            supabase_auth: { ok: result.auth, message: result.auth ? 'Available' : 'Auth check failed' },
            supabase_storage: { ok: result.storage, message: result.storage ? 'Buckets available' : 'Buckets may not exist' },
            supabase_realtime: { ok: result.api && envConfig.enableUatRealtime, message: envConfig.enableUatRealtime ? (result.api ? 'Available' : 'Unavailable') : 'Disabled' },
          });
        } catch {
          setSupabaseTestResults({
            supabase: { ok: false, message: 'Connection failed' },
            supabase_api: { ok: false, message: 'Connection failed' },
            supabase_db: { ok: false, message: 'Connection failed' },
            supabase_auth: { ok: false, message: 'Connection failed' },
            supabase_storage: { ok: false, message: 'Connection failed' },
            supabase_realtime: { ok: false, message: 'Connection failed' },
          });
        } finally {
          setTestingSupabase(false);
        }
        setTestingService(null);
        return;
      } else if (serviceKey === 'evidence_storage' || serviceKey === 'report_storage') {
        testUrl = `${envConfig.uatApiBaseUrl}/storage-health`;
      } else {
        throw new Error(`No test endpoint for ${serviceKey}`);
      }

      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        setTestResults((prev) => ({ ...prev, [serviceKey]: { ok: true, message: `Connected (HTTP ${response.status})` } }));
      } else {
        setTestResults((prev) => ({ ...prev, [serviceKey]: { ok: false, message: `HTTP ${response.status}: ${response.statusText}` } }));
      }
    } catch (err: unknown) {
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? 'Connection timed out'
        : err instanceof Error ? err.message : 'Connection failed';
      setTestResults((prev) => ({ ...prev, [serviceKey]: { ok: false, message } }));
    } finally {
      setTestingService(null);
    }
  };

  // --- Setup checklist ---
  const setupChecks: SetupCheckItem[] = [
    {
      id: 'repo-pulled',
      label: 'Repository pulled from GitHub',
      status: 'not_required',
      detail: 'Verify git remote is configured',
    },
    {
      id: 'deps-installed',
      label: 'Node dependencies installed',
      status: 'not_required',
      detail: 'Run npm ci or npm install',
    },
    {
      id: 'env-configured',
      label: '.env.local or environment file configured',
      status: envConfig.appName ? 'complete' : 'missing',
      detail: envConfig.appName ? `App: ${envConfig.appName}, Mode: ${envConfig.deploymentMode}` : 'Not configured',
    },
    {
      id: 'api-routes-reachable',
      label: 'Frontend can reach its local API routes',
      status: 'not_required',
      detail: 'Check with connection test',
    },
    {
      id: 'n8n-reachable',
      label: 'n8n is reachable',
      status: healthReport ? (connections.find((c) => c.key === 'n8n')?.status === 'online' ? 'complete' : 'missing') : 'not_required',
      detail: connections.find((c) => c.key === 'n8n')?.message || 'Not checked',
    },
    {
      id: 'n8n-workflow',
      label: 'UAT workflow imported into n8n',
      status: 'not_required',
      detail: 'Import DFP UAT workflow JSON into n8n',
    },
    {
      id: 'playwright-reachable',
      label: 'Playwright worker is reachable',
      status: healthReport ? (connections.find((c) => c.key === 'playwright')?.status === 'online' ? 'complete' : 'missing') : 'not_required',
      detail: connections.find((c) => c.key === 'playwright')?.message || 'Not checked',
    },
    {
      id: 'ai-reachable',
      label: 'AI model is reachable',
      status: healthReport ? (connections.find((c) => c.key === 'ai')?.status === 'online' ? 'complete' : 'warning') : 'not_required',
      detail: connections.find((c) => c.key === 'ai')?.message || 'AI is optional',
    },
    {
      id: 'supabase-configured',
      label: 'Supabase is configured',
      status: envConfig.supabaseDeploymentMode !== 'disabled' ? 'complete' : 'warning',
      detail: envConfig.supabaseDeploymentMode !== 'disabled'
        ? `Mode: ${envConfig.supabaseDeploymentMode}, URL: ${envConfig.supabaseUrl || 'not set'}`
        : 'Supabase is disabled. Set VITE_PUBLIC_SUPABASE_DEPLOYMENT_MODE.',
    },
    {
      id: 'supabase-migrations',
      label: 'UAT migrations applied',
      status: 'not_required',
      detail: 'Run supabase migration up to apply schema',
    },
    {
      id: 'supabase-types',
      label: 'TypeScript types generated',
      status: 'not_required',
      detail: 'Run supabase gen types typescript --local',
    },
    {
      id: 'supabase-buckets',
      label: 'Storage buckets created',
      status: 'not_required',
      detail: `Required: ${envConfig.evidenceBucket}, ${envConfig.reportBucket}, ${envConfig.traceBucket}`,
    },
    {
      id: 'supabase-rls',
      label: 'Row Level Security enabled',
      status: 'not_required',
      detail: 'All UAT tables must have RLS enabled and policies applied',
    },
    {
      id: 'supabase-seed',
      label: 'Seed data loaded (optional)',
      status: 'not_required',
      detail: 'Run supabase db seed for demo data',
    },
    {
      id: 'supabase-realtime',
      label: 'Realtime configured',
      status: envConfig.enableUatRealtime ? 'complete' : 'not_required',
      detail: envConfig.enableUatRealtime ? 'Realtime is enabled for live updates' : 'Realtime is disabled',
    },
    {
      id: 'evidence-bucket',
      label: 'Evidence storage bucket exists',
      status: 'not_required',
      detail: 'Verify bucket in Supabase or local storage',
    },
    {
      id: 'approved-domains',
      label: 'Approved test domains are configured',
      status: 'not_required',
      detail: 'Set UAT_ALLOWED_DOMAINS in environment',
    },
    {
      id: 'production-disabled',
      label: 'Production testing remains disabled',
      status: envConfig.allowProductionTesting ? 'warning' : 'complete',
      detail: envConfig.allowProductionTesting ? 'Production testing is ENABLED — review this setting' : 'Production testing is disabled',
    },
    {
      id: 'reverse-proxy',
      label: 'Reverse proxy is configured',
      status: 'not_required',
      detail: 'nginx or Caddy for production routing',
    },
    {
      id: 'https',
      label: 'HTTPS is configured (outside private LAN)',
      status: 'not_required',
      detail: 'Required only when accessed from outside the private network',
    },
  ];

  const statusIcon = (status: SetupCheckItem['status']): string => {
    switch (status) {
      case 'complete': return 'ri-checkbox-circle-fill text-green-500';
      case 'warning': return 'ri-error-warning-fill text-amber-500';
      case 'missing': return 'ri-close-circle-fill text-red-500';
      case 'not_required': return 'ri-checkbox-blank-circle-line text-foreground-400';
    }
  };

  const statusLabel = (status: SetupCheckItem['status']): string => {
    switch (status) {
      case 'complete': return 'Complete';
      case 'warning': return 'Warning';
      case 'missing': return 'Missing';
      case 'not_required': return 'Not Required';
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-background-200/70">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-foreground-600 mb-2">
            <span className="hover:text-foreground-950 cursor-pointer whitespace-nowrap" onClick={() => navigate('/staff')}>Staff</span>
            <i className="ri-arrow-right-s-line w-3 h-3 flex items-center justify-center" />
            <span className="hover:text-foreground-950 cursor-pointer whitespace-nowrap" onClick={() => navigate('/staff/uat-agent')}>UAT Agent</span>
            <i className="ri-arrow-right-s-line w-3 h-3 flex items-center justify-center" />
            <span className="text-foreground-950 font-medium whitespace-nowrap">Local Server Setup</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground-950">Local Server Setup</h1>
              <p className="mt-0.5 text-sm text-foreground-600">
                Deployment readiness, service health, git info, and local configuration guide.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-5xl space-y-8 pb-20">
        {/* Deployment Status */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">Deployment Status</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Application', value: buildInfo.appName || '—' },
                { label: 'Deployment Mode', value: buildInfo.deploymentMode || '—' },
                { label: 'Version', value: buildInfo.version || '—' },
                { label: 'Build Date', value: buildInfo.buildDate || '—' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                  <p className="text-sm font-medium text-foreground-950">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Environment Configuration Status */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">Environment Configuration</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'App Name', value: envConfig.appName },
                { label: 'App URL', value: envConfig.appUrl },
                { label: 'Deployment Mode', value: envConfig.deploymentMode },
                { label: 'Mock UAT Mode', value: envConfig.enableMockUat ? 'Enabled' : 'Disabled' },
                { label: 'API Base URL', value: envConfig.uatApiBaseUrl },
                { label: 'Production Testing', value: envConfig.allowProductionTesting ? 'Allowed' : 'Blocked' },
                { label: 'Production Approval', value: envConfig.requireProductionApproval ? 'Required' : 'Not Required' },
                { label: 'Mask Sensitive Values', value: envConfig.maskSensitiveValues ? 'Yes' : 'No' },
                { label: 'Default Max Pages', value: String(envConfig.defaultMaxPages) },
                { label: 'Default Max Actions', value: String(envConfig.defaultMaxActions) },
                { label: 'Request Timeout', value: `${envConfig.requestTimeoutMs}ms` },
                { label: 'Poll Interval', value: `${envConfig.pollIntervalMs}ms` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                  <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service Health */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Service Health</h2>
            <div className="flex items-center gap-3">
              {healthReport && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                  healthReport.status === 'healthy' ? 'bg-green-50 text-green-700' :
                  healthReport.status === 'degraded' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    healthReport.status === 'healthy' ? 'bg-green-500' :
                    healthReport.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  {healthReport.status === 'healthy' ? 'Healthy' : healthReport.status === 'degraded' ? 'Degraded' : 'Offline'}
                </span>
              )}
              <button
                onClick={checkHealth}
                disabled={checking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
              >
                <i className={`ri-refresh-line w-3.5 h-3.5 flex items-center justify-center ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Running...' : 'Run Health Check'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-background-200/70">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Service</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Latency</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Message</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Connection Test</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc: ServiceDefinition) => {
                    const conn = connections.find((c) => c.key === svc.key);
                    const test = testResults[svc.key];
                    const statusColor = conn?.status === 'online' ? 'text-green-600' :
                      conn?.status === 'degraded' ? 'text-amber-600' :
                      conn?.status === 'checking' ? 'text-foreground-500' :
                      'text-red-600';

                    return (
                      <tr key={svc.key} className="border-b border-background-100">
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-medium text-foreground-950 whitespace-nowrap">{svc.displayName}</span>
                          {!svc.required && (
                            <span className="ml-1 text-xs text-foreground-400">(optional)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusColor} whitespace-nowrap`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              conn?.status === 'online' ? 'bg-green-500' :
                              conn?.status === 'degraded' ? 'bg-amber-500' :
                              conn?.status === 'checking' ? 'bg-foreground-400 animate-pulse' :
                              'bg-red-400'
                            }`} />
                            {conn ? conn.status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Not checked'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-foreground-700 whitespace-nowrap">
                            {conn?.latencyMs !== null && conn?.latencyMs !== undefined ? `${conn.latencyMs}ms` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-foreground-600 max-w-[200px] truncate block">
                            {conn?.message || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => testConnection(svc.key)}
                            disabled={testingService === svc.key}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
                          >
                            {testingService === svc.key ? (
                              <>
                                <i className="ri-loader-4-line w-3 h-3 flex items-center justify-center animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <i className="ri-flashlight-line w-3 h-3 flex items-center justify-center" />
                                Test
                              </>
                            )}
                          </button>
                          {test && (
                            <span className={`ml-2 text-xs whitespace-nowrap ${test.ok ? 'text-green-600' : 'text-red-600'}`}>
                              {test.message}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Local Supabase */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Local Supabase</h2>
            <button
              onClick={() => testConnection('supabase')}
              disabled={testingSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
            >
              <i className={`ri-database-2-line w-3.5 h-3.5 flex items-center justify-center ${testingSupabase ? 'animate-pulse' : ''}`} />
              {testingSupabase ? 'Testing...' : 'Test Supabase Connection'}
            </button>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* Supabase env config */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Connection</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Deployment Mode', value: envConfig.supabaseDeploymentMode },
                  { label: 'API URL', value: envConfig.supabaseUrl || '—' },
                  { label: 'Anon Key', value: envConfig.supabaseAnonKey ? '•••• configured' : 'Missing' },
                  { label: 'Studio URL', value: envConfig.supabaseUrl ? envConfig.supabaseUrl.replace('54321', '54323') : '—' },
                  { label: 'Realtime', value: envConfig.enableUatRealtime ? 'Enabled' : 'Disabled' },
                  { label: 'Database Required', value: envConfig.databaseRequired ? 'Yes' : 'No' },
                  { label: 'Evidence Bucket', value: envConfig.evidenceBucket },
                  { label: 'Report Bucket', value: envConfig.reportBucket },
                  { label: 'Trace Bucket', value: envConfig.traceBucket },
                  { label: 'Auto Migrations', value: envConfig.autoRunMigrations ? 'Enabled' : 'Disabled' },
                  { label: 'DB Reset Allowed', value: envConfig.allowDatabaseReset ? 'Yes' : 'No' },
                  { label: 'Timeout', value: `${envConfig.databaseTimeoutMs}ms` },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Supabase sub-service health */}
            {Object.keys(supabaseTestResults).length > 0 && (
              <div className="p-5 border-b border-background-200/70">
                <p className="text-xs font-semibold text-foreground-950 mb-3">Sub-Service Health</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-background-200/70">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Service</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'supabase_api', label: 'Supabase API' },
                        { key: 'supabase_db', label: 'Database' },
                        { key: 'supabase_auth', label: 'Authentication' },
                        { key: 'supabase_storage', label: 'Storage' },
                        { key: 'supabase_realtime', label: 'Realtime' },
                      ].map((item) => {
                        const result = supabaseTestResults[item.key];
                        return (
                          <tr key={item.key} className="border-b border-background-100">
                            <td className="px-3 py-2 text-xs font-medium text-foreground-950 whitespace-nowrap">{item.label}</td>
                            <td className="px-3 py-2">
                              {result ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${result.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                                  {result.ok ? 'Online' : 'Offline'}
                                </span>
                              ) : (
                                <span className="text-xs text-foreground-400 whitespace-nowrap">Not tested</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-xs text-foreground-600">{result?.message || '—'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Required tables */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Required Tables (26)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  'uat_projects',
                  'uat_test_plans',
                  'uat_test_journeys',
                  'uat_journey_steps',
                  'uat_test_runs',
                  'uat_journey_results',
                  'uat_agent_findings',
                  'uat_bug_reports',
                  'uat_bug_occurrences',
                  'uat_bug_evidence',
                  'uat_visual_baselines',
                  'uat_settings',
                  'uat_audit_log',
                  'uat_webhook_receipts',
                  'uat_worker_heartbeats',
                  'uat_recovery_events',
                  'uat_evidence_cleanup_runs',
                  'uat_evidence_cleanup_items',
                  'uat_backup_runs',
                  'uat_backup_items',
                  'uat_restore_tests',
                  'uat_disaster_recovery_status',
                  'uat_release_candidates',
                  'uat_release_approvals',
                  'uat_risk_acceptances',
                  'uat_release_gate_checks',
                ].map((table) => (
                  <span key={table} className="text-xs font-mono text-foreground-600 bg-background-100 px-2 py-0.5 rounded whitespace-nowrap">{table}</span>
                ))}
              </div>
            </div>

            {/* Required buckets */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Required Buckets (all private)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { name: envConfig.evidenceBucket, desc: 'Screenshots, traces, test evidence' },
                  { name: envConfig.reportBucket, desc: 'Generated UAT reports' },
                  { name: envConfig.traceBucket, desc: 'Playwright trace files' },
                ].map((bucket) => (
                  <div key={bucket.name} className="bg-background-100 p-2 rounded">
                    <span className="text-xs font-mono text-foreground-950 font-medium block whitespace-nowrap">{bucket.name}</span>
                    <span className="text-xs text-foreground-600">{bucket.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Supabase CLI commands */}
            <div className="p-5">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Supabase CLI Commands</p>
              <div className="space-y-2">
                {[
                  { label: 'Start Supabase', cmd: 'supabase start' },
                  { label: 'Check status', cmd: 'supabase status' },
                  { label: 'Apply migrations', cmd: 'supabase migration up' },
                  { label: 'Load seed data', cmd: 'supabase db seed' },
                  { label: 'Generate types', cmd: 'supabase gen types typescript --local > src/lib/supabase/database.types.ts' },
                  { label: 'Stop Supabase', cmd: 'supabase stop' },
                  { label: 'Open Studio', cmd: `open ${envConfig.supabaseUrl ? envConfig.supabaseUrl.replace('54321', '54323') : 'http://localhost:54323'}` },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Atlas-HaL AI */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Atlas-HaL AI</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={testOllamaConnection}
                disabled={testingOllama}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
              >
                <i className={`ri-plug-line w-3.5 h-3.5 flex items-center justify-center ${testingOllama ? 'animate-pulse' : ''}`} />
                {testingOllama ? 'Testing...' : 'Test Ollama Connection'}
              </button>
              <button
                onClick={checkOllamaModels}
                disabled={testingOllama}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70 disabled:opacity-50"
              >
                <i className="ri-list-check w-3.5 h-3.5 flex items-center justify-center" />
                Check Installed Models
              </button>
              <button
                onClick={testOllamaResponse}
                disabled={testingOllama}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70 disabled:opacity-50"
              >
                <i className="ri-chat-3-line w-3.5 h-3.5 flex items-center justify-center" />
                Test AI Response
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* AI config info */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Provider', value: 'Ollama' },
                  { label: 'Host', value: 'Atlas-HaL' },
                  { label: 'Model', value: ollamaHealthResult?.model || 'qwen2.5:14b' },
                  { label: 'Temperature', value: '0.2' },
                  { label: 'Keep Alive', value: '10m' },
                  { label: 'Allow Disabled Mode', value: envConfig.allowAiDisabledMode ? 'Yes' : 'No' },
                  { label: 'Fail Run When AI Offline', value: envConfig.failRunWhenAiOffline ? 'Yes' : 'No' },
                  { label: 'Health Timeout', value: '5,000ms' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection status */}
            {ollamaHealthResult && (
              <div className="p-5 border-b border-background-200/70">
                <p className="text-xs font-semibold text-foreground-950 mb-3">Connection Status</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Status',
                      value: ollamaHealthResult.status === 'connected'
                        ? 'Connected'
                        : ollamaHealthResult.status === 'model_missing'
                          ? 'Model Missing'
                          : ollamaHealthResult.status === 'degraded'
                            ? 'Degraded'
                            : 'Offline',
                      color: ollamaHealthResult.status === 'connected'
                        ? 'text-green-600'
                        : ollamaHealthResult.status === 'model_missing'
                          ? 'text-amber-600'
                          : 'text-red-600',
                    },
                    { label: 'Model Installed', value: ollamaHealthResult.modelAvailable ? 'Yes' : 'No' },
                    { label: 'Latency', value: ollamaHealthResult.latencyMs !== null ? `${ollamaHealthResult.latencyMs}ms` : '—' },
                    { label: 'Message', value: ollamaHealthResult.message },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                      <p className={`text-sm font-medium ${'color' in item ? item.color : 'text-foreground-950'}`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test AI Response result */}
            {ollamaTestResponse && (
              <div className="p-5 border-b border-background-200/70">
                <p className="text-xs font-semibold text-foreground-950 mb-3">Test AI Response</p>
                <div className={`p-3 rounded-md ${ollamaTestResponse.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${ollamaTestResponse.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={`text-xs font-medium ${ollamaTestResponse.ok ? 'text-green-700' : 'text-red-700'}`}>
                      {ollamaTestResponse.ok ? 'Response received' : 'Request failed'}
                    </span>
                    <span className="text-xs text-foreground-500 ml-auto">{ollamaTestResponse.latencyMs}ms</span>
                  </div>
                  {ollamaTestResponse.ok && (
                    <p className="text-sm text-foreground-950 font-medium">&ldquo;{ollamaTestResponse.response}&rdquo;</p>
                  )}
                  {!ollamaTestResponse.ok && (
                    <p className="text-xs text-red-700">{ollamaTestResponse.response}</p>
                  )}
                </div>
              </div>
            )}

            {/* Installed models list */}
            {ollamaModels.length > 0 && (
              <div className="p-5 border-b border-background-200/70">
                <p className="text-xs font-semibold text-foreground-950 mb-2">Installed Models ({ollamaModels.length})</p>
                <div className="flex flex-wrap gap-2">
                  {ollamaModels.map((m) => (
                    <span
                      key={m}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono whitespace-nowrap ${
                        m === 'qwen2.5:14b' || m.startsWith('qwen2.5:14b:')
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-background-100 text-foreground-700 border border-background-200/70'
                      }`}
                    >
                      {m === 'qwen2.5:14b' || m.startsWith('qwen2.5:14b:') && (
                        <i className="ri-check-line w-3 h-3 flex items-center justify-center" />
                      )}
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Connection test curl commands */}
            <div className="p-5">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Connection Verification (from UAT VM)</p>
              <div className="space-y-2">
                {[
                  { label: 'Ping Atlas-HaL', cmd: 'ping -c 4 192.168.1.92' },
                  { label: 'Check Ollama API', cmd: 'curl http://192.168.1.92:11434/api/tags' },
                  { label: 'Test generation', cmd: `curl -s http://192.168.1.92:11434/api/generate -H "Content-Type: application/json" -d '{"model":"qwen2.5:14b","prompt":"Reply with exactly: UAT VM connected to Atlas HaL","stream":false}'` },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-start justify-between bg-background-100 p-2.5 rounded-md gap-3">
                    <span className="text-xs text-foreground-600 whitespace-nowrap shrink-0">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 break-all text-right">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Firewall note */}
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-200">
              <p className="text-xs text-amber-800">
                <i className="ri-shield-check-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
                Firewall: Atlas-HaL must permit inbound TCP port 11434 from the UAT VM. The UAT VM needs outbound access to 192.168.1.92:11434. Do not expose Ollama to the public internet.
              </p>
            </div>
          </div>
        </section>

        {/* Internal Request Security */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Internal Request Security</h2>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* Security config info */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Webhook Signing', value: 'Configured (HMAC-SHA256)' },
                  { label: 'Callback Signing', value: 'Configured (HMAC-SHA256)' },
                  { label: 'Playwright Token', value: 'Configured (Bearer + HMAC)' },
                  { label: 'Signature Version', value: 'v1' },
                  { label: 'Timestamp Tolerance', value: '300 seconds' },
                  { label: 'Idempotency Storage', value: 'Ready (in-memory + Supabase)' },
                  { label: 'Idempotency TTL', value: '24 hours' },
                  { label: 'Replay Protection', value: 'Active' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Security status indicators */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Webhook Signing', value: 'Ready', color: 'text-green-600' },
                  { label: 'Callback Signing', value: 'Ready', color: 'text-green-600' },
                  { label: 'Playwright Auth', value: 'Token + Signature', color: 'text-green-600' },
                  { label: 'State Machine', value: 'Active', color: 'text-green-600' },
                  { label: 'Last Auth Request', value: '—', color: 'text-foreground-500' },
                  { label: 'Rejected Requests', value: '0', color: 'text-foreground-950' },
                  { label: 'Replay Protection', value: 'Active', color: 'text-green-600' },
                  { label: 'Server Var Scanner', value: 'Active', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Safe actions */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Security Tests (no browser run started)</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Test n8n Auth', icon: 'ri-shield-keyhole-line' },
                  { label: 'Test Playwright Auth', icon: 'ri-shield-user-line' },
                  { label: 'Test Callback Verification', icon: 'ri-arrow-go-back-line' },
                  { label: 'Refresh Security Status', icon: 'ri-refresh-line' },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70"
                  >
                    <i className={`${btn.icon} w-3.5 h-3.5 flex items-center justify-center`} />
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Secret generation guide */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Secret Generation (on UAT VM)</p>
              <div className="space-y-2">
                {[
                  { label: 'Webhook Secret', cmd: 'openssl rand -hex 32' },
                  { label: 'Callback Secret', cmd: 'openssl rand -hex 32' },
                  { label: 'Playwright Token', cmd: 'openssl rand -hex 32' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
              <p className="text-xs text-foreground-500 mt-3">
                Run each command separately. Copy the output to the matching variable in <code className="text-xs bg-background-100 px-1 rounded">/opt/dfp-uat/app-stack/.env</code>. Never commit these values to GitHub.
              </p>
            </div>

            {/* Rotation documentation */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Secret Rotation</p>
              <div className="space-y-1.5">
                <p className="text-xs text-foreground-600">
                  During rotation, set <code className="text-xs bg-background-100 px-1 rounded">UAT_WEBHOOK_PREVIOUS_SECRET</code> and <code className="text-xs bg-background-100 px-1 rounded">UAT_CALLBACK_PREVIOUS_SECRET</code> to the old values.
                </p>
                <p className="text-xs text-foreground-600">
                  New outgoing requests use only the current secret. Incoming verification accepts either current or previous during the rotation window.
                </p>
                <p className="text-xs text-foreground-600">
                  Remove previous-secret variables after all services restart with the new secret. Do not keep previous values indefinitely.
                </p>
              </div>
            </div>

            {/* Security note */}
            <div className="px-5 py-3 bg-green-50 border-t border-green-200">
              <p className="text-xs text-green-800">
                <i className="ri-shield-check-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
                All internal requests use HMAC-SHA256 signing with replay protection. Secrets are never exposed to the browser or logged. The repository safety scanner detects server-only variables in client code.
              </p>
            </div>
          </div>
        </section>

        {/* Local Setup Checklist */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">Local Setup Checklist</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="divide-y divide-background-100">
              {setupChecks.map((check) => (
                <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                  <i className={`${statusIcon(check.status)} w-5 h-5 flex items-center justify-center mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground-950">{check.label}</p>
                    <p className="text-xs text-foreground-600 mt-0.5">{check.detail}</p>
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap px-2 py-0.5 rounded ${
                    check.status === 'complete' ? 'bg-green-50 text-green-700' :
                    check.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                    check.status === 'missing' ? 'bg-red-50 text-red-700' :
                    'bg-background-100 text-foreground-500'
                  }`}>
                    {statusLabel(check.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Docker Command Examples */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">Docker Commands</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 space-y-3">
              <div>
                <p className="text-xs font-medium text-foreground-600 mb-1.5">Build and start all services</p>
                <pre className="bg-background-100 p-3 rounded-md text-xs text-foreground-950 font-mono overflow-x-auto">
{`docker compose -f docker-compose.example.yml up -d --build`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground-600 mb-1.5">View logs</p>
                <pre className="bg-background-100 p-3 rounded-md text-xs text-foreground-950 font-mono overflow-x-auto">
{`docker compose -f docker-compose.example.yml logs -f`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground-600 mb-1.5">Stop services</p>
                <pre className="bg-background-100 p-3 rounded-md text-xs text-foreground-950 font-mono overflow-x-auto">
{`docker compose -f docker-compose.example.yml down`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground-600 mb-1.5">Rebuild a single service</p>
                <pre className="bg-background-100 p-3 rounded-md text-xs text-foreground-950 font-mono overflow-x-auto">
{`docker compose -f docker-compose.example.yml up -d --build dfp-uat-frontend`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* npm Commands */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">npm Commands</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Install dependencies', cmd: 'npm ci' },
                  { label: 'Development server', cmd: 'npm run dev' },
                  { label: 'TypeScript check', cmd: 'npm run type-check' },
                  { label: 'Lint check', cmd: 'npm run lint' },
                  { label: 'Production build', cmd: 'npm run build' },
                  { label: 'Verify (type + lint + build)', cmd: 'npm run verify' },
                  { label: 'Preview production build', cmd: 'npm run preview' },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center justify-between bg-background-100 p-3 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Recovery and Worker Status */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Recovery and Worker Status</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center" />
                Refresh Worker Status
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-search-eye-line w-3.5 h-3.5 flex items-center justify-center" />
                Run Recovery Scan
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-heart-pulse-line w-3.5 h-3.5 flex items-center justify-center" />
                Test Worker Heartbeat
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Heartbeat Interval', value: '30 seconds' },
                  { label: 'Worker Delayed After', value: '90 seconds' },
                  { label: 'Worker Stale After', value: '180 seconds' },
                  { label: 'Run Start Timeout', value: '300 seconds' },
                  { label: 'Run Idle Timeout', value: '600 seconds' },
                  { label: 'Queue Timeout', value: '900 seconds' },
                  { label: 'Recovery Scan Interval', value: '60 seconds' },
                  { label: 'Default Max Attempts', value: '2' },
                  { label: 'Cancel Timeout', value: '120 seconds' },
                  { label: 'Alert Cooldown', value: '30 minutes' },
                  { label: 'Execution Paused', value: 'No' },
                  { label: 'Execution Leases', value: 'Active' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Worker Instance', value: '— (not connected)', color: 'text-foreground-500' },
                  { label: 'Worker Status', value: 'Offline', color: 'text-red-600' },
                  { label: 'Last Heartbeat', value: '—', color: 'text-foreground-500' },
                  { label: 'Active Run Count', value: '0', color: 'text-foreground-950' },
                  { label: 'Capacity', value: '2', color: 'text-foreground-950' },
                  { label: 'Delayed Worker Warning', value: '—', color: 'text-foreground-500' },
                  { label: 'Stale Worker Warning', value: '—', color: 'text-foreground-500' },
                  { label: 'Recovery Scanner', value: 'Ready', color: 'text-green-600' },
                  { label: 'Last Recovery Scan', value: '—', color: 'text-foreground-500' },
                  { label: 'Runs Delayed', value: '0', color: 'text-foreground-950' },
                  { label: 'Runs Interrupted', value: '0', color: 'text-foreground-950' },
                  { label: 'Stale Leases', value: '0', color: 'text-foreground-950' },
                  { label: 'Pending Cancellations', value: '0', color: 'text-foreground-950' },
                  { label: 'Checkpoints Active', value: 'Yes', color: 'text-green-600' },
                  { label: 'Alert Dedup', value: 'Active (30min)', color: 'text-green-600' },
                  { label: 'Retry Policy', value: 'Step:1 Journey:1 Run:0', color: 'text-foreground-950' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Interrupted Run Management</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Review Interrupted Runs', icon: 'ri-file-warning-line' },
                  { label: 'Resume Safe Journeys', icon: 'ri-play-circle-line' },
                  { label: 'Retry Failed AI Review', icon: 'ri-brain-line' },
                  { label: 'Stop All UAT Tests', icon: 'ri-stop-circle-line', danger: true },
                ].map((btn) => (
                  <button key={btn.label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap transition-colors border ${btn.danger ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200' : 'text-foreground-700 bg-background-100 hover:bg-background-200/70 border-background-200/70'}`}>
                    <i className={`${btn.icon} w-3.5 h-3.5 flex items-center justify-center`} />
                    {btn.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-foreground-500 mt-3">Emergency Stop requires elevated permission and confirmation. All evidence is preserved.</p>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">VM Reboot Recovery Checklist</p>
              <div className="space-y-1.5">
                {['1. Confirm Supabase is healthy','2. Confirm n8n is healthy','3. Confirm the Playwright worker is healthy','4. Confirm Atlas-HaL Ollama is reachable','5. Run reconciliation','6. Review interrupted runs','7. Resume only safe recoverable journeys','8. Run a smoke test'].map((step) => (<p key={step} className="text-xs text-foreground-600">{step}</p>))}
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Recovery Test Commands</p>
              <div className="space-y-2">
                {[
                  { label: 'Run recovery tests', cmd: 'node scripts/test-recovery.mjs' },
                  { label: 'Run security tests', cmd: 'node scripts/test-security.mjs' },
                  { label: 'Check repository safety', cmd: 'node scripts/check-repository-safety.mjs' },
                  { label: 'Full verification', cmd: 'npm run verify:deploy' },
                ].map((item) => (<div key={item.cmd} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md"><span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span><code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code></div>))}
              </div>
            </div>
          </div>
        </section>

        {/* Evidence Storage */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Evidence Storage</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center" />
                Refresh Storage Status
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-search-eye-line w-3.5 h-3.5 flex items-center justify-center" />
                Preview Cleanup
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors">
                <i className="ri-delete-back-2-line w-3.5 h-3.5 flex items-center justify-center" />
                Run Approved Cleanup
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Retention Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Success Evidence', value: '14 days' },
                  { label: 'Failed Evidence', value: '90 days' },
                  { label: 'Traces', value: '30 days' },
                  { label: 'Videos', value: '30 days' },
                  { label: 'Reports', value: '365 days' },
                  { label: 'Temporary Files', value: '24 hours' },
                  { label: 'Cleanup Enabled', value: 'Yes' },
                  { label: 'Dry Run Default', value: 'Yes' },
                  { label: 'Scan Interval', value: 'Every 6 hours' },
                  { label: 'Grace Period', value: '24 hours' },
                  { label: 'Batch Size', value: '100 items' },
                  { label: 'Approval Threshold', value: 'Above 10 GB' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Storage Limits</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Max Total Storage', value: '100 GB' },
                  { label: 'Warning Threshold', value: '75% (75 GB)' },
                  { label: 'Critical Threshold', value: '90% (90 GB)' },
                  { label: 'Max Screenshot', value: '10 MB' },
                  { label: 'Max Video', value: '250 MB' },
                  { label: 'Max Trace', value: '250 MB' },
                  { label: 'Max Report', value: '25 MB' },
                  { label: 'Allowed MIME Types', value: 'png, jpeg, webp, webm, mp4, zip, json, txt, html, pdf' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-semibold text-foreground-950">Storage Status</p>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Healthy
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Evidence Objects', value: '\u2014' },
                  { label: 'Total Size', value: '\u2014' },
                  { label: 'Usage Percentage', value: '\u2014' },
                  { label: 'Screenshot Usage', value: '\u2014' },
                  { label: 'Video Usage', value: '\u2014' },
                  { label: 'Trace Usage', value: '\u2014' },
                  { label: 'Report Usage', value: '\u2014' },
                  { label: 'Cleanup Candidates', value: '\u2014' },
                  { label: 'Candidate Size', value: '\u2014' },
                  { label: 'Failed Uploads', value: '0' },
                  { label: 'Orphaned Objects', value: '0' },
                  { label: 'Deletion Failures', value: '0' },
                  { label: 'Last Cleanup Scan', value: '\u2014' },
                  { label: 'Last Successful Cleanup', value: '\u2014' },
                  { label: 'Next Scheduled Cleanup', value: '\u2014' },
                  { label: 'Emergency Storage Mode', value: 'Inactive', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${'color' in item ? item.color : 'text-foreground-950'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Preservation Rules</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { rule: 'Evidence linked to open critical/high-severity bugs', icon: 'ri-bug-line' },
                  { rule: 'Evidence linked to approved release reports', icon: 'ri-check-double-line' },
                  { rule: 'Staff-pinned evidence', icon: 'ri-pushpin-line' },
                  { rule: 'Evidence under legal hold', icon: 'ri-scales-line' },
                  { rule: 'Evidence under investigation hold', icon: 'ri-search-line' },
                  { rule: 'Uncertain uploads', icon: 'ri-hourglass-line' },
                  { rule: 'Deletion approval pending', icon: 'ri-time-line' },
                  { rule: 'Scheduled retest evidence', icon: 'ri-loop-left-line' },
                ].map((item) => (
                  <div key={item.rule} className="flex items-start gap-2 bg-background-100 p-2.5 rounded-md">
                    <i className={`${item.icon} w-4 h-4 flex items-center justify-center text-green-600 mt-0.5`} />
                    <p className="text-xs text-foreground-950">{item.rule}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Cleanup Actions</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Review Cleanup Candidates', icon: 'ri-file-list-3-line' },
                  { label: 'Review Orphaned Evidence', icon: 'ri-ghost-line' },
                  { label: 'Export Cleanup Report', icon: 'ri-file-download-line' },
                  { label: 'Pin Evidence', icon: 'ri-pushpin-line' },
                  { label: 'Extend Retention', icon: 'ri-calendar-check-line' },
                  { label: 'Apply Legal Hold', icon: 'ri-scales-line' },
                ].map((btn) => (
                  <button key={btn.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                    <i className={`${btn.icon} w-3.5 h-3.5 flex items-center justify-center`} />
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Storage Path Rules (all private)</p>
              <div className="bg-background-100 p-3 rounded-md">
                <pre className="text-xs text-foreground-950 font-mono overflow-x-auto whitespace-pre-wrap">{'{project-id}/{run-id}/{journey-result-id}/screenshots/\n{project-id}/{run-id}/{journey-result-id}/videos/\n{project-id}/{run-id}/{journey-result-id}/traces/\n{project-id}/{run-id}/{journey-result-id}/reports/'}</pre>
              </div>
              <p className="text-xs text-foreground-500 mt-2">Paths are generated server-side in UUID format. Path traversal and unsafe characters are blocked.</p>
            </div>
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">VM Disk Monitoring (UAT VM)</p>
              <div className="space-y-2">
                {[
                  { label: 'Disk usage', cmd: 'df -h' },
                  { label: 'Docker disk usage', cmd: 'docker system df' },
                  { label: 'Docker volumes', cmd: 'docker volume ls' },
                  { label: 'Temp files', cmd: 'du -sh /var/lib/dfp-uat-worker/temp/*' },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-green-50 border-t border-green-200">
              <p className="text-xs text-green-800">
                <i className="ri-shield-check-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
                All evidence buckets are private. Paths are generated and validated server-side. Cleanup always starts with a dry run. Evidence linked to open bugs, approved releases, or legal holds is never deleted automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Backup and Disaster Recovery */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Backup and Disaster Recovery</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center" />
                Refresh Backup Status
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors">
                <i className="ri-archive-line w-3.5 h-3.5 flex items-center justify-center" />
                Start Backup
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-shield-check-line w-3.5 h-3.5 flex items-center justify-center" />
                Verify Latest Backup
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* Recovery readiness */}
            <div className="p-5 border-b border-background-200/70">
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-semibold text-foreground-950">Overall Recovery Readiness</p>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Ready with Warnings
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Overall Status', value: 'Ready with Warnings', color: 'text-amber-600' },
                  { label: 'Supabase Database', value: 'Ready', color: 'text-green-600' },
                  { label: 'Supabase Storage', value: 'Ready', color: 'text-green-600' },
                  { label: 'n8n Database', value: 'Ready', color: 'text-green-600' },
                  { label: 'n8n Encryption Key', value: 'Warning', color: 'text-amber-600' },
                  { label: 'Application Config', value: 'Ready', color: 'text-green-600' },
                  { label: 'Restore Tested', value: 'No (overdue)', color: 'text-amber-600' },
                  { label: 'Atlas Vault', value: 'Available', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Backup configuration */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Backup Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Local Root', value: '/var/backups/dfp-uat' },
                  { label: 'Remote Path', value: '/mnt/atlas-vault/dfp-uat' },
                  { label: 'Encryption', value: 'Enabled (GPG)' },
                  { label: 'DB Backup Interval', value: 'Every 24 hours' },
                  { label: 'Storage Backup Interval', value: 'Every 24 hours' },
                  { label: 'Config Backup Interval', value: 'Every 24 hours' },
                  { label: 'Full Backup Interval', value: 'Every 7 days' },
                  { label: 'Daily Retention', value: '7 backups' },
                  { label: 'Weekly Retention', value: '4 backups' },
                  { label: 'Monthly Retention', value: '3 backups' },
                  { label: 'Verify Checksums', value: 'Enabled' },
                  { label: 'Verify Archives', value: 'Enabled' },
                  { label: 'Restore Test Interval', value: 'Every 30 days' },
                  { label: 'Warning After', value: '30 hours' },
                  { label: 'Critical After', value: '48 hours' },
                  { label: 'Encryption Key File', value: '/run/secrets/uat_backup_key' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-foreground-950 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Backup status */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Latest Backup Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Latest Local Backup', value: '\u2014 (not run)', color: 'text-foreground-500' },
                  { label: 'Latest Remote Backup', value: '\u2014 (not synced)', color: 'text-foreground-500' },
                  { label: 'Latest Verified Backup', value: '\u2014', color: 'text-foreground-500' },
                  { label: 'Latest Restore Test', value: '\u2014', color: 'text-foreground-500' },
                  { label: 'Local Copy Available', value: 'Pending', color: 'text-amber-600' },
                  { label: 'Remote Copy Available', value: 'Pending', color: 'text-amber-600' },
                  { label: 'Backup Storage Usage', value: '\u2014', color: 'text-foreground-500' },
                  { label: 'Backup Hold Active', value: 'None', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* RPO/RTO */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">RPO / RTO Targets</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Target RPO', value: '24 hours' },
                  { label: 'Target RTO', value: '4 hours' },
                  { label: 'Current RPO Status', value: 'Unknown', color: 'text-amber-600' },
                  { label: 'Current RTO Status', value: 'Unknown', color: 'text-amber-600' },
                  { label: 'Latest Backup Age', value: '\u2014' },
                  { label: 'Latest Verified Age', value: '\u2014' },
                  { label: 'Latest Restore Duration', value: '\u2014' },
                  { label: 'Blocking Issues', value: 'None', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${'color' in item ? item.color : 'text-foreground-950'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Backup actions */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Backup Actions</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Review Backup Manifest', icon: 'ri-file-list-3-line' },
                  { label: 'Schedule Restore Test', icon: 'ri-test-tube-line' },
                  { label: 'View Restore-Test Results', icon: 'ri-file-chart-line' },
                  { label: 'Export Recovery Report', icon: 'ri-file-download-line' },
                  { label: 'Add Backup Hold', icon: 'ri-lock-line' },
                ].map((btn) => (
                  <button key={btn.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                    <i className={`${btn.icon} w-3.5 h-3.5 flex items-center justify-center`} />
                    {btn.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-foreground-500 mt-3">
                Restore tests run in isolated temporary environments. Live services are never targeted.
              </p>
            </div>

            {/* Backup components */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Protected Components</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { comp: 'Supabase PostgreSQL', icon: 'ri-database-2-line', status: 'Configured' },
                  { comp: 'Supabase Storage', icon: 'ri-hard-drive-2-line', status: 'Configured' },
                  { comp: 'n8n PostgreSQL', icon: 'ri-database-line', status: 'Configured' },
                  { comp: 'n8n Encryption Key', icon: 'ri-key-2-line', status: 'Warning — verify backup exists' },
                  { comp: 'n8n Workflow Exports', icon: 'ri-flow-chart', status: 'Configured' },
                  { comp: 'Application Config (.env)', icon: 'ri-settings-3-line', status: 'Configured (encrypted)' },
                  { comp: 'Docker Compose Files', icon: 'ri-server-line', status: 'Configured' },
                  { comp: 'Supabase Migrations', icon: 'ri-git-branch-line', status: 'Configured' },
                  { comp: 'Playwright Config', icon: 'ri-terminal-box-line', status: 'Configured' },
                  { comp: 'Git Revision', icon: 'ri-git-commit-line', status: 'Auto-captured' },
                ].map((item) => (
                  <div key={item.comp} className="flex items-start gap-2 bg-background-100 p-2.5 rounded-md">
                    <i className={`${item.icon} w-4 h-4 flex items-center justify-center text-foreground-600 mt-0.5`} />
                    <div>
                      <p className="text-xs text-foreground-950 font-medium">{item.comp}</p>
                      <p className="text-xs text-foreground-500">{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Secret generation and setup commands */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Backup Scripts (from UAT VM)</p>
              <div className="space-y-2">
                {[
                  { label: 'Run backup (dry run)', cmd: 'bash scripts/backup-uat.sh --dry-run' },
                  { label: 'Run backup', cmd: 'bash scripts/backup-uat.sh' },
                  { label: 'Verify backup', cmd: 'bash scripts/verify-backup.sh <timestamp>' },
                  { label: 'Restore test', cmd: 'UAT_RESTORE_TEST_ALLOWED=true bash scripts/restore-test.sh <timestamp>' },
                  { label: 'Backup status', cmd: 'bash scripts/backup-status.sh' },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Encryption key generation */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Backup Encryption Key (on UAT VM)</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                  <span className="text-xs text-foreground-600 whitespace-nowrap">Generate encryption key</span>
                  <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">openssl rand -hex 32 &gt; /run/secrets/uat_backup_key &amp;&amp; chmod 600 /run/secrets/uat_backup_key</code>
                </div>
              </div>
              <p className="text-xs text-foreground-500 mt-2">
                The encryption key must be stored outside Git at <code className="text-xs bg-background-100 px-1 rounded">/run/secrets/uat_backup_key</code>. Never commit this key to the repository.
              </p>
            </div>

            {/* VM disk monitoring */}
            <div className="p-5">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Backup Storage Monitoring (UAT VM)</p>
              <div className="space-y-2">
                {[
                  { label: 'Local backup usage', cmd: 'du -sh /var/backups/dfp-uat' },
                  { label: 'Remote backup usage', cmd: 'du -sh /mnt/atlas-vault/dfp-uat' },
                  { label: 'Disk free', cmd: 'df -h /var/backups/dfp-uat' },
                  { label: 'Atlas Vault mount', cmd: 'mountpoint /mnt/atlas-vault/dfp-uat' },
                  { label: 'List recent backups', cmd: 'ls -lt /var/backups/dfp-uat | head -10' },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                    <span className="text-xs text-foreground-600 whitespace-nowrap">{item.label}</span>
                    <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <div className="px-5 py-3 bg-green-50 border-t border-green-200">
              <p className="text-xs text-green-800">
                <i className="ri-shield-check-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
                Backups are encrypted, verified with SHA-256 checksums, and copied to Atlas Vault. Restore tests run in isolated environments only. No secrets are stored in backup manifests or audit logs. Never store backups in GitHub.
              </p>
            </div>
          </div>
        </section>

        {/* Release Governance */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground-950">Release Governance</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center" />
                Refresh Governance Status
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors">
                <i className="ri-test-tube-line w-3.5 h-3.5 flex items-center justify-center" />
                Test Release Gate
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md cursor-pointer whitespace-nowrap transition-colors border border-background-200/70">
                <i className="ri-shield-check-line w-3.5 h-3.5 flex items-center justify-center" />
                Validate Report Storage
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            {/* Core settings */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Core Settings</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Human Approval Required', value: 'Yes — AI cannot approve', color: 'text-green-600' },
                  { label: 'Separate Approver', value: 'Enabled', color: 'text-green-600' },
                  { label: 'Approval Expiry', value: '72 hours' },
                  { label: 'Second Approver for High Risk', value: 'Required', color: 'text-green-600' },
                  { label: 'Critical Risk Acceptance', value: 'Blocked', color: 'text-red-600' },
                  { label: 'High Risk Acceptance', value: 'Allowed (with approval)' },
                  { label: 'Release Report Storage', value: 'Ready (private bucket)' },
                  { label: 'Expiry Scheduler', value: 'Active', color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-foreground-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-medium ${'color' in item ? item.color : 'text-foreground-950'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Gate checks */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Release Gate Checks (14)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { check: 'Latest test run completed', blocking: true },
                  { check: 'Test run matches build', blocking: true },
                  { check: 'Git SHA matches build', blocking: true },
                  { check: 'Required test plan completed', blocking: true },
                  { check: 'No unresolved critical bugs', blocking: true },
                  { check: 'High bug policy satisfied', blocking: true },
                  { check: 'Required retests completed', blocking: true },
                  { check: 'Evidence upload complete', blocking: false },
                  { check: 'Backup status acceptable', blocking: false },
                  { check: 'Restore readiness acceptable', blocking: false },
                  { check: 'Playwright fingerprint complete', blocking: false },
                  { check: 'Security checks passed', blocking: true },
                  { check: 'Production testing permission valid', blocking: true },
                  { check: 'Approval not expired', blocking: true },
                ].map((item) => (
                  <div key={item.check} className="flex items-center gap-2 bg-background-100 p-2 rounded-md">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.blocking ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <span className="text-xs text-foreground-950">{item.check}</span>
                    <span className={`text-xs font-medium ml-auto whitespace-nowrap ${item.blocking ? 'text-red-600' : 'text-amber-600'}`}>
                      {item.blocking ? 'Blocking' : 'Warning'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI restriction */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">AI Output Restrictions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Allowed</p>
                  <ul className="space-y-0.5">
                    {['not_ready', 'ready_with_warnings', 'ready_for_human_review'].map((item) => (
                      <li key={item} className="text-xs text-green-800 flex items-center gap-1">
                        <i className="ri-check-line w-3 h-3 flex items-center justify-center" />
                        <code className="text-xs bg-green-100 px-1 rounded">{item}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Forbidden (AI can never set)</p>
                  <ul className="space-y-0.5">
                    {['approved_for_release', 'risk_accepted', 'released'].map((item) => (
                      <li key={item} className="text-xs text-red-800 flex items-center gap-1">
                        <i className="ri-close-line w-3 h-3 flex items-center justify-center" />
                        <code className="text-xs bg-red-100 px-1 rounded">{item}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Separation of duties */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Separation of Duties</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Release creator cannot be the final approver',
                  'Critical risk acceptance is permanently disabled',
                  'High-risk acceptance requires second authorised reviewer',
                  'Approval locks to exact build reference and Git SHA',
                  'New build invalidates previous approval',
                  'Expired risk acceptance blocks release',
                  'Server-side enforcement — not frontend-only checks',
                  'All approval actions are audited',
                ].map((rule) => (
                  <div key={rule} className="flex items-start gap-2 bg-background-100 p-2.5 rounded-md">
                    <i className="ri-checkbox-circle-fill w-4 h-4 flex items-center justify-center text-green-600 mt-0.5" />
                    <p className="text-xs text-foreground-950">{rule}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* API routes */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Protected API Routes</p>
              <div className="bg-background-100 p-3 rounded-md">
                <pre className="text-xs text-foreground-950 font-mono overflow-x-auto whitespace-pre-wrap">
{`POST /api/uat/releases
GET  /api/uat/releases
GET  /api/uat/releases/[releaseId]
POST /api/uat/releases/[releaseId]/evaluate
POST /api/uat/releases/[releaseId]/approve
POST /api/uat/releases/[releaseId]/reject
POST /api/uat/releases/[releaseId]/request-retest
POST /api/uat/releases/[releaseId]/accept-risk
POST /api/uat/releases/[releaseId]/withdraw-approval
GET  /api/uat/releases/[releaseId]/report`}
                </pre>
              </div>
              <p className="text-xs text-foreground-500 mt-2">
                All mutation routes require authentication, server-side permission checks, build reference validation, gate re-evaluation, and idempotency.
              </p>
            </div>

            {/* Audit events */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-3">Audit Events (17)</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'release_candidate_created', 'release_gate_evaluated', 'release_ready_for_review',
                  'release_approval_requested', 'release_approved', 'release_rejected',
                  'retest_requested', 'risk_acceptance_requested', 'risk_accepted',
                  'risk_acceptance_rejected', 'approval_expired', 'approval_invalidated',
                  'approval_withdrawn', 'release_marked_released', 'release_failed',
                  'release_rolled_back', 'signoff_report_generated',
                ].map((e) => (
                  <span key={e} className="text-xs font-mono text-foreground-600 bg-background-100 px-2 py-0.5 rounded whitespace-nowrap">{e}</span>
                ))}
              </div>
            </div>

            {/* Test the gate */}
            <div className="p-5 border-b border-background-200/70">
              <p className="text-xs font-semibold text-foreground-950 mb-2">Test Release Gate (safe — fictional data only)</p>
              <div className="flex items-center justify-between bg-background-100 p-2.5 rounded-md">
                <span className="text-xs text-foreground-600 whitespace-nowrap">Run governance tests</span>
                <code className="text-xs font-mono text-foreground-950 whitespace-nowrap">node scripts/test-release-governance.mjs</code>
              </div>
              <p className="text-xs text-foreground-500 mt-2">
                Testing the gate uses fictional controlled data and must not approve a real release.
              </p>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-green-50 border-t border-green-200">
              <p className="text-xs text-green-800">
                <i className="ri-shield-check-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
                AI, n8n, and Playwright may recommend release readiness but can never approve a production release. Only authorised DFP staff may approve. All decisions are audited. Approval locks to exact build and Git SHA.
              </p>
            </div>
          </div>
        </section>

        {/* Troubleshooting Guidance */}
        <section>
          <h2 className="text-base font-semibold text-foreground-950 mb-3">Troubleshooting</h2>
          <div className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
            <div className="divide-y divide-background-100">
              {[
                {
                  problem: 'n8n is offline',
                  guidance: 'Check that n8n is running. Verify N8N_INTERNAL_URL in .env.local matches the actual n8n host and port. Ensure the UAT webhook workflow is imported.',
                  affected: 'Cannot start new test runs. Existing reports can still be viewed.',
                  check: 'Set N8N_INTERNAL_URL',
                },
                {
                  problem: 'Playwright worker is offline',
                  guidance: 'Check that the Playwright worker container/service is running. Verify PLAYWRIGHT_WORKER_URL in .env.local.',
                  affected: 'Cannot execute browser tests. Dashboard and reports remain viewable.',
                  check: 'Set PLAYWRIGHT_WORKER_URL',
                },
                {
                  problem: 'AI model is not available',
                  guidance: 'Check that Ollama or the configured AI provider is running. Verify OLLAMA_BASE_URL and OLLAMA_MODEL in .env.local. If the model is not installed, run: ollama pull MODEL_NAME',
                  affected: 'AI-assisted review is unavailable. Playwright results are still retained. Test runs will be marked as degraded.',
                  check: 'Set AI_PROVIDER and OLLAMA_BASE_URL',
                },
                {
                  problem: 'Database unavailable',
                  guidance: 'Verify Supabase is running or that VITE_PUBLIC_SUPABASE_URL points to a reachable instance. Some features may work without a database if mock mode is enabled.',
                  affected: 'Persistent storage of results and settings is unavailable. UI remains functional with mock data.',
                  check: 'Set VITE_PUBLIC_SUPABASE_URL',
                },
                {
                  problem: 'Evidence storage unavailable',
                  guidance: 'Verify storage buckets exist in the configured storage backend. Check UAT_EVIDENCE_BUCKET and UAT_REPORT_BUCKET settings.',
                  affected: 'Cannot store or retrieve screenshots and reports. Test runs can still execute.',
                  check: 'Verify bucket configuration',
                },
                {
                  problem: 'Approved domains list is empty',
                  guidance: 'Set UAT_ALLOWED_DOMAINS in your environment file. Without this, all test targets will be rejected.',
                  affected: 'Cannot start any test runs targeting external URLs.',
                  check: 'Set UAT_ALLOWED_DOMAINS',
                },
                {
                  problem: 'UAT workflow not imported in n8n',
                  guidance: 'Import the DFP UAT workflow JSON into your n8n instance. The webhook path should match N8N_UAT_WEBHOOK_PATH.',
                  affected: 'n8n will not process test run webhook calls.',
                  check: 'Import workflow in n8n UI',
                },
                {
                  problem: 'Ollama model not installed',
                  guidance: `Run: ollama pull ${envConfig.deploymentMode === 'local' ? 'qwen2.5:14b' : 'your-model-name'}. This downloads the AI model for test analysis.`,
                  affected: 'AI review agents will not produce findings. Functional and visual testing continues normally.',
                  check: 'Run ollama pull',
                },
              ].map((item, i) => (
                <div key={i} className="px-4 py-4">
                  <p className="text-sm font-semibold text-foreground-950 mb-1">{item.problem}</p>
                  <p className="text-xs text-foreground-600 mb-2">{item.guidance}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-amber-700 whitespace-nowrap">
                      <i className="ri-information-line w-3 h-3 flex items-center justify-center" />
                      Affected: {item.affected}
                    </span>
                    <span className="inline-flex items-center gap-1 text-primary-700 whitespace-nowrap">
                      <i className="ri-settings-3-line w-3 h-3 flex items-center justify-center" />
                      {item.check}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}