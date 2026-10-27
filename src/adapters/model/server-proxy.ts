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

export class ModelDevProxy {
  private config: ModelProxyConfig;

  constructor(
    customConfig?: Partial<ModelProxyConfig>,
    private readonly logger: (msg: string) => void = () => {}
  ) {
    this.config = customConfig
      ? {
          apiKey: customConfig.apiKey,
          keySource: customConfig.keySource ?? (customConfig.apiKey ? 'MODEL_API_KEY' : 'none'),
          baseUrl: customConfig.baseUrl ?? 'https://api.meta.ai/v1',
          modelName: customConfig.modelName ?? 'muse-spark-1.3',
        }
      : resolveModelConfig(this.logger);
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

  public async handleRefine(request: ModelPortRequest): Promise<ModelPortResponse> {
    const diag = this.getDiagnostics();
    if (diag.status === 'disabled') {
      return {
        wording: request.templateWording,
        usedFallback: true,
        fallbackReason: 'disabled',
      };
    }

    // Call the model API with strict fact validation and timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are an assistant refining notification wording. Do NOT add new times, places, or prices. Use ONLY provided facts. Reply with JSON: {"wording": "..."}',
            },
            {
              role: 'user',
              content: JSON.stringify({
                template: request.templateWording,
                facts: request.suppliedFacts,
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
