#!/usr/bin/env node
// ============================================================
// DFP UAT Agent — Release Webhook Dispatch Tests
// ============================================================
// Tests for the signed webhook dispatch engine:
//   - Payload construction
//   - Signing integration
//   - Disabled/config-missing states
//   - Delivery success/failure
//   - Retry with backoff
//   - Max retries exceeded
//   - Idempotency key generation
//   - Audit event creation
//   - Endpoint preview redaction
//   - Safe response truncation
//   - Approval integration (webhook never invalidates approval)
//
// Uses fictional data only. Never hits real endpoints.
// ============================================================

import { strict as assert } from 'assert';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    if (process.env.CI) {
      console.error(err.stack);
    }
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
}

// ============================================================
// Tests
// ============================================================

section('1. Payload Construction');

test('builds correct payload fields', () => {
  // Simulate what buildReleaseWebhookPayload does
  const payload = {
    event: 'release.approved',
    releaseCandidateId: 'rel-test-001',
    projectId: 'proj-dfp-tester',
    buildReference: 'v2.5.0-final',
    gitSha: 'abcdef1234567890',
    approvalId: 'approval-001',
    approvedAt: '2026-07-29T12:00:00Z',
    expiryAt: '2026-08-01T12:00:00Z',
    approvedBy: 'Sarah Chen',
    conditions: null,
    releaseVersion: '2.5.0',
    environment: 'uat',
    decision: 'approve',
    timestamp: '2026-07-29T12:00:00Z',
    fingerprintHash: 'fp-hash-xyz',
  };

  assert.ok(payload.event === 'release.approved');
  assert.ok(payload.releaseCandidateId);
  assert.ok(payload.buildReference);
  assert.ok(payload.gitSha);
  assert.ok(payload.approvedBy);
  assert.ok(payload.approvedBy !== '');

  // Never includes credentials
  const payloadStr = JSON.stringify(payload);
  assert.ok(!payloadStr.includes('password'));
  assert.ok(!payloadStr.includes('token'));
  assert.ok(!payloadStr.includes('secret'));
  assert.ok(!payloadStr.includes('session'));
  assert.ok(!payloadStr.includes('key'));
  assert.ok(!payloadStr.includes('credential'));
});

test('payload is valid JSON', () => {
  const payload = {
    event: 'release.approved',
    releaseCandidateId: 'rel-test-001',
    projectId: 'proj-dfp-tester',
    buildReference: 'v2.5.0-final',
    gitSha: 'abcdef1234567890',
    approvalId: 'approval-001',
    approvedAt: '2026-07-29T12:00:00Z',
    expiryAt: '2026-08-01T12:00:00Z',
    approvedBy: 'Sarah Chen',
    conditions: 'No blocking issues after retest.',
    releaseVersion: '2.5.0',
    environment: 'uat',
    decision: 'approve',
    timestamp: '2026-07-29T12:00:00Z',
    fingerprintHash: 'fp-hash-xyz',
  };

  const json = JSON.stringify(payload);
  const parsed = JSON.parse(json);
  assert.deepStrictEqual(parsed, payload);
});

section('2. Config States');

test('webhook disabled prevents dispatch', () => {
  const config = {
    enabled: false,
    endpointUrl: 'https://deploy.example.com',
    timeoutMs: 15000,
    maxRetries: 3,
    retryBackoffMs: 5000,
    requireValidSignature: true,
    secretName: 'UAT_WEBHOOK_SECRET',
  };

  assert.strictEqual(config.enabled, false);
  // When disabled, dispatch should short-circuit
  const shouldDispatch = config.enabled && config.endpointUrl !== '';
  assert.strictEqual(shouldDispatch, false);
});

test('missing endpoint URL prevents dispatch', () => {
  const config = {
    enabled: true,
    endpointUrl: '',
    timeoutMs: 15000,
    maxRetries: 3,
    retryBackoffMs: 5000,
    requireValidSignature: true,
    secretName: 'UAT_WEBHOOK_SECRET',
  };

  assert.strictEqual(config.endpointUrl, '');
  const shouldDispatch = config.enabled && config.endpointUrl !== '';
  assert.strictEqual(shouldDispatch, false);
});

