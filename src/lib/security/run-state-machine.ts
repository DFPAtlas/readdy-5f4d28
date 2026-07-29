// ============================================================
// DFP UAT Agent — Run State Machine (Extended)
// ============================================================
// Enforces valid state transitions for UAT test runs with
// full recovery, retry, cancellation, and expiry support.
// ============================================================

export type UatRunState =
  | 'draft'
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_worker'
  | 'waiting_for_ai'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'interrupted'
  | 'cancel_requested'
  | 'cancelled'
  | 'blocked'
  | 'expired'
  | 'retry_pending';

export type UatJourneyState =
  | 'pending' | 'queued' | 'starting' | 'running' | 'passed'
  | 'failed' | 'warning' | 'blocked' | 'interrupted' | 'cancelled' | 'retry_pending';

export interface TransitionValidationResult {
  allowed: boolean;
  from: UatRunState;
  to: UatRunState;
  reason?: string;
}

interface JourneyValidation { allowed: boolean; from: UatJourneyState; to: UatJourneyState; reason?: string; }

export interface RejectedTransitionLog {
  timestamp: string; from: UatRunState; attemptedTo: UatRunState; reason: string; runId: string;
}

export type StepSafety = 'safe_to_repeat' | 'repeat_with_validation' | 'requires_staff_approval' | 'never_repeat_automatically';

// ============================================================
// Transitions
// ============================================================

const RT: Map<UatRunState, Set<UatRunState>> = new Map([
  ['draft', new Set(['queued'])],
  ['queued', new Set(['starting', 'cancel_requested', 'expired'])],
  ['starting', new Set(['running', 'interrupted', 'failed'])],
  ['running', new Set(['waiting_for_worker', 'waiting_for_ai', 'completed', 'completed_with_warnings', 'failed', 'interrupted', 'cancel_requested'])],
  ['waiting_for_worker', new Set(['running', 'interrupted', 'failed'])],
  ['waiting_for_ai', new Set(['completed', 'completed_with_warnings', 'interrupted'])],
  ['completed', new Set([])],
  ['completed_with_warnings', new Set([])],
  ['failed', new Set(['retry_pending'])],
  ['interrupted', new Set(['queued', 'retry_pending'])],
  ['cancel_requested', new Set(['cancelled'])],
  ['cancelled', new Set([])],
  ['blocked', new Set([])],
  ['expired', new Set([])],
  ['retry_pending', new Set(['queued'])],
]);

const JT: Map<UatJourneyState, Set<UatJourneyState>> = new Map([
  ['pending', new Set(['queued'])],
  ['queued', new Set(['starting'])],
  ['starting', new Set(['running'])],
  ['running', new Set(['passed', 'failed', 'warning', 'blocked', 'interrupted'])],
  ['passed', new Set([])],
  ['failed', new Set(['retry_pending'])],
  ['warning', new Set([])],
  ['blocked', new Set([])],
  ['interrupted', new Set(['queued', 'retry_pending'])],
  ['cancelled', new Set([])],
  ['retry_pending', new Set(['queued'])],
]);

// ============================================================
// Validation
// ============================================================

export function isValidRunState(state: string): state is UatRunState { return RT.has(state as UatRunState); }
export function isValidJourneyState(state: string): state is UatJourneyState { return JT.has(state as UatJourneyState); }

export function getAllowedRunTransitions(from: UatRunState): UatRunState[] { return Array.from(RT.get(from) || new Set()); }
export function getAllowedJourneyTransitions(from: UatJourneyState): UatJourneyState[] { return Array.from(JT.get(from) || new Set()); }

export function validateRunTransition(from: UatRunState, to: UatRunState, runId?: string): TransitionValidationResult {
  if (!isValidRunState(from)) return { allowed: false, from, to, reason: `Unknown source "${from}".` };
  if (!isValidRunState(to)) return { allowed: false, from, to, reason: `Unknown target "${to}".` };
  const allowed = RT.get(from);
  if (!allowed || !allowed.has(to)) {
    const list = Array.from(allowed || []).join(', ') || '(none)';
    return { allowed: false, from, to, reason: `"${from} → ${to}" not allowed. Allowed: ${list}.` };
  }
  return { allowed: true, from, to };
}

export function validateJourneyTransition(from: UatJourneyState, to: UatJourneyState): JourneyValidation {
  if (!isValidJourneyState(from)) return { allowed: false, from, to, reason: `Unknown source "${from}".` };
  if (!isValidJourneyState(to)) return { allowed: false, from, to, reason: `Unknown target "${to}".` };
  const allowed = JT.get(from);
  if (!allowed || !allowed.has(to)) {
    const list = Array.from(allowed || []).join(', ') || '(none)';
    return { allowed: false, from, to, reason: `"${from} → ${to}" not allowed. Allowed: ${list}.` };
  }
  return { allowed: true, from, to };
}

