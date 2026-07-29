// ============================================================
// DFP UAT Agent — Health Check Service
// ============================================================
// Client-side health checks that call through the API proxy.
// Never calls private n8n, Playwright, or Ollama directly.
// ============================================================

import type { HealthReport, ServiceHealth, ServiceStatus } from '@/config/services';
import { getServiceDefinitions } from '@/config/services';
import { getEnvironmentConfig } from '@/config/environment';

// ============================================================
// Types
// ============================================================

export interface ConnectionStatus {
  key: string;
  displayName: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message: string;
  lastChecked: string | null;
  safeHostLabel: string;
}

// ============================================================
// Health Check
// ============================================================

async function checkSingleService(
  serviceKey: string,
  healthUrl: string,
  timeoutMs: number
): Promise<{ status: ServiceStatus; latencyMs: number | null; message: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const start = performance.now();
  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - start);

    if (response.ok) {
      return { status: 'online', latencyMs: latency, message: 'Connected' };
    }

    const body = await response.text().catch(() => '');
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) message = parsed.message;
      else if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // Not JSON, use status text
      if (response.statusText) message = response.statusText;
    }

    // 503 = degraded
    if (response.status === 503) {
      return { status: 'degraded', latencyMs: latency, message };
    }
    return { status: 'offline', latencyMs: latency, message };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - start);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'offline', latencyMs: null, message: `Timeout after ${timeoutMs}ms` };
    }
    const message = err instanceof TypeError
      ? 'Connection refused — service may be offline'
      : err instanceof Error ? err.message : 'Unknown error';
    return { status: 'offline', latencyMs: latency, message };
  }
}

// ============================================================
// Public API
// ============================================================

export async function runHealthChecks(): Promise<ConnectionStatus[]> {
  const services = getServiceDefinitions();
  const config = getEnvironmentConfig();

  // Frontend is always online (we're running)
  const results: ConnectionStatus[] = [
    {
      key: 'frontend',
      displayName: 'Frontend Application',
      status: 'online',
      latencyMs: 0,
      message: 'Running',
      lastChecked: new Date().toISOString(),
      safeHostLabel: window.location.hostname,
    },
  ];

  // Check Supabase first if configured — use direct client health check
  const supabaseResults = await checkSupabaseHealth();
  results.push(...supabaseResults);

  // Check Ollama directly using the ollama service
  const ollamaResults = await checkOllamaHealth();
  results.push(...ollamaResults);

  // Check remaining services (n8n, playwright) in parallel via proxy
  const proxyServices = services.filter(
    (s) =>
      s.key !== 'frontend' &&
      !s.key.startsWith('supabase_') &&
      s.key !== 'supabase' &&
      s.key !== 'ollama' &&
      s.key !== 'ai' &&
      s.healthPath
  );

  const checkPromises = proxyServices.map(async (service) => {
    const healthUrl = `${config.uatApiBaseUrl}${service.healthPath}`;
    const result = await checkSingleService(service.key, healthUrl, service.timeoutMs);

    const status: ConnectionStatus = {
      key: service.key,
      displayName: service.displayName,
      status: result.status,
      latencyMs: result.latencyMs,
      message: result.message,
      lastChecked: new Date().toISOString(),
      safeHostLabel: healthUrl,
    };

    return status;
  });

  const serviceResults = await Promise.all(checkPromises);
  results.push(...serviceResults);

  return results;
}

// ============================================================
// Supabase-specific health check (direct client, not proxy)
// ============================================================

