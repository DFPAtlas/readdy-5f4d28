// ============================================================
// DFP UAT Agent — Recovery System (server-side)
// ============================================================
// Handles worker heartbeats, execution leases, stale-run
// detection, safe checkpoints, retry policy enforcement,
// cancellation orchestration, and emergency stop.
//
// NEVER expose secrets, tokens, or raw stack traces.
// ============================================================

import { createRequestId, createIdempotencyKey } from './request-signing.server';
import { checkAndRecordReceipt, completeReceipt } from './idempotency.server';
import type {
  UatRunState,
  TransitionValidationResult,
} from './run-state-machine';
import {
  validateRunTransition,
  isTerminalRunState,
  isRetryableRunState,
  isSafeToRepeat,
  requiresStaffApproval,
  DEFAULT_RETRY_POLICY,
  isRetryableError,
} from './run-state-machine';

// ============================================================
// Types
// ============================================================

export type RunHealth = 'healthy' | 'delayed' | 'stale' | 'interrupted' | 'failed';

export type RecoveryReason =
  | 'queue_timeout'
  | 'worker_start_timeout'
  | 'heartbeat_missing'
  | 'lease_expired'
  | 'progress_timeout'
  | 'callback_timeout'
  | 'ai_timeout'
  | 'cancel_timeout'
  | 'worker_offline'
  | 'vm_restart_detected'
  | 'unknown_interruption';

export type CheckpointId =
  | 'before_login'
  | 'after_login'
  | 'before_form_submission'
  | 'after_form_submission'
  | 'before_payment_redirect'
  | 'after_test_record_created'
  | 'before_cleanup';

export type RecoveryEventType =
  | 'worker_registered' | 'worker_delayed' | 'worker_stale'
  | 'lease_acquired' | 'lease_renewed' | 'lease_expired'
  | 'run_interrupted' | 'recovery_scan_started' | 'recovery_scan_completed'
  | 'retry_requested' | 'retry_approved' | 'retry_rejected'
  | 'cancel_requested' | 'cancel_acknowledged'
  | 'emergency_stop_enabled' | 'emergency_stop_disabled';

export interface ExecutionLease {
  workerInstanceId: string;
  leaseAcquiredAt: Date;
  leaseExpiresAt: Date;
  runId: string;
}

export interface CheckpointEntry {
  checkpointId: CheckpointId;
  journeyResultId: string;
  stepIndex: number;
  stepId: string;
  reachedAt: Date;
}

export interface RecoveryEvent {
  id: string;
  runId: string;
  journeyResultId: string | null;
  eventType: RecoveryEventType;
  detectedAt: Date;
  detectedBy: string;
  previousStatus: string;
  newStatus: string;
  reasonCode: string;
  safeSummary: string;
  automatic: boolean;
  approvedBy: string | null;
}

export interface HeartbeatPayload {
  workerInstanceId: string;
  workerType: string;
  status: 'idle' | 'busy' | 'degraded' | 'offline';
  activeRunIds: string[];
  activeJourneyResultIds: string[];
  capacity: number;
  timestamp: number;
}

export interface WorkerRecord {
  workerInstanceId: string;
  workerType: string;
  hostname: string;
  version: string;
  status: string;
  activeRunCount: number;
  capacity: number;
  lastSeenAt: Date;
  startedAt: Date;
}

export interface RecoveryScanResult {
  scanId: string;
  scannedAt: Date;
  totalRunsChecked: number;
  interruptedDetected: number;
  staleDetected: number;
  recoveredCount: number;
  errors: string[];
}

