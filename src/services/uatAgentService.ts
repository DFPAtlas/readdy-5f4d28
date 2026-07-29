import type {
  UatDashboard,
  UatTestPlan,
  UatTestRun,
  UatBug,
  UatEvidence,
  UatVisualBaseline,
  UatSettings,
  CreateUatRunPayload,
  CreateTestPlanPayload,
  UpdateTestPlanPayload,
  UpdateUatBugPayload,
  UatBugFilters,
  UatEvidenceFilters,
} from '@/types/uat';
import {
  mockDashboard,
  mockTestPlans,
  mockRecentRuns,
  mockBugs,
  mockEvidence,
  mockBaselines,
  mockSettings,
} from '@/mocks/uatAgentMockData';
import { getEnvironmentConfig, isMockMode as envIsMockMode } from '@/config/environment';
import { logger } from '@/services/logger';

// ============================================================
// Configuration
// ============================================================

const envConfig = getEnvironmentConfig();
const API_BASE_URL = envConfig.uatApiBaseUrl;
const REQUEST_TIMEOUT = envConfig.requestTimeoutMs;

let useMock = envIsMockMode();

export function setMockMode(enabled: boolean): void {
  useMock = enabled;
}

export function isMockModeActive(): boolean {
  return useMock;
}

// ============================================================
// Helpers
// ============================================================

function delay(ms: number = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockRequest<T>(data: T, delayMs: number = 300): Promise<T> {
  await delay(delayMs);
  return JSON.parse(JSON.stringify(data)) as T;
}

// ============================================================
// URL safety validation
// ============================================================

const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'data:', 'javascript:'];
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\.\d+\.\d+\.\d+/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i,
  /^https?:\/\/192\.168\.\d+\.\d+/i,
  /^https?:\/\/0\.0\.0\.0/i,
  /^https?:\/\/\[::1\]/i,
];

function validateTargetUrl(url: string): void {
  try {
    const parsed = new URL(url);

    // Block unsupported protocols
    if (BLOCKED_PROTOCOLS.some((p) => url.toLowerCase().startsWith(p))) {
      throw new Error(`Unsupported protocol in target URL: ${parsed.protocol}`);
    }

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid protocol "${parsed.protocol}". Only http and https are allowed.`);
    }

    // Block URLs with embedded credentials
    if (parsed.username || parsed.password) {
      throw new Error('Target URL must not contain embedded usernames or passwords.');
    }

    // Warn about private IPs
    const isPrivateIp = PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(url));
    if (isPrivateIp) {
      logger.warn('Target URL points to a private/local network address', {
        service: 'uatAgentService',
        route: 'validateTargetUrl',
      });
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('protocol')) {
      throw err;
    }
    throw new Error(`Invalid target URL: "${url}"`);
  }
}

// ============================================================
// Standard error structure
// ============================================================

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function buildApiErrorMessage(response: ApiErrorResponse, status: number): string {
  return `[${response.error.code}] ${response.error.message} (HTTP ${status})`;
}

// ============================================================
// Live request
// ============================================================

async function liveRequest<T>(
  path: string,
  fetchOptions?: Parameters<typeof fetch>[1]
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const startTime = performance.now();
  try {
    const headers = new Headers(fetchOptions?.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    const responseText = await response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { raw: responseText };
    }

    if (!response.ok) {
      const apiError = parsed as unknown as ApiErrorResponse;
      const message = apiError?.error?.message
        ? buildApiErrorMessage(apiError, response.status)
        : `API error: ${response.status} ${response.statusText}`;
      logger.serviceCall('uat-api', path, duration, false);
      throw new Error(message);
    }

    logger.serviceCall('uat-api', path, duration, true);
    return parsed as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.safeError('uat-api', 'REQUEST_TIMEOUT', `Request timed out after ${REQUEST_TIMEOUT}ms: ${path}`);
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT}ms.`);
    }
    logger.serviceCall('uat-api', path, duration, false);
    throw err;
  }
}

// ============================================================
// Service Methods
// ============================================================

export async function getUatDashboard(): Promise<UatDashboard> {
  if (useMock) return mockRequest(mockDashboard);
  return liveRequest<UatDashboard>('/dashboard');
}

export async function listTestPlans(): Promise<UatTestPlan[]> {
  if (useMock) return mockRequest(mockTestPlans);
  return liveRequest<UatTestPlan[]>('/test-plans');
}

