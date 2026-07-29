// ============================================================
// DFP UAT Agent — Supabase Database Service Layer
// ============================================================
// Typed repositories for all UAT tables.
// Uses explicit column selections (never select('*') on sensitive tables).
// Normalises errors into safe codes.
// Never places raw Supabase queries in React components.
// ============================================================

import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/services/logger';

// ============================================================
// Error Codes
// ============================================================

export type SupabaseErrorCode =
  | 'SUPABASE_OFFLINE'
  | 'SUPABASE_AUTH_REQUIRED'
  | 'SUPABASE_PERMISSION_DENIED'
  | 'SUPABASE_SCHEMA_NOT_READY'
  | 'SUPABASE_BUCKET_MISSING'
  | 'SUPABASE_TIMEOUT'
  | 'SUPABASE_REALTIME_UNAVAILABLE';

export class SupabaseServiceError extends Error {
  code: SupabaseErrorCode;

  constructor(code: SupabaseErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SupabaseServiceError';
  }
}

// ============================================================
// Service context — only initialised when Supabase is configured
// ============================================================

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new SupabaseServiceError(
      'SUPABASE_OFFLINE',
      'Supabase is not configured. Set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return getSupabaseBrowserClient();
}

function handleError(err: unknown, operation: string): never {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.safeError('supabase', operation, message);

  if (message.includes('JWT expired') || message.includes('auth')) {
    throw new SupabaseServiceError('SUPABASE_AUTH_REQUIRED', 'Authentication required. Please log in again.');
  }
  if (message.includes('permission denied') || message.includes('row-level security')) {
    throw new SupabaseServiceError('SUPABASE_PERMISSION_DENIED', 'You do not have permission to perform this action.');
  }
  if (message.includes('relation') && message.includes('does not exist')) {
    throw new SupabaseServiceError('SUPABASE_SCHEMA_NOT_READY', 'Database schema has not been applied. Run migrations first.');
  }
  if (message.includes('timeout') || message.includes('abort')) {
    throw new SupabaseServiceError('SUPABASE_TIMEOUT', 'Database request timed out. Please try again.');
  }
  throw new SupabaseServiceError('SUPABASE_OFFLINE', message);
}

// ============================================================
// Projects
// ============================================================

export interface UatProjectRecord {
  id: string;
  name: string;
  description: string | null;
  approved_base_urls: string[];
  environment: 'demo' | 'uat' | 'staging' | 'production';
  enabled: boolean;
  default_safety_policy: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function fetchProjects(): Promise<UatProjectRecord[]> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_projects')
    .select('id, name, description, approved_base_urls, environment, enabled, default_safety_policy, created_at, updated_at')
    .order('name');
  if (error) handleError(error, 'fetchProjects');
  return data || [];
}

export async function fetchProject(id: string): Promise<UatProjectRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_projects')
    .select('id, name, description, approved_base_urls, environment, enabled, default_safety_policy, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) handleError(error, 'fetchProject');
  return data;
}

export async function createProject(record: {
  name: string;
  description?: string;
  approved_base_urls: string[];
  environment?: string;
}): Promise<UatProjectRecord> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_projects')
    .insert(record)
    .select('id, name, description, approved_base_urls, environment, enabled, default_safety_policy, created_at, updated_at')
    .single();
  if (error) handleError(error, 'createProject');
  return data;
}

export async function updateProject(id: string, updates: Partial<UatProjectRecord>): Promise<UatProjectRecord> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_projects')
    .update(updates)
    .eq('id', id)
    .select('id, name, description, approved_base_urls, environment, enabled, default_safety_policy, created_at, updated_at')
    .single();
  if (error) handleError(error, 'updateProject');
  return data;
}

// ============================================================
// Test Plans
// ============================================================

export interface UatTestPlanRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  test_mode: 'smoke' | 'journey' | 'full_uat' | 'release_comparison';
  stop_on_critical: boolean;
  retry_count: number;
  retry_delay_ms: number;
  enabled: boolean;
  notification_rules: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function fetchTestPlans(projectId?: string): Promise<UatTestPlanRecord[]> {
  const client = getClient();
  let query = client
    .from('uat_test_plans')
    .select('id, project_id, name, description, test_mode, stop_on_critical, retry_count, retry_delay_ms, enabled, notification_rules, created_at, updated_at')
    .order('name');
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) handleError(error, 'fetchTestPlans');
  return data || [];
}

