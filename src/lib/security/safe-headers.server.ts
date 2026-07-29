// ============================================================
// DFP UAT Agent — Safe Header Utilities (server/universal)
// ============================================================
// Redacts sensitive headers from logs, extracts only safe
// metadata from incoming requests, and provides utilities
// for building safe response headers.
//
// NEVER log: Authorization, X-UAT-Signature, cookies,
// shared secrets, or raw passwords.
// ============================================================

import { SIGNING_HEADER_NAMES } from './request-signing.server';

// ============================================================
// Types
// ============================================================

export interface SafeRequestHeaders {
  version: string | null;
  timestamp: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  hasSignature: boolean;
  contentType: string | null;
  unsafeHeadersRemoved: number;
}

export interface SafeLogEntry {
  timestamp: string;
  requestId: string;
  idempotencyKeyHash: string;
  route: string;
  sourceService: string;
  destinationService: string;
  statusCode: number;
  durationMs: number;
  safeErrorCode: string | null;
  runId: string | null;
  method: string;
  /** SHA-256 hash of the request body for traceability (not the body itself) */
  bodyHash: string | null;
}

// ============================================================
// Sensitive header patterns
// ============================================================

const SENSITIVE_HEADER_NAMES_LOWER = new Set([
  'authorization',
  'x-uat-signature',
  'x-uat-webhook-secret',
  'x-uat-callback-secret',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-forwarded-for', // PII
  'x-real-ip',       // PII
  'proxy-authorization',
  'www-authenticate',
]);

const SENSITIVE_HEADER_PREFIXES_LOWER = [
  'x-uat-sig',
  'x-uat-auth',
  'cf-',      // Cloudflare headers — may contain origin IPs
];

// ============================================================
// Header Extraction
// ============================================================

/**
 * Safely extract only the signing-related metadata from
 * incoming headers. Never includes the raw signature value.
 */
export function extractSigningHeaders(
  headers: Record<string, string | null | undefined>
): SafeRequestHeaders {
  let unsafeRemoved = 0;

  const version = getSafeHeader(headers, SIGNING_HEADER_NAMES.version);
  const timestamp = getSafeHeader(headers, SIGNING_HEADER_NAMES.timestamp);
  const requestId = getSafeHeader(headers, SIGNING_HEADER_NAMES.requestId);
  const idempotencyKey = getSafeHeader(headers, SIGNING_HEADER_NAMES.idempotencyKey);
  const hasSignature = hasHeader(headers, SIGNING_HEADER_NAMES.signature);
  const contentType = getSafeHeader(headers, 'content-type');

  // Count sensitive headers that are present (but being redacted)
  for (const [key] of Object.entries(headers)) {
    if (isSensitiveHeader(key)) {
      unsafeRemoved++;
    }
  }

  return {
    version,
    timestamp,
    requestId,
    idempotencyKey,
    hasSignature,
    contentType,
    unsafeHeadersRemoved: unsafeRemoved,
  };
}

/**
 * Returns a sanitised copy of headers suitable for logging.
 * Sensitive headers are replaced with '[REDACTED]'.
 */
export function redactSensitiveHeaders(
  headers: Record<string, string | null | undefined>
): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveHeader(key)) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value ?? '(null)';
    }
  }

  return safe;
}

// ============================================================
// Header Helpers
// ============================================================

function getSafeHeader(
  headers: Record<string, string | null | undefined>,
  name: string
): string | null {
  // Case-insensitive header lookup
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      if (value === null || value === undefined) return null;
      return String(value);
    }
  }
  return null;
}

function hasHeader(
  headers: Record<string, string | null | undefined>,
  name: string
): boolean {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return true;
  }
  return false;
}

export function isSensitiveHeader(headerName: string): boolean {
  const lower = headerName.toLowerCase().trim();

  if (SENSITIVE_HEADER_NAMES_LOWER.has(lower)) return true;

  for (const prefix of SENSITIVE_HEADER_PREFIXES_LOWER) {
    if (lower.startsWith(prefix)) return true;
  }

  return false;
}

// ============================================================
// Safe Logging Helpers
// ============================================================

/**
 * Hash an idempotency key for safe logging.
 * Only the hash (not the key itself) should appear in logs.
 */
export async function hashIdempotencyKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Truncate to first 8 chars for readability
  return hex.slice(0, 8);
}

/**
 * Build a safe log entry for webhook request tracking.
 * Never includes tokens, signatures, or authorization.
 */
export async function buildSafeLogEntry(params: {
  requestId: string;
  idempotencyKey: string;
  method: string;
  route: string;
  sourceService: string;
  destinationService: string;
  statusCode: number;
  durationMs: number;
  safeErrorCode?: string | null;
  runId?: string | null;
  bodyHash?: string | null;
}): Promise<SafeLogEntry> {
  return {
    timestamp: new Date().toISOString(),
    requestId: params.requestId,
    idempotencyKeyHash: await hashIdempotencyKey(params.idempotencyKey),
    route: params.route,
    sourceService: params.sourceService,
    destinationService: params.destinationService,
    statusCode: params.statusCode,
    durationMs: params.durationMs,
    safeErrorCode: params.safeErrorCode || null,
    runId: params.runId || null,
    method: params.method.toUpperCase(),
    bodyHash: params.bodyHash || null,
  };
}

// ============================================================
// Browser-safe error response builder
// ============================================================

/**
 * Creates a generic authentication failure response.
 * Never reveals which check failed (signature, timestamp, etc.).
 */
export function buildAuthFailedResponse(requestId: string): {
  success: false;
  error: { code: string; message: string; requestId: string };
} {
  return {
    success: false,
    error: {
      code: 'WEBHOOK_AUTH_FAILED',
      message: 'The internal request could not be authenticated.',
      requestId,
    },
  };
}