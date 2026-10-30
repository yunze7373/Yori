/**
 * ModelPort Contracts & Types
 * Governed by Architecture Rev3 Section 9.1 and AC-106-1, AC-106-2.
 *
 * ModelPort (Meta Muse Spark):
 * - Wording ONLY, over supplied facts.
 * - The model NEVER originates times, weather, places, routes, or prices.
 * - Output is schema-validated.
 * - Strict fact checking: Any time or place token not in the supplied facts causes
 *   the output to be discarded for the deterministic template.
 * - Disabled when no API key is present; D1-D6 outputs are identical with model disabled.
 */

export interface SuppliedFacts {
  readonly times: readonly string[];
  readonly places: readonly string[];
  readonly contextSummary?: string;
}

export interface ModelPortRequest {
  readonly templateId: string;
  readonly facts: Record<string, unknown>;
}

export type FallbackReason =
  | 'disabled'
  | 'timeout'
  | 'error'
  | 'schema_invalid'
  | 'unlisted_fact_token';

export interface ModelPortResponse {
  readonly wording: string;
  readonly usedFallback: boolean;
  readonly fallbackReason?: FallbackReason;
}

export interface ModelPortDiagnostics {
  readonly status: 'enabled' | 'disabled';
  readonly message: string;
  readonly modelName: string;
  readonly keySource: 'MODEL_API_KEY' | 'META_API_KEY' | 'none';
  readonly providerHost?: string;
}

export interface ModelPort {
  refineWording(request: ModelPortRequest): Promise<ModelPortResponse>;
  getDiagnostics(): Promise<ModelPortDiagnostics>;
}
