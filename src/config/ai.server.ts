// ============================================================
// DFP UAT Agent — AI Configuration (server-side proxy)
// ============================================================
// This module defines AI provider types and safe public config.
// The actual Ollama URL and model are SERVER-ONLY and never
// exposed to the browser. The browser accesses Ollama through
// the /api/local/ollama/* proxy (Vite dev or nginx in prod).
// ============================================================

// ============================================================
// Types
// ============================================================

export type AiProvider = 'ollama' | 'openai-compatible' | 'disabled';

export interface OllamaConfig {
  /** Safe host label for display (e.g. "Atlas-HaL") */
  safeHostLabel: string;
  /** Model name — populated from health check response, never from env */
  model: string;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
  /** Health check timeout in milliseconds */
  healthTimeoutMs: number;
  /** Generation temperature */
  temperature: number;
  /** Ollama keep-alive duration string (e.g. "10m") */
  keepAlive: string;
}

export interface AiConfig {
  provider: AiProvider;
  ollamaConfig: OllamaConfig | null;
  allowDisabledMode: boolean;
  failRunWhenAiOffline: boolean;
}

// ============================================================
// Error codes
// ============================================================

export const AI_ERROR_CODES = {
  OLLAMA_NOT_CONFIGURED: 'OLLAMA_NOT_CONFIGURED',
  OLLAMA_OFFLINE: 'OLLAMA_OFFLINE',
  OLLAMA_TIMEOUT: 'OLLAMA_TIMEOUT',
  OLLAMA_MODEL_NOT_FOUND: 'OLLAMA_MODEL_NOT_FOUND',
  OLLAMA_INVALID_RESPONSE: 'OLLAMA_INVALID_RESPONSE',
  OLLAMA_ANALYSIS_FAILED: 'OLLAMA_ANALYSIS_FAILED',
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

export interface AiError {
  code: AiErrorCode;
  message: string;
  requestId: string;
}

// ============================================================
// AI status types for health responses
// ============================================================

export type AiServiceStatus =
  | 'connected'
  | 'degraded'
  | 'offline'
  | 'model_missing'
  | 'not_configured';

export interface AiHealthResponse {
  name: string;
  status: AiServiceStatus;
  model: string;
  modelAvailable: boolean;
  latencyMs: number | null;
  message: string;
}

// ============================================================
// Ollama API types
// ============================================================

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    top_k?: number;
  };
  keep_alive?: string;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    top_k?: number;
  };
  keep_alive?: string;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// ============================================================
// UAT analysis result types (structured output from AI)
// ============================================================

export type FindingStatus = 'passed' | 'failed' | 'warning' | 'blocked';

export type FindingCategory = 'functional' | 'ux' | 'accessibility' | 'security' | 'performance' | 'content';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AiFinding {
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  expectedResult: string;
  actualResult: string;
  reproductionSteps: string[];
  suggestedAction: string;
  evidenceReferences: string[];
}

export interface UatAnalysisResult {
  summary: string;
  status: FindingStatus;
  findings: AiFinding[];
}

export interface BugSummaryResult {
  title: string;
  severity: FindingSeverity;
  category: FindingCategory;
  summary: string;
  expectedResult: string;
  actualResult: string;
  reproductionSteps: string[];
  suggestedAction: string;
  falsePositiveRisk: 'low' | 'medium' | 'high';
}

export interface UxReviewResult {
  summary: string;
  overallScore: number;
  findings: AiFinding[];
  positiveObservations: string[];
  layoutIssues: string[];
  interactionIssues: string[];
  consistencyIssues: string[];
}

export interface AccessibilitySummaryResult {
  summary: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  violations: AiFinding[];
  warnings: AiFinding[];
  passes: string[];
  overallCompliance: number;
}

export interface ReleaseReportResult {
  summary: string;
  readinessStatus: 'ready' | 'ready_with_warnings' | 'not_ready' | 'blocked';
  overallScore: number;
  criticalBlockers: string[];
  highPriorityIssues: string[];
  recommendations: string[];
  testCoverageAssessment: string;
}

// ============================================================
// Safe config
// ============================================================

function buildSafeAiConfig(): AiConfig {
  return {
    provider: 'ollama',
    ollamaConfig: null, // Populated by health check response
    allowDisabledMode: true,
    failRunWhenAiOffline: false,
  };
}

let cachedConfig: AiConfig | null = null;

export function getAiConfig(): AiConfig {
  if (!cachedConfig) {
    cachedConfig = buildSafeAiConfig();
  }
  return cachedConfig;
}

export function getAiProvider(): AiProvider {
  return getAiConfig().provider;
}

export function isAiEnabled(): boolean {
  return getAiConfig().provider !== 'disabled';
}

export function isAllowAiDisabledMode(): boolean {
  return getAiConfig().allowDisabledMode;
}

export function isFailRunWhenAiOffline(): boolean {
  return getAiConfig().failRunWhenAiOffline;
}