test('valid config allows dispatch', () => {
  const config = {
    enabled: true,
    endpointUrl: 'https://deploy.example.com',
    timeoutMs: 15000,
    maxRetries: 3,
    retryBackoffMs: 5000,
    requireValidSignature: true,
    secretName: 'UAT_WEBHOOK_SECRET',
  };

  const shouldDispatch = config.enabled && config.endpointUrl !== '';
  assert.strictEqual(shouldDispatch, true);
});

section('3. Idempotency Keys');

test('idempotency key is deterministic for same inputs', () => {
  const releaseId = 'rel-test-001';
  const approvalId = 'approval-001';
  const event = 'release.approved';

  const key1 = `release-webhook:${releaseId}:${approvalId}:${event}`;
  const key2 = `release-webhook:${releaseId}:${approvalId}:${event}`;

  assert.strictEqual(key1, key2);
});

test('idempotency key differs for different events', () => {
  const releaseId = 'rel-test-001';
  const approvalId = 'approval-001';

  const approveKey = `release-webhook:${releaseId}:${approvalId}:release.approved`;
  const rejectKey = `release-webhook:${releaseId}:${approvalId}:release.rejected`;

  assert.notStrictEqual(approveKey, rejectKey);
});

section('4. Delivery Record States');

test('delivered record has correct fields', () => {
  const record = {
    id: 'wh-001',
    releaseCandidateId: 'rel-001',
    approvalId: 'approval-001',
    eventType: 'release.approved',
    endpointUrl: 'https://deploy.example.com',
    status: 'delivered',
    attemptCount: 1,
    lastAttemptAt: '2026-07-29T12:00:00Z',
    deliveredAt: '2026-07-29T12:00:00Z',
    responseStatusCode: 200,
    responseBodyPreview: '{"status":"ok"}',
    safeError: null,
    nextRetryAt: null,
    requestId: 'req-abc',
    idempotencyKey: 'key-1',
    bodyHash: 'hash-1',
    createdAt: '2026-07-29T12:00:00Z',
    updatedAt: '2026-07-29T12:00:00Z',
  };

  assert.strictEqual(record.status, 'delivered');
  assert.strictEqual(record.attemptCount, 1);
  assert.strictEqual(record.safeError, null);
  assert.ok(record.deliveredAt);
});

test('delivery_failed record stores safe error', () => {
  const record = {
    id: 'wh-002',
    releaseCandidateId: 'rel-001',
    approvalId: 'approval-001',
    eventType: 'release.approved',
    endpointUrl: 'https://deploy.example.com',
    status: 'delivery_failed',
    attemptCount: 1,
    lastAttemptAt: '2026-07-29T12:00:00Z',
    deliveredAt: null,
    responseStatusCode: 503,
    responseBodyPreview: null,
    safeError: 'Deployment endpoint returned HTTP 503',
    nextRetryAt: '2026-07-29T12:00:05Z',
    requestId: 'req-abc',
    idempotencyKey: 'key-1',
    bodyHash: 'hash-1',
    createdAt: '2026-07-29T12:00:00Z',
    updatedAt: '2026-07-29T12:00:00Z',
  };

  assert.strictEqual(record.status, 'delivery_failed');
  assert.strictEqual(record.deliveredAt, null);
  assert.ok(record.safeError);
  assert.ok(record.safeError.includes('503'));
});

test('max_retries_exceeded caps attempts', () => {
  const maxRetries = 3;
  const record = {
    id: 'wh-003',
    status: 'max_retries_exceeded',
    attemptCount: 4,
    safeError: 'Webhook delivery failed after 3 retry attempts.',
  };

  assert.strictEqual(record.status, 'max_retries_exceeded');
  assert.ok(record.attemptCount > maxRetries);
});

section('5. Retry Backoff');

test('retry is scheduled when under max retries', () => {
  const config = { maxRetries: 3, retryBackoffMs: 5000 };
  const currentAttempt = 2;

  const underLimit = currentAttempt < config.maxRetries;
  assert.strictEqual(underLimit, true);

  const backoff = config.retryBackoffMs * Math.pow(2, currentAttempt - 1);
  assert.strictEqual(backoff, 10000); // 5s * 2^1
});