export async function fetchTestPlan(id: string): Promise<UatTestPlanRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_test_plans')
    .select('id, project_id, name, description, test_mode, stop_on_critical, retry_count, retry_delay_ms, enabled, notification_rules, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) handleError(error, 'fetchTestPlan');
  return data;
}

// ============================================================
// Test Runs
// ============================================================

export interface UatTestRunRecord {
  id: string;
  project_id: string;
  plan_id: string | null;
  triggered_by: string | null;
  environment: string;
  build_reference: string | null;
  status: string;
  test_mode: string | null;
  browsers: string[];
  viewports: string[];
  safety_snapshot: Record<string, unknown> | null;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number;
  current_journey_id: string | null;
  current_step_id: string | null;
  progress: number;
  total_steps: number;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  blocked_count: number;
  pass_rate: number;
  bugs_found: number;
  readiness_score: number | null;
  n8n_execution_ref: string | null;
  browser_worker_ref: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchTestRuns(filters?: {
  status?: string;
  projectId?: string;
  environment?: string;
  limit?: number;
}): Promise<UatTestRunRecord[]> {
  const client = getClient();
  let query = client
    .from('uat_test_runs')
    .select('id, project_id, plan_id, triggered_by, environment, build_reference, status, test_mode, browsers, viewports, safety_snapshot, start_time, end_time, duration_ms, current_journey_id, current_step_id, progress, total_steps, passed_count, failed_count, warning_count, blocked_count, pass_rate, bugs_found, readiness_score, n8n_execution_ref, browser_worker_ref, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.projectId) query = query.eq('project_id', filters.projectId);
  if (filters?.environment) query = query.eq('environment', filters.environment);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) handleError(error, 'fetchTestRuns');
  return data || [];
}

export async function fetchTestRun(id: string): Promise<UatTestRunRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_test_runs')
    .select('id, project_id, plan_id, triggered_by, environment, build_reference, status, test_mode, browsers, viewports, safety_snapshot, start_time, end_time, duration_ms, current_journey_id, current_step_id, progress, total_steps, passed_count, failed_count, warning_count, blocked_count, pass_rate, bugs_found, readiness_score, n8n_execution_ref, browser_worker_ref, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) handleError(error, 'fetchTestRun');
  return data;
}

// ============================================================
// Journey Results
// ============================================================

export interface UatJourneyResultRecord {
  id: string;
  run_id: string;
  journey_id: string | null;
  journey_name: string;
  browser: string;
  viewport: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number;
  screenshot_count: number;
  video_available: boolean;
  trace_available: boolean;
  step_results: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function fetchJourneyResults(runId: string): Promise<UatJourneyResultRecord[]> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_journey_results')
    .select('id, run_id, journey_id, journey_name, browser, viewport, status, start_time, end_time, duration_ms, screenshot_count, video_available, trace_available, step_results, created_at, updated_at')
    .eq('run_id', runId)
    .order('start_time');
  if (error) handleError(error, 'fetchJourneyResults');
  return data || [];
}

// ============================================================
// Agent Findings
// ============================================================

export interface UatAgentFindingRecord {
  id: string;
  run_id: string;
  journey_result_id: string | null;
  agent_type: string;
  category: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | null;
  confidence: number | null;
  title: string;
  summary: string | null;
  evidence_refs: string[] | null;
  suggested_action: string | null;
  fingerprint: string;
  created_at: string;
}

export async function fetchFindings(runId: string): Promise<UatAgentFindingRecord[]> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_agent_findings')
    .select('id, run_id, journey_result_id, agent_type, category, severity, confidence, title, summary, evidence_refs, suggested_action, fingerprint, created_at')
    .eq('run_id', runId)
    .order('created_at');
  if (error) handleError(error, 'fetchFindings');
  return data || [];
}

// ============================================================
// Bug Reports
// ============================================================

