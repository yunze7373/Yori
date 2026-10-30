/**
 * Server-Side Model Dev Proxy
 * Governed by Architecture Rev3 Section 9.1 and AC-106-1, AC-106-2.
 *
 * Server-side only:
 * - Environment variable MODEL_API_KEY (preferred), META_API_KEY accepted alias (MODEL_API_KEY wins).
 * - Log ONLY which variable name was used, NEVER the secret value.
 * - MODEL_BASE_URL default https://api.meta.ai/v1.
 * - MODEL_NAME default muse-spark-1.3.
 * - Reads from .env.local if present, NEVER bundled into client code.
 * - Diagnostics show 'model: disabled (no MODEL_API_KEY)' when absent.
 * - NEVER reads external tool credentials or unauthorized local auth files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  ModelPortRequest,
  ModelPortResponse,
  ModelPortDiagnostics,
} from './types.js';
import { validateFactsInWording } from './fact-checker.js';
import {
  validateTemplateRequest,
  getTemplate,
  type ServerTemplate,
} from './template-registry.js';
import {
  type ReasoningInput,
  type ReasoningOutput,
  type ReasoningValidationFailureReason,
  type DecisionCommandOutput,
  deterministicReasoningFallback,
  validateReasoningOutput,
  validateReasoningInputSchema,
  validateDecisionCommandOutput,
} from './reasoning.js';

export interface ModelCommandResponse {
  readonly result: DecisionCommandOutput | null;
  readonly usedFallback: boolean;
  readonly fallbackReason?:
    | 'disabled'
    | 'timeout'
    | 'error'
    | 'schema_invalid'
    | 'unknown_signal_id'
    | 'unknown_fact_key'
    | 'unconfirmed_fact_used'
    | 'invalid_reason_code'
    | 'out_of_set_intent'
    | 'unlisted_fact_token'
    | 'truncated'
    | 'extraction_fault';
}

export interface ModelReasoningResponse {
  readonly result: ReasoningOutput;
  readonly usedFallback: boolean;
  readonly fallbackReason?:
    | 'disabled'
    | 'timeout'
    | 'error'
    | 'truncated'
    | 'extraction_fault'
    | ReasoningValidationFailureReason;
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelProxyConfig {
  readonly apiKey?: string;
  readonly keySource: 'MODEL_API_KEY' | 'META_API_KEY' | 'none';
  readonly baseUrl: string;
  readonly modelName: string;
  readonly liveEnabled: boolean;
  readonly maxCalls: number;
  readonly timeoutMs: number;
  readonly maxTokensOverride?: number;
  readonly reasoningEffort?: ReasoningEffort;
  readonly ledgerPath: string;
}

let processLiveCallCount = 0;

export function getProcessLiveCallCount(): number {
  return processLiveCallCount;
}

export function resetProcessLiveCallCount(): void {
  processLiveCallCount = 0;
}

/**
 * Lifetime and per-run call budget limits for Meta Model API (S1-CAP50).
 * MODEL_LIFETIME_MAX_CALLS: 50 total lifetime calls enforced atomically in persistent ledger.
 * MODEL_PER_RUN_MAX_CALLS: 10 calls maximum per verification session.
 */
export const MODEL_LIFETIME_MAX_CALLS = 50;
export const MODEL_PER_RUN_MAX_CALLS = 10;

/**
 * Resolves MODEL_LIVE_MAX_CALLS from environment with strict bounds [1, MODEL_PER_RUN_MAX_CALLS].
 * Defaults to MODEL_PER_RUN_MAX_CALLS (10) when unset or empty.
 * Values above MODEL_PER_RUN_MAX_CALLS are clamped to 10.
 */
export function resolveMaxCalls(env: Record<string, string | undefined> = process.env): number {
  const raw = env['MODEL_LIVE_MAX_CALLS'];
  if (raw === undefined || raw.trim() === '') return MODEL_PER_RUN_MAX_CALLS;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) return MODEL_PER_RUN_MAX_CALLS;
  return Math.min(parsed, MODEL_PER_RUN_MAX_CALLS);
}

/**
 * Resolves MODEL_TIMEOUT_MS with strict clamp [500, 20000].
 * Default: 2000 ms. NaN/negative/empty -> 2000.
 */
export function resolveTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env['MODEL_TIMEOUT_MS'];
  if (raw === undefined || raw.trim() === '') return 2000;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) return 2000;
  return Math.max(500, Math.min(20000, parsed));
}

/**
 * Operational maximum completion token ceiling for Meta Model API (api.meta.ai).
 * Context window: 1M tokens (1,048,576) [UNVERIFIED on public docs page; cited in release notes].
 * Llama 3.1 architecture limit: up to 131,072 context tokens (https://llama.meta.com/docs/model-cards-and-prompt-formats/llama3_1/, retrieved Oct 2026; "Context length: up to 128k tokens").
 * For muse-spark-1.3 Chat Completions, maximum completion ceiling is [UNVERIFIED on public endpoint without auth];
 * safely bounded operationally at MAX_TOKENS_CEILING = 8192.
 * Pricing reference: ~$2.00 per 1M completion tokens ($0.000002/token) [UNVERIFIED estimate used for worst-case budget bounds].
 */
export const MAX_TOKENS_CEILING = 8192;

/**
 * Resolves MODEL_MAX_TOKENS with clamp [1, 8192].
 * Unset / empty / non-numeric / 0 / negative -> undefined (path defaults 150/250/300 preserved).
 * Values exceeding MAX_TOKENS_CEILING (8192) are clamped to 8192.
 */
