// ============================================================
// DFP UAT Agent — Release Webhook Dispatch Engine
// ============================================================
// Fires signed, idempotent webhook events to deployment
// systems when releases are approved, rejected, or rolled back.
//
// Uses the existing HMAC-SHA256 request-signing infrastructure.
// Never includes credentials, session data, or private URLs.
// ============================================================

import type {
  ReleaseWebhookEventType,
  ReleaseWebhookPayload,
  ReleaseWebhookConfig,
  ReleaseWebhookDeliveryStatus,
  ReleaseWebhookDeliveryRecord,
  ReleaseWebhookErrorCode,
  ReleaseWebhookAuditEventType,
  UatReleaseCandidate,
  UatReleaseApproval,
} from '@/types/uat';
import {
  createSigningHeaders,
  createRequestId,
  hashRequestBody,
} from '@/lib/security/request-signing.server';

// ============================================================
// Configuration
// ============================================================

const DEFAULT_WEBHOOK_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BACKOFF_MS = 5000;

export function getDefaultWebhookConfig(): ReleaseWebhookConfig {
  return {
    enabled: true,
    endpointUrl: '',
    timeoutMs: DEFAULT_WEBHOOK_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
    requireValidSignature: true,
    secretName: 'UAT_WEBHOOK_SECRET',
  };
}

// ============================================================
// Payload Construction
// ============================================================

/**
 * Build the release webhook payload from an approved release.
 * Never includes credentials, tokens, session data, or private URLs.
 */
export function buildReleaseWebhookPayload(
  event: ReleaseWebhookEventType,
  candidate: UatReleaseCandidate,
  approval: UatReleaseApproval,
): ReleaseWebhookPayload {
  return {
    event,
    releaseCandidateId: candidate.id,
    projectId: candidate.projectId,
    buildReference: approval.approvedBuildReference,
    gitSha: approval.approvedGitSha,
    approvalId: approval.id,
    approvedAt: approval.approvedAt,
    expiryAt: approval.expiresAt,
    approvedBy: approval.approvedBy,
    conditions: approval.conditions,
    releaseVersion: candidate.releaseVersion,
    environment: candidate.environment,
    decision: approval.decision,
    timestamp: new Date().toISOString(),
    fingerprintHash: approval.approvedFingerprintHash,
  };
}

// ============================================================
// Webhook Dispatch
// ============================================================

export interface WebhookDispatchInput {
  event: ReleaseWebhookEventType;
  payload: ReleaseWebhookPayload;
  config: ReleaseWebhookConfig;
  signingSecret: string;
  path: string;
  method?: string;
}

export interface WebhookDispatchResult {
  ok: boolean;
  deliveryRecord: ReleaseWebhookDeliveryRecord;
  errorCode?: ReleaseWebhookErrorCode;
  message?: string;
}

/**
 * Dispatch a signed webhook to a deployment endpoint.
 * Returns a delivery record reflecting the outcome.
 */
