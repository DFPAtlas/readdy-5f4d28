// ============================================================
// DFP UAT Agent — Idempotency Management (server-side)
// ============================================================
// Handles idempotency key generation, validation, replay
// detection, and storage. Works with uat_webhook_receipts
// table in Supabase when connected, otherwise uses in-memory
// store for local development.
// ============================================================

import { createIdempotencyKey as generateKey, createRequestId } from './request-signing.server';

// ============================================================
// Types
// ============================================================

export type IdempotencyStatus =
  | 'new'
  | 'duplicate'
  | 'replayed'
  | 'expired'
  | 'invalid_key';

export interface IdempotencyRecord {
  id: string;
  idempotencyKey: string;
  requestId: string;
  sourceService: string;
  destinationService: string;
  requestPath: string;
  requestMethod: string;
  bodyHash: string;
  status: 'processing' | 'completed' | 'duplicate' | 'expired';
  firstReceivedAt: string;
  lastReceivedAt: string;
  expiresAt: string;
  responseCode: number | null;
  runId: string | null;
  repeatCount: number;
}

export interface IdempotencyCheckResult {
  status: IdempotencyStatus;
  existingRecord: IdempotencyRecord | null;
  canProceed: boolean;
}

// ============================================================
// In-memory store (development only)
// ============================================================

interface StoredReceipt {
  record: IdempotencyRecord;
  addedAt: number;
}

class InMemoryReceiptStore {
  private receipts: Map<string, StoredReceipt> = new Map();
  private requestIds: Set<string> = new Set();

  hasRequestId(requestId: string): boolean {
    return this.requestIds.has(requestId);
  }

  getByKey(idempotencyKey: string): IdempotencyRecord | null {
    const stored = this.receipts.get(idempotencyKey);
    if (!stored) return null;

    // Check expiry
    const now = Date.now();
    const expiry = new Date(stored.record.expiresAt).getTime();
    if (now > expiry) {
      this.receipts.delete(idempotencyKey);
      return null;
    }

    return stored.record;
  }

  store(record: IdempotencyRecord): void {
    this.receipts.set(record.idempotencyKey, {
      record,
      addedAt: Date.now(),
    });
    this.requestIds.add(record.requestId);
  }

  update(idempotencyKey: string, updates: Partial<IdempotencyRecord>): void {
    const stored = this.receipts.get(idempotencyKey);
    if (stored) {
      stored.record = { ...stored.record, ...updates };
      this.receipts.set(idempotencyKey, stored);
    }
  }

  /** Clean expired records (call periodically) */
  cleanExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, stored] of this.receipts.entries()) {
      const expiry = new Date(stored.record.expiresAt).getTime();
      if (now > expiry) {
        this.receipts.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.receipts.size;
  }
}

// ============================================================
// Singleton store
// ============================================================

let store: InMemoryReceiptStore | null = null;

function getStore(): InMemoryReceiptStore {
  if (!store) {
    store = new InMemoryReceiptStore();
  }
  return store;
}

// ============================================================
// Idempotency Key Helpers
// ============================================================

/** Standard idempotency key builders for common UAT operations */
export const IdempotencyPatterns = {
  startRun: (runId: string) => generateKey('start-run', [runId]),
  startWorkerRun: (runId: string, journeyId: string, browser: string, viewport: string) =>
    generateKey('start-worker-run', [runId, journeyId, browser, viewport]),
  completeJourney: (journeyResultId: string) =>
    generateKey('complete-journey', [journeyResultId]),
  upsertFinding: (findingFingerprint: string) =>
    generateKey('upsert-finding', [findingFingerprint]),
  completeRun: (runId: string) => generateKey('complete-run', [runId]),
  cancelRun: (runId: string) => generateKey('cancel-run', [runId]),
  retryAi: (runId: string) => generateKey('retry-ai', [runId]),
};

/**
 * Creates an idempotency record without persisting it.
 * Use checkAndRecord() for the full persist + check flow.
 */
