// ============================================================
// DFP UAT Agent — Structured Logger
// ============================================================
// Lightweight structured console logger for local deployment.
// Never logs passwords, API keys, auth headers, cookies,
// Supabase service-role keys, or sensitive form-field values.
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  route?: string;
  service?: string;
  runId?: string;
  status?: string;
  errorCode?: string;
  duration?: number;
  message: string;
}

// ============================================================
// Sensitive field filtering
// ============================================================

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /service[_-]?role/i,
  /private[_-]?key/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitiseObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = sanitiseObject(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ============================================================
// Logger
// ============================================================

let currentRequestId = '';

export function setRequestId(id: string): void {
  currentRequestId = id;
}

function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatEntry(entry: LogEntry): string {
  const parts: string[] = [
    `[${entry.timestamp}]`,
    entry.level.toUpperCase(),
  ];
  if (entry.requestId) parts.push(`[${entry.requestId}]`);
  if (entry.route) parts.push(`[${entry.route}]`);
  if (entry.service) parts.push(`[${entry.service}]`);
  if (entry.runId) parts.push(`[run:${entry.runId}]`);
  if (entry.status) parts.push(`[status:${entry.status}]`);
  if (entry.errorCode) parts.push(`[${entry.errorCode}]`);
  if (entry.duration !== undefined) parts.push(`(${entry.duration}ms)`);
  parts.push(entry.message);
  return parts.join(' ');
}

function log(level: LogLevel, message: string, extra?: Partial<LogEntry>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: extra?.requestId || currentRequestId || undefined,
    route: extra?.route,
    service: extra?.service,
    runId: extra?.runId,
    status: extra?.status,
    errorCode: extra?.errorCode,
    duration: extra?.duration,
    message,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug(message: string, extra?: Partial<LogEntry>): void {
    log('debug', message, extra);
  },

  info(message: string, extra?: Partial<LogEntry>): void {
    log('info', message, extra);
  },

  warn(message: string, extra?: Partial<LogEntry>): void {
    log('warn', message, extra);
  },

  error(message: string, extra?: Partial<LogEntry>): void {
    log('error', message, extra);
  },

  /** Log a service call with timing */
  serviceCall(service: string, route: string, duration: number, success: boolean): void {
    const id = generateRequestId();
    const level: LogLevel = success ? 'info' : 'error';
    log(level, `${success ? 'OK' : 'FAILED'} → ${service}${route}`, {
      service,
      route,
      duration,
      requestId: id,
    });
  },

  /** Log a safe error without exposing internal details */
  safeError(service: string, errorCode: string, userMessage: string): void {
    log('error', userMessage, { service, errorCode });
  },

  /** Sanitise and log an object (never logs sensitive values) */
  safeObject(level: LogLevel, message: string, obj: Record<string, unknown>): void {
    log(level, `${message} ${JSON.stringify(sanitiseObject(obj))}`);
  },
};