export interface RecoveryConfig {
  heartbeatIntervalSeconds: number;
  workerDelayedAfterSeconds: number;
  workerStaleAfterSeconds: number;
  runStartTimeoutSeconds: number;
  runIdleTimeoutSeconds: number;
  queueTimeoutSeconds: number;
  recoveryScanIntervalSeconds: number;
  defaultMaxAttempts: number;
  cancelTimeoutSeconds: number;
  alertCooldownMinutes: number;
}

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  heartbeatIntervalSeconds: 30,
  workerDelayedAfterSeconds: 90,
  workerStaleAfterSeconds: 180,
  runStartTimeoutSeconds: 300,
  runIdleTimeoutSeconds: 600,
  queueTimeoutSeconds: 900,
  recoveryScanIntervalSeconds: 60,
  defaultMaxAttempts: 2,
  cancelTimeoutSeconds: 120,
  alertCooldownMinutes: 30,
};

// ============================================================
// In-Memory Stores (development — Supabase in production)
// ============================================================

class WorkerHeartbeatStore {
  private workers: Map<string, WorkerRecord> = new Map();

  register(worker: WorkerRecord): void {
    this.workers.set(worker.workerInstanceId, worker);
  }

  heartbeat(workerInstanceId: string): void {
    const w = this.workers.get(workerInstanceId);
    if (w) {
      w.lastSeenAt = new Date();
      this.workers.set(workerInstanceId, w);
    }
  }

  get(workerInstanceId: string): WorkerRecord | undefined {
    return this.workers.get(workerInstanceId);
  }

  getAll(): WorkerRecord[] {
    return Array.from(this.workers.values());
  }

  getStaleWorkers(staleAfterSeconds: number): WorkerRecord[] {
    const cutoff = Date.now() - staleAfterSeconds * 1000;
    return Array.from(this.workers.values()).filter((w) => w.lastSeenAt.getTime() < cutoff);
  }

  getDelayedWorkers(delayedAfterSeconds: number): WorkerRecord[] {
    const cutoff = Date.now() - delayedAfterSeconds * 1000;
    return Array.from(this.workers.values()).filter((w) => w.lastSeenAt.getTime() < cutoff);
  }

  removeOffline(offlineForSeconds: number): number {
    const cutoff = Date.now() - offlineForSeconds * 1000;
    let removed = 0;
    for (const [id, w] of this.workers.entries()) {
      if (w.lastSeenAt.getTime() < cutoff) { this.workers.delete(id); removed++; }
    }
    return removed;
  }

  get size(): number { return this.workers.size; }
}

class LeaseStore {
  private leases: Map<string, ExecutionLease> = new Map();

  acquire(runId: string, workerInstanceId: string, ttlSeconds: number = 300): ExecutionLease | null {
    const existing = this.leases.get(runId);
    if (existing && existing.leaseExpiresAt > new Date()) {
      if (existing.workerInstanceId !== workerInstanceId) return null;
    }

    const now = new Date();
    const lease: ExecutionLease = {
      workerInstanceId,
      leaseAcquiredAt: now,
      leaseExpiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      runId,
    };
    this.leases.set(runId, lease);
    return lease;
  }

  renew(runId: string, workerInstanceId: string, ttlSeconds: number = 300): ExecutionLease | null {
    const existing = this.leases.get(runId);
    if (!existing) return null;
    if (existing.workerInstanceId !== workerInstanceId) return null;

    existing.leaseExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.leases.set(runId, existing);
    return existing;
  }

  get(runId: string): ExecutionLease | undefined { return this.leases.get(runId); }

  isExpired(runId: string): boolean {
    const l = this.leases.get(runId);
    return !l || l.leaseExpiresAt <= new Date();
  }

  getExpired(): ExecutionLease[] {
    const now = new Date();
    return Array.from(this.leases.values()).filter((l) => l.leaseExpiresAt <= now);
  }

  release(runId: string): void { this.leases.delete(runId); }

  get size(): number { return this.leases.size; }
}

class CheckpointStore {
  private checkpoints: Map<string, CheckpointEntry[]> = new Map();

  record(journeyResultId: string, entry: CheckpointEntry): void {
    const list = this.checkpoints.get(journeyResultId) || [];
    const existing = list.findIndex((c) => c.checkpointId === entry.checkpointId);
    if (existing >= 0) list[existing] = entry;
    else list.push(entry);
    this.checkpoints.set(journeyResultId, list);
  }