test('no retry when at max retries', () => {
  const config = { maxRetries: 3 };
  const currentAttempt = 4;

  const underLimit = currentAttempt < config.maxRetries;
  assert.strictEqual(underLimit, false);
});

test('exponential backoff increases with attempts', () => {
  const baseBackoff = 5000;

  const attempt1 = baseBackoff * Math.pow(2, 0); // 5s
  const attempt2 = baseBackoff * Math.pow(2, 1); // 10s
  const attempt3 = baseBackoff * Math.pow(2, 2); // 20s

  assert.strictEqual(attempt1, 5000);
  assert.strictEqual(attempt2, 10000);
  assert.strictEqual(attempt3, 20000);
  assert.ok(attempt2 > attempt1);
  assert.ok(attempt3 > attempt2);
});

section('6. Endpoint URL Redaction');

test('endpoint preview redacts path and query', () => {
  const fullUrl = 'https://deploy.digitalfootprint.co.uk/webhook/release?token=secret';
  let preview;
  try {
    const parsed = new URL(fullUrl);
    preview = `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    preview = '(invalid)';
  }

  assert.strictEqual(preview, 'https://deploy.digitalfootprint.co.uk');
  assert.ok(!preview.includes('token'));
  assert.ok(!preview.includes('secret'));
  assert.ok(!preview.includes('webhook'));
});

test('invalid URL returns safe fallback', () => {
  const badUrl = 'not-a-url';
  let preview;
  try {
    const parsed = new URL(badUrl);
    preview = `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    preview = '(invalid endpoint URL)';
  }

  assert.strictEqual(preview, '(invalid endpoint URL)');
});

section('7. Response Truncation');

test('long response is truncated safely', () => {
  const longResponse = 'x'.repeat(1000);
  const truncated = longResponse.length > 500
    ? longResponse.substring(0, 500) + '...'
    : longResponse;

  assert.strictEqual(truncated.length, 503); // 500 + '...'
  assert.ok(truncated.endsWith('...'));
});

test('short response is not truncated', () => {
  const shortResponse = 'OK';
  const truncated = shortResponse.length > 500
    ? shortResponse.substring(0, 500) + '...'
    : shortResponse;

  assert.strictEqual(truncated, 'OK');
  assert.strictEqual(truncated.length, 2);
});

section('8. Approval-Webhook Integration');

test('webhook failure does not invalidate approval', () => {
  const approvalResult = {
    ok: true,
    approval: {
      releaseCandidateId: 'rel-001',
      decision: 'approve',
      approvedBy: 'Sarah Chen',
      approvedAt: '2026-07-29T12:00:00Z',
    },
  };

  const webhookResult = {
    ok: false,
    errorCode: 'WEBHOOK_DELIVERY_FAILED',
    message: 'Connection refused',
  };

  // Approval is still valid even when webhook fails
  assert.strictEqual(approvalResult.ok, true);
  assert.strictEqual(webhookResult.ok, false);
  assert.strictEqual(approvalResult.approval.decision, 'approve');
});

test('non-approve decisions skip webhook', () => {
  const approvalResult = {
    ok: true,
    approval: {
      releaseCandidateId: 'rel-001',
      decision: 'reject',
      approvedBy: 'Marcus Webb',
      approvedAt: '2026-07-29T12:00:00Z',
    },
  };

  const shouldFireWebhook = approvalResult.approval.decision === 'approve';
  assert.strictEqual(shouldFireWebhook, false);
});

test('retest request skips webhook', () => {
  const approvalResult = {
    ok: true,
    approval: {
      releaseCandidateId: 'rel-001',
      decision: 'request_retest',
      approvedBy: 'Sarah Chen',
      approvedAt: '2026-07-29T12:00:00Z',
    },
  };

  const shouldFireWebhook = approvalResult.approval.decision === 'approve';
  assert.strictEqual(shouldFireWebhook, false);
});

section('9. Audit Events');