export interface UatBugReportRecord {
  id: string;
  fingerprint: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | null;
  category: string | null;
  status: string;
  expected_result: string | null;
  actual_result: string | null;
  reproduction_steps: string[] | null;
  first_detected: string;
  last_detected: string;
  occurrence_count: number;
  assigned_to: string | null;
  resolution_summary: string | null;
  false_positive: boolean;
  retest_requested: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchBugs(filters?: {
  severity?: string;
  status?: string;
  category?: string;
  assignedTo?: string;
}): Promise<UatBugReportRecord[]> {
  const client = getClient();
  let query = client
    .from('uat_bug_reports')
    .select('id, fingerprint, title, severity, category, status, expected_result, actual_result, reproduction_steps, first_detected, last_detected, occurrence_count, assigned_to, resolution_summary, false_positive, retest_requested, created_at, updated_at')
    .order('first_detected', { ascending: false });

  if (filters?.severity) query = query.eq('severity', filters.severity);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);

  const { data, error } = await query;
  if (error) handleError(error, 'fetchBugs');
  return data || [];
}

export async function updateBug(id: string, updates: {
  status?: string;
  assigned_to?: string | null;
  resolution_summary?: string | null;
  staff_notes?: string;
}): Promise<UatBugReportRecord> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_bug_reports')
    .update(updates)
    .eq('id', id)
    .select('id, fingerprint, title, severity, category, status, expected_result, actual_result, reproduction_steps, first_detected, last_detected, occurrence_count, assigned_to, resolution_summary, false_positive, retest_requested, created_at, updated_at')
    .single();
  if (error) handleError(error, 'updateBug');
  return data;
}

// ============================================================
// Bug Evidence
// ============================================================

export interface UatBugEvidenceRecord {
  id: string;
  bug_id: string;
  occurrence_id: string | null;
  evidence_type: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  sensitive: boolean;
  created_at: string;
}

export async function fetchBugEvidence(bugId: string): Promise<UatBugEvidenceRecord[]> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_bug_evidence')
    .select('id, bug_id, occurrence_id, evidence_type, storage_path, file_size_bytes, mime_type, sensitive, created_at')
    .eq('bug_id', bugId)
    .order('created_at');
  if (error) handleError(error, 'fetchBugEvidence');
  return data || [];
}

export async function getEvidenceSignedUrl(evidenceId: string): Promise<string> {
  const client = getClient();
  // First, get the storage path
  const { data: evidence, error } = await client
    .from('uat_bug_evidence')
    .select('storage_path')
    .eq('id', evidenceId)
    .maybeSingle();

  if (error) handleError(error, 'getEvidenceSignedUrl');
  if (!evidence) throw new SupabaseServiceError('SUPABASE_OFFLINE', 'Evidence record not found.');

  // Generate signed URL for the storage path
  const { data: signedData, error: signedError } = await client
    .storage
    .from('uat-evidence')
    .createSignedUrl(evidence.storage_path, 300); // 5 minutes

  if (signedError) handleError(signedError, 'getEvidenceSignedUrl:createSignedUrl');
  return signedData?.signedUrl || '';
}

// ============================================================
// Visual Baselines
// ============================================================

export interface UatVisualBaselineRecord {
  id: string;
  project_id: string;
  page_or_journey: string;
  browser: string;
  viewport: string;
  storage_path: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchBaselines(projectId?: string): Promise<UatVisualBaselineRecord[]> {
  const client = getClient();
  let query = client
    .from('uat_visual_baselines')
    .select('id, project_id, page_or_journey, browser, viewport, storage_path, approved_by, approved_at, approval_note, active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) handleError(error, 'fetchBaselines');
  return data || [];
}

export async function approveBaseline(id: string, approvedBy: string, note: string): Promise<UatVisualBaselineRecord> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_visual_baselines')
    .update({
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      approval_note: note,
      active: true,
    })
    .eq('id', id)
    .select('id, project_id, page_or_journey, browser, viewport, storage_path, approved_by, approved_at, approval_note, active, created_at, updated_at')
    .single();
  if (error) handleError(error, 'approveBaseline');
  return data;
}

// ============================================================
// Settings
// ============================================================

export interface UatSettingRecord {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchSettings(): Promise<UatSettingRecord[]> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_settings')
    .select('id, key, value, description, updated_by, created_at, updated_at')
    .order('key');
  if (error) handleError(error, 'fetchSettings');
  return data || [];
}

export async function upsertSetting(key: string, value: Record<string, unknown>, description?: string): Promise<UatSettingRecord> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_settings')
    .upsert({ key, value, description }, { onConflict: 'key' })
    .select('id, key, value, description, updated_by, created_at, updated_at')
    .single();
  if (error) handleError(error, 'upsertSetting');
  return data;
}

