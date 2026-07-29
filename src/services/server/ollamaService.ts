// ============================================================
// DFP UAT Agent — Ollama Service (server-proxy)
// ============================================================
// All Ollama communication goes through /api/local/ollama/*
// proxy routes. The browser NEVER calls Ollama directly.
// The actual Ollama URL (192.168.1.92:11434) is configured
// in the Vite dev proxy / nginx reverse proxy — never here.
// ============================================================

import type {
  OllamaTagsResponse,
  OllamaGenerateResponse,
  OllamaChatResponse,
  OllamaChatMessage,
  UatAnalysisResult,
  BugSummaryResult,
  UxReviewResult,
  AccessibilitySummaryResult,
  ReleaseReportResult,
  AiHealthResponse,
  AiServiceStatus,
  AiError,
  AiErrorCode,
} from '@/config/ai.server';
import { AI_ERROR_CODES } from '@/config/ai.server';

// ============================================================
// Configuration (from proxy — no direct Ollama URL)
// ============================================================

const OLLAMA_PROXY_BASE = '/api/local/ollama';
const DEFAULT_HEALTH_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_KEEP_ALIVE = '10m';

// ============================================================
// Lightweight inline logger (no external dependency)
// ============================================================

function logOllama(level: 'info' | 'error', action: string, detail?: Record<string, unknown>): void {
  const prefix = '[Ollama Service]';
  const msg = `${prefix} ${action}`;
  if (level === 'error') {
    console.warn(msg, detail || '');
  } else {
    console.log(msg, detail || '');
  }
}

// ============================================================
// Helpers
// ============================================================

function generateRequestId(): string {
  return `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildError(code: AiErrorCode, message: string): AiError {
  return { code, message, requestId: generateRequestId() };
}

async function fetchWithTimeout(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> },
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Public API — Health & Status
// ============================================================

export async function checkOllamaHealth(): Promise<AiHealthResponse> {
  const requestId = generateRequestId();
  const start = performance.now();

  try {
    const response = await fetchWithTimeout(
      `${OLLAMA_PROXY_BASE}/api/tags`,
      { method: 'GET' },
      DEFAULT_HEALTH_TIMEOUT_MS
    );

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const status: AiServiceStatus = response.status === 503 ? 'degraded' : 'offline';
      logOllama('error', 'Health check failed', { requestId, status: response.status });
      return {
        name: 'Atlas-HaL Ollama',
        status,
        model: 'unknown',
        modelAvailable: false,
        latencyMs,
        message: `Ollama returned HTTP ${response.status}`,
      };
    }

    const data: OllamaTagsResponse = await response.json();
    const modelName = 'qwen2.5:14b';
    const modelAvailable = (data.models || []).some(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`)
    );

    const status: AiServiceStatus = modelAvailable ? 'connected' : 'model_missing';
    const message = modelAvailable
      ? 'Local Ollama is available.'
      : `Model ${modelName} is not installed on Atlas-HaL.`;

    logOllama('info', 'Health check passed', { requestId, latencyMs, modelAvailable });

    return {
      name: 'Atlas-HaL Ollama',
      status,
      model: modelName,
      modelAvailable,
      latencyMs,
      message,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);

    if (err instanceof DOMException && err.name === 'AbortError') {
      logOllama('error', 'Health check timed out', { requestId });
      return {
        name: 'Atlas-HaL Ollama',
        status: 'offline',
        model: 'unknown',
        modelAvailable: false,
        latencyMs: null,
        message: `Health check timed out after ${DEFAULT_HEALTH_TIMEOUT_MS}ms`,
      };
    }

    const message = err instanceof TypeError
      ? 'Connection refused — Ollama may be offline'
      : err instanceof Error ? err.message : 'Unknown error';

    logOllama('error', 'Health check error', { requestId, error: message });

    return {
      name: 'Atlas-HaL Ollama',
      status: 'offline',
      model: 'unknown',
      modelAvailable: false,
      latencyMs,
      message,
    };
  }
}

export async function listOllamaModels(): Promise<{ models: string[]; error: AiError | null }> {
  const requestId = generateRequestId();

  try {
    const response = await fetchWithTimeout(
      `${OLLAMA_PROXY_BASE}/api/tags`,
      { method: 'GET' },
      DEFAULT_HEALTH_TIMEOUT_MS
    );

    if (!response.ok) {
      return {
        models: [],
        error: buildError(AI_ERROR_CODES.OLLAMA_OFFLINE, `Ollama returned HTTP ${response.status}`),
      };
    }

    const data: OllamaTagsResponse = await response.json();
    return {
      models: (data.models || []).map((m) => m.name),
      error: null,
    };
  } catch (err: unknown) {
    return {
      models: [],
      error: buildError(
        AI_ERROR_CODES.OLLAMA_OFFLINE,
        err instanceof Error ? err.message : 'Failed to list models'
      ),
    };
  }
}

export async function isConfiguredModelAvailable(): Promise<boolean> {
  const { models, error } = await listOllamaModels();
  if (error) return false;
  const modelName = 'qwen2.5:14b';
  return models.some((m) => m === modelName || m.startsWith(`${modelName}:`));
}

// ============================================================
// Public API — Test
// ============================================================

export interface TestAiResponseResult {
  ok: boolean;
  response: string;
  latencyMs: number;
  error: AiError | null;
}