export function canTransition(from: UatRunState, to: UatRunState): boolean { return validateRunTransition(from, to).allowed; }

export function buildRejectedTransitionLog(from: UatRunState, to: UatRunState, reason: string, runId: string): RejectedTransitionLog {
  return { timestamp: new Date().toISOString(), from, attemptedTo: to, reason, runId };
}

export function attemptTransition(current: UatRunState, target: UatRunState, runId: string, onRejected?: (log: RejectedTransitionLog) => void): UatRunState | null {
  const r = validateRunTransition(current, target);
  if (!r.allowed) {
    const log = buildRejectedTransitionLog(current, target, r.reason || 'Unknown', runId);
    if (onRejected) onRejected(log);
    return null;
  }
  return target;
}

// ============================================================
// Labels & Classification
// ============================================================

export function getRunStateLabel(s: UatRunState): string {
  const m: Record<UatRunState, string> = { draft:'Draft', queued:'Queued', starting:'Starting', running:'Running', waiting_for_worker:'Waiting for Worker', waiting_for_ai:'Waiting for AI', completed:'Completed', completed_with_warnings:'Completed with Warnings', failed:'Failed', interrupted:'Interrupted', cancel_requested:'Cancel Requested', cancelled:'Cancelled', blocked:'Blocked', expired:'Expired', retry_pending:'Retry Pending' };
  return m[s] || s;
}

export function getJourneyStateLabel(s: UatJourneyState): string {
  const m: Record<UatJourneyState, string> = { pending:'Pending', queued:'Queued', starting:'Starting', running:'Running', passed:'Passed', failed:'Failed', warning:'Warning', blocked:'Blocked', interrupted:'Interrupted', cancelled:'Cancelled', retry_pending:'Retry Pending' };
  return m[s] || s;
}

export function isTerminalRunState(s: UatRunState): boolean { return ['completed','completed_with_warnings','cancelled','blocked','expired'].includes(s); }
export function isRetryableRunState(s: UatRunState): boolean { return ['failed','interrupted','retry_pending'].includes(s); }
export function isActiveRunState(s: UatRunState): boolean { return ['queued','starting','running','waiting_for_worker','waiting_for_ai','cancel_requested'].includes(s); }

// ============================================================
// Forbidden Transitions (for tests/docs)
// ============================================================

export const FORBIDDEN_TRANSITION_EXAMPLES = [
  { from: 'completed' as UatRunState, to: 'running' as UatRunState },
  { from: 'cancelled' as UatRunState, to: 'completed' as UatRunState },
  { from: 'expired' as UatRunState, to: 'running' as UatRunState },
  { from: 'failed' as UatRunState, to: 'completed' as UatRunState },
  { from: 'blocked' as UatRunState, to: 'running' as UatRunState },
  { from: 'retry_pending' as UatRunState, to: 'completed' as UatRunState },
  { from: 'cancel_requested' as UatRunState, to: 'running' as UatRunState },
];

// ============================================================
// Step Safety
// ============================================================

const STEP_SAFETY: Record<string, StepSafety> = {
  navigate:'safe_to_repeat', click:'safe_to_repeat', wait_for_element:'safe_to_repeat',
  assert_text:'safe_to_repeat', assert_url:'safe_to_repeat', assert_element_visible:'safe_to_repeat',
  assert_api_response:'safe_to_repeat', capture_screenshot:'safe_to_repeat', run_accessibility_scan:'safe_to_repeat',
  fill_field:'repeat_with_validation', select_option:'repeat_with_validation', upload_file:'repeat_with_validation',
};

export function getStepSafety(type: string): StepSafety { return STEP_SAFETY[type] || 'requires_staff_approval'; }
export function isSafeToRepeat(type: string): boolean { return getStepSafety(type) === 'safe_to_repeat'; }
export function requiresStaffApproval(type: string): boolean { const s = getStepSafety(type); return s === 'requires_staff_approval' || s === 'never_repeat_automatically'; }

// ============================================================
// Retry Policy
// ============================================================

export interface RetryPolicy { stepRetryMax: number; journeyRetryMax: number; fullRunRetryMax: number; backoffMs: number[]; }
export const DEFAULT_RETRY_POLICY: RetryPolicy = { stepRetryMax: 1, journeyRetryMax: 1, fullRunRetryMax: 0, backoffMs: [30000, 60000, 120000] };

const RETRYABLE = ['WORKER_OFFLINE','WORKER_CAPACITY_REACHED','RUN_HEARTBEAT_MISSING','RUN_LEASE_EXPIRED','RUN_CALLBACK_TIMEOUT','RUN_QUEUE_TIMEOUT'];
export function isRetryableError(code: string): boolean { return RETRYABLE.includes(code); }