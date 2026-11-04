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

export interface AppliedAction {
  readonly intent?: string;
  readonly deltaMinutes?: number;
  readonly mode?: string;
  readonly topPickName?: string;
  readonly leaveTime?: string;
}

export interface SuppliedFacts {
  readonly times: readonly string[];
  readonly places: readonly string[];
  readonly contextSummary?: string;
  readonly prices?: readonly string[];
  readonly ratings?: readonly string[];
  readonly distances?: readonly string[];
  readonly weather?: readonly string[];
  readonly durations?: readonly string[];
  readonly routes?: readonly string[];
  readonly cardType?: string;
  readonly habits?: readonly string[];
  readonly openStatuses?: readonly string[];
  readonly appliedAction?: AppliedAction;
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
  | 'unlisted_fact_token'
  | 'truncated'
  | 'extraction_fault';

export interface ModelPortResponse {
  readonly wording: string;
  readonly usedFallback: boolean;
  readonly fallbackReason?: FallbackReason;
}

export interface RejectedReasonCodeTelemetry {
  readonly field: string;
  readonly code: string;
}

export interface ModelPortDiagnostics {
  readonly status: 'enabled' | 'disabled';
  readonly message: string;
  readonly modelName: string;
  readonly keySource: 'MODEL_API_KEY' | 'META_API_KEY' | 'none';
  readonly providerHost?: string;
  readonly lastFinishReason?: string;
  readonly lastReasoningTokens?: number;
  readonly lastRejectedReasonCodes?: readonly RejectedReasonCodeTelemetry[];
}

export interface ModelPort {
  refineWording(request: ModelPortRequest): Promise<ModelPortResponse>;
  getDiagnostics(): Promise<ModelPortDiagnostics>;
}