async function checkSupabaseHealth(): Promise<ConnectionStatus[]> {
  const now = new Date().toISOString();
  const config = getEnvironmentConfig();

  if (config.supabaseDeploymentMode === 'disabled') {
    return [
      {
        key: 'supabase',
        displayName: 'Supabase',
        status: 'not_configured',
        latencyMs: null,
        message: 'Supabase is disabled in environment config.',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_api',
        displayName: 'Supabase API',
        status: 'not_configured',
        latencyMs: null,
        message: 'Disabled',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_db',
        displayName: 'Supabase Database',
        status: 'not_configured',
        latencyMs: null,
        message: 'Disabled',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_auth',
        displayName: 'Supabase Auth',
        status: 'not_configured',
        latencyMs: null,
        message: 'Disabled',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_storage',
        displayName: 'Supabase Storage',
        status: 'not_configured',
        latencyMs: null,
        message: 'Disabled',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_realtime',
        displayName: 'Supabase Realtime',
        status: 'not_configured',
        latencyMs: null,
        message: 'Disabled',
        lastChecked: now,
        safeHostLabel: '—',
      },
    ];
  }

  // Supabase is configured — run the real health check
  try {
    const { checkSupabaseConnection } = await import('@/services/supabaseService');
    const healthResult = await checkSupabaseConnection();

    const safeHost = config.supabaseUrl
      ? config.supabaseUrl.replace(/https?:\/\//, '').replace(/\/$/, '')
      : 'not configured';

    return [
      {
        key: 'supabase',
        displayName: 'Supabase',
        status: healthResult.ok ? 'online' : (healthResult.api || healthResult.db ? 'degraded' : 'offline'),
        latencyMs: healthResult.latencyMs,
        message: healthResult.message,
        lastChecked: now,
        safeHostLabel: safeHost,
      },
      {
        key: 'supabase_api',
        displayName: 'Supabase API',
        status: healthResult.api ? 'online' : 'offline',
        latencyMs: healthResult.latencyMs,
        message: healthResult.api ? 'Reachable' : 'Unavailable',
        lastChecked: now,
        safeHostLabel: safeHost,
      },
      {
        key: 'supabase_db',
        displayName: 'Supabase Database',
        status: healthResult.db ? 'online' : 'offline',
        latencyMs: healthResult.latencyMs,
        message: healthResult.db ? 'Tables accessible' : 'Schema may not be applied',
        lastChecked: now,
        safeHostLabel: safeHost,
      },
      {
        key: 'supabase_auth',
        displayName: 'Supabase Auth',
        status: healthResult.auth ? 'online' : 'degraded',
        latencyMs: healthResult.latencyMs,
        message: healthResult.auth ? 'Available' : 'Auth check failed',
        lastChecked: now,
        safeHostLabel: safeHost,
      },
      {
        key: 'supabase_storage',
        displayName: 'Supabase Storage',
        status: healthResult.storage ? 'online' : 'degraded',
        latencyMs: healthResult.latencyMs,
        message: healthResult.storage ? 'Evidence bucket available' : 'Bucket may not exist',
        lastChecked: now,
        safeHostLabel: safeHost,
      },
      {
        key: 'supabase_realtime',
        displayName: 'Supabase Realtime',
        status: healthResult.api && config.enableUatRealtime ? 'online' : (config.enableUatRealtime ? 'offline' : 'not_configured'),
        latencyMs: healthResult.latencyMs,
        message: config.enableUatRealtime ? (healthResult.api ? 'Available' : 'Unavailable') : 'Disabled in config',
        lastChecked: now,
        safeHostLabel: safeHost,
      },
    ];
  } catch {
    return [
      {
        key: 'supabase',
        displayName: 'Supabase',
        status: 'offline',
        latencyMs: null,
        message: 'Health check failed — Supabase may be unreachable.',
        lastChecked: now,
        safeHostLabel: config.supabaseUrl || 'not configured',
      },
      {
        key: 'supabase_api',
        displayName: 'Supabase API',
        status: 'offline',
        latencyMs: null,
        message: 'Unavailable',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_db',
        displayName: 'Supabase Database',
        status: 'offline',
        latencyMs: null,
        message: 'Unavailable',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_auth',
        displayName: 'Supabase Auth',
        status: 'offline',
        latencyMs: null,
        message: 'Unavailable',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_storage',
        displayName: 'Supabase Storage',
        status: 'offline',
        latencyMs: null,
        message: 'Unavailable',
        lastChecked: now,
        safeHostLabel: '—',
      },
      {
        key: 'supabase_realtime',
        displayName: 'Supabase Realtime',
        status: 'offline',
        latencyMs: null,
        message: 'Unavailable',
        lastChecked: now,
        safeHostLabel: '—',
      },
    ];
  }
}

// ============================================================
// Ollama health check (via ollamaService)
// ============================================================

async function checkOllamaHealth(): Promise<ConnectionStatus[]> {
  const now = new Date().toISOString();

  try {
    const { checkOllamaHealth: checkOllama } = await import('@/services/server/ollamaService');
    const health = await checkOllama();

    const aiStatus: ServiceStatus = health.status === 'connected'
      ? 'online'
      : health.status === 'degraded'
        ? 'degraded'
        : health.status === 'model_missing'
          ? 'degraded'
          : health.status === 'not_configured'
            ? 'not_configured'
            : 'offline';

    const aiLabel = health.status === 'connected'
      ? `Connected — ${health.model}`
      : health.status === 'model_missing'
        ? 'Model Missing'
        : health.status === 'not_configured'
          ? 'Not Configured'
          : health.message;

    const ollamaLabel = health.status === 'connected'
      ? 'Connected'
      : health.status === 'model_missing'
        ? 'Model Missing'
        : health.status === 'not_configured'
          ? 'Not Configured'
          : 'Offline';

    return [
      {
        key: 'ai',
        displayName: 'AI Model',
        status: aiStatus,
        latencyMs: health.latencyMs,
        message: aiLabel,
        lastChecked: now,
        safeHostLabel: health.name,
      },
      {
        key: 'ollama',
        displayName: 'Atlas-HaL Ollama',
        status: health.status === 'connected'
          ? 'online'
          : health.status === 'model_missing'
            ? 'degraded'
            : health.status === 'not_configured'
              ? 'not_configured'
              : 'offline',
        latencyMs: health.latencyMs,
        message: ollamaLabel,
        lastChecked: now,
        safeHostLabel: health.name,
      },
    ];
  } catch {
    return [
      {
        key: 'ai',
        displayName: 'AI Model',
        status: 'offline',
        latencyMs: null,
        message: 'Ollama health check failed',
        lastChecked: now,
        safeHostLabel: 'Atlas-HaL',
      },
      {
        key: 'ollama',
        displayName: 'Atlas-HaL Ollama',
        status: 'offline',
        latencyMs: null,
        message: 'Health check failed',
        lastChecked: now,
        safeHostLabel: 'Atlas-HaL',
      },
    ];
  }
}

export function computeOverallStatus(statusList: ConnectionStatus[]): 'healthy' | 'degraded' | 'offline' {
  const required = getServiceDefinitions().filter((s) => s.required);
  let requiredOffline = 0;

  for (const req of required) {
    const status = statusList.find((s) => s.key === req.key);
    if (!status || status.status === 'offline') {
      requiredOffline++;
    }
  }

  if (requiredOffline >= required.length) return 'offline';
  if (requiredOffline > 0) return 'degraded';

  const hasDegraded = statusList.some((s) => s.status === 'degraded');
  if (hasDegraded) return 'degraded';

  return 'healthy';
}

export function buildHealthReport(statusList: ConnectionStatus[]): HealthReport {
  const services: ServiceHealth[] = statusList.map((s) => ({
    serviceKey: s.key,
    displayName: s.displayName,
    status: s.status,
    latencyMs: s.latencyMs,
    message: s.message,
    lastChecked: s.lastChecked,
    category: getServiceDefinitions().find((d) => d.key === s.key)?.category || 'core',
  }));

  return {
    status: computeOverallStatus(statusList),
    deploymentMode: getEnvironmentConfig().deploymentMode,
    services,
    checkedAt: new Date().toISOString(),
  };
}