// ============================================================
// Audit Log
// ============================================================

export interface UatAuditLogRecord {
  id: string;
  event_type: string;
  actor: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function recordAuditEvent(event: {
  event_type: string;
  actor?: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, unknown>;
}): Promise<UatAuditLogRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from('uat_audit_log')
    .insert(event)
    .select('id, event_type, actor, target_type, target_id, details, created_at')
    .single();
  if (error) {
    logger.safeError('supabase', 'recordAuditEvent', error.message);
    return null; // Audit failures are non-fatal
  }
  return data;
}

export async function fetchAuditLog(filters?: {
  eventType?: string;
  targetType?: string;
  limit?: number;
}): Promise<UatAuditLogRecord[]> {
  const client = getClient();
  let query = client
    .from('uat_audit_log')
    .select('id, event_type, actor, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false });

  if (filters?.eventType) query = query.eq('event_type', filters.eventType);
  if (filters?.targetType) query = query.eq('target_type', filters.targetType);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) handleError(error, 'fetchAuditLog');
  return data || [];
}

// ============================================================
// Realtime Subscriptions
// ============================================================

export function subscribeToRun(
  runId: string,
  onUpdate: (run: UatTestRunRecord) => void
): { unsubscribe: () => void } {
  const client = getClient();

  const channel = client
    .channel(`run-${runId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'uat_test_runs',
        filter: `id=eq.${runId}`,
      },
      (payload) => {
        onUpdate(payload.new as UatTestRunRecord);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        logger.info('Subscribed to run updates', { service: 'supabase-realtime', runId });
      }
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        logger.warn('Realtime subscription closed', { service: 'supabase-realtime', runId, status });
      }
    });

  return {
    unsubscribe: () => {
      channel.unsubscribe();
      client.removeChannel(channel);
    },
  };
}

export function subscribeToRunFindings(
  runId: string,
  onFinding: (finding: UatAgentFindingRecord) => void
): { unsubscribe: () => void } {
  const client = getClient();

  const channel = client
    .channel(`run-findings-${runId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'uat_agent_findings',
        filter: `run_id=eq.${runId}`,
      },
      (payload) => {
        onFinding(payload.new as UatAgentFindingRecord);
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      channel.unsubscribe();
      client.removeChannel(channel);
    },
  };
}

// ============================================================
// Connection / Health
// ============================================================

export async function checkSupabaseConnection(): Promise<{
  ok: boolean;
  api: boolean;
  db: boolean;
  auth: boolean;
  storage: boolean;
  latencyMs: number;
  message: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      api: false,
      db: false,
      auth: false,
      storage: false,
      latencyMs: 0,
      message: 'Not configured — set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const client = getClient();
  const start = performance.now();
  const results = { api: false, db: false, auth: false, storage: false };

  try {
    // Test API — lightweight health check
    const { data: healthData, error: healthErr } = await client
      .rpc('is_staff_user')
      .maybeSingle();
    results.api = !healthErr;
    results.auth = Boolean(healthData !== null || healthErr === null);

    // Test DB — check if a known table exists
    const { error: dbErr } = await client
      .from('uat_settings')
      .select('key', { count: 'exact', head: true });
    results.db = !dbErr;

    // Test Storage — check bucket existence
    const { error: storageErr } = await client
      .storage
      .getBucket('uat-evidence');
    results.storage = !storageErr;

    const latencyMs = Math.round(performance.now() - start);
    const allOk = results.api && results.db;

    const failingParts: string[] = [];
    if (!results.api) failingParts.push('API');
    if (!results.db) failingParts.push('Database');
    if (!results.storage) failingParts.push('Storage');

    return {
      ok: allOk,
      ...results,
      latencyMs,
      message: allOk
        ? 'All Supabase services healthy'
        : `Degraded: ${failingParts.join(', ')} not available`,
    };
  } catch (err) {
    return {
      ok: false,
      api: false,
      db: false,
      auth: false,
      storage: false,
      latencyMs: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}