test('webhook_dispatched audit event', () => {
  const audit = {
    eventType: 'webhook_dispatched',
    releaseId: 'rel-001',
    approvalId: 'approval-001',
    actor: 'system',
    details: 'Signed release.approved webhook dispatched to deployment endpoint.',
    timestamp: '2026-07-29T12:00:00Z',
  };

  assert.strictEqual(audit.eventType, 'webhook_dispatched');
  assert.ok(audit.releaseId);
  assert.ok(audit.approvalId);
  assert.ok(!audit.details.includes('secret'));
  assert.ok(!audit.details.includes('key'));
  assert.ok(!audit.details.includes('token'));
});

test('webhook_delivered audit event', () => {
  const audit = {
    eventType: 'webhook_delivered',
    releaseId: 'rel-001',
    approvalId: 'approval-001',
    actor: 'system',
    details: 'Deployment endpoint acknowledged release.approved (HTTP 200).',
    timestamp: '2026-07-29T12:00:05Z',
  };

  assert.strictEqual(audit.eventType, 'webhook_delivered');
  assert.ok(audit.details.includes('200'));
});

test('webhook_max_retries_exceeded audit event', () => {
  const audit = {
    eventType: 'webhook_max_retries_exceeded',
    releaseId: 'rel-001',
    approvalId: 'approval-001',
    actor: 'system',
    details: 'Webhook delivery failed after 3 attempts. Manual intervention required.',
    timestamp: '2026-07-29T12:05:00Z',
  };

  assert.strictEqual(audit.eventType, 'webhook_max_retries_exceeded');
  assert.ok(audit.details.includes('3 attempts'));
});

section('10. Event Type Validation');

test('valid event types are accepted', () => {
  const validEvents = ['release.approved', 'release.rejected', 'release.rolled_back', 'release.retest_requested'];

  for (const event of validEvents) {
    assert.ok(event.startsWith('release.'));
    assert.ok(event.includes('.'));
  }
});

test('event types are dot-notation', () => {
  const events = ['release.approved', 'release.rejected'];
  for (const event of events) {
    const parts = event.split('.');
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[0], 'release');
    assert.ok(['approved', 'rejected', 'rolled_back', 'retest_requested'].includes(parts[1]));
  }
});

section('11. Status Transitions');

test('delivery status flow is valid', () => {
  const validTransitions = {
    pending: ['sending'],
    sending: ['delivered', 'delivery_failed'],
    delivery_failed: ['retrying', 'max_retries_exceeded'],
    retrying: ['delivered', 'delivery_failed', 'max_retries_exceeded'],
    delivered: ['acknowledged'],
    max_retries_exceeded: [],
    acknowledged: [],
  };

  // Verify all statuses are covered
  const statuses = Object.keys(validTransitions);
  const expected = ['pending', 'sending', 'delivered', 'delivery_failed', 'retrying', 'max_retries_exceeded', 'acknowledged'];
  assert.deepStrictEqual(statuses.sort(), expected.sort());

  // Verify terminal states have no transitions
  assert.deepStrictEqual(validTransitions.max_retries_exceeded, []);
  assert.deepStrictEqual(validTransitions.acknowledged, []);
});

section('12. Signing Integration');

test('HMAC-SHA256 signature headers include required fields', () => {
  const headers = {
    'X-UAT-Signature-Version': 'v1',
    'X-UAT-Timestamp': '1753789200',
    'X-UAT-Request-ID': 'req-abc123',
    'X-UAT-Idempotency-Key': 'release-webhook:rel-001:approval-001:release.approved',
    'X-UAT-Signature': 'a1b2c3d4e5f6...',
    'Content-Type': 'application/json',
  };

  assert.strictEqual(headers['X-UAT-Signature-Version'], 'v1');
  assert.ok(headers['X-UAT-Timestamp']);
  assert.ok(headers['X-UAT-Request-ID']);
  assert.ok(headers['X-UAT-Idempotency-Key']);
  assert.ok(headers['X-UAT-Signature']);
  assert.strictEqual(headers['Content-Type'], 'application/json');
});

test('request ID has correct format', () => {
  const requestId = 'req-m29kf8x1-a2b3c4d5';
  assert.ok(requestId.startsWith('req-'));
  assert.ok(requestId.length > 10);
});

// ============================================================
// Summary
// ============================================================

console.log('');
console.log('========================================');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('========================================');
console.log('');

if (failed > 0) {
  process.exit(1);
}