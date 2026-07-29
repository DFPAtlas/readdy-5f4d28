// ============================================================
// DFP UAT Agent — Request Signing (server/universal)
// ============================================================
// Provides HMAC-SHA256 request signing following the
// canonical format:
//
//   v1
//   {unixTimestamp}
//   {HTTP_METHOD}
//   {requestPath}
//   {SHA256_OF_RAW_BODY}
//
// Uses Web Crypto API — available in browsers, Node 19+,
// and Deno. Timing-safe comparison for signature verification.
//
// NEVER log shared secrets, expected signatures, or auth
// headers. Verification errors must not reveal whether the
// timestamp, signature, or secret caused the failure.
// ============================================================

// ============================================================
// Types
// ============================================================

export type SignatureVersion = 'v1';

export type VerificationResult =
  | 'valid'
  | 'missing_signature'
  | 'invalid_signature'
  | 'expired_timestamp'
  | 'future_timestamp'
  | 'unsupported_version'
  | 'replayed_request'
  | 'missing_idempotency_key'
  | 'missing_timestamp'
  | 'missing_request_id';

export interface SigningHeaders {
  [headerName: string]: string;
  'X-UAT-Signature-Version': string;
  'X-UAT-Timestamp': string;
  'X-UAT-Request-ID': string;
  'X-UAT-Idempotency-Key': string;
  'X-UAT-Signature': string;
  'Content-Type': string;
}

export interface CanonicalRequest {
  version: SignatureVersion;
  timestamp: number;
  method: string;
  path: string;
  bodyHash: string;
  canonicalString: string;
}

export interface SignatureMetadata {
  version: SignatureVersion;
  timestamp: number;
  requestId: string;
  idempotencyKey: string;
  signatureHex: string;
}

// ============================================================
// Constants
// ============================================================

export const SIGNATURE_VERSION: SignatureVersion = 'v1';
export const SIGNATURE_TOLERANCE_SECONDS_DEFAULT = 300;
export const IDEMPOTENCY_TTL_HOURS_DEFAULT = 24;

export const SIGNING_HEADER_NAMES = {
  version: 'X-UAT-Signature-Version',
  timestamp: 'X-UAT-Timestamp',
  requestId: 'X-UAT-Request-ID',
  idempotencyKey: 'X-UAT-Idempotency-Key',
  signature: 'X-UAT-Signature',
} as const;

// ============================================================
// Helpers
// ============================================================

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

function textDecoder(): TextDecoder {
  return new TextDecoder();
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function createRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `req-${timestamp}-${random}`;
}

export function createIdempotencyKey(operation: string, uniqueParts: string[]): string {
  const parts = [operation, ...uniqueParts].filter(Boolean);
  return parts.join(':');
}

// ============================================================
// Body Hashing
// ============================================================

export async function hashRequestBody(rawBody: string): Promise<string> {
  const encoder = textEncoder();
  const data = encoder.encode(rawBody);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(hashBuffer);
}

export async function hashRequestBodyBytes(bodyBytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
  return bytesToHex(hashBuffer);
}

// ============================================================
// Canonical Request Construction
// ============================================================

export async function buildCanonicalRequest(
  method: string,
  path: string,
  rawBody: string,
  timestamp?: number
): Promise<CanonicalRequest> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const bodyHash = await hashRequestBody(rawBody);
  const normalizedMethod = method.toUpperCase();
  const canonicalString = [
    SIGNATURE_VERSION,
    String(ts),
    normalizedMethod,
    path,
    bodyHash,
  ].join('\n');

  return {
    version: SIGNATURE_VERSION,
    timestamp: ts,
    method: normalizedMethod,
    path,
    bodyHash,
    canonicalString,
  };
}

// ============================================================
// HMAC Key Import
// ============================================================

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = textEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// ============================================================
// Signature Creation
// ============================================================

export async function createRequestSignature(
  secret: string,
  canonicalString: string
): Promise<string> {
  const key = await importHmacKey(secret);
  const encoder = textEncoder();
  const data = encoder.encode(canonicalString);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return bytesToHex(signature);
}

// ============================================================
// Signature Verification (timing-safe)
// ============================================================

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;

  const aBytes = textEncoder().encode(a);
  const bBytes = textEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

