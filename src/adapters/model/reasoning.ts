/**
 * Model Reasoning Port & Validator
 * Governed by Architecture Rev3 Section 14.2 and AC-202-1, AC-202-3 (Plan yori_ph002_001 Slice B1).
 *
 * Requirements:
 * 1. Inputs are derived server-side or from pipeline output, NOT free client text.
 * 2. Model output schema (strict JSON): {orderedPlanIds[], rationale[{planId, citedSignalIds[], citedFactKeys[], text}], proposedIntent?{intent, confidence, citedSignalIds[]}}.
 * 3. Any unknown planId/signal/fact id, missing citation, an extra key, or an unlisted time/place/price token
 *    discards the WHOLE output and uses the deterministic ranking.
 * 4. Effect is bounded: the model may only reorder candidates the engine produced (or propose an intent that
 *    passes through the EXISTING shared policy: suppression, budget, decline).
 * 5. Deterministic fallback is always available.
 */

import type {
  PreparedPlan,
  ContextSnapshot,
  ContextSignal,
  MemoryFact,
  IntentCandidate,
} from '../../core/contracts/index.js';
import { validateFactsInWording } from './fact-checker.js';

export interface CandidatePlanSummary {
  readonly id: string;
  readonly intentId: string;
  readonly confidence: number;
  readonly headline: string;
  readonly times: readonly string[];
  readonly places: readonly string[];
  readonly prices?: readonly string[];
  readonly optionModes?: readonly string[];
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
}

export interface ReasoningInput {
  readonly candidates: readonly CandidatePlanSummary[];
  readonly availableSignalIds: readonly string[];
  readonly confirmedFactKeys: readonly string[];
  readonly contextSummary?: string;
}

export interface PlanRationale {
  readonly planId: string;
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
  readonly text: string;
}

export interface ProposedIntent {
  readonly intent: string;
  readonly confidence: number;
  readonly citedSignalIds: readonly string[];
}

export interface ReasoningOutput {
  readonly orderedPlanIds: readonly string[];
  readonly rationale: readonly PlanRationale[];
  readonly proposedIntent?: ProposedIntent;
}

export type ReasoningValidationFailureReason =
  | 'schema_invalid'
  | 'extra_keys'
  | 'unknown_plan_id'
  | 'unknown_signal_id'
  | 'unknown_fact_key'
  | 'missing_citation'
  | 'unlisted_fact_token';

export type ReasoningValidationResult =
  | { readonly valid: true; readonly data: ReasoningOutput }
  | {
      readonly valid: false;
      readonly reason: ReasoningValidationFailureReason;
      readonly error: string;
    };

/**
 * Summarizes a PreparedPlan into structured candidate fields for reasoning input.
 */
export function summarizePlanForReasoning(plan: PreparedPlan): CandidatePlanSummary {
  const times: string[] = [];
  if (plan.apptAt) times.push(plan.apptAt);
  if (plan.prepareAt) times.push(plan.prepareAt);
  if (plan.leaveAt) times.push(plan.leaveAt);

  const places: string[] = [];
  if (plan.subjectTitle) places.push(plan.subjectTitle);

  const optionModes: string[] = [];
  const prices: string[] = [];

  for (const opt of plan.optionsOrSteps) {
    if (typeof opt !== 'string') {
      if (opt.leaveAt) times.push(opt.leaveAt);
      if (opt.name) places.push(opt.name);
      if (opt.mode) optionModes.push(opt.mode);
      if (opt.cost) prices.push(opt.cost);
    }
  }

  const citedSignalIds = plan.why.evidenceSignals.map(s => `${s.kind}:${s.issuedAt}`);
  const citedFactKeys = plan.why.memoryFactsUsed.map(m => m.key);

  return Object.freeze({
    id: plan.id,
    intentId: plan.intentId,
    confidence: 1.0,
    headline: plan.headline,
    times: Object.freeze([...new Set(times)]),
    places: Object.freeze([...new Set(places)]),
    prices: Object.freeze([...new Set(prices)]),
    optionModes: Object.freeze([...new Set(optionModes)]),
    citedSignalIds: Object.freeze(citedSignalIds),
    citedFactKeys: Object.freeze(citedFactKeys),
  });
}

/**
 * Builds server-side ReasoningInput from prepared plans, snapshot signals, and confirmed facts.
 */
export function buildReasoningInput(
  plans: readonly PreparedPlan[],
  snapshot: ContextSnapshot,
  memory: readonly MemoryFact[],
  contextSummary?: string
): ReasoningInput {
  const candidates = plans.map(summarizePlanForReasoning);
  const availableSignalIds = snapshot.signals.map(s => `${s.kind}:${s.issuedAt}`);
  const confirmedFactKeys = memory.filter(m => m.status === 'confirmed').map(m => m.key);

  return Object.freeze({
    candidates: Object.freeze(candidates),
    availableSignalIds: Object.freeze([...new Set(availableSignalIds)]),
    confirmedFactKeys: Object.freeze([...new Set(confirmedFactKeys)]),
    contextSummary,
  });
}

