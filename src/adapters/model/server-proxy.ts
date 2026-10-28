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
  deterministicReasoningFallback,
  validateReasoningOutput,
  validateReasoningInputSchema,
} from './reasoning.js';

export interface ModelReasoningResponse {
  readonly result: ReasoningOutput;
  readonly usedFallback: boolean;
  readonly fallbackReason?:
    | 'disabled'
    | 'timeout'
    | 'error'
    | ReasoningValidationFailureReason;
}

export interface ModelProxyConfig {
  readonly apiKey?: string;
  readonly keySource: 'MODEL_API_KEY' | 'META_API_KEY' | 'none';
  readonly baseUrl: string;
  readonly modelName: string;
}

/**
 * Loads .env.local variables into process.env if present.
 */
export function loadEnvLocal(baseDir: string = process.cwd()): void {
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

  return {
    apiKey,
    keySource,
    baseUrl,
    modelName,
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

  constructor(
    customConfig?: Partial<ModelProxyConfig>,
    private readonly logger: (msg: string) => void = () => {},
    customRateLimiter?: RateLimiter
  ) {
    this.config = customConfig
      ? {
          apiKey: customConfig.apiKey,
          keySource: customConfig.keySource ?? (customConfig.apiKey ? 'MODEL_API_KEY' : 'none'),
          baseUrl: customConfig.baseUrl ?? 'https://api.meta.ai/v1',
          modelName: customConfig.modelName ?? 'muse-spark-1.3',
        }
      : resolveModelConfig(this.logger);
    this.rateLimiter = customRateLimiter ?? new RateLimiter(30, 60_000);
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getDiagnostics(): ModelPortDiagnostics {
    if (!this.config.apiKey) {
      return {
        status: 'disabled',
        message: 'model: disabled (no MODEL_API_KEY)',
        modelName: this.config.modelName,
        keySource: 'none',
      };
    }

    return {
      status: 'enabled',
      message: `model: enabled (${this.config.modelName} via ${this.config.keySource})`,
      modelName: this.config.modelName,
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
      url !== '/api/model/reason'
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

    return false;
  }

  public async handleRefine(
    requestOrTemplate: ModelPortRequest | ServerTemplate | string,
    factsArg?: Record<string, unknown>
  ): Promise<ModelPortResponse> {
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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

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
          max_tokens: 150,
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
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

      let parsedWording = '';
      try {
        const parsed = JSON.parse(content) as { wording?: string };
        parsedWording = parsed.wording || '';
      } catch {
        parsedWording = content.trim();
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
      const isTimeout = err instanceof Error && err.name === 'AbortError';
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

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
          max_tokens: 250,
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
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        return {
          result: fallback,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

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
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        result: fallback,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'error',
      };
    }
  }
}
