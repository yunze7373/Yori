/**
 * Living Context Reasoning Coordinator
 * Governed by Architecture Rev3 Section 14.2 and AC-202-2 (Plan yori_ph002_001 Slice B2).
 *
 * Responsibilities:
 * 1. Builds ReasoningInput from composed engine plans (summarizePlanForReasoning / buildReasoningInput).
 * 2. Calls POST /api/model/reason with strict timeout handling (2000ms max).
 * 3. Applies reorderPlansWithReasoning to NOW/AHEAD only when the response is valid and not a fallback.
 * 4. Model-proposed intent enters via createModelIntentCandidate and is evaluated against SharedPolicy (suppression, budget, decline).
 * 5. Handles errors silently in the UI: on timeout (>2s), 5xx, network error, or discard, deterministic order is untouched.
 * 6. UI never blocks on the model: asynchronous execution after deterministic composition.
 */

import type {
  PreparedPlan,
  ContextSnapshot,
  MemoryFact,
  LivingContext,
  IntentCandidate,
  SuppressionReason,
} from '../core/contracts/index.js';
import {
  sharedPolicy,
  type SharedPolicySurface,
  type PolicyEvaluationContext,
} from '../core/policy/index.js';
import {
  buildReasoningInput,
  reorderPlansWithReasoning,
  createModelIntentCandidate,
  validateReasoningOutput,
  type ReasoningOutput,
  type ReasoningValidationFailureReason,
  type ReasoningReasonCode,
} from '../adapters/model/reasoning.js';
import { STRINGS } from '../ui/living-context/strings.js';

export interface ModelReasoningApiResponse {
  readonly result: ReasoningOutput;
  readonly usedFallback: boolean;
  readonly fallbackReason?:
    | 'disabled'
    | 'timeout'
    | 'error'
    | ReasoningValidationFailureReason;
}

export interface ReasoningCoordinationResult {
  readonly applied: boolean;
  readonly now: PreparedPlan | null;
  readonly ahead: readonly PreparedPlan[];
  readonly rationaleMap: ReadonlyMap<string, string>;
  readonly proposedIntentCandidate?: IntentCandidate;
  readonly proposedIntentSuppression?: SuppressionReason;
  readonly fallbackReason?: string;
}

export interface ReasoningCoordinatorOptions {
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly policy?: SharedPolicySurface;
  readonly policyContext?: PolicyEvaluationContext;
  readonly fetchFn?: typeof fetch;
  readonly logger?: (msg: string) => void;
}

/**
 * Coordinates asynchronous model reasoning over LivingContext plans.
 * Bounded effect: reorders candidate plans or proposes an intent into SharedPolicy.
 * Never mutates plan times, checklists, actions, or options.
 */
export async function coordinateReasoning(
  living: LivingContext,
  snapshot: ContextSnapshot,
  memory: readonly MemoryFact[],
  options?: ReasoningCoordinatorOptions
): Promise<ReasoningCoordinationResult> {
  const allPlans: PreparedPlan[] = [];
  if (living.now) allPlans.push(living.now);
  if (living.ahead && living.ahead.length > 0) allPlans.push(...living.ahead);

  const originalNow = living.now;
  const originalAhead = living.ahead;
  const emptyRationaleMap: ReadonlyMap<string, string> = new Map();

  // If no candidates exist, there is nothing to reorder
  if (allPlans.length === 0) {
    return {
      applied: false,
      now: originalNow,
      ahead: originalAhead,
      rationaleMap: emptyRationaleMap,
    };
  }

  // 1. Build bounded reasoning input server-side / adapter-side
  const reasoningInput = buildReasoningInput(allPlans, snapshot, memory);

  const endpoint = options?.endpoint || '/api/model/reason';
  const timeoutMs = options?.timeoutMs || 2000;
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const logger = options?.logger || (() => {});

  let responseData: ModelReasoningApiResponse;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reasoningInput),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      logger(`[ReasoningCoordinator] HTTP ${response.status} from ${endpoint}`);
      return {
        applied: false,
        now: originalNow,
        ahead: originalAhead,
        rationaleMap: emptyRationaleMap,
        fallbackReason: `http_${response.status}`,
      };
    }

    responseData = (await response.json()) as ModelReasoningApiResponse;
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    logger(`[ReasoningCoordinator] Request failed: ${err}`);
    return {
      applied: false,
      now: originalNow,
      ahead: originalAhead,
      rationaleMap: emptyRationaleMap,
      fallbackReason: isTimeout ? 'timeout' : 'error',
    };
  }

  // 3. Fallback or discard: keep deterministic order
  if (responseData.usedFallback || !responseData.result) {
    return {
      applied: false,
      now: originalNow,
      ahead: originalAhead,
      rationaleMap: emptyRationaleMap,
      fallbackReason: responseData.fallbackReason || 'fallback',
    };
  }

  // Defense in depth: Client-side validation against supplied plans (Finding 1)
  const clientValidation = validateReasoningOutput(responseData.result, reasoningInput);
  if (!clientValidation.valid) {
    logger(`[ReasoningCoordinator] Client validation failed: ${clientValidation.error}`);
    return {
      applied: false,
      now: originalNow,
      ahead: originalAhead,
      rationaleMap: emptyRationaleMap,
      fallbackReason: clientValidation.reason,
    };
  }

  // 4. Valid reorder: reorder plans keeping plan data byte-for-byte intact
  const reorderedPlans = reorderPlansWithReasoning(allPlans, responseData.result);
  const newNow = living.now !== null ? (reorderedPlans[0] ?? null) : null;
  const newAhead = living.now !== null ? reorderedPlans.slice(1, 4) : reorderedPlans.slice(0, 3);

  // 5. Build rationale map for UI display in Why Sheet
  // NEVER render free model text (Finding 1 / INV-103).
  // Only map validated enumerated reasonCodes to externalized UI copy!
  const rationaleMap = new Map<string, string>();
  if (Array.isArray(responseData.result.rationale)) {
    for (const r of responseData.result.rationale) {
      if (r && r.planId) {
        const code =
          (r.reasonCode as ReasoningReasonCode | undefined) ||
          (Array.isArray(r.reasonCodes) ? (r.reasonCodes[0] as ReasoningReasonCode) : undefined);
        if (code && typeof code === 'string' && code in STRINGS.reasoningReasons) {
          rationaleMap.set(
            r.planId,
            STRINGS.reasoningReasons[code as keyof typeof STRINGS.reasoningReasons]
          );
        }
      }
    }
  }

  // 6. Handle optional proposedIntent: must pass through SharedPolicy (AC-202-3)
  let proposedIntentCandidate: IntentCandidate | undefined;
  let proposedIntentSuppression: SuppressionReason | undefined;

  if (responseData.result.proposedIntent) {
    proposedIntentCandidate = createModelIntentCandidate(
      responseData.result.proposedIntent,
      snapshot.signals
    );
    const policy = options?.policy || sharedPolicy;
    const policyCtx: PolicyEvaluationContext = options?.policyContext || {
      snapshot,
      memory,
    };
    const suppression = policy.checkSuppression(proposedIntentCandidate, policyCtx);
    if (suppression) {
      proposedIntentSuppression = suppression;
      logger(
        `[ReasoningCoordinator] Proposed intent '${proposedIntentCandidate.intent}' suppressed by policy: ${suppression.reason}`
      );
    }
  }

  return {
    applied: true,
    now: newNow,
    ahead: Object.freeze(newAhead),
    rationaleMap: Object.freeze(rationaleMap),
    proposedIntentCandidate,
    proposedIntentSuppression,
  };
}