export async function dispatchReleaseWebhook(
  input: WebhookDispatchInput,
): Promise<WebhookDispatchResult> {
  const {
    event,
    payload,
    config,
    signingSecret,
    path,
    method = 'POST',
  } = input;

  // Guard: webhook must be enabled
  if (!config.enabled) {
    return {
      ok: false,
      deliveryRecord: buildDeliveryRecord('pending', event, payload, config.endpointUrl, ''),
      errorCode: 'WEBHOOK_DISABLED',
      message: 'Release webhook dispatch is disabled.',
    };
  }

  // Guard: endpoint must be configured
  if (!config.endpointUrl || config.endpointUrl.trim() === '') {
    return {
      ok: false,
      deliveryRecord: buildDeliveryRecord('pending', event, payload, config.endpointUrl, ''),
      errorCode: 'WEBHOOK_ENDPOINT_NOT_CONFIGURED',
      message: 'No deployment webhook endpoint configured.',
    };
  }

  const requestId = createRequestId();
  const rawBody = JSON.stringify(payload);
  const bodyHash = await hashRequestBody(rawBody);
  const idempotencyKey = `release-webhook:${payload.releaseCandidateId}:${payload.approvalId}:${event}`;

  let signingHeaders: Record<string, string>;
  try {
    signingHeaders = await createSigningHeaders(
      method,
      path,
      rawBody,
      idempotencyKey,
      signingSecret,
      requestId,
    );
  } catch {
    return {
      ok: false,
      deliveryRecord: buildDeliveryRecord('delivery_failed', event, payload, config.endpointUrl, bodyHash, requestId, idempotencyKey),
      errorCode: 'WEBHOOK_SIGNING_FAILED',
      message: 'Failed to create HMAC-SHA256 signature for release webhook.',
    };
  }

  const fullUrl = `${config.endpointUrl.replace(/\/$/, '')}${path}`;

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    response = await fetch(fullUrl, {
      method,
      headers: signingHeaders,
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (err: unknown) {
    const errMessage = err instanceof DOMException && err.name === 'AbortError'
      ? `Webhook delivery timed out after ${config.timeoutMs}ms`
      : err instanceof Error ? err.message : 'Unknown delivery error';

    return {
      ok: false,
      deliveryRecord: buildDeliveryRecord(
        'delivery_failed',
        event,
        payload,
        config.endpointUrl,
        bodyHash,
        requestId,
        idempotencyKey,
        1,
        null,
        safeTruncate(errMessage),
      ),
      errorCode: 'WEBHOOK_DELIVERY_FAILED',
      message: errMessage,
    };
  }

  const responseBody = await safeReadResponseBody(response);

  if (response.ok) {
    return {
      ok: true,
      deliveryRecord: buildDeliveryRecord(
        'delivered',
        event,
        payload,
        config.endpointUrl,
        bodyHash,
        requestId,
        idempotencyKey,
        1,
        response.status,
        safeTruncate(responseBody),
      ),
    };
  }

  return {
    ok: false,
    deliveryRecord: buildDeliveryRecord(
      'delivery_failed',
      event,
      payload,
      config.endpointUrl,
      bodyHash,
      requestId,
      idempotencyKey,
      1,
      response.status,
      safeTruncate(responseBody),
    ),
    errorCode: 'WEBHOOK_DELIVERY_FAILED',
    message: `Deployment endpoint returned HTTP ${response.status}`,
  };
}

// ============================================================
// Retry-Aware Dispatch
// ============================================================

export interface WebhookDispatchWithRetryInput {
  event: ReleaseWebhookEventType;
  payload: ReleaseWebhookPayload;
  config: ReleaseWebhookConfig;
  signingSecret: string;
  path: string;
  method?: string;
  previousRecord?: ReleaseWebhookDeliveryRecord;
}

/**
 * Dispatch with retry support. If a previous record exists with
 * attempts, increments from that point. Respects maxRetries.
 */
export async function dispatchReleaseWebhookWithRetry(
  input: WebhookDispatchWithRetryInput,
): Promise<WebhookDispatchResult> {
  const {
    event,
    payload,
    config,
    signingSecret,
    path,
    method = 'POST',
    previousRecord,
  } = input;

  const currentAttempt = previousRecord ? previousRecord.attemptCount + 1 : 1;

  // Guard: already exceeded max retries
  if (currentAttempt > config.maxRetries) {
    const record = previousRecord
      ? {
        ...previousRecord,
        status: 'max_retries_exceeded' as ReleaseWebhookDeliveryStatus,
        attemptCount: currentAttempt,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      : buildDeliveryRecord('max_retries_exceeded', event, payload, config.endpointUrl, '', '', '', config.maxRetries);

    return {
      ok: false,
      deliveryRecord: record,
      errorCode: 'WEBHOOK_MAX_RETRIES_EXCEEDED',
      message: `Webhook delivery failed after ${config.maxRetries} retry attempts.`,
    };
  }

  // Attempt dispatch
  const result = await dispatchReleaseWebhook({
    event,
    payload,
    config,
    signingSecret,
    path,
    method,
  });

  // Annotate with attempt count from the retry context
  const recordWithAttempt = {
    ...result.deliveryRecord,
    attemptCount: currentAttempt,
    lastAttemptAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (result.ok) {
    return {
      ...result,
      deliveryRecord: {
        ...recordWithAttempt,
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
      },
    };
  }

  // Delivery failed — schedule retry if under limit
  if (currentAttempt < config.maxRetries) {
    const nextRetryAt = new Date(
      Date.now() + config.retryBackoffMs * Math.pow(2, currentAttempt - 1),
    ).toISOString();

    return {
      ...result,
      deliveryRecord: {
        ...recordWithAttempt,
        status: 'retrying',
        nextRetryAt,
      },
    };
  }

  return {
    ...result,
    deliveryRecord: {
      ...recordWithAttempt,
      status: 'max_retries_exceeded',
    },
    errorCode: 'WEBHOOK_MAX_RETRIES_EXCEEDED',
    message: `Webhook delivery failed after ${config.maxRetries} attempts.`,
  };
}

// ============================================================
// Delivery Record Builder
// ============================================================

function buildDeliveryRecord(
  status: ReleaseWebhookDeliveryStatus,
  event: ReleaseWebhookEventType,
  payload: ReleaseWebhookPayload,
  endpointUrl: string,
  bodyHash: string,
  requestId?: string,
  idempotencyKey?: string,
  attemptCount: number = 0,
  responseStatusCode: number | null = null,
  safeResponseOrError: string | null = null,
): ReleaseWebhookDeliveryRecord {
  const now = new Date().toISOString();
  const reqId = requestId || createRequestId();
  const idemKey = idempotencyKey || `release-webhook:${payload.releaseCandidateId}:${payload.approvalId}:${event}`;

  return {
    id: `wh-${payload.approvalId}-${Date.now()}`,
    releaseCandidateId: payload.releaseCandidateId,
    approvalId: payload.approvalId,
    eventType: event,
    endpointUrl: safeEndpointPreview(endpointUrl),
    status,
    attemptCount,
    lastAttemptAt: attemptCount > 0 ? now : null,
    deliveredAt: status === 'delivered' ? now : null,
    responseStatusCode,
    responseBodyPreview: status === 'delivered' ? safeResponseOrError : null,
    safeError: status === 'delivery_failed' || status === 'max_retries_exceeded' ? safeResponseOrError : null,
    nextRetryAt: status === 'retrying' ? new Date(Date.now() + DEFAULT_RETRY_BACKOFF_MS).toISOString() : null,
    requestId: reqId,
    idempotencyKey: idemKey,
    bodyHash: bodyHash || '',
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================
// Helpers
// ============================================================

async function safeReadResponseBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.substring(0, 500);
  } catch {
    return '(unreadable response body)';
  }
}

function safeTruncate(input: string, maxLen: number = 500): string {
  if (!input) return '';
  return input.length > maxLen ? input.substring(0, maxLen) + '...' : input;
}

/**
 * Redact the full endpoint URL to a safe preview — show only
 * the hostname, never query params or full path that might
 * contain tokens.
 */
function safeEndpointPreview(url: string): string {
  if (!url) return '(not configured)';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return '(invalid endpoint URL)';
  }
}

// ============================================================
// Webhook Approval Integration
// ============================================================

export interface ApprovalWebhookContext {
  candidate: UatReleaseCandidate;
  approval: UatReleaseApproval;
  config: ReleaseWebhookConfig;
  signingSecret: string;
  path?: string;
}

/**
 * Fire the release-approved webhook after a successful human
 * approval. This is the main integration point — call this from
 * the approval handler after the approval record is persisted.
 */
export async function fireReleaseApprovedWebhook(
  ctx: ApprovalWebhookContext,
): Promise<WebhookDispatchResult> {
  const payload = buildReleaseWebhookPayload('release.approved', ctx.candidate, ctx.approval);

  return dispatchReleaseWebhookWithRetry({
    event: 'release.approved',
    payload,
    config: ctx.config,
    signingSecret: ctx.signingSecret,
    path: ctx.path || '/webhook/dfp-uat/release-approved',
  });
}

/**
 * Fire the release-rejected webhook when a release is rejected.
 */
export async function fireReleaseRejectedWebhook(
  ctx: ApprovalWebhookContext,
): Promise<WebhookDispatchResult> {
  const payload = buildReleaseWebhookPayload('release.rejected', ctx.candidate, ctx.approval);

  return dispatchReleaseWebhook({
    event: 'release.rejected',
    payload,
    config: ctx.config,
    signingSecret: ctx.signingSecret,
    path: ctx.path || '/webhook/dfp-uat/release-rejected',
  });
}

// ============================================================
// Audit Event Helpers
// ============================================================

export function createWebhookAuditEntry(
  eventType: ReleaseWebhookAuditEventType,
  releaseId: string,
  approvalId: string,
  actor: string,
  details: string,
): { eventType: string; releaseId: string; approvalId: string; actor: string; details: string; timestamp: string } {
  return {
    eventType,
    releaseId,
    approvalId,
    actor,
    details,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// Delivery Status Classification
// ============================================================

export function classifyWebhookDeliveryStatus(
  record: ReleaseWebhookDeliveryRecord | null,
): { label: string; color: string; icon: string } {
  if (!record) {
    return { label: 'Not Dispatched', color: 'text-foreground-400', icon: 'ri-mail-close-line' };
  }

  switch (record.status) {
    case 'delivered':
      return { label: 'Delivered', color: 'text-green-600', icon: 'ri-check-double-line' };
    case 'acknowledged':
      return { label: 'Acknowledged', color: 'text-green-600', icon: 'ri-check-double-line' };
    case 'sending':
      return { label: 'Sending', color: 'text-amber-600', icon: 'ri-mail-send-line' };
    case 'pending':
      return { label: 'Pending', color: 'text-foreground-500', icon: 'ri-mail-line' };
    case 'retrying':
      return { label: `Retrying (${record.attemptCount}/${record.attemptCount + 2})`, color: 'text-amber-600', icon: 'ri-refresh-line' };
    case 'delivery_failed':
      return { label: 'Delivery Failed', color: 'text-red-600', icon: 'ri-mail-close-line' };
    case 'max_retries_exceeded':
      return { label: 'Max Retries Exceeded', color: 'text-red-600', icon: 'ri-error-warning-line' };
  }
}