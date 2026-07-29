// ============================================================
// DFP UAT Agent — Typed Environment Configuration
// ============================================================
// Validates all required environment variables at startup.
// Distinguishes public (VITE_PUBLIC_) from server-only vars.
// Never exposes server-only secrets to the browser.
// ============================================================

export type DeploymentMode = 'development' | 'local' | 'staging' | 'production';

export interface EnvironmentConfig {
  // Application
  appName: string;
  appUrl: string;
  deploymentMode: DeploymentMode;
  enableMockUat: boolean;

  // API
  uatApiBaseUrl: string;
  uatRealtimeUrl: string;

  // Supabase
  supabaseDeploymentMode: 'local' | 'self_hosted' | 'hosted' | 'disabled';
  supabaseUrl: string;
  supabaseAnonKey: string;
  enableUatRealtime: boolean;
  databaseRequired: boolean;
  databaseTimeoutMs: number;
  autoRunMigrations: boolean;
  allowDatabaseReset: boolean;
  evidenceBucket: string;
  reportBucket: string;
  traceBucket: string;

  // Runtime
  defaultMaxPages: number;
  defaultMaxActions: number;
  requestTimeoutMs: number;
  pollIntervalMs: number;

  // AI
  allowAiDisabledMode: boolean;
  failRunWhenAiOffline: boolean;

  // Security (public subset only)
  allowProductionTesting: boolean;
  requireProductionApproval: boolean;
  maskSensitiveValues: boolean;
}

// ============================================================
// Validation
// ============================================================

const VALID_DEPLOYMENT_MODES: string[] = ['development', 'local', 'staging', 'production'];

const VALID_SUPABASE_MODES: string[] = ['local', 'self_hosted', 'hosted', 'disabled'];

function readEnv(key: string, fallback: string = ''): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as Record<string, string>)[key] || fallback;
  }
  return fallback;
}

