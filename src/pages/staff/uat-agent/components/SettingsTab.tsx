import { useState, useEffect } from 'react';
import type { UatSettings } from '@/types/uat';
import { getUatSettings, updateUatSettings } from '@/services/uatAgentService';
import { useNavigate } from 'react-router-dom';
import { getEnvironmentConfig, isMockMode } from '@/config/environment';

export default function SettingsTab() {
  const navigate = useNavigate();
  const envConfig = getEnvironmentConfig();
  const mockActive = isMockMode();
  const [settings, setSettings] = useState<UatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUatSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (updates: Partial<UatSettings>) => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUatSettings(updates);
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-4 space-y-4 animate-pulse">
      {[1,2,3].map((i) => <div key={i} className="bg-white rounded-lg border border-background-200/70 h-32" />)}
    </div>;
  }

  if (error) {
    return <div className="text-center py-16"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={fetchSettings} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">Retry</button></div>;
  }

  if (!settings) return null;

  return (
    <div className="space-y-6 py-4 max-w-3xl">
      {/* n8n Connection */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">n8n Connection</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Webhook endpoint for triggering UAT workflows.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Status</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${settings.n8nConnected ? 'text-green-600' : 'text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${settings.n8nConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {settings.n8nConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Endpoint</span>
            <span className="text-xs text-foreground-950 font-mono">{settings.n8nEndpoint}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">API Key</span>
            <span className="text-xs text-foreground-600 font-mono">{settings.n8nApiKeyMasked}</span>
          </div>
        </div>
      </section>

      {/* Browser Worker */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Browser Worker Connection</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Playwright worker WebSocket endpoint.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Status</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${settings.browserWorkerConnected ? 'text-green-600' : 'text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${settings.browserWorkerConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {settings.browserWorkerConnected ? 'Ready' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Endpoint</span>
            <span className="text-xs text-foreground-950 font-mono">{settings.browserWorkerEndpoint}</span>
          </div>
        </div>
      </section>

      {/* Default Limits */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Default Test Limits</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-foreground-600 mb-1">Max Pages</label>
            <input
              type="number"
              value={settings.defaultMaxPages}
              onChange={(e) => setSettings({ ...settings, defaultMaxPages: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs text-foreground-600 mb-1">Max Actions</label>
            <input
              type="number"
              value={settings.defaultMaxActions}
              onChange={(e) => setSettings({ ...settings, defaultMaxActions: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs text-foreground-600 mb-1">Default Timeout (ms)</label>
            <input
              type="number"
              value={settings.defaultTimeout}
              onChange={(e) => setSettings({ ...settings, defaultTimeout: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-background-200/70 flex justify-end">
          <button
            onClick={() => handleSave({ defaultMaxPages: settings.defaultMaxPages, defaultMaxActions: settings.defaultMaxActions, defaultTimeout: settings.defaultTimeout })}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Limits'}
          </button>
        </div>
      </section>

      {/* Domains */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Approved & Blocked Domains</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-green-700 mb-2">Approved Domains</p>
              <div className="space-y-1">
                {settings.approvedDomains.map((d) => (
                  <div key={d} className="flex items-center gap-2 text-xs text-foreground-700 py-1">
                    <i className="ri-check-line text-green-600 w-3 h-3 flex items-center justify-center" />
                    {d}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-700 mb-2">Blocked Domains</p>
              <div className="space-y-1">
                {settings.blockedDomains.map((d) => (
                  <div key={d} className="flex items-center gap-2 text-xs text-foreground-700 py-1">
                    <i className="ri-close-line text-red-600 w-3 h-3 flex items-center justify-center" />
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Test Accounts */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Test Accounts</h3>
        </div>
        <div className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-200/70">
                  <th className="text-left py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Role</th>
                  <th className="text-left py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Email</th>
                  <th className="text-left py-2 text-xs font-semibold text-foreground-600 whitespace-nowrap">Description</th>
                </tr>
              </thead>
              <tbody>
                {settings.testAccounts.map((acct) => (
                  <tr key={acct.id} className="border-b border-background-100">
                    <td className="py-2 text-xs text-foreground-950 font-medium whitespace-nowrap">{acct.role}</td>
                    <td className="py-2 text-xs text-foreground-700 font-mono whitespace-nowrap">{acct.email}</td>
                    <td className="py-2 text-xs text-foreground-600">{acct.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Retention & Production */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Retention & Production Permissions</h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Retention Period</span>
            <span className="text-xs text-foreground-950 font-medium whitespace-nowrap">{settings.retentionDays} days</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Production Testing</span>
            <span className={`text-xs font-medium whitespace-nowrap ${settings.productionAllowed ? 'text-red-600' : 'text-green-600'}`}>
              {settings.productionAllowed ? 'Allowed' : 'Not Allowed'}
            </span>
          </div>
          <div>
            <span className="text-xs text-foreground-600">Production Approvers:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {settings.productionApprovers.map((a) => (
                <span key={a} className="text-xs text-foreground-700 bg-background-100 px-2 py-0.5 rounded whitespace-nowrap">{a}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ollama AI Configuration */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Ollama AI — Atlas-HaL</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Local AI model for automated test review and analysis. Accessed through server-side proxy only.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Provider</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent-100 text-accent-800 whitespace-nowrap">
              Ollama
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Host</span>
            <span className="text-xs text-foreground-950 font-medium whitespace-nowrap">Atlas-HaL</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Model</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">qwen2.5:14b</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Temperature</span>
            <span className="text-xs text-foreground-950 whitespace-nowrap">0.2</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Request Timeout</span>
            <span className="text-xs text-foreground-950 whitespace-nowrap">120,000ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">AI Disabled Mode Allowed</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${envConfig.allowAiDisabledMode ? 'text-green-600' : 'text-red-600'}`}>
              {envConfig.allowAiDisabledMode ? 'Yes — runs continue without AI' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Fail Run When AI Offline</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${envConfig.failRunWhenAiOffline ? 'text-red-600' : 'text-green-600'}`}>
              {envConfig.failRunWhenAiOffline ? 'Yes — runs fail without AI' : 'No — Playwright results retained'}
            </span>
          </div>
          <div className="pt-2 border-t border-background-100">
            <p className="text-xs text-foreground-500">
              <i className="ri-information-line w-3.5 h-3.5 inline-flex items-center justify-center mr-1" />
              Ollama is accessed only through server-side proxy. The internal address (192.168.1.92:11434) is never exposed to the browser. Configure OLLAMA_BASE_URL in .env.local on the UAT VM.
            </p>
          </div>
        </div>
      </section>

      {/* Local Server Setup */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Local Deployment</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Server setup, health checks, and deployment configuration.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Deployment Mode</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-secondary-100 text-secondary-800 whitespace-nowrap">
              {envConfig.deploymentMode}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Mock Mode</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${mockActive ? 'text-amber-600' : 'text-green-600'}`}>
              {mockActive ? 'Enabled (Demo)' : 'Disabled'}
            </span>
          </div>
          <div className="pt-2">
            <button
              onClick={() => navigate('/staff/uat-agent/local-setup')}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md cursor-pointer whitespace-nowrap transition-colors"
            >
              <i className="ri-server-line w-3.5 h-3.5 flex items-center justify-center" />
              Local Server Setup
            </button>
          </div>
        </div>
      </section>

      {/* Supabase Connection */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Supabase Connection</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Local or hosted Supabase for persistent UAT data, evidence storage, and realtime updates.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Deployment Mode</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-secondary-100 text-secondary-800 whitespace-nowrap">
              {envConfig.supabaseDeploymentMode}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">API URL</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">
              {envConfig.supabaseUrl || 'Not configured'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Anon Key</span>
            <span className="text-xs text-foreground-600 font-mono whitespace-nowrap">
              {envConfig.supabaseAnonKey ? '•••••••• configured' : 'Missing'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Realtime</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${envConfig.enableUatRealtime ? 'text-green-600' : 'text-foreground-500'}`}>
              {envConfig.enableUatRealtime ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Database Required</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${envConfig.databaseRequired ? 'text-amber-600' : 'text-green-600'}`}>
              {envConfig.databaseRequired ? 'Required' : 'Optional'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Evidence Bucket</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">{envConfig.evidenceBucket}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Report Bucket</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">{envConfig.reportBucket}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Trace Bucket</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">{envConfig.traceBucket}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Auto-run Migrations</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${envConfig.autoRunMigrations ? 'text-red-600' : 'text-green-600'}`}>
              {envConfig.autoRunMigrations ? 'Enabled (not recommended)' : 'Disabled'}
            </span>
          </div>
        </div>
      </section>

      {/* Generated Types Status */}
      <section className="bg-white rounded-lg border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h3 className="text-sm font-semibold text-foreground-950">Generated Types</h3>
          <p className="text-xs text-foreground-600 mt-0.5">Status of TypeScript types generated from the Supabase schema.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Types File</span>
            <span className="text-xs text-foreground-950 font-mono whitespace-nowrap">src/lib/supabase/database.types.ts</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-600">Status</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 whitespace-nowrap">
              <i className="ri-information-line w-3 h-3 flex items-center justify-center" />
              Placeholder — run supabase gen types
            </span>
          </div>
          <div className="pt-2">
            <p className="text-xs text-foreground-500 font-mono bg-background-100 p-2 rounded">
              supabase gen types typescript --local &gt; src/lib/supabase/database.types.ts
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}