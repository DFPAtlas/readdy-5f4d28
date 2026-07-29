# DFP UAT Agent — Security Architecture

## Overview

All internal communication between the DFP UAT frontend, n8n, and the Playwright browser worker is authenticated using HMAC-SHA256 request signing, token authentication, replay protection, and idempotency enforcement.

## Communication Flow

```
DFP UAT Server → n8n Webhook        (HMAC-SHA256 signed)
n8n            → Playwright Worker   (Bearer token + HMAC-SHA256 signed)
Playwright     → n8n Callback        (HMAC-SHA256 signed, separate secret)
n8n            → DFP UAT Callback    (HMAC-SHA256 signed, separate secret)
DFP UAT Server → Supabase            (Service-role key, server-only)
```

## Secrets

All secrets are stored in `/opt/dfp-uat/app-stack/.env` on the UAT VM and never committed to GitHub.

| Secret | Purpose | Scope |
|--------|---------|-------|
| `UAT_WEBHOOK_SECRET` | Signs requests from DFP to n8n | Server-only |
| `UAT_CALLBACK_SECRET` | Signs callbacks from n8n/Playwright to DFP | Server-only |
| `PLAYWRIGHT_WORKER_TOKEN` | Bearer token for Playwright worker auth | Server-only |
| `N8N_API_TOKEN` | n8n API authentication | Server-only |

### Generating Secrets

Run each command separately on the UAT VM. Use different output for every secret:

```bash
openssl rand -hex 32  # UAT_WEBHOOK_SECRET
openssl rand -hex 32  # UAT_CALLBACK_SECRET
openssl rand -hex 32  # PLAYWRIGHT_WORKER_TOKEN
```

### Secret Rotation

1. Generate new secrets with `openssl rand -hex 32`
2. Copy current values to `_PREVIOUS_SECRET` variables
3. Set new values as the current secrets
4. Restart all services: `docker compose restart`
5. Verify health checks pass
6. Remove `_PREVIOUS_SECRET` variables after confirming all services use new secrets

During rotation, incoming verification accepts either the current or previous secret. New outgoing requests always use the current secret.

## Signature Format

### Canonical String

```
v1
{unixTimestamp}
{HTTP_METHOD}
{requestPath}
{SHA256_OF_RAW_BODY}
```

### Headers

| Header | Example | Description |
|--------|---------|-------------|
| `X-UAT-Signature-Version` | `v1` | Signature version |
| `X-UAT-Timestamp` | `1785337200` | Unix timestamp |
| `X-UAT-Request-ID` | `req-abc123` | Unique request identifier |
| `X-UAT-Idempotency-Key` | `start-run:run-001` | Stable operation key |
| `X-UAT-Signature` | `a1b2c3...` | HMAC-SHA256 hex signature |

### Verification Rules

- Timestamps must be within 300 seconds of server time
- Request IDs must not have been seen before
- Idempotency keys must not duplicate in-progress operations
- Signatures must match using timing-safe comparison
- Unsupported versions are rejected immediately

## Idempotency

Stable idempotency keys prevent duplicate operations:

| Operation | Key Pattern |
|-----------|-------------|
| Start run | `start-run:{runId}` |
| Start worker run | `start-worker-run:{runId}:{journeyId}:{browser}:{viewport}` |
| Complete journey | `complete-journey:{journeyResultId}` |
| Upsert finding | `upsert-finding:{findingFingerprint}` |
| Complete run | `complete-run:{runId}` |
| Cancel run | `cancel-run:{runId}` |

When a duplicate key is received:
- The operation is NOT repeated
- The existing result is returned when available
- The repeat count is incremented for auditing

## Run State Machine

Valid transitions:

```
queued → running
queued → cancelled
running → completed
running → completed_with_warnings
running → failed
running → interrupted
running → cancelled
interrupted → queued
failed → queued
```

Terminal states: `completed`, `completed_with_warnings`, `cancelled`
Retryable states: `failed`, `interrupted`

Rejected transitions are recorded in the audit log.

## Safe Logging

The following are NEVER logged:
- `UAT_WEBHOOK_SECRET`
- `UAT_CALLBACK_SECRET`
- `PLAYWRIGHT_WORKER_TOKEN`
- `X-UAT-Signature` header value
- `Authorization` header
- Raw passwords
- Session cookies
- Complete request bodies containing user data

Idempotency keys are hashed (SHA-256 truncated to 8 chars) in logs.

## Repository Safety

The `scripts/check-repository-safety.mjs` scanner detects:
- Forbidden environment files (`.env`, `.env.production`, etc.)
- Private key files (`.pem`, `.key`, `.p12`, `.pfx`)
- Hardcoded secrets (JWT, PostgreSQL URLs, API keys)
- Server-only variables in client-side code

Run locally: `node scripts/check-repository-safety.mjs`

## Handling a Suspected Secret Leak

1. **Revoke or rotate** the secret immediately on all services
2. **Remove** the secret from all source files
3. **Replace** with an environment variable reference
4. **Clean Git history** if the secret was committed:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
5. **Run** `node scripts/check-repository-safety.mjs` to verify
6. **Update** any services that used the old secret
7. **Review** audit logs for unauthorized access during exposure window

## Security Tests

Run automated security tests:

```bash
node scripts/test-security.mjs
```

Tests cover: canonical request construction, body hashing, signature generation and verification, timing-safe comparison, timestamp validation, replay protection, idempotent repeat handling, approved and invalid state transitions, sensitive header redaction, bearer token detection, and secret rotation.