export async function getTestPlan(id: string): Promise<UatTestPlan | null> {
  if (useMock) {
    const plan = mockTestPlans.find((p) => p.id === id) || null;
    return mockRequest(plan);
  }
  return liveRequest<UatTestPlan>(`/test-plans/${id}`);
}

export async function createTestPlan(payload: CreateTestPlanPayload): Promise<UatTestPlan> {
  if (useMock) {
    const now = new Date().toISOString();
    const planId = `plan-${Date.now()}`;

    const newPlan: UatTestPlan = {
      id: planId,
      name: payload.name,
      projectId: payload.projectId,
      projectName: payload.projectId,
      baseEnvironment: payload.baseEnvironment,
      journeys: payload.journeys.map((journey, index) => ({
        ...journey,
        id: `${planId}-journey-${index + 1}`,
        planId,
        createdAt: now,
        updatedAt: now,
      })),
      devices: payload.devices,
      browsers: payload.browsers,
      retryCount: payload.retryCount,
      stopOnCritical: payload.stopOnCritical,
      notificationRules: payload.notificationRules,
      enabled: payload.enabled,
      lastRunId: null,
      lastRunDate: null,
      lastPassRate: null,
      createdAt: now,
      updatedAt: now,
    };
    return mockRequest(newPlan);
  }
  return liveRequest<UatTestPlan>('/test-plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTestPlan(id: string, payload: UpdateTestPlanPayload): Promise<UatTestPlan> {
  if (useMock) {
    const plan = mockTestPlans.find((p) => p.id === id);
    if (!plan) throw new Error('Test plan not found');

    const now = new Date().toISOString();
    const { id: _payloadId, journeys, ...updates } = payload;

    const updated: UatTestPlan = {
      ...plan,
      ...updates,
      id: plan.id,
      journeys: journeys
        ? journeys.map((journey, index) => {
            const existingJourney = plan.journeys[index];
            return {
              ...journey,
              id: existingJourney?.id ?? `${plan.id}-journey-${index + 1}`,
              planId: plan.id,
              createdAt: existingJourney?.createdAt ?? now,
              updatedAt: now,
            };
          })
        : plan.journeys,
      updatedAt: now,
    };

    return mockRequest(updated);
  }
  return liveRequest<UatTestPlan>(`/test-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createUatRun(payload: CreateUatRunPayload): Promise<UatTestRun> {
  // Validate target URL
  validateTargetUrl(payload.baseUrl);

  if (useMock) {
    const newRun: UatTestRun = {
      id: `run-${Date.now()}`,
      projectId: payload.projectId,
      projectName: payload.projectId,
      baseUrl: payload.baseUrl,
      environment: payload.environment,
      testPlanId: payload.testPlanId,
      testPlanName: payload.testPlanId,
      testMode: payload.testMode,
      browsers: payload.browsers,
      viewports: payload.viewports,
      releaseReference: payload.releaseReference,
      triggeredBy: 'Current User',
      status: 'queued',
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      currentJourney: null,
      currentStep: null,
      progress: 0,
      passedCount: 0,
      failedCount: 0,
      warningCount: 0,
      blockedCount: 0,
      totalSteps: 0,
      passRate: 0,
      bugsFound: 0,
      journeyResults: [],
      agentStatuses: [],
      safetyPolicy: payload.safetyPolicy,
      timeline: [],
      heartbeatAt: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      lastProgressAt: null,
      lastWorkerContactAt: null,
      lastCallbackAt: null,
      attemptCount: 0,
      maximumAttempts: 2,
      recoveryCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      recoverable: true,
      recoveryStatus: null,
      recoveryRequestedAt: null,
      recoveryRequestedBy: null,
      interruptedAt: null,
      interruptionReason: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      workerInstanceId: null,
      n8nExecutionId: null,
    };
    return mockRequest(newRun, 800);
  }
  return liveRequest<UatTestRun>('/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getUatRun(runId: string): Promise<UatTestRun | null> {
  if (useMock) {
    const run = mockRecentRuns.find((r) => r.id === runId) || null;
    return mockRequest(run);
  }
  return liveRequest<UatTestRun>(`/runs/${runId}`);
}

export async function cancelUatRun(runId: string): Promise<UatTestRun> {
  if (useMock) {
    const run = mockRecentRuns.find((r) => r.id === runId);
    if (!run) throw new Error('Run not found');
    const cancelled = {
      ...run,
      status: 'cancelled' as const,
      endTime: new Date().toISOString(),
    };
    return mockRequest(cancelled);
  }
  return liveRequest<UatTestRun>(`/runs/${runId}/cancel`, { method: 'POST' });
}

export async function retestRun(runId: string, options?: { journeyIds?: string[] }): Promise<UatTestRun> {
  if (useMock) {
    const run = mockRecentRuns.find((r) => r.id === runId);
    if (!run) throw new Error('Run not found');
    const retest = {
      ...run,
      id: `run-${Date.now()}`,
      status: 'queued' as const,
      startTime: new Date().toISOString(),
      endTime: null,
      progress: 0,
      passedCount: 0,
      failedCount: 0,
      warningCount: 0,
      blockedCount: 0,
      bugsFound: 0,
      journeyResults: [],
      agentStatuses: [],
      timeline: [],
    };
    return mockRequest(retest, 800);
  }
  return liveRequest<UatTestRun>(`/runs/${runId}/retest`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function listUatBugs(filters?: UatBugFilters): Promise<UatBug[]> {
  if (useMock) {
    let bugs = [...mockBugs];
    if (filters) {
      if (filters.severity) bugs = bugs.filter((b) => b.severity === filters.severity);
      if (filters.status) bugs = bugs.filter((b) => b.status === filters.status);
      if (filters.projectId) bugs = bugs.filter((b) => b.projectId === filters.projectId);
      if (filters.environment) bugs = bugs.filter((b) => b.environment === filters.environment);
      if (filters.category) bugs = bugs.filter((b) => b.category === filters.category);
      if (filters.assignedTo) bugs = bugs.filter((b) => b.assignedTo === filters.assignedTo);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        bugs = bugs.filter((b) => b.title.toLowerCase().includes(s) || b.id.includes(s));
      }
    }
    return mockRequest(bugs);
  }
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
  }
  return liveRequest<UatBug[]>(`/bugs?${params.toString()}`);
}

export async function updateUatBug(id: string, payload: UpdateUatBugPayload): Promise<UatBug> {
  if (useMock) {
    const bug = mockBugs.find((b) => b.id === id);
    if (!bug) throw new Error('Bug not found');
    const updated = { ...bug, ...payload };
    return mockRequest(updated);
  }
  return liveRequest<UatBug>(`/bugs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function listEvidence(filters?: UatEvidenceFilters): Promise<UatEvidence[]> {
  if (useMock) {
    let evidence = [...mockEvidence];
    if (filters) {
      if (filters.runId) evidence = evidence.filter((e) => e.runId === filters.runId);
      if (filters.journeyId) evidence = evidence.filter((e) => e.journeyId === filters.journeyId);
      if (filters.bugId) evidence = evidence.filter((e) => e.bugId === filters.bugId);
      if (filters.type) evidence = evidence.filter((e) => e.type === filters.type);
      if (filters.browser) evidence = evidence.filter((e) => e.browser === filters.browser);
      if (filters.device) evidence = evidence.filter((e) => e.device === filters.device);
    }
    return mockRequest(evidence);
  }
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
  }
  return liveRequest<UatEvidence[]>(`/evidence?${params.toString()}`);
}

export async function listVisualBaselines(): Promise<UatVisualBaseline[]> {
  if (useMock) return mockRequest(mockBaselines);
  return liveRequest<UatVisualBaseline[]>('/baselines');
}

export async function approveVisualBaseline(id: string, note: string): Promise<UatVisualBaseline> {
  if (useMock) {
    const baseline = mockBaselines.find((b) => b.id === id);
    if (!baseline) throw new Error('Baseline not found');
    const approved = {
      ...baseline,
      status: 'approved' as const,
      approvedBy: 'Current User',
      approvedAt: new Date().toISOString(),
      approvalNote: note,
      approvalHistory: [
        ...baseline.approvalHistory,
        {
          id: `approval-${Date.now()}`,
          approvedBy: 'Current User',
          approvedAt: new Date().toISOString(),
          note,
          action: 'approved' as const,
        },
      ],
    };
    return mockRequest(approved);
  }
  return liveRequest<UatVisualBaseline>(`/baselines/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function getUatSettings(): Promise<UatSettings> {
  if (useMock) return mockRequest(mockSettings);
  return liveRequest<UatSettings>('/settings');
}

export async function updateUatSettings(payload: Partial<UatSettings>): Promise<UatSettings> {
  if (useMock) {
    const updated = { ...mockSettings, ...payload };
    return mockRequest(updated);
  }
  return liveRequest<UatSettings>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}