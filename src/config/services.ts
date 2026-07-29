// ============================================================
// DFP UAT Agent — Service Registry
// ============================================================
// Central definition of all services the UAT Agent depends on.
// Each service has display info, health endpoint, and
// browser-visibility classification.
// ============================================================

export type ServiceStatus = 'online' | 'degraded' | 'offline' | 'checking' | 'not_configured';
export type ServiceCategory = 'core' | 'testing' | 'ai' | 'storage';

export interface ServiceDefinition {
  /** Unique key for this service */
  key: string;
  /** Human-readable display name */
  displayName: string;
  /** Category for grouping */
  category: ServiceCategory;
  /** Base URL (may be empty if not configured) */
  baseUrl: string;
  /** Health-check endpoint path appended to baseUrl, or empty */
  healthPath: string;
  /** Whether this service is required for the app to function */
  required: boolean;
  /** Whether this service URL is safe to show in the browser */
  browserVisible: boolean;
  /** Connection timeout in milliseconds */
  timeoutMs: number;
  /** Brief description shown in tooltips */
  description: string;
}

export interface ServiceHealth {
  serviceKey: string;
  displayName: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message: string;
  lastChecked: string | null;
  category: ServiceCategory;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'offline';
  deploymentMode: string;
  services: ServiceHealth[];
  checkedAt: string;
}

// ============================================================
// Service Definitions
// ============================================================

function buildServices(): ServiceDefinition[] {
  return [
    {
      key: 'frontend',
      displayName: 'Frontend Application',
      category: 'core',
      baseUrl: '',
      healthPath: '',
      required: true,
      browserVisible: true,
      timeoutMs: 2000,
      description: 'The DFP UAT Agent web application itself.',
    },
    {
      key: 'n8n',
      displayName: 'n8n Orchestrator',
      category: 'core',
      baseUrl: '/api/uat',
      healthPath: '/health',
      required: true,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'n8n workflow engine that orchestrates UAT test runs.',
    },
    {
      key: 'playwright',
      displayName: 'Browser Worker',
      category: 'testing',
      baseUrl: '/api/uat',
      healthPath: '/worker-health',
      required: true,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Playwright browser worker that executes test steps in real browsers.',
    },
    {
      key: 'ai',
      displayName: 'AI Model',
      category: 'ai',
      baseUrl: '/api/local/ollama',
      healthPath: '/api/tags',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Atlas-HaL Ollama (qwen2.5:14b) for AI-assisted test review. Accessed through local API proxy.',
    },
    {
      key: 'ollama',
      displayName: 'Atlas-HaL Ollama',
      category: 'ai',
      baseUrl: '/api/local/ollama',
      healthPath: '/api/tags',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Ollama AI server on Atlas-HaL (192.168.1.92:11434). Model: qwen2.5:14b.',
    },
    {
      key: 'supabase',
      displayName: 'Supabase',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/db-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase for persistent storage of test results, evidence, and settings.',
    },
    {
      key: 'supabase_api',
      displayName: 'Supabase API',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/supabase-api-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase REST API health.',
    },
    {
      key: 'supabase_db',
      displayName: 'Supabase Database',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/supabase-db-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase PostgreSQL database health.',
    },
    {
      key: 'supabase_auth',
      displayName: 'Supabase Auth',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/supabase-auth-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase authentication service health.',
    },
    {
      key: 'supabase_storage',
      displayName: 'Supabase Storage',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/supabase-storage-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase storage for evidence and reports.',
    },
    {
      key: 'supabase_realtime',
      displayName: 'Supabase Realtime',
      category: 'storage',
      baseUrl: '/api/uat',
      healthPath: '/supabase-realtime-health',
      required: false,
      browserVisible: true,
      timeoutMs: 5000,
      description: 'Supabase Realtime for live run updates.',
    },
  ];
}

let cachedServices: ServiceDefinition[] | null = null;

export function getServiceDefinitions(): ServiceDefinition[] {
  if (!cachedServices) {
    cachedServices = buildServices();
  }
  return cachedServices;
}

export function getServiceByKey(key: string): ServiceDefinition | undefined {
  return getServiceDefinitions().find((s) => s.key === key);
}