/**
 * Validates model output against strict schema and citation invariants.
 * Any unknown ID, missing citation, extra key, or unlisted token rejects the whole output.
 */
export function validateReasoningOutput(
  raw: unknown,
  input: ReasoningInput
): ReasoningValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      reason: 'schema_invalid',
      error: 'Reasoning output must be a non-null JSON object',
    };
  }

  const record = raw as Record<string, unknown>;

  // Check top-level extra keys
  const allowedTopKeys = new Set(['orderedPlanIds', 'rationale', 'proposedIntent']);
  for (const k of Object.keys(record)) {
    if (!allowedTopKeys.has(k)) {
      return {
        valid: false,
        reason: 'extra_keys',
        error: `Unauthorized top-level key '${k}' in reasoning output`,
      };
    }
  }

  // 1. Validate orderedPlanIds
  if (!Array.isArray(record.orderedPlanIds)) {
    return {
      valid: false,
      reason: 'schema_invalid',
      error: "'orderedPlanIds' must be an array of plan id strings",
    };
  }

  const inputPlanIds = new Set(input.candidates.map(c => c.id));
  const seenPlanIds = new Set<string>();

  for (const item of record.orderedPlanIds) {
    if (typeof item !== 'string') {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'Each item in orderedPlanIds must be a string',
      };
    }
    if (!inputPlanIds.has(item)) {
      return {
        valid: false,
        reason: 'unknown_plan_id',
        error: `Unknown planId '${item}' in orderedPlanIds`,
      };
    }
    if (seenPlanIds.has(item)) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: `Duplicate planId '${item}' in orderedPlanIds`,
      };
    }
    seenPlanIds.add(item);
  }

  // 2. Validate rationale
  if (!Array.isArray(record.rationale)) {
    return {
      valid: false,
      reason: 'schema_invalid',
      error: "'rationale' must be an array of rationale objects",
    };
  }

  const allowedRationaleKeys = new Set(['planId', 'citedSignalIds', 'citedFactKeys', 'text']);
  const availableSignals = new Set(input.availableSignalIds);
  const confirmedFacts = new Set(input.confirmedFactKeys);

  // Aggregate supplied facts for fact-checking rationale text
  const allSuppliedTimes: string[] = [];
  const allSuppliedPlaces: string[] = [];
  for (const cand of input.candidates) {
    allSuppliedTimes.push(...cand.times);
    allSuppliedPlaces.push(...cand.places);
  }

  const validatedRationales: PlanRationale[] = [];

  for (const item of record.rationale) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'Each rationale entry must be an object',
      };
    }

    const ratObj = item as Record<string, unknown>;

    for (const rk of Object.keys(ratObj)) {
      if (!allowedRationaleKeys.has(rk)) {
        return {
          valid: false,
          reason: 'extra_keys',
          error: `Unauthorized key '${rk}' in rationale item`,
        };
      }
    }

    if (typeof ratObj.planId !== 'string' || !inputPlanIds.has(ratObj.planId)) {
      return {
        valid: false,
        reason: 'unknown_plan_id',
        error: `Rationale references unknown or missing planId '${ratObj.planId}'`,
      };
    }

    if (!Array.isArray(ratObj.citedSignalIds) || !Array.isArray(ratObj.citedFactKeys)) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'citedSignalIds and citedFactKeys must be arrays',
      };
    }

    const citedSignals: string[] = [];
    for (const sid of ratObj.citedSignalIds) {
      if (typeof sid !== 'string' || !availableSignals.has(sid)) {
        return {
          valid: false,
          reason: 'unknown_signal_id',
          error: `Rationale cites unknown signal ID '${sid}'`,
        };
      }
      citedSignals.push(sid);
    }

    const citedFacts: string[] = [];
    for (const fk of ratObj.citedFactKeys) {
      if (typeof fk !== 'string' || !confirmedFacts.has(fk)) {
        return {
          valid: false,
          reason: 'unknown_fact_key',
          error: `Rationale cites unknown or unconfirmed fact key '${fk}'`,
        };
      }
      citedFacts.push(fk);
    }

    // Must have at least one citation (AC-202-1: every claim cites supplied signal/fact ids)
    if (citedSignals.length === 0 && citedFacts.length === 0) {
      return {
        valid: false,
        reason: 'missing_citation',
        error: `Rationale for plan '${ratObj.planId}' has no citations`,
      };
    }

    if (typeof ratObj.text !== 'string' || ratObj.text.trim().length === 0) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'Rationale text must be a non-empty string',
      };
    }

    // Fact checking: ensure rationale text does not invent unlisted times, places, or prices
    const textFactCheck = validateFactsInWording(ratObj.text, {
      times: allSuppliedTimes,
      places: allSuppliedPlaces,
    });
    if (!textFactCheck.valid) {
      return {
        valid: false,
        reason: 'unlisted_fact_token',
        error: `Rationale text contains unlisted tokens: ${textFactCheck.unlistedTokens.join(', ')}`,
      };
    }

    // Check for unsupplied price patterns
    const priceMatch = ratObj.text.match(/(\$\s*\d+|\b\d+\s*(?:dollars|usd|yen|euros|cents)\b)/gi);
    if (priceMatch) {
      return {
        valid: false,
        reason: 'unlisted_fact_token',
        error: `Rationale text contains unsupplied price token: ${priceMatch.join(', ')}`,
      };
    }

    validatedRationales.push(
      Object.freeze({
        planId: ratObj.planId,
        citedSignalIds: Object.freeze(citedSignals),
        citedFactKeys: Object.freeze(citedFacts),
        text: ratObj.text,
      })
    );
  }

  // 3. Validate proposedIntent (optional)
  let proposedIntent: ProposedIntent | undefined;
  if (record.proposedIntent !== undefined) {
    if (!record.proposedIntent || typeof record.proposedIntent !== 'object' || Array.isArray(record.proposedIntent)) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: "'proposedIntent' must be an object if present",
      };
    }

    const piObj = record.proposedIntent as Record<string, unknown>;
    const allowedPiKeys = new Set(['intent', 'confidence', 'citedSignalIds']);
    for (const pik of Object.keys(piObj)) {
      if (!allowedPiKeys.has(pik)) {
        return {
          valid: false,
          reason: 'extra_keys',
          error: `Unauthorized key '${pik}' in proposedIntent`,
        };
      }
    }

    if (typeof piObj.intent !== 'string' || piObj.intent.trim().length === 0) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: "proposedIntent requires non-empty 'intent' string",
      };
    }

    if (
      typeof piObj.confidence !== 'number' ||
      isNaN(piObj.confidence) ||
      piObj.confidence < 0 ||
      piObj.confidence > 1
    ) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'proposedIntent confidence must be a number between 0.0 and 1.0',
      };
    }

    if (!Array.isArray(piObj.citedSignalIds) || piObj.citedSignalIds.length === 0) {
      return {
        valid: false,
        reason: 'missing_citation',
        error: 'proposedIntent must cite at least one signal ID',
      };
    }

    const piSignals: string[] = [];
    for (const sid of piObj.citedSignalIds) {
      if (typeof sid !== 'string' || !availableSignals.has(sid)) {
        return {
          valid: false,
          reason: 'unknown_signal_id',
          error: `proposedIntent cites unknown signal ID '${sid}'`,
        };
      }
      piSignals.push(sid);
    }

    proposedIntent = Object.freeze({
      intent: piObj.intent,
      confidence: piObj.confidence,
      citedSignalIds: Object.freeze(piSignals),
    });
  }

  return {
    valid: true,
    data: Object.freeze({
      orderedPlanIds: Object.freeze([...record.orderedPlanIds as string[]]),
      rationale: Object.freeze(validatedRationales),
      proposedIntent,
    }),
  };
}