export function resolveMaxTokensOverride(
  env: Record<string, string | undefined> = process.env
): number | undefined {
  const raw = env['MODEL_MAX_TOKENS'];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) return undefined;
  return Math.min(MAX_TOKENS_CEILING, parsed);
}

/**
 * Resolves MODEL_REASONING_EFFORT from environment.
 * Meta Model API documentation (https://api.meta.ai/v1, retrieved Oct 2026) specifies supported values:
 * 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'.
 * Note: 'none' is documented to cause HTTP 400 on reasoning endpoints [UNVERIFIED on live endpoint].
 * Unset or unrecognized values return undefined (omitted from payload to eliminate HTTP 400 risk).
 */
export function resolveReasoningEffort(
  env: Record<string, string | undefined> = process.env
): ReasoningEffort | undefined {
  const raw = env['MODEL_REASONING_EFFORT']?.trim().toLowerCase();
  if (!raw) return undefined;
  if (
    raw === 'minimal' ||
    raw === 'low' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'xhigh' ||
    raw === 'max'
  ) {
    return raw;
  }
  return undefined;
}

/**
 * Resolves the default persistent call attempt ledger path.
 */
export function getDefaultLedgerPath(baseDir: string = process.cwd()): string {
  return path.resolve(baseDir, '.yori-runtime', 'model-live-ledger.json');
}

/**
 * Resolves the persistent call attempt ledger path.
 * Default: .yori-runtime/model-live-ledger.json
 */
export function resolveLedgerPath(
  env: Record<string, string | undefined> = process.env,
  baseDir: string = process.cwd()
): string {
  const custom = env['MODEL_LIVE_LEDGER_PATH'];
  if (custom && custom.trim().length > 0) {
    return path.isAbsolute(custom.trim())
      ? custom.trim()
      : path.resolve(baseDir, custom.trim());
  }
  return getDefaultLedgerPath(baseDir);
}

export interface LedgerReservationEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly endpoint: string;
  readonly callIndex: number;
}

export interface ModelLedgerData {
  readonly version: 1;
  readonly call_count: number;
  readonly reservations: readonly LedgerReservationEntry[];
}

export interface LedgerReservationResult {
  readonly success: boolean;
  readonly callCount: number;
  readonly maxCalls: number;
  readonly error?: 'cap_exceeded' | 'corrupt_ledger' | 'unwritable_ledger' | 'lock_timeout';
}

export interface LedgerState {
  readonly status: 'ok' | 'missing' | 'corrupt';
  readonly callCount: number;
}

/**
 * Reads persistent ledger state synchronously without acquiring lock.
 */
export function readLedgerState(ledgerPath: string): LedgerState {
  if (!fs.existsSync(ledgerPath)) {
    return { status: 'missing', callCount: 0 };
  }
  try {
    const content = fs.readFileSync(ledgerPath, 'utf-8');
    const data = JSON.parse(content);
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.call_count !== 'number' ||
      data.call_count < 0 ||
      !Array.isArray(data.reservations)
    ) {
      return { status: 'corrupt', callCount: -1 };
    }
    return { status: 'ok', callCount: data.call_count };
  } catch {
    return { status: 'corrupt', callCount: -1 };
  }
}

/**
 * Resets the specified ledger and lock file (for tests and verification tooling).
 * Protects the production default ledger: refuses to reset the default production path
 * unless allowProduction: true is explicitly provided.
 */
export function resetLedger(ledgerPath: string, allowProduction: boolean = false): void {
  if (!ledgerPath) {
    throw new Error('resetLedger requires an explicit ledgerPath');
  }
  const defaultPath = getDefaultLedgerPath();
  if (path.resolve(ledgerPath) === path.resolve(defaultPath) && !allowProduction) {
    throw new Error(
      `resetLedger refused to reset the default production ledger at ${defaultPath} without allowProduction: true`
    );
  }
  const lockPath = `${ledgerPath}.lock`;
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {}
  try {
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
  } catch {}
}

/**
 * Atomically reserves a call slot BEFORE dispatching an outbound fetch.
 * Uses an exclusive lock file (O_CREAT | O_EXCL) with retry.
 * Concurrent reservations serialize safely and never exceed maxCalls.
 * Ledger records call counts and timestamps only; NEVER secret keys or prompts.
 * Fails closed (success: false) on corrupt JSON or filesystem error.
 */
