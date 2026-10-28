/**
 * ModelPort Client Implementation
 * Governed by Architecture Rev3 Section 9.1 and AC-106-1, AC-106-2.
 *
 * Client-side interface to ModelPort:
 * - Wording ONLY, over supplied facts.
 * - Always falls back gracefully to deterministic template on missing key, timeout, or error.
 * - Enforces client-side fact checking as a second layer of defense.
 * - Never includes or bundles API keys in client code.
 */

import type {
  ModelPort,
  ModelPortRequest,
  ModelPortResponse,
  ModelPortDiagnostics,
} from './types.js';
import { validateFactsInWording } from './fact-checker.js';
import { getTemplate } from './template-registry.js';

export class ClientModelPort implements ModelPort {
  constructor(private readonly proxyEndpoint: string = '/api/model') {}

  public async getDiagnostics(): Promise<ModelPortDiagnostics> {
    try {
      const resp = await fetch(`${this.proxyEndpoint}/diagnostics`);
      if (resp.ok) {
        return (await resp.json()) as ModelPortDiagnostics;
      }
    } catch {
      // proxy unreachable -> disabled
    }

    return {
      status: 'disabled',
      message: 'model: disabled (no MODEL_API_KEY)',
      modelName: 'muse-spark-1.3',
      keySource: 'none',
    };
  }

  public async refineWording(request: ModelPortRequest): Promise<ModelPortResponse> {
    const template = getTemplate(request.templateId);
    const fallbackWording = template
      ? template.renderDeterministic(request.facts)
      : typeof request.facts?.headline === 'string'
      ? request.facts.headline
      : 'Upcoming notice';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(`${this.proxyEndpoint}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: request.templateId,
          facts: request.facts,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        return {
          wording: fallbackWording,
          usedFallback: true,
          fallbackReason: 'error',
        };
      }

      const result = (await resp.json()) as ModelPortResponse;

      // Second layer of fact checking on client side (defense in depth)
      if (!result.usedFallback && result.wording && template) {
        const factTokens = template.extractFactTokens(request.facts);
        const check = validateFactsInWording(result.wording, factTokens);
        if (!check.valid) {
          return {
            wording: fallbackWording,
            usedFallback: true,
            fallbackReason: 'unlisted_fact_token',
          };
        }
      }

      return result;
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        wording: fallbackWording,
        usedFallback: true,
        fallbackReason: isTimeout ? 'timeout' : 'disabled',
      };
    }
  }
}

export const defaultModelPort: ModelPort = new ClientModelPort();
export * from './types.js';
export * from './fact-checker.js';
export * from './server-proxy.js';
export * from './template-registry.js';
export * from './reasoning.js';
export * from './decision-log.js';