/**
 * Returns deterministic fallback reasoning output (preserving input candidate order).
 */
export function deterministicReasoningFallback(input: ReasoningInput): ReasoningOutput {
  return Object.freeze({
    orderedPlanIds: Object.freeze(input.candidates.map(c => c.id)),
    rationale: Object.freeze([]),
  });
}

/**
 * Bounded effect: reorders engine-produced PreparedPlans matching reasoning output.
 * Preserves plan integrity (headline, times, actions unchanged).
 */
export function reorderPlansWithReasoning(
  plans: readonly PreparedPlan[],
  reasoning: ReasoningOutput | null
): readonly PreparedPlan[] {
  if (!reasoning || !Array.isArray(reasoning.orderedPlanIds) || reasoning.orderedPlanIds.length === 0) {
    return plans;
  }

  const planMap = new Map(plans.map(p => [p.id, p]));
  const reordered: PreparedPlan[] = [];

  for (const id of reasoning.orderedPlanIds) {
    const found = planMap.get(id);
    if (found) {
      reordered.push(found);
      planMap.delete(id);
    }
  }

  // Append any plans that were not in the reordering list
  for (const remaining of planMap.values()) {
    reordered.push(remaining);
  }

  return Object.freeze(reordered);
}

/**
 * Creates an IntentCandidate from a model-proposed intent.
 * Enters the EXISTING shared policy pipeline (AC-202-3).
 */
export function createModelIntentCandidate(
  proposed: ProposedIntent,
  availableSignals: readonly ContextSignal[]
): IntentCandidate {
  const signalMap = new Map(availableSignals.map(s => [`${s.kind}:${s.issuedAt}`, s]));
  const evidence: ContextSignal[] = [];

  for (const sid of proposed.citedSignalIds) {
    const s = signalMap.get(sid);
    if (s) {
      evidence.push(s);
    }
  }

  return Object.freeze({
    intent: proposed.intent,
    confidence: proposed.confidence,
    evidence: Object.freeze(evidence),
    metadata: Object.freeze({
      source: 'model_reasoning',
      citedSignalIds: proposed.citedSignalIds,
    }),
  });
}