function readEnvBool(key: string, fallback: boolean = false): boolean {
  const raw = readEnv(key, String(fallback));
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

function readEnvNum(key: string, fallback: number): number {
  const raw = readEnv(key, String(fallback));
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

const validationErrors: string[] = [];

function required(key: string, value: string): void {
  if (!value) {
    validationErrors.push(`Missing required environment variable: ${key}`);
  }
}

function validateMode(mode: string): DeploymentMode {
  if (!VALID_DEPLOYMENT_MODES.includes(mode)) {
    validationErrors.push(
      `Invalid VITE_PUBLIC_DEPLOYMENT_MODE "${mode}". Must be one of: ${VALID_DEPLOYMENT_MODES.join(', ')}`
    );
    return 'local';
  }
  return mode as DeploymentMode;
}

// ============================================================
// Build config
// ============================================================

function buildConfig(): EnvironmentConfig {
  const deploymentMode = validateMode(readEnv('VITE_PUBLIC_DEPLOYMENT_MODE', 'local'));
  const enableMockUat = readEnvBool('VITE_PUBLIC_ENABLE_MOCK_UAT', false);

  // Warn if mock mode is on in production
  if (deploymentMode === 'production' && enableMockUat) {
    validationErrors.push(
      'VITE_PUBLIC_ENABLE_MOCK_UAT is true in production mode. Mock mode should not be enabled in production.'
    );
  }

  // Supabase mode validation
  const supabaseMode = readEnv('VITE_PUBLIC_SUPABASE_DEPLOYMENT_MODE', 'disabled');
  if (!VALID_SUPABASE_MODES.includes(supabaseMode)) {
    validationErrors.push(
      `Invalid VITE_PUBLIC_SUPABASE_DEPLOYMENT_MODE "${supabaseMode}". Must be one of: ${VALID_SUPABASE_MODES.join(', ')}`
    );
  }

  required('VITE_PUBLIC_APP_NAME', readEnv('VITE_PUBLIC_APP_NAME'));

  const config: EnvironmentConfig = {
    appName: readEnv('VITE_PUBLIC_APP_NAME', 'DFP UAT Agent'),
    appUrl: readEnv('VITE_PUBLIC_APP_URL', 'http://localhost:3000'),
    deploymentMode,
    enableMockUat,

    uatApiBaseUrl: readEnv('VITE_PUBLIC_UAT_API_BASE_URL', '/api/uat'),
    uatRealtimeUrl: readEnv('VITE_PUBLIC_UAT_REALTIME_URL', ''),

    // Supabase
    supabaseDeploymentMode: supabaseMode as EnvironmentConfig['supabaseDeploymentMode'],
    supabaseUrl: readEnv('VITE_PUBLIC_SUPABASE_URL', ''),
    supabaseAnonKey: readEnv('VITE_PUBLIC_SUPABASE_ANON_KEY', ''),
    enableUatRealtime: readEnvBool('VITE_PUBLIC_ENABLE_UAT_REALTIME', true),
    databaseRequired: readEnvBool('VITE_PUBLIC_UAT_DATABASE_REQUIRED', false),
    databaseTimeoutMs: readEnvNum('VITE_PUBLIC_UAT_DATABASE_TIMEOUT_MS', 10000),
    autoRunMigrations: readEnvBool('VITE_PUBLIC_UAT_AUTO_RUN_MIGRATIONS', false),
    allowDatabaseReset: readEnvBool('VITE_PUBLIC_UAT_ALLOW_DATABASE_RESET', false),
    evidenceBucket: readEnv('VITE_PUBLIC_UAT_EVIDENCE_BUCKET', 'uat-evidence'),
    reportBucket: readEnv('VITE_PUBLIC_UAT_REPORT_BUCKET', 'uat-reports'),
    traceBucket: readEnv('VITE_PUBLIC_UAT_TRACE_BUCKET', 'uat-traces'),

    defaultMaxPages: readEnvNum('VITE_PUBLIC_UAT_DEFAULT_MAX_PAGES', 50),
    defaultMaxActions: readEnvNum('VITE_PUBLIC_UAT_DEFAULT_MAX_ACTIONS', 250),
    requestTimeoutMs: readEnvNum('VITE_PUBLIC_UAT_REQUEST_TIMEOUT_MS', 30000),
    pollIntervalMs: readEnvNum('VITE_PUBLIC_UAT_POLL_INTERVAL_MS', 3000),

    // AI fallback behaviour
    allowAiDisabledMode: readEnvBool('VITE_PUBLIC_UAT_ALLOW_AI_DISABLED_MODE', true),
    failRunWhenAiOffline: readEnvBool('VITE_PUBLIC_UAT_FAIL_RUN_WHEN_AI_OFFLINE', false),

    allowProductionTesting: readEnvBool('VITE_PUBLIC_UAT_ALLOW_PRODUCTION_TESTING', false),
    requireProductionApproval: readEnvBool('VITE_PUBLIC_UAT_REQUIRE_PRODUCTION_APPROVAL', true),
    maskSensitiveValues: readEnvBool('VITE_PUBLIC_UAT_MASK_SENSITIVE_VALUES', true),
  };

  if (validationErrors.length > 0) {
    console.warn(
      '[DFP UAT Agent] Environment validation warnings:\n' +
        validationErrors.map((e) => `  - ${e}`).join('\n')
    );
  }

  return config;
}

// ============================================================
// Singleton
// ============================================================

let cachedConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    cachedConfig = buildConfig();
  }
  return cachedConfig;
}

export function getDeploymentMode(): DeploymentMode {
  return getEnvironmentConfig().deploymentMode;
}

export function isMockMode(): boolean {
  return getEnvironmentConfig().enableMockUat;
}

export function isProduction(): boolean {
  return getEnvironmentConfig().deploymentMode === 'production';
}

export function isDevelopment(): boolean {
  return getEnvironmentConfig().deploymentMode === 'development';
}

export function isSupabaseEnabled(): boolean {
  return getEnvironmentConfig().supabaseDeploymentMode !== 'disabled';
}

export function getSupabaseBuckets(): { evidence: string; reports: string; traces: string } {
  const config = getEnvironmentConfig();
  return {
    evidence: config.evidenceBucket,
    reports: config.reportBucket,
    traces: config.traceBucket,
  };
}