export async function testAiResponse(): Promise<TestAiResponseResult> {
  const requestId = generateRequestId();
  const start = performance.now();

  try {
    const body = {
      model: 'qwen2.5:14b',
      prompt: 'Reply with exactly: UAT VM connected to Atlas HaL',
      stream: false,
      options: { temperature: 0, num_predict: 50 },
      keep_alive: DEFAULT_KEEP_ALIVE,
    };

    const response = await fetchWithTimeout(
      `${OLLAMA_PROXY_BASE}/api/generate`,
      { method: 'POST', body: JSON.stringify(body) },
      DEFAULT_HEALTH_TIMEOUT_MS
    );

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        ok: false,
        response: '',
        latencyMs,
        error: buildError(AI_ERROR_CODES.OLLAMA_OFFLINE, `Ollama returned HTTP ${response.status}`),
      };
    }

    const data: OllamaGenerateResponse = await response.json();
    logOllama('info', 'Test response received', { requestId, latencyMs });

    return {
      ok: true,
      response: data.response?.trim() || '(empty response)',
      latencyMs,
      error: null,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        response: '',
        latencyMs,
        error: buildError(AI_ERROR_CODES.OLLAMA_TIMEOUT, 'Test request timed out'),
      };
    }

    return {
      ok: false,
      response: '',
      latencyMs,
      error: buildError(
        AI_ERROR_CODES.OLLAMA_OFFLINE,
        err instanceof Error ? err.message : 'Connection failed'
      ),
    };
  }
}

// ============================================================
// Public API — Structured Analysis
// ============================================================

async function ollamaChat(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<{ data: string | null; error: AiError | null }> {
  const requestId = generateRequestId();

  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  try {
    const body = {
      model: 'qwen2.5:14b',
      messages,
      stream: false,
      format: 'json',
      options: {
        temperature: DEFAULT_TEMPERATURE,
        num_predict: 4096,
      },
      keep_alive: DEFAULT_KEEP_ALIVE,
    };

    const response = await fetchWithTimeout(
      `${OLLAMA_PROXY_BASE}/api/chat`,
      { method: 'POST', body: JSON.stringify(body) },
      timeoutMs
    );

    if (!response.ok) {
      return {
        data: null,
        error: buildError(AI_ERROR_CODES.OLLAMA_OFFLINE, `Ollama chat returned HTTP ${response.status}`),
      };
    }

    const result: OllamaChatResponse = await response.json();

    if (!result.message?.content) {
      return {
        data: null,
        error: buildError(AI_ERROR_CODES.OLLAMA_INVALID_RESPONSE, 'Empty response from Ollama chat'),
      };
    }

    logOllama('info', 'Chat response received', { requestId });

    return { data: result.message.content, error: null };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        data: null,
        error: buildError(AI_ERROR_CODES.OLLAMA_TIMEOUT, `Chat request timed out after ${timeoutMs}ms`),
      };
    }

    return {
      data: null,
      error: buildError(
        AI_ERROR_CODES.OLLAMA_OFFLINE,
        err instanceof Error ? err.message : 'Chat request failed'
      ),
    };
  }
}

function parseStructuredResponse<T>(raw: string | null, fallbackLabel: string): { result: T | null; error: AiError | null } {
  if (!raw) {
    return { result: null, error: null };
  }

  try {
    // Ollama sometimes wraps JSON in markdown code blocks
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned) as T;
    return { result: parsed, error: null };
  } catch {
    return {
      result: null,
      error: buildError(
        AI_ERROR_CODES.OLLAMA_INVALID_RESPONSE,
        `Failed to parse ${fallbackLabel} response as JSON`
      ),
    };
  }
}

// --- UAT Analysis ---

export async function generateUatAnalysis(
  evidenceJson: string,
  systemPrompt: string
): Promise<{ result: UatAnalysisResult | null; error: AiError | null }> {
  const { data, error } = await ollamaChat(systemPrompt, evidenceJson);
  if (error) return { result: null, error };
  return parseStructuredResponse<UatAnalysisResult>(data, 'UAT analysis');
}

// --- Bug Summary ---

export async function generateBugSummary(
  bugDataJson: string,
  systemPrompt: string
): Promise<{ result: BugSummaryResult | null; error: AiError | null }> {
  const { data, error } = await ollamaChat(systemPrompt, bugDataJson);
  if (error) return { result: null, error };
  return parseStructuredResponse<BugSummaryResult>(data, 'bug summary');
}

// --- UX Review ---

export async function generateUxReview(
  evidenceJson: string,
  systemPrompt: string
): Promise<{ result: UxReviewResult | null; error: AiError | null }> {
  const { data, error } = await ollamaChat(systemPrompt, evidenceJson);
  if (error) return { result: null, error };
  return parseStructuredResponse<UxReviewResult>(data, 'UX review');
}

// --- Accessibility Summary ---

export async function generateAccessibilitySummary(
  evidenceJson: string,
  systemPrompt: string
): Promise<{ result: AccessibilitySummaryResult | null; error: AiError | null }> {
  const { data, error } = await ollamaChat(systemPrompt, evidenceJson);
  if (error) return { result: null, error };
  return parseStructuredResponse<AccessibilitySummaryResult>(data, 'accessibility summary');
}

// --- Release Report ---

export async function generateReleaseReport(
  runSummaryJson: string,
  systemPrompt: string
): Promise<{ result: ReleaseReportResult | null; error: AiError | null }> {
  const { data, error } = await ollamaChat(systemPrompt, runSummaryJson);
  if (error) return { result: null, error };
  return parseStructuredResponse<ReleaseReportResult>(data, 'release report');
}