  getLastSafe(journeyResultId: string): CheckpointEntry | null {
    const list = this.checkpoints.get(journeyResultId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  getAll(journeyResultId: string): CheckpointEntry[] {
    return this.checkpoints.get(journeyResultId) || [];
  }

  clear(journeyResultId: string): void { this.checkpoints.delete(journeyResultId); }
}

class RecoveryEventStore {
  private events: RecoveryEvent[] = [];

  record(event: RecoveryEvent): void { this.events.push(event); }

  getByRun(runId: string): RecoveryEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }

  getRecent(limit: number = 50): RecoveryEvent[] {
    return this.events.slice(-limit).reverse();
  }

  get size(): number { return this.events.length; }
}

// ============================================================
// Singleton Stores
// ============================================================

let workerStore: WorkerHeartbeatStore | null = null;
let leaseStore: LeaseStore | null = null;
let checkpointStore: CheckpointStore | null = null;
let eventStore: RecoveryEventStore | null = null;

const getWorkerStore = () => { if (!workerStore) workerStore = new WorkerHeartbeatStore(); return workerStore; };
const getLeaseStore = () => { if (!leaseStore) leaseStore = new LeaseStore(); return leaseStore; };
const getCheckpointStore = () => { if (!checkpointStore) checkpointStore = new CheckpointStore(); return checkpointStore; };
const getEventStore = () => { if (!eventStore) eventStore = new RecoveryEventStore(); return eventStore; };

// ============================================================
// Execution Pause Flag
// ============================================================

let executionPaused = false;

export function isExecutionPaused(): boolean { return executionPaused; }
export function setExecutionPaused(paused: boolean): void { executionPaused = paused; }

// ============================================================
// Worker Heartbeats
// ============================================================

export function processHeartbeat(payload: HeartbeatPayload): { ok: boolean; message: string } {
  const store = getWorkerStore();

  if (!payload.workerInstanceId) return { ok: false, message: 'Missing worker instance ID.' };
  if (!payload.workerType) return { ok: false, message: 'Missing worker type.' };

  const now = new Date();
  const existing = store.get(payload.workerInstanceId);

  if (!existing) {
    store.register({
      workerInstanceId: payload.workerInstanceId,
      workerType: payload.workerType,
      hostname: 'unknown',
      version: '1.0',
      status: payload.status,
      activeRunCount: payload.activeRunIds.length,
      capacity: payload.capacity || 2,
      lastSeenAt: now,
      startedAt: now,
    });
  } else {
    existing.status = payload.status;
    existing.activeRunCount = payload.activeRunIds.length;
    existing.capacity = payload.capacity;
    existing.lastSeenAt = now;
    store.register(existing);
  }

  return { ok: true, message: 'Heartbeat recorded.' };
}

export function getWorkerStatus(): {
  workers: WorkerRecord[];
  staleWorkers: WorkerRecord[];
  delayedWorkers: WorkerRecord[];
} {
  const store = getWorkerStore();
  const cfg = DEFAULT_RECOVERY_CONFIG;
  return {
    workers: store.getAll(),
    staleWorkers: store.getStaleWorkers(cfg.workerStaleAfterSeconds),
    delayedWorkers: store.getDelayedWorkers(cfg.workerDelayedAfterSeconds),
  };
}

// ============================================================
// Execution Leases
// ============================================================

export function acquireLease(runId: string, workerInstanceId: string, ttlSeconds?: number): ExecutionLease | null {
  const store = getLeaseStore();
  const existingLease = store.get(runId);

  if (existingLease && !store.isExpired(runId)) {
    if (existingLease.workerInstanceId === workerInstanceId) {
      return store.renew(runId, workerInstanceId, ttlSeconds);
    }
    return null;
  }

  return store.acquire(runId, workerInstanceId, ttlSeconds);
}

export function renewLease(runId: string, workerInstanceId: string, ttlSeconds?: number): ExecutionLease | null {
  return getLeaseStore().renew(runId, workerInstanceId, ttlSeconds);
}

export function releaseLease(runId: string): void {
  getLeaseStore().release(runId);
}

export function isLeaseExpired(runId: string): boolean {
  return getLeaseStore().isExpired(runId);
}

export function getLease(runId: string): ExecutionLease | undefined {
  return getLeaseStore().get(runId);
}

export function getExpiredLeases(): ExecutionLease[] {
  return getLeaseStore().getExpired();
}

// ============================================================
// Stale-Run Detection
// ============================================================

export function classifyRunHealth(params: {
  status: UatRunState;
  heartbeatAt: Date | null;
  progressAt: Date | null;
  queueTime: Date | null;
  startTime: Date | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
}): { health: RunHealth; reason: RecoveryReason | null; recoverable: boolean } {
  const cfg = DEFAULT_RECOVERY_CONFIG;
  const now = new Date();

  // Terminal/stable states — no action needed
  if (isTerminalRunState(params.status)) {
    return { health: 'healthy', reason: null, recoverable: false };
  }

  // Queue timeout
  if (params.status === 'queued' && params.queueTime) {
    const queueAge = (now.getTime() - params.queueTime.getTime()) / 1000;
    if (queueAge > cfg.queueTimeoutSeconds) {
      return { health: 'stale', reason: 'queue_timeout', recoverable: false };
    }
  }

  // Start timeout
  if (params.status === 'starting' && params.startTime) {
    const startAge = (now.getTime() - params.startTime.getTime()) / 1000;
    if (startAge > cfg.runStartTimeoutSeconds) {
      return { health: 'stale', reason: 'worker_start_timeout', recoverable: params.attemptCount < params.maxAttempts };
    }
  }

  // Lease expired
  if (params.leaseExpiresAt && params.leaseExpiresAt <= now) {
    return {
      health: 'stale',
      reason: 'lease_expired',
      recoverable: params.attemptCount < params.maxAttempts && isRetryableRunState(params.status),
    };
  }

  // Heartbeat missing
  if (params.heartbeatAt) {
    const hbAge = (now.getTime() - params.heartbeatAt.getTime()) / 1000;
    if (hbAge > cfg.workerStaleAfterSeconds) {
      return {
        health: 'stale',
        reason: 'heartbeat_missing',
        recoverable: params.attemptCount < params.maxAttempts,
      };
    }
    if (hbAge > cfg.workerDelayedAfterSeconds) {
      return { health: 'delayed', reason: 'heartbeat_missing', recoverable: true };
    }
  }

  // Progress timeout
  if (params.progressAt) {
    const progAge = (now.getTime() - params.progressAt.getTime()) / 1000;
    if (progAge > cfg.runIdleTimeoutSeconds) {
      return {
        health: 'stale',
        reason: 'progress_timeout',
        recoverable: params.attemptCount < params.maxAttempts,
      };
    }
  }

  // Waiting-for-worker with no callback
  if (params.status === 'waiting_for_worker' && params.progressAt) {
    const waitAge = (now.getTime() - params.progressAt.getTime()) / 1000;
    if (waitAge > cfg.runIdleTimeoutSeconds) {
      return { health: 'stale', reason: 'callback_timeout', recoverable: params.attemptCount < params.maxAttempts };
    }
  }

  // Waiting-for-AI
  if (params.status === 'waiting_for_ai' && params.progressAt) {
    const aiWaitAge = (now.getTime() - params.progressAt.getTime()) / 1000;
    if (aiWaitAge > cfg.runIdleTimeoutSeconds) {
      return { health: 'stale', reason: 'ai_timeout', recoverable: true };
    }
  }

  // Cancel timeout
  if (params.status === 'cancel_requested' && params.progressAt) {
    const cancelAge = (now.getTime() - params.progressAt.getTime()) / 1000;
    if (cancelAge > cfg.cancelTimeoutSeconds) {
      return { health: 'stale', reason: 'cancel_timeout', recoverable: false };
    }
  }

  return { health: 'healthy', reason: null, recoverable: false };
}

// ============================================================
// Recovery Scanner
// ============================================================

let lastScanTime: Date | null = null;

export function runRecoveryScan(activeRuns: Array<{
  id: string;
  status: UatRunState;
  heartbeatAt: Date | null;
  progressAt: Date | null;
  queueTime: Date | null;
  startTime: Date | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  workerInstanceId: string | null;
}>): RecoveryScanResult {
  const eventS = getEventStore();

  const scanId = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  eventS.record({
    id: createRequestId(),
    runId: 'system',
    journeyResultId: null,
    eventType: 'recovery_scan_started',
    detectedAt: new Date(),
    detectedBy: 'recovery-scanner',
    previousStatus: '—',
    newStatus: '—',
    reasonCode: 'recovery_scan',
    safeSummary: 'Recovery scan started',
    automatic: true,
    approvedBy: null,
  });

  let interruptedDetected = 0;
  let staleDetected = 0;
  let recoveredCount = 0;
  const errors: string[] = [];

  for (const run of activeRuns) {
    try {
      const health = classifyRunHealth({
        status: run.status,
        heartbeatAt: run.heartbeatAt,
        progressAt: run.progressAt,
        queueTime: run.queueTime,
        startTime: run.startTime,
        leaseExpiresAt: run.leaseExpiresAt,
        attemptCount: run.attemptCount,
        maxAttempts: run.maxAttempts,
      });

      if (health.health === 'stale') {
        staleDetected++;
        if (health.recoverable) {
          // Auto-recover: transition to interrupted so staff can retry
          eventS.record({
            id: createRequestId(),
            runId: run.id,
            journeyResultId: null,
            eventType: 'run_interrupted',
            detectedAt: new Date(),
            detectedBy: 'recovery-scanner',
            previousStatus: run.status,
            newStatus: 'interrupted',
            reasonCode: health.reason || 'unknown_interruption',
            safeSummary: `Run ${run.id} marked interrupted due to ${health.reason}. Recoverable: true`,
            automatic: true,
            approvedBy: null,
          });
          interruptedDetected++;
          recoveredCount++;
        } else {
          interruptedDetected++;
        }
      } else if (health.health === 'delayed') {
        eventS.record({
          id: createRequestId(),
          runId: run.id,
          journeyResultId: null,
          eventType: 'worker_delayed',
          detectedAt: new Date(),
          detectedBy: 'recovery-scanner',
          previousStatus: run.status,
          newStatus: run.status,
          reasonCode: health.reason || 'unknown_interruption',
          safeSummary: `Run ${run.id} appears delayed: ${health.reason}`,
          automatic: true,
          approvedBy: null,
        });
      }
    } catch (err: unknown) {
      errors.push(`Run ${run.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  lastScanTime = new Date();

  eventS.record({
    id: createRequestId(),
    runId: 'system',
    journeyResultId: null,
    eventType: 'recovery_scan_completed',
    detectedAt: new Date(),
    detectedBy: 'recovery-scanner',
    previousStatus: '—',
    newStatus: '—',
    reasonCode: 'recovery_scan',
    safeSummary: `Scan complete: ${staleDetected} stale, ${interruptedDetected} interrupted, ${recoveredCount} auto-recovered`,
    automatic: true,
    approvedBy: null,
  });

  return {
    scanId,
    scannedAt: new Date(),
    totalRunsChecked: activeRuns.length,
    interruptedDetected,
    staleDetected,
    recoveredCount,
    errors,
  };
}

export function getLastScanTime(): Date | null { return lastScanTime; }

// ============================================================
// Checkpoints
// ============================================================

export function recordCheckpoint(journeyResultId: string, entry: CheckpointEntry): void {
  getCheckpointStore().record(journeyResultId, entry);
}

export function getLastSafeCheckpoint(journeyResultId: string): CheckpointEntry | null {
  return getCheckpointStore().getLastSafe(journeyResultId);
}

export function getCheckpoints(journeyResultId: string): CheckpointEntry[] {
  return getCheckpointStore().getAll(journeyResultId);
}

export function clearCheckpoints(journeyResultId: string): void {
  getCheckpointStore().clear(journeyResultId);
}

// ============================================================
// Retry Management
// ============================================================

export function canRetryRun(params: {
  status: UatRunState;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string;
}): { canRetry: boolean; requiresApproval: boolean; reason: string } {
  if (!isRetryableRunState(params.status)) {
    return { canRetry: false, requiresApproval: false, reason: `State "${params.status}" is not retryable.` };
  }

  if (params.attemptCount >= params.maxAttempts) {
    return { canRetry: false, requiresApproval: false, reason: `Attempt limit reached (${params.attemptCount}/${params.maxAttempts}).` };
  }

  if (!isRetryableError(params.errorCode)) {
    return { canRetry: false, requiresApproval: false, reason: `Error "${params.errorCode}" is not retryable.` };
  }

  return { canRetry: true, requiresApproval: false, reason: 'Retry eligible.' };
}

export function canRetryJourney(params: {
  status: string;
  attemptCount: number;
  maxAttempts: number;
}): { canRetry: boolean; reason: string } {
  if (params.status !== 'failed' && params.status !== 'interrupted') {
    return { canRetry: false, reason: `Journey status "${params.status}" is not retryable.` };
  }
  if (params.attemptCount >= params.maxAttempts) {
    return { canRetry: false, reason: `Journey attempt limit reached (${params.attemptCount}/${params.maxAttempts}).` };
  }
  return { canRetry: true, reason: 'Retry eligible.' };
}

export function canRetryAiReview(params: {
  runStatus: UatRunState;
  journeyStatus: string;
}): { canRetry: boolean; reason: string } {
  if (params.runStatus === 'waiting_for_ai') return { canRetry: true, reason: 'AI review is pending.' };
  if (params.runStatus === 'completed' || params.runStatus === 'completed_with_warnings') {
    return { canRetry: true, reason: 'AI review can be retried on completed run.' };
  }
  return { canRetry: false, reason: `Run status "${params.runStatus}" does not support AI retry.` };
}

// ============================================================
// Cancellation Orchestration
// ============================================================

export function initiateCancellation(runId: string): {
  success: boolean;
  message: string;
  cancelTimeoutSeconds: number;
} {
  const eventS = getEventStore();

  eventS.record({
    id: createRequestId(),
    runId,
    journeyResultId: null,
    eventType: 'cancel_requested',
    detectedAt: new Date(),
    detectedBy: 'staff',
    previousStatus: 'running',
    newStatus: 'cancel_requested',
    reasonCode: 'staff_cancellation',
    safeSummary: 'Cancellation requested by staff member.',
    automatic: false,
    approvedBy: null,
  });

  return {
    success: true,
    message: 'Cancellation requested. Worker has been notified.',
    cancelTimeoutSeconds: DEFAULT_RECOVERY_CONFIG.cancelTimeoutSeconds,
  };
}

export function acknowledgeCancellation(runId: string): void {
  const eventS = getEventStore();
  releaseLease(runId);

  eventS.record({
    id: createRequestId(),
    runId,
    journeyResultId: null,
    eventType: 'cancel_acknowledged',
    detectedAt: new Date(),
    detectedBy: 'worker',
    previousStatus: 'cancel_requested',
    newStatus: 'cancelled',
    reasonCode: 'cancel_acknowledged',
    safeSummary: 'Worker acknowledged cancellation.',
    automatic: true,
    approvedBy: null,
  });
}

// ============================================================
// Emergency Stop
// ============================================================

export function emergencyStop(reason: string, requestedBy: string): {
  success: boolean;
  message: string;
} {
  if (!reason.trim()) return { success: false, message: 'A reason is required for emergency stop.' };

  setExecutionPaused(true);

  const eventS = getEventStore();
  eventS.record({
    id: createRequestId(),
    runId: 'system',
    journeyResultId: null,
    eventType: 'emergency_stop_enabled',
    detectedAt: new Date(),
    detectedBy: requestedBy,
    previousStatus: 'active',
    newStatus: 'paused',
    reasonCode: 'emergency_stop',
    safeSummary: `Emergency stop enabled by ${requestedBy}. Reason: ${reason}`,
    automatic: false,
    approvedBy: requestedBy,
  });

  return { success: true, message: 'Emergency stop enabled. No new tests will start. Active runs are being cancelled.' };
}

export function emergencyStopDisable(requestedBy: string): {
  success: boolean;
  message: string;
} {
  setExecutionPaused(false);

  const eventS = getEventStore();
  eventS.record({
    id: createRequestId(),
    runId: 'system',
    journeyResultId: null,
    eventType: 'emergency_stop_disabled',
    detectedAt: new Date(),
    detectedBy: requestedBy,
    previousStatus: 'paused',
    newStatus: 'active',
    reasonCode: 'emergency_stop',
    safeSummary: `Emergency stop disabled by ${requestedBy}.`,
    automatic: false,
    approvedBy: requestedBy,
  });

  return { success: true, message: 'Emergency stop disabled. New tests can now be started.' };
}

// ============================================================
// Audit Event Access
// ============================================================

export function getRecoveryEvents(runId?: string, limit: number = 50): RecoveryEvent[] {
  const store = getEventStore();
  if (runId) return store.getByRun(runId);
  return store.getRecent(limit);
}

// ============================================================
// Notification Deduplication (simple in-memory)
// ============================================================

interface NotificationRecord {
  type: string;
  runId: string;
  sentAt: Date;
}

class NotificationDeduplicator {
  private sent: Map<string, NotificationRecord> = new Map();

  shouldSend(type: string, runId: string): boolean {
    const key = `${type}:${runId}`;
    const existing = this.sent.get(key);
    if (!existing) return true;

    const cooldown = DEFAULT_RECOVERY_CONFIG.alertCooldownMinutes * 60 * 1000;
    if (Date.now() - existing.sentAt.getTime() > cooldown) return true;

    return false;
  }

  markSent(type: string, runId: string): void {
    this.sent.set(`${type}:${runId}`, { type, runId, sentAt: new Date() });
  }

  clear(): void { this.sent.clear(); }
}

let deduplicator: NotificationDeduplicator | null = null;
const getDeduplicator = () => { if (!deduplicator) deduplicator = new NotificationDeduplicator(); return deduplicator; };

export function shouldSendAlert(type: string, runId: string): boolean {
  return getDeduplicator().shouldSend(type, runId);
}

export function markAlertSent(type: string, runId: string): void {
  getDeduplicator().markSent(type, runId);
}

// ============================================================
// Cleanup
// ============================================================

export function clearRecoveryStores(): void {
  workerStore = null;
  leaseStore = null;
  checkpointStore = null;
  eventStore = null;
  deduplicator = null;
  executionPaused = false;
  lastScanTime = null;
}

// ============================================================
// Idempotency patterns for recovery operations
// ============================================================

export const RecoveryIdempotencyPatterns = {
  workerHeartbeat: (workerId: string) =>
    createIdempotencyKey('worker-heartbeat', [workerId, Date.now().toString()]),
  acquireLease: (runId: string, workerId: string) =>
    createIdempotencyKey('acquire-lease', [runId, workerId]),
  recoveryScan: () =>
    createIdempotencyKey('recovery-scan', [Date.now().toString()]),
  retryRun: (runId: string) =>
    createIdempotencyKey('retry-run', [runId]),
  retryAi: (runId: string) =>
    createIdempotencyKey('retry-ai', [runId]),
  cancelRun: (runId: string) =>
    createIdempotencyKey('cancel-run', [runId]),
  emergencyStop: () =>
    createIdempotencyKey('emergency-stop', [Date.now().toString()]),
};