export async function verifyRequestSignature(
  secret: string,
  canonicalString: string,
  providedSignatureHex: string
): Promise<boolean> {
  const expectedHex = await createRequestSignature(secret, canonicalString);
  return timingSafeEqual(expectedHex, providedSignatureHex);
}

// ============================================================
// Timestamp Validation
// ============================================================

export function validateRequestTimestamp(
  timestampSeconds: number,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS_DEFAULT
): 'valid' | 'expired_timestamp' | 'future_timestamp' {
  if (typeof timestampSeconds !== 'number' || !isFinite(timestampSeconds)) {
    return 'expired_timestamp';
  }

  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestampSeconds;

  if (diff > toleranceSeconds) {
    return 'expired_timestamp';
  }

  if (diff < -toleranceSeconds) {
    return 'future_timestamp';
  }

  return 'valid';
}

// ============================================================
// Full Verification Pipeline
// ============================================================

export interface IncomingSignatureHeaders {
  version?: string | null;
  timestamp?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  signature?: string | null;
}

export interface FullVerificationInput {
  method: string;
  path: string;
  rawBody: string;
  headers: IncomingSignatureHeaders;
  secret: string;
  toleranceSeconds?: number;
}

export interface FullVerificationResult {
  status: VerificationResult;
  metadata: SignatureMetadata | null;
  safeError: string;
}

export async function fullSignatureVerification(
  input: FullVerificationInput
): Promise<FullVerificationResult> {
  const { method, path, rawBody, headers, secret, toleranceSeconds } = input;

  // 1. Check version
  if (!headers.version) {
    return {
      status: 'unsupported_version',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }
  if (headers.version !== SIGNATURE_VERSION) {
    return {
      status: 'unsupported_version',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  // 2. Check timestamp
  if (!headers.timestamp) {
    return {
      status: 'missing_timestamp',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  const timestampNum = parseInt(headers.timestamp, 10);
  const tsCheck = validateRequestTimestamp(timestampNum, toleranceSeconds);
  if (tsCheck !== 'valid') {
    return {
      status: tsCheck,
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  // 3. Check request ID
  if (!headers.requestId) {
    return {
      status: 'missing_request_id',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  // 4. Check idempotency key
  if (!headers.idempotencyKey) {
    return {
      status: 'missing_idempotency_key',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  // 5. Check signature
  if (!headers.signature) {
    return {
      status: 'missing_signature',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  // 6. Build canonical request and verify
  const canonical = await buildCanonicalRequest(method, path, rawBody, timestampNum);
  const isValid = await verifyRequestSignature(secret, canonical.canonicalString, headers.signature);

  if (!isValid) {
    return {
      status: 'invalid_signature',
      metadata: null,
      safeError: 'The internal request could not be authenticated.',
    };
  }

  return {
    status: 'valid',
    metadata: {
      version: SIGNATURE_VERSION,
      timestamp: timestampNum,
      requestId: headers.requestId,
      idempotencyKey: headers.idempotencyKey,
      signatureHex: headers.signature,
    },
    safeError: '',
  };
}

// ============================================================
// Header Construction (for outgoing requests)
// ============================================================

export async function createSigningHeaders(
  method: string,
  path: string,
  rawBody: string,
  idempotencyKey: string,
  secret: string,
  requestId?: string
): Promise<SigningHeaders> {
  const canonical = await buildCanonicalRequest(method, path, rawBody);
  const signature = await createRequestSignature(secret, canonical.canonicalString);

  return {
    'X-UAT-Signature-Version': SIGNATURE_VERSION,
    'X-UAT-Timestamp': String(canonical.timestamp),
    'X-UAT-Request-ID': requestId || createRequestId(),
    'X-UAT-Idempotency-Key': idempotencyKey,
    'X-UAT-Signature': signature,
    'Content-Type': 'application/json',
  };
}

// ============================================================
// Fixed Test Vectors (do NOT use these as real secrets)
// ============================================================

export const TEST_VECTORS = {
  /** Only for unit tests — never use as a real secret */
  testSecret: 'test-secret-for-vector-only-not-real',
  testPayload: JSON.stringify({ action: 'test', value: 42 }),
  /** Pre-computed hash of the test payload above */
  testBodyHash: '', // Computed at runtime only — never stored
  testTimestamp: 1785337200, // Example from spec
  testPath: '/webhook/dfp-uat',
  testMethod: 'POST',
} as const;