export async function reserveLedgerSlot(
  ledgerPath: string,
  maxCalls: number,
  endpoint: string,
  logger: (msg: string) => void = () => {},
  lifetimeMaxCalls: number = MODEL_LIFETIME_MAX_CALLS,
  runStartCount: number = 0
): Promise<LedgerReservationResult> {
  const dir = path.dirname(ledgerPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err: any) {
    logger(`[ModelProxy] Failed to create ledger directory ${dir}: ${err?.message || err}`);
    return { success: false, callCount: -1, maxCalls, error: 'unwritable_ledger' };
  }

  const lockPath = `${ledgerPath}.lock`;
  let lockFd: number | null = null;
  const startTime = Date.now();
  const maxWaitMs = 5000;

  while (lockFd === null) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
    } catch (err: any) {
      if (err && err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            try {
              fs.unlinkSync(lockPath);
            } catch {}
          }
        } catch {}
        if (Date.now() - startTime > maxWaitMs) {
          logger('[ModelProxy] Ledger lock acquisition timed out');
          return { success: false, callCount: -1, maxCalls, error: 'lock_timeout' };
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      } else {
        logger(`[ModelProxy] Ledger lock error: ${err?.message || err}`);
        return { success: false, callCount: -1, maxCalls, error: 'unwritable_ledger' };
      }
    }
  }

  try {
    let data: { version: number; call_count: number; reservations: LedgerReservationEntry[] };
    if (!fs.existsSync(ledgerPath)) {
      data = { version: 1, call_count: 0, reservations: [] };
    } else {
      try {
        const raw = fs.readFileSync(ledgerPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          typeof parsed.call_count !== 'number' ||
          parsed.call_count < 0 ||
          !Array.isArray(parsed.reservations)
        ) {
          logger('[ModelProxy] Ledger file contains invalid structure');
          return { success: false, callCount: -1, maxCalls, error: 'corrupt_ledger' };
        }
        data = parsed;
      } catch (parseErr: any) {
        logger(`[ModelProxy] Ledger file unreadable or corrupt JSON: ${parseErr?.message || parseErr}`);
        return { success: false, callCount: -1, maxCalls, error: 'corrupt_ledger' };
      }
    }

    // 1. Check lifetime cap (50 calls total across all runs)
    if (data.call_count >= lifetimeMaxCalls) {
      return { success: false, callCount: data.call_count, maxCalls, error: 'cap_exceeded' };
    }

    // 2. Check per-run cap (maxCalls per verification run)
    const runCallCount = Math.max(0, data.call_count - runStartCount);
    if (runCallCount >= maxCalls) {
      return { success: false, callCount: data.call_count, maxCalls, error: 'cap_exceeded' };
    }

    data.call_count += 1;
    data.reservations.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      endpoint,
      callIndex: data.call_count,
    });

    const tmpFile = `${ledgerPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, ledgerPath);
    } catch (writeErr: any) {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {}
      logger(`[ModelProxy] Failed to write ledger file: ${writeErr?.message || writeErr}`);
      return { success: false, callCount: -1, maxCalls, error: 'unwritable_ledger' };
    }

    return { success: true, callCount: data.call_count, maxCalls };
  } finally {
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
      } catch {}
      try {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      } catch {}
    }
  }
}

/**
 * Loads .env.local variables into process.env if present.
 * In test runners (Vitest / NODE_ENV=test), environment variables are controlled by the test harness.
 */
export function loadEnvLocal(baseDir: string = process.cwd()): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return;
  }
  const envPath = path.join(baseDir, '.env.local');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // ignore read error
    }
  }
}

/**
 * Resolves model configuration from environment.
 * Logs ONLY the variable name used, NEVER the value.
 */
export function resolveModelConfig(
  logger: (msg: string) => void = () => {}
): ModelProxyConfig {
  loadEnvLocal();

  const modelKey = process.env['MODEL_API_KEY'];
  const metaKey = process.env['META_API_KEY'];

  let apiKey: string | undefined;
  let keySource: 'MODEL_API_KEY' | 'META_API_KEY' | 'none' = 'none';

  if (modelKey && modelKey.trim().length > 0) {
    apiKey = modelKey.trim();
    keySource = 'MODEL_API_KEY';
    logger('[ModelProxy] Configured with variable: MODEL_API_KEY');
  } else if (metaKey && metaKey.trim().length > 0) {
    apiKey = metaKey.trim();
    keySource = 'META_API_KEY';
    logger('[ModelProxy] Configured with variable: META_API_KEY');
  }

  const baseUrl = process.env['MODEL_BASE_URL'] || 'https://api.meta.ai/v1';
  const modelName = process.env['MODEL_NAME'] || 'muse-spark-1.3';
  const liveEnabled = process.env['MODEL_LIVE_ENABLED'] === '1';
  const maxCalls = resolveMaxCalls(process.env);
  const timeoutMs = resolveTimeoutMs(process.env);
  const maxTokensOverride = resolveMaxTokensOverride(process.env);
  const reasoningEffort = resolveReasoningEffort(process.env);
  const ledgerPath = resolveLedgerPath(process.env);

  return {
    apiKey,
    keySource,
    baseUrl,
    modelName,
    liveEnabled,
    maxCalls,
    timeoutMs,
    maxTokensOverride,
    reasoningEffort,
    ledgerPath,
  };
}

export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private readonly maxRequests: number = 30,
    private readonly windowMs: number = 60_000
  ) {}

  public check(now: number = Date.now()): boolean {
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    this.requests.push(now);
    return true;
  }

  public reset(): void {
    this.requests = [];
  }
}

export function isLocalHost(hostHeader?: string): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  if (host === 'localhost' || host.startsWith('localhost:')) return true;
  if (host === '127.0.0.1' || host.startsWith('127.0.0.1:')) return true;
  if (host === '[::1]' || host.startsWith('[::1]:')) return true;
  return false;
}

export function isLocalOrigin(originHeader?: string): boolean {
  if (!originHeader) return true;
  const origin = originHeader.trim().toLowerCase();
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function isLocalReferer(refererHeader?: string): boolean {
  if (!refererHeader) return true;
  const referer = refererHeader.trim().toLowerCase();
  try {
    const url = new URL(referer);
    const hostname = url.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Resolves the server host binding.
 * Binds to 0.0.0.0 when DEV_DEVICE_TESTING is enabled (phone testing),
 * otherwise strictly binds to 127.0.0.1 loopback only.
 */
export function resolveBindHost(env: Record<string, string | undefined> = process.env): string {
  return env['DEV_DEVICE_TESTING'] === 'true' ? '0.0.0.0' : '127.0.0.1';
}

/**
 * Strips optional markdown code fences (```json ... ``` or ``` ... ```) from output text.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}

export type ContentExtractionResult =
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'truncated'; readonly reason: 'truncated' }
  | { readonly kind: 'extraction_fault'; readonly reason: 'extraction_fault' }
  | { readonly kind: 'schema_invalid'; readonly reason: 'schema_invalid' };

/**
 * Parses visible output content from an OpenAI-compatible choice object and
 * classifies outcomes into distinct failure modes per S1-DIAG & S1-CAP50:
 * - 'truncated': finish_reason='length' (completion budget exhausted)
 * - 'extraction_fault': content in unexpected field/shape or reasoning fields present without visible content
 * - 'schema_invalid': empty or missing visible content when finish_reason is 'stop' or absent
 * - 'ok': visible content successfully extracted and code fences stripped
 */
export function parseMessageContent(
  choice?: {
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
      reasoning?: unknown;
    };
    finish_reason?: string;
  }
): ContentExtractionResult {
  if (!choice) {
    return { kind: 'extraction_fault', reason: 'extraction_fault' };
  }

  // 1. Truncation: finish_reason='length' always signals truncation
  if (choice.finish_reason === 'length') {
    return { kind: 'truncated', reason: 'truncated' };
  }

  const msg = choice.message;
  if (!msg || typeof msg !== 'object') {
    return { kind: 'extraction_fault', reason: 'extraction_fault' };
  }

  const hasReasoning = Boolean(
    (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim().length > 0) ||
    (typeof msg.reasoning === 'string' && msg.reasoning.trim().length > 0)
  );

  // 2. Extraction fault: content in unexpected field or shape
  if (
    msg.content !== undefined &&
    msg.content !== null &&
    typeof msg.content === 'object' &&
    !Array.isArray(msg.content)
  ) {
    return { kind: 'extraction_fault', reason: 'extraction_fault' };
  }

  // 3. Content is missing (undefined or null)
  if (msg.content === undefined || msg.content === null) {
    if (choice.finish_reason === 'length') {
      return { kind: 'truncated', reason: 'truncated' };
    }
    if (hasReasoning) {
      return { kind: 'extraction_fault', reason: 'extraction_fault' };
    }
    return { kind: 'schema_invalid', reason: 'schema_invalid' };
  }

  // 4. Extract raw text from string or well-formed parts array
  let rawText: string | undefined;
  if (typeof msg.content === 'string') {
    rawText = msg.content;
  } else if (Array.isArray(msg.content)) {
    const isWellFormedParts = msg.content.every(
      p => typeof p === 'object' && p !== null && ('text' in p || 'type' in p)
    );
    if (!isWellFormedParts) {
      return { kind: 'extraction_fault', reason: 'extraction_fault' };
    }
    const textParts = msg.content
      .filter((p: any) => typeof p?.text === 'string')
      .map((p: any) => p.text as string);
    rawText = textParts.join('');
  } else {
    return { kind: 'extraction_fault', reason: 'extraction_fault' };
  }

  if (!rawText || !rawText.trim()) {
    if (choice.finish_reason === 'length') {
      return { kind: 'truncated', reason: 'truncated' };
    }
    if (hasReasoning) {
      return { kind: 'extraction_fault', reason: 'extraction_fault' };
    }
    return { kind: 'schema_invalid', reason: 'schema_invalid' };
  }

  return { kind: 'ok', content: stripCodeFences(rawText) };
}

/**
 * Extracts raw textual content from an OpenAI-compatible message object.
 * Returns stripped content when ok, otherwise undefined.
 */
export function extractMessageContent(message: unknown, finishReason?: string): string | undefined {
  const res = parseMessageContent({ message: message as any, finish_reason: finishReason });
  return res.kind === 'ok' ? res.content : undefined;
}

/**
 * Creates Vite / Connect development server middleware for the ModelDevProxy.
 */
export function createModelProxyMiddleware(
  proxy: ModelDevProxy = new ModelDevProxy()
): (req: any, res: any, next: (err?: any) => void) => Promise<void> {
  return async (req: any, res: any, next: (err?: any) => void) => {
    try {
      const handled = await proxy.handleHttpRequest(req, res);
      if (!handled) {
        next();
      }
    } catch (err) {
      next(err);
    }
  };
}

export class ModelDevProxy {
  private config: ModelProxyConfig;
  private readonly rateLimiter: RateLimiter;
  private lastFinishReason?: string;
  private lastReasoningTokens?: number;
  private runStartLedgerCount?: number;

  constructor(
    customConfig?: Partial<ModelProxyConfig>,
    private readonly logger: (msg: string) => void = () => {},
    customRateLimiter?: RateLimiter
  ) {
    const resolved = resolveModelConfig(this.logger);
    if (customConfig) {
      const apiKey = customConfig.apiKey;
      const keySource = customConfig.keySource ?? (apiKey ? 'MODEL_API_KEY' : 'none');
      let liveEnabled = resolved.liveEnabled;
      if (customConfig.liveEnabled !== undefined) {
        liveEnabled = customConfig.liveEnabled;
      } else if (customConfig.apiKey !== undefined) {
        liveEnabled =
          process.env.MODEL_LIVE_ENABLED !== undefined
            ? process.env.MODEL_LIVE_ENABLED === '1'
            : true;
      }

      const maxCalls =
        customConfig.maxCalls !== undefined
          ? Math.min(Math.max(0, customConfig.maxCalls), MODEL_PER_RUN_MAX_CALLS)
          : resolved.maxCalls;

      const timeoutMs =
        customConfig.timeoutMs !== undefined
          ? Math.max(500, Math.min(20000, customConfig.timeoutMs))
          : resolved.timeoutMs;

      const maxTokensOverride =
        customConfig.maxTokensOverride !== undefined
          ? Math.max(1, Math.min(MAX_TOKENS_CEILING, customConfig.maxTokensOverride))
          : resolved.maxTokensOverride;

      const reasoningEffort =
        customConfig.reasoningEffort !== undefined
          ? customConfig.reasoningEffort
          : resolved.reasoningEffort;

      const ledgerPath = customConfig.ledgerPath ?? resolved.ledgerPath;

      this.config = {
        apiKey,
        keySource,
        baseUrl: customConfig.baseUrl ?? resolved.baseUrl,
        modelName: customConfig.modelName ?? resolved.modelName,
        liveEnabled,
        maxCalls,
        timeoutMs,
        maxTokensOverride,
        reasoningEffort,
        ledgerPath,
      };
    } else {
      this.config = resolved;
    }
    this.rateLimiter = customRateLimiter ?? new RateLimiter(30, 60_000);
  }

  public getConfig(): ModelProxyConfig {
    return this.config;
  }

  public getCallCount(): number {
    return processLiveCallCount;
  }

  public resetCallCount(): void {
    processLiveCallCount = 0;
    this.runStartLedgerCount = undefined;
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getLastFinishReason(): string | undefined {
    return this.lastFinishReason;
  }

  public getLastReasoningTokens(): number | undefined {
    return this.lastReasoningTokens;
  }

  public resetDiagnosticsMetadata(): void {
    this.lastFinishReason = undefined;
    this.lastReasoningTokens = undefined;
  }

  public getDiagnostics(): ModelPortDiagnostics {
    let providerHost: string | undefined;
    try {
      providerHost = new URL(this.config.baseUrl).hostname;
    } catch {
      providerHost = undefined;
    }

    const baseDiag = {
      modelName: this.config.modelName,
      providerHost,
      lastFinishReason: this.lastFinishReason,
      lastReasoningTokens: this.lastReasoningTokens,
    };

    if (!this.config.apiKey) {
      return {
        ...baseDiag,
        status: 'disabled',
        message: 'model: disabled (no MODEL_API_KEY)',
        keySource: 'none',
      };
    }

    if (!this.config.liveEnabled) {
      return {
        ...baseDiag,
        status: 'disabled',
        message: 'model: key present, live disabled (MODEL_LIVE_ENABLED!=1)',
        keySource: this.config.keySource,
      };
    }

    const ledgerState = readLedgerState(this.config.ledgerPath);
    if (ledgerState.status === 'corrupt') {
      return {
        ...baseDiag,
        status: 'disabled',
        message: 'model: persistent ledger corrupt or unreadable, falling back to deterministic',
        keySource: this.config.keySource,
      };
    }

    if (ledgerState.callCount >= MODEL_LIFETIME_MAX_CALLS) {
      return {
        ...baseDiag,
        status: 'disabled',
        message: `model: lifetime call cap reached (${ledgerState.callCount}/${MODEL_LIFETIME_MAX_CALLS}), falling back to deterministic`,
        keySource: this.config.keySource,
      };
    }

    const runCallCount =
      this.runStartLedgerCount !== undefined && ledgerState.status === 'ok'
        ? Math.max(processLiveCallCount, Math.max(0, ledgerState.callCount - this.runStartLedgerCount))
        : processLiveCallCount;

    if (runCallCount >= this.config.maxCalls) {
      return {
        ...baseDiag,
        status: 'disabled',
        message: `model: live call cap reached (${runCallCount}/${this.config.maxCalls}), falling back to deterministic`,
        keySource: this.config.keySource,
      };
    }

    return {
      ...baseDiag,
      status: 'enabled',
      message: `model: enabled (${this.config.modelName} via ${this.config.keySource})`,
      keySource: this.config.keySource,
    };
  }

  /**
   * Handles incoming HTTP requests for model proxy routes with strict security guards.
   * Enforces:
   * 1. Local loopback Host header only (403 for LAN/Tailscale).
   * 2. Local loopback Origin/Referer only (403 for cross-site / external origins).
   * 3. Blocks cross-site Sec-Fetch-Site (403).
   * 4. Content-Type: application/json required on POST (415).
   * 5. Maximum 8KB payload cap (413).
   * 6. Per-minute rate limit (429).
   */
  public async handleHttpRequest(req: any, res: any): Promise<boolean> {
    const url = (req.url || '').split('?')[0];
    if (
      url !== '/api/model/diagnostics' &&
      url !== '/api/model/refine' &&
      url !== '/api/model/reason' &&
      url !== '/api/model/command'
    ) {
      return false;
    }

    // 1. Host header validation
    const hostHeader = (req.headers?.['host'] || req.headers?.[':authority']) as string | undefined;
    if (!isLocalHost(hostHeader)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: non-local host access is blocked' }));
      return true;
    }

    // 2. Origin validation
    const originHeader = req.headers?.['origin'] as string | undefined;
    if (originHeader && !isLocalOrigin(originHeader)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: cross-origin access is blocked' }));
      return true;
    }

    // 3. Sec-Fetch-Site validation
    const secFetchSite = req.headers?.['sec-fetch-site'] as string | undefined;
    if (secFetchSite === 'cross-site') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: cross-site requests are blocked' }));
      return true;
    }

    // 4. Referer validation
    const referer = req.headers?.['referer'] as string | undefined;
    if (referer && !isLocalReferer(referer)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: non-local referer is blocked' }));
      return true;
    }

    // 5. Device testing mode isolation
    if (process.env.DEV_DEVICE_TESTING === 'true') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: model proxy disabled in device-testing mode' }));
      return true;
    }

    // Route: GET /api/model/diagnostics
    if (url === '/api/model/diagnostics') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }
      const diag = this.getDiagnostics();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(diag));
      return true;
    }

    // Route: POST /api/model/refine
    if (url === '/api/model/refine') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }

      // Content-Type validation
      const contentType = ((req.headers?.['content-type'] as string) || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unsupported Media Type: application/json required' }));
        return true;
      }

      // Rate limit check
      if (!this.rateLimiter.check()) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Retry-After', '60');
        res.end(JSON.stringify({ error: 'Too Many Requests: rate limit exceeded' }));
        return true;
      }

      // Body size limit: 8KB (8192 bytes)
      return new Promise<boolean>(resolve => {
        let body = '';
        let bytesCount = 0;
        let isOversize = false;

        req.on('data', (chunk: Buffer | string) => {
          if (isOversize) return;
          const chunkLen = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
          bytesCount += chunkLen;
          if (bytesCount > 8192) {
            isOversize = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Payload Too Large: maximum body size is 8KB' }));
            resolve(true);
            return;
          }
          body += chunk.toString();
        });

        req.on('end', async () => {
          if (isOversize) return;
          try {
            const parsed = JSON.parse(body);
            const validation = validateTemplateRequest(parsed);
            if (!validation.valid) {
              res.statusCode = validation.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: validation.error }));
              resolve(true);
              return;
            }

            const result = await this.handleRefine(validation.template, validation.facts);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            resolve(true);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            resolve(true);
          }
        });

        req.on('error', () => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Request read error' }));
          resolve(true);
        });
      });
    }

    // Route: POST /api/model/reason (PH-002 B1 Constrained Reasoning Port)
    if (url === '/api/model/reason') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }

      // Content-Type validation
      const contentType = ((req.headers?.['content-type'] as string) || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unsupported Media Type: application/json required' }));
        return true;
      }

      // Rate limit check
      if (!this.rateLimiter.check()) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Retry-After', '60');
        res.end(JSON.stringify({ error: 'Too Many Requests: rate limit exceeded' }));
        return true;
      }

      // Body size limit: 8KB (8192 bytes)
      return new Promise<boolean>(resolve => {
        let body = '';
        let bytesCount = 0;
        let isOversize = false;

        req.on('data', (chunk: Buffer | string) => {
          if (isOversize) return;
          const chunkLen = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
          bytesCount += chunkLen;
          if (bytesCount > 8192) {
            isOversize = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Payload Too Large: maximum body size is 8KB' }));
            resolve(true);
            return;
          }
          body += chunk.toString();
        });

        req.on('end', async () => {
          if (isOversize) return;
          try {
            const parsed = JSON.parse(body);
            const inputValidation = validateReasoningInputSchema(parsed);
            if (!inputValidation.valid) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: `Invalid reasoning input: ${inputValidation.error}`,
                })
              );
              resolve(true);
              return;
            }
            const result = await this.handleReasoning(inputValidation.data!);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            resolve(true);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            resolve(true);
          }
        });

        req.on('error', () => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Request read error' }));
          resolve(true);
        });
      });
    }

    // Route: POST /api/model/command (V2a-2 Muse Spark Constrained Decision Engine)
    if (url === '/api/model/command') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }

      const contentType = ((req.headers?.['content-type'] as string) || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unsupported Media Type: application/json required' }));
        return true;
      }

      if (!this.rateLimiter.check()) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Retry-After', '60');
        res.end(JSON.stringify({ error: 'Too Many Requests: rate limit exceeded' }));
        return true;
      }

      return new Promise<boolean>(resolve => {
        let body = '';
        let bytesCount = 0;
        let isOversize = false;

        req.on('data', (chunk: Buffer | string) => {
          if (isOversize) return;
          const chunkLen = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
          bytesCount += chunkLen;
          if (bytesCount > 8192) {
            isOversize = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Payload Too Large: maximum body size is 8KB' }));
            resolve(true);
            return;
          }
          body += chunk.toString();
        });

        req.on('end', async () => {
          if (isOversize) return;
          try {
            const parsed = JSON.parse(body);
            const reqValidation = validateTemplateRequest(parsed);
            if (!reqValidation.valid) {
              res.statusCode = reqValidation.statusCode || 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: reqValidation.error }));
              resolve(true);
              return;
            }
            const result = await this.handleCommand(reqValidation.facts);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            resolve(true);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            resolve(true);
          }
        });

        req.on('error', () => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Request read error' }));
          resolve(true);
        });
      });
    }

    return false;
  }

  public async handleRefine(
    requestOrTemplate: ModelPortRequest | ServerTemplate | string,
    factsArg?: Record<string, unknown>
  ): Promise<ModelPortResponse> {
    this.resetDiagnosticsMetadata();
    let tmpl: ServerTemplate | undefined;
    let actualFacts: Record<string, unknown> = {};

    if (
      typeof requestOrTemplate === 'object' &&
      requestOrTemplate !== null &&
      'id' in requestOrTemplate &&
      'systemPrompt' in requestOrTemplate
    ) {
      tmpl = requestOrTemplate as ServerTemplate;
      actualFacts = factsArg || {};
    } else if (typeof requestOrTemplate === 'string') {
      tmpl = getTemplate(requestOrTemplate);
      actualFacts = factsArg || {};
    } else if (
      typeof requestOrTemplate === 'object' &&
      requestOrTemplate !== null &&
      'templateId' in requestOrTemplate
    ) {
      tmpl = getTemplate(requestOrTemplate.templateId);
      actualFacts = requestOrTemplate.facts || {};
    }

    if (!tmpl) {
      const fallbackWording =
        typeof actualFacts.headline === 'string'
          ? actualFacts.headline
          : 'Upcoming notice';
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: 'error',
      };
    }

    const fallbackWording = tmpl.renderDeterministic(actualFacts);

    const diag = this.getDiagnostics();
    if (diag.status === 'disabled') {
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    // Call the model API with strict fact validation, max_tokens, and timeout
    if (processLiveCallCount >= this.config.maxCalls) {
      this.logger(
        `[ModelProxy] Call cap reached (${processLiveCallCount}/${this.config.maxCalls}): falling back to deterministic`
      );
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    if (this.runStartLedgerCount === undefined) {
      const state = readLedgerState(this.config.ledgerPath);
      this.runStartLedgerCount = state.status === 'ok' ? state.callCount : 0;
    }

    const reservation = await reserveLedgerSlot(
      this.config.ledgerPath,
      this.config.maxCalls,
      'refine',
      this.logger,
      MODEL_LIFETIME_MAX_CALLS,
      this.runStartLedgerCount
    );
    if (!reservation.success) {
      this.logger(
        `[ModelProxy] Ledger reservation rejected (${reservation.error}): falling back to deterministic`
      );
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }
    processLiveCallCount = Math.max(processLiveCallCount + 1, reservation.callCount);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      // Facts are inserted as quoted JSON data, never concatenated into instructions (Requirement 4)
      const userMessageContent = JSON.stringify({
        templateId: tmpl.id,
        instruction: tmpl.promptInstruction,
        facts: actualFacts,
      });

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          max_tokens: this.config.maxTokensOverride ?? 150,
          ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
          messages: [
            {
              role: 'system',
              content: tmpl.systemPrompt,
            },
            {
              role: 'user',
              content: userMessageContent,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: 'error',
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: unknown;
            reasoning_content?: unknown;
            reasoning?: unknown;
          };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          completion_tokens_details?: {
            reasoning_tokens?: number;
          };
          reasoning_tokens?: number;
        };
      };

      this.lastFinishReason = json.choices?.[0]?.finish_reason;
      this.lastReasoningTokens =
        json.usage?.completion_tokens_details?.reasoning_tokens ??
        json.usage?.reasoning_tokens;

      const extraction = parseMessageContent(json.choices?.[0]);
      if (extraction.kind !== 'ok') {
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: extraction.reason,
        };
      }

      const content = extraction.content;
      let parsedWording = '';
      if (content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(content) as { wording?: string };
          parsedWording = parsed.wording || '';
        } catch {
          return {
            wording: fallbackWording,
            usedFallback: true,
            fallbackReason: 'schema_invalid',
          };
        }
      } else {
        try {
          const parsed = JSON.parse(content) as { wording?: string };
          parsedWording = parsed.wording || '';
        } catch {
          parsedWording = content.trim();
        }
      }

      if (!parsedWording) {
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

      // Fact checking: every token must be in supplied facts!
      const factTokens = tmpl.extractFactTokens(actualFacts);
      const factCheck = validateFactsInWording(parsedWording, factTokens);
      if (!factCheck.valid) {
        this.logger(
          `[ModelProxy] Discarding model wording due to unlisted tokens: ${factCheck.unlistedTokens.join(', ')}`
        );
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: 'unlisted_fact_token',
        };
      }

      return {
        wording: parsedWording,
        usedFallback: false,
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'error',
      };
    }
  }

  /**
   * Performs constrained model reasoning over structured candidate plans (PH-002 B1, AC-202-1).
   * Validates output schema, signal/fact citations, and factual tokens.
   * Any violation or failure safely discards the whole output for the deterministic ranking.
   */
  public async handleReasoning(
    rawInput: unknown
  ): Promise<ModelReasoningResponse> {
    this.resetDiagnosticsMetadata();
    const inputValidation = validateReasoningInputSchema(rawInput);
    if (!inputValidation.valid) {
      const fallback = deterministicReasoningFallback(
        rawInput &&
          typeof rawInput === 'object' &&
          Array.isArray((rawInput as any).candidates)
          ? (rawInput as ReasoningInput)
          : { candidates: [], availableSignalIds: [], confirmedFactKeys: [] }
      );
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: 'schema_invalid',
      };
    }
    const input = inputValidation.data!;
    const fallback = deterministicReasoningFallback(input);
    const diag = this.getDiagnostics();

    if (diag.status === 'disabled') {
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    const tmpl = getTemplate('reason_rank');
    if (!tmpl) {
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: 'error',
      };
    }

    if (processLiveCallCount >= this.config.maxCalls) {
      this.logger(
        `[ModelProxy] Call cap reached (${processLiveCallCount}/${this.config.maxCalls}): falling back to deterministic`
      );
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    if (this.runStartLedgerCount === undefined) {
      const state = readLedgerState(this.config.ledgerPath);
      this.runStartLedgerCount = state.status === 'ok' ? state.callCount : 0;
    }

    const reservation = await reserveLedgerSlot(
      this.config.ledgerPath,
      this.config.maxCalls,
      'reason_rank',
      this.logger,
      MODEL_LIFETIME_MAX_CALLS,
      this.runStartLedgerCount
    );
    if (!reservation.success) {
      this.logger(
        `[ModelProxy] Ledger reservation rejected (${reservation.error}): falling back to deterministic`
      );
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }
    processLiveCallCount = Math.max(processLiveCallCount + 1, reservation.callCount);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const userMessageContent = JSON.stringify({
        templateId: tmpl.id,
        instruction: tmpl.promptInstruction,
        input,
      });

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          max_tokens: this.config.maxTokensOverride ?? 250,
          ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
          messages: [
            {
              role: 'system',
              content: tmpl.systemPrompt,
            },
            {
              role: 'user',
              content: userMessageContent,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          result: fallback,
          usedFallback: true,
          fallbackReason: 'error',
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: unknown;
            reasoning_content?: unknown;
            reasoning?: unknown;
          };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          completion_tokens_details?: {
            reasoning_tokens?: number;
          };
          reasoning_tokens?: number;
        };
      };

      this.lastFinishReason = json.choices?.[0]?.finish_reason;
      this.lastReasoningTokens =
        json.usage?.completion_tokens_details?.reasoning_tokens ??
        json.usage?.reasoning_tokens;

      const extraction = parseMessageContent(json.choices?.[0]);
      if (extraction.kind !== 'ok') {
        return {
          result: fallback,
          usedFallback: true,
          fallbackReason: extraction.reason,
        };
      }

      const content = extraction.content;
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          result: fallback,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

      const validation = validateReasoningOutput(parsed, input);
      if (!validation.valid) {
        this.logger(
          `[ModelProxy] Discarding reasoning output due to validation failure (${validation.reason}): ${validation.error}`
        );
        return {
          result: fallback,
          usedFallback: true,
          fallbackReason: validation.reason,
        };
      }

      return {
        result: validation.data,
        usedFallback: false,
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'error',
      };
    }
  }

  /**
   * Performs constrained command decision handling via Muse Spark (V2a-2).
   */
  public async handleCommand(
    facts: Record<string, unknown>
  ): Promise<ModelCommandResponse> {
    this.resetDiagnosticsMetadata();
    const tmpl = getTemplate('decision_command');
    if (!tmpl) {
      return {
        result: null,
        usedFallback: true,
        fallbackReason: 'error',
      };
    }

    // Strict schema check: knownFactKeys is required and must not be empty (G3-PARITY)
    // Rejects before any upstream model call or live dispatch
    const knownFactKeys = facts.knownFactKeys;
    if (!Array.isArray(knownFactKeys) || knownFactKeys.length === 0) {
      this.logger(
        '[ModelProxy] Rejecting command decision request: knownFactKeys is missing or empty'
      );
      return {
        result: null,
        usedFallback: true,
        fallbackReason: 'schema_invalid',
      };
    }

    const diag = this.getDiagnostics();
    if (diag.status === 'disabled') {
      return {
        result: null,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    if (processLiveCallCount >= this.config.maxCalls) {
      this.logger(
        `[ModelProxy] Call cap reached (${processLiveCallCount}/${this.config.maxCalls}): falling back to deterministic`
      );
      return {
        result: null,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    if (this.runStartLedgerCount === undefined) {
      const state = readLedgerState(this.config.ledgerPath);
      this.runStartLedgerCount = state.status === 'ok' ? state.callCount : 0;
    }

    const reservation = await reserveLedgerSlot(
      this.config.ledgerPath,
      this.config.maxCalls,
      'decision_command',
      this.logger,
      MODEL_LIFETIME_MAX_CALLS,
      this.runStartLedgerCount
    );
    if (!reservation.success) {
      this.logger(
        `[ModelProxy] Ledger reservation rejected (${reservation.error}): falling back to deterministic`
      );
      return {
        result: null,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }
    processLiveCallCount = Math.max(processLiveCallCount + 1, reservation.callCount);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const userMessageContent = JSON.stringify({
        templateId: tmpl.id,
        instruction: tmpl.promptInstruction,
        facts,
      });

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          max_tokens: this.config.maxTokensOverride ?? 300,
          ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
          messages: [
            {
              role: 'system',
              content: tmpl.systemPrompt,
            },
            {
              role: 'user',
              content: userMessageContent,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          result: null,
          usedFallback: true,
          fallbackReason: 'error',
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: unknown;
            reasoning_content?: unknown;
            reasoning?: unknown;
          };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          completion_tokens_details?: {
            reasoning_tokens?: number;
          };
          reasoning_tokens?: number;
        };
      };

      this.lastFinishReason = json.choices?.[0]?.finish_reason;
      this.lastReasoningTokens =
        json.usage?.completion_tokens_details?.reasoning_tokens ??
        json.usage?.reasoning_tokens;

      const extraction = parseMessageContent(json.choices?.[0]);
      if (extraction.kind !== 'ok') {
        return {
          result: null,
          usedFallback: true,
          fallbackReason: extraction.reason,
        };
      }

      const content = extraction.content;
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          result: null,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

      const validation = validateDecisionCommandOutput(parsed, {
        availableModes: Array.isArray(facts.availableModes) ? (facts.availableModes as string[]) : undefined,
        availableSignalIds: Array.isArray(facts.availableSignalIds) ? (facts.availableSignalIds as string[]) : undefined,
        knownFactKeys: Array.isArray(facts.knownFactKeys) ? (facts.knownFactKeys as string[]) : undefined,
        confirmedFactKeys: Array.isArray(facts.confirmedFactKeys) ? (facts.confirmedFactKeys as string[]) : undefined,
        validTimes: Array.isArray(facts.validTimes) ? (facts.validTimes as string[]) : undefined,
        validPlaces: Array.isArray(facts.validPlaces) ? (facts.validPlaces as string[]) : undefined,
      });

      if (!validation.valid) {
        this.logger(
          `[ModelProxy] Discarding command decision output due to validation failure (${validation.reason}): ${validation.error}`
        );
        return {
          result: null,
          usedFallback: true,
          fallbackReason: (validation.reason as any) || 'schema_invalid',
        };
      }

      return {
        result: validation.data,
        usedFallback: false,
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      return {
        result: null,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'error',
      };
    }
  }
}