export function createIdempotencyRecord(params: {
  idempotencyKey: string;
  requestId: string;
  sourceService: string;
  destinationService: string;
  requestPath: string;
  requestMethod: string;
  bodyHash: string;
  runId?: string | null;
  ttlHours?: number;
}): IdempotencyRecord {
  const ttl = params.ttlHours || 24;
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString();

  return {
    id: `receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    idempotencyKey: params.idempotencyKey,
    requestId: params.requestId,
    sourceService: params.sourceService,
    destinationService: params.destinationService,
    requestPath: params.requestPath,
    requestMethod: params.requestMethod,
    bodyHash: params.bodyHash,
    status: 'processing',
    firstReceivedAt: now,
    lastReceivedAt: now,
    expiresAt: expiry,
    responseCode: null,
    runId: params.runId || null,
    repeatCount: 0,
  };
}

// ============================================================
// Idempotency Check
// ============================================================

export function checkIdempotency(
  idempotencyKey: string,
  requestId: string
): IdempotencyCheckResult {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return {
      status: 'invalid_key',
      existingRecord: null,
      canProceed: false,
    };
  }

  // Check for replayed request ID
  if (getStore().hasRequestId(requestId)) {
    const existing = getStore().getByKey(idempotencyKey);
    return {
      status: 'replayed',
      existingRecord: existing || null,
      canProceed: false,
    };
  }

  const existing = getStore().getByKey(idempotencyKey);

  if (existing) {
    // Same key already processed
    return {
      status: 'duplicate',
      existingRecord: existing,
      canProceed: false,
    };
  }

  return {
    status: 'new',
    existingRecord: null,
    canProceed: true,
  };
}

// ============================================================
// Record Management
// ============================================================

export function recordReceipt(record: IdempotencyRecord): void {
  getStore().store(record);
}

export function recordDuplicate(idempotencyKey: string): void {
  const existing = getStore().getByKey(idempotencyKey);
  if (existing) {
    getStore().update(idempotencyKey, {
      status: 'duplicate',
      lastReceivedAt: new Date().toISOString(),
      repeatCount: existing.repeatCount + 1,
    });
  }
}

export function completeReceipt(params: {
  idempotencyKey: string;
  responseCode: number;
  runId?: string | null;
}): void {
  getStore().update(params.idempotencyKey, {
    status: 'completed',
    responseCode: params.responseCode,
    runId: params.runId || null,
    lastReceivedAt: new Date().toISOString(),
  });
}

export function getReceipt(idempotencyKey: string): IdempotencyRecord | null {
  return getStore().getByKey(idempotencyKey);
}

/**
 * Combined check, record, and store — the standard flow for
 * incoming webhook requests.
 */
export async function checkAndRecordReceipt(params: {
  idempotencyKey: string;
  requestId: string;
  sourceService: string;
  destinationService: string;
  requestPath: string;
  requestMethod: string;
  bodyHash: string;
  runId?: string | null;
  ttlHours?: number;
}): Promise<IdempotencyCheckResult> {
  const check = checkIdempotency(params.idempotencyKey, params.requestId);

  if (!check.canProceed) {
    // Record the duplicate attempt for auditing
    recordDuplicate(params.idempotencyKey);
    return check;
  }

  // Create and store the new receipt
  const record = createIdempotencyRecord({
    idempotencyKey: params.idempotencyKey,
    requestId: params.requestId,
    sourceService: params.sourceService,
    destinationService: params.destinationService,
    requestPath: params.requestPath,
    requestMethod: params.requestMethod,
    bodyHash: params.bodyHash,
    runId: params.runId,
    ttlHours: params.ttlHours,
  });
  recordReceipt(record);

  return {
    status: 'new',
    existingRecord: null,
    canProceed: true,
  };
}

// ============================================================
// Store Stats
// ============================================================

export function getIdempotencyStats(): {
  totalRecords: number;
  activeRecords: number;
  duplicateCount: number;
  completedCount: number;
} {
  const s = getStore();
  s.cleanExpired(); // Clean first

  let active = 0;
  let duplicates = 0;
  let completed = 0;

  // Iterate all records (this is fine for in-memory store)
  // In production with Supabase, use COUNT queries
  for (const [, stored] of (s as unknown as Map<string, StoredReceipt>).entries()) {
    switch (stored.record.status) {
      case 'processing':
        active++;
        break;
      case 'duplicate':
        duplicates++;
        break;
      case 'completed':
        completed++;
        break;
    }
  }

  return {
    totalRecords: s.size,
    activeRecords: active,
    duplicateCount: duplicates,
    completedCount: completed,
  };
}

export function clearIdempotencyStore(): void {
  store = null;
}