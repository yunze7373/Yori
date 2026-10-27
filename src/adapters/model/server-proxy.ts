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
    if (url !== '/api/model/diagnostics' && url !== '/api/model/refine') {
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
            if (
              !parsed ||
              typeof parsed !== 'object' ||
              typeof parsed.templateWording !== 'string' ||
              typeof parsed.suppliedFacts !== 'object' ||
              parsed.suppliedFacts === null
            ) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid JSON request schema' }));
              resolve(true);
              return;
            }
            const result = await this.handleRefine(parsed);
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

  public async handleRefine(request: ModelPortRequest): Promise<ModelPortResponse> {
    const diag = this.getDiagnostics();
    if (diag.status === 'disabled') {
      return {
        wording: request.templateWording,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    // Call the model API with strict fact validation, max_tokens, and timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const times = Array.isArray(request.suppliedFacts?.times)
        ? request.suppliedFacts.times.slice(0, 10)
        : [];
      const places = Array.isArray(request.suppliedFacts?.places)
        ? request.suppliedFacts.places.slice(0, 10)
        : [];
      const contextSummary =
        typeof request.suppliedFacts?.contextSummary === 'string'
          ? request.suppliedFacts.contextSummary.slice(0, 200)
          : '';
      const templateWording =
        typeof request.templateWording === 'string'
          ? request.templateWording.slice(0, 500)
          : '';

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
              content:
                'You are an assistant refining notification wording. Do NOT add new times, places, or prices. Use ONLY provided facts. Reply with JSON: {"wording": "..."}',
            },
            {
              role: 'user',
              content: JSON.stringify({
                templateId: request.intentId,
                template: templateWording,
                facts: {
                  times,
                  places,
                  context: contextSummary,
                },
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          wording: request.templateWording,
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
          wording: request.templateWording,
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
          wording: request.templateWording,
          usedFallback: true,
          fallbackReason: 'schema_invalid',
        };
      }

      // Fact checking: every token must be in supplied facts!
      const factCheck = validateFactsInWording(parsedWording, request.suppliedFacts);
      if (!factCheck.valid) {
        this.logger(
          `[ModelProxy] Discarding model wording due to unlisted tokens: ${factCheck.unlistedTokens.join(', ')}`
        );
        return {
          wording: request.templateWording,
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
        wording: request.templateWording,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'error',
      };
    }
  }
}
