/**
 * Model Reasoning Port & Validator
 * Governed by Architecture Rev3 Section 14.2 and AC-202-1, AC-202-3 (Plan yori_ph002_001 Slice B1).
 *
 * Requirements:
 * 1. Inputs are derived server-side or from pipeline output, NOT free client text.
 *    No free-text headline or contextSummary fields in reasoning inputs; strict schema validation.
 * 2. Model output schema (strict JSON): {orderedPlanIds[], rationale[{planId, citedSignalIds[], citedFactKeys[], text}], proposedIntent?{intent, confidence, citedSignalIds[]}}.
 * 3. Any unknown planId/signal/fact id, missing citation, an extra key, or an unlisted time/place/price token
 *    discards the WHOLE output and uses the deterministic ranking.
 * 4. Effect is bounded: the model may only reorder candidates the engine produced (or propose an intent that
 *    passes through the EXISTING shared policy: suppression, budget, decline).
 * 5. Candidate instants are converted to local display forms (12h and 24h) in candidate/snapshot timezone for fact checking.
 * 6. Deterministic fallback is always available.
 */

import type {
  PreparedPlan,
  ContextSnapshot,
  ContextSignal,
  MemoryFact,
  IntentCandidate,
} from '../../core/contracts/index.js';
import { validateFactsInWording, parseTimeToMinutes, validateAssistantReply } from './fact-checker.js';
import type { RejectedReasonCodeTelemetry } from './types.js';

export { type RejectedReasonCodeTelemetry };

export function sanitizeModelText(raw: unknown): string {
  if (typeof raw !== 'string') {
    const len = typeof raw === 'undefined' ? 0 : String(raw).length;
    return `<nonconforming len=${len}>`;
  }
  if (/^[a-z][a-z0-9_]{0,39}$/.test(raw)) {
    return raw;
  }
  return `<nonconforming len=${raw.length}>`;
}

export const sanitizeReasonCodeForTelemetry = sanitizeModelText;

export const REGISTERED_INTENTS: ReadonlySet<string> = new Set([
  'depart',
  'lunch',
  'grocery',
  'grocery-stub',
]);

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const SIGNAL_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,32}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const FACT_KEY_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const TIMEZONE_PATTERN = /^[a-zA-Z0-9_/+-]{1,50}$/;

export interface CandidatePlanSummary {
  readonly id: string;
  readonly intentId: string;
  readonly confidence: number;
  readonly times: readonly string[];
  readonly places: readonly string[];
  readonly timezone?: string;
  readonly prices?: readonly string[];
  readonly optionModes?: readonly string[];
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
}

export interface ReasoningInput {
  readonly candidates: readonly CandidatePlanSummary[];
  readonly availableSignalIds: readonly string[];
  readonly confirmedFactKeys: readonly string[];
  readonly timeZone?: string;
  readonly timezone?: string;
}

export type ReasoningReasonCode =
  | 'matches_confirmed_preference'
  | 'time_critical'
  | 'shorter_trip'
  | 'weather_adjusted'
  | 'free_window_fit';

export const VALID_REASON_CODES: ReadonlySet<string> = new Set([
  'matches_confirmed_preference',
  'time_critical',
  'shorter_trip',
  'weather_adjusted',
  'free_window_fit',
]);

export interface PlanRationale {
  readonly planId: string;
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
  readonly reasonCode?: ReasoningReasonCode;
  readonly reasonCodes?: readonly ReasoningReasonCode[];
  readonly text?: string;
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

export type ReasoningInputValidationResult =
  | { readonly valid: true; readonly data: ReasoningInput }
  | { readonly valid: false; readonly error: string };

/**
 * Validates ReasoningInput against a strict schema before sending upstream or processing.
 * Rejects free-text instruction fields, extra keys, unregistered intents, or malformed IDs.
 */
export function validateReasoningInputSchema(raw: unknown): ReasoningInputValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'Reasoning input must be a non-null JSON object' };
  }

  const record = raw as Record<string, unknown>;

  // Allowed top-level keys only
  const allowedTopKeys = new Set([
    'candidates',
    'availableSignalIds',
    'confirmedFactKeys',
    'timeZone',
    'timezone',
  ]);
  for (const k of Object.keys(record)) {
    if (!allowedTopKeys.has(k)) {
      return { valid: false, error: `Unauthorized top-level key '${k}'` };
    }
  }

  // candidates: array 1..6
  if (!Array.isArray(record.candidates)) {
    return { valid: false, error: "'candidates' must be an array" };
  }
  if (record.candidates.length === 0 || record.candidates.length > 6) {
    return {
      valid: false,
      error: `'candidates' array length must be between 1 and 6 (got ${record.candidates.length})`,
    };
  }

  const allowedCandidateKeys = new Set([
    'id',
    'intentId',
    'confidence',
    'times',
    'places',
    'timezone',
    'prices',
    'optionModes',
    'citedSignalIds',
    'citedFactKeys',
  ]);

  const validatedCandidates: CandidatePlanSummary[] = [];

  for (let i = 0; i < record.candidates.length; i++) {
    const c = record.candidates[i];
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return { valid: false, error: `candidates[${i}] must be a non-null object` };
    }
    const cRec = c as Record<string, unknown>;

    for (const ck of Object.keys(cRec)) {
      if (!allowedCandidateKeys.has(ck)) {
        return { valid: false, error: `Unauthorized candidate key '${ck}' in candidates[${i}]` };
      }
    }

    if (typeof cRec.id !== 'string' || !ID_PATTERN.test(cRec.id)) {
      return { valid: false, error: `Invalid candidate id in candidates[${i}]` };
    }

    if (typeof cRec.intentId !== 'string' || !REGISTERED_INTENTS.has(cRec.intentId)) {
      return {
        valid: false,
        error: `Invalid or unregistered intentId '${cRec.intentId}' in candidates[${i}]`,
      };
    }

    if (
      typeof cRec.confidence !== 'number' ||
      !Number.isFinite(cRec.confidence) ||
      cRec.confidence < 0 ||
      cRec.confidence > 1
    ) {
      return {
        valid: false,
        error: `confidence in candidates[${i}] must be a number between 0 and 1`,
      };
    }

    if (!Array.isArray(cRec.times) || cRec.times.length > 10) {
      return { valid: false, error: `times in candidates[${i}] must be an array of at most 10 items` };
    }
    for (const t of cRec.times) {
      if (typeof t !== 'string' || t.length > 40 || (!parseTimeToMinutes(t) && !Date.parse(t))) {
        return { valid: false, error: `Invalid time instant '${t}' in candidates[${i}]` };
      }
    }

    if (!Array.isArray(cRec.places) || cRec.places.length > 6) {
      return { valid: false, error: `places in candidates[${i}] must be an array of at most 6 items` };
    }
    for (const p of cRec.places) {
      if (typeof p !== 'string' || p.length === 0 || p.length > 60 || /[\r\n]/.test(p)) {
        return { valid: false, error: `Invalid place token in candidates[${i}]` };
      }
    }

    if (cRec.timezone !== undefined) {
      if (typeof cRec.timezone !== 'string' || !TIMEZONE_PATTERN.test(cRec.timezone)) {
        return { valid: false, error: `Invalid timezone in candidates[${i}]` };
      }
    }

    if (cRec.prices !== undefined) {
      if (!Array.isArray(cRec.prices) || cRec.prices.length > 6) {
        return { valid: false, error: `prices in candidates[${i}] must be an array of at most 6 items` };
      }
      for (const pr of cRec.prices) {
        if (typeof pr !== 'string' || pr.length > 20 || /[\r\n]/.test(pr)) {
          return { valid: false, error: `Invalid price in candidates[${i}]` };
        }
      }
    }

    if (cRec.optionModes !== undefined) {
      if (!Array.isArray(cRec.optionModes) || cRec.optionModes.length > 6) {
        return { valid: false, error: `optionModes in candidates[${i}] must be an array of at most 6 items` };
      }
      for (const m of cRec.optionModes) {
        if (typeof m !== 'string' || m.length > 30 || /[\r\n]/.test(m)) {
          return { valid: false, error: `Invalid optionMode in candidates[${i}]` };
        }
      }
    }

    if (!Array.isArray(cRec.citedSignalIds) || cRec.citedSignalIds.length > 10) {
      return { valid: false, error: `citedSignalIds in candidates[${i}] must be an array of at most 10 items` };
    }
    for (const sid of cRec.citedSignalIds) {
      if (typeof sid !== 'string' || sid.length > 64 || !SIGNAL_ID_PATTERN.test(sid)) {
        return { valid: false, error: `Invalid citedSignalId '${sid}' in candidates[${i}]` };
      }
    }

    if (!Array.isArray(cRec.citedFactKeys) || cRec.citedFactKeys.length > 10) {
      return { valid: false, error: `citedFactKeys in candidates[${i}] must be an array of at most 10 items` };
    }
    for (const fk of cRec.citedFactKeys) {
      if (typeof fk !== 'string' || fk.length > 64 || !FACT_KEY_PATTERN.test(fk)) {
        return { valid: false, error: `Invalid citedFactKey '${fk}' in candidates[${i}]` };
      }
    }

    validatedCandidates.push({
      id: cRec.id,
      intentId: cRec.intentId,
      confidence: cRec.confidence,
      times: Object.freeze([...cRec.times]),
      places: Object.freeze([...cRec.places]),
      timezone: cRec.timezone as string | undefined,
      prices: cRec.prices ? Object.freeze([...(cRec.prices as string[])]) : undefined,
      optionModes: cRec.optionModes ? Object.freeze([...(cRec.optionModes as string[])]) : undefined,
      citedSignalIds: Object.freeze([...cRec.citedSignalIds]),
      citedFactKeys: Object.freeze([...cRec.citedFactKeys]),
    });
  }

  // availableSignalIds: array 0..20
  if (!Array.isArray(record.availableSignalIds) || record.availableSignalIds.length > 20) {
    return { valid: false, error: "'availableSignalIds' must be an array of at most 20 items" };
  }
  for (const sid of record.availableSignalIds) {
    if (typeof sid !== 'string' || sid.length > 64 || !SIGNAL_ID_PATTERN.test(sid)) {
      return { valid: false, error: `Invalid signal ID '${sid}' in availableSignalIds` };
    }
  }

  // confirmedFactKeys: array 0..20
  if (!Array.isArray(record.confirmedFactKeys) || record.confirmedFactKeys.length > 20) {
    return { valid: false, error: "'confirmedFactKeys' must be an array of at most 20 items" };
  }
  for (const fk of record.confirmedFactKeys) {
    if (typeof fk !== 'string' || fk.length > 64 || !FACT_KEY_PATTERN.test(fk)) {
      return { valid: false, error: `Invalid fact key '${fk}' in confirmedFactKeys` };
    }
  }

  const tz = (record.timeZone || record.timezone) as string | undefined;
  if (tz !== undefined && (typeof tz !== 'string' || !TIMEZONE_PATTERN.test(tz))) {
    return { valid: false, error: `Invalid timeZone '${tz}'` };
  }

  return {
    valid: true,
    data: Object.freeze({
      candidates: Object.freeze(validatedCandidates),
      availableSignalIds: Object.freeze([...(record.availableSignalIds as string[])]),
      confirmedFactKeys: Object.freeze([...(record.confirmedFactKeys as string[])]),
      timeZone: tz,
    }),
  };
}

/**
 * Converts an ISO-8601 instant string into 12-hour and 24-hour localized display times
 * for fact-checking rationale tokens against candidate times.
 */
export function convertInstantToLocalDisplayTimes(
  isoInstant: string,
  timeZone?: string
): readonly string[] {
  if (!timeZone) return [];
  const d = new Date(isoInstant);
  if (!Number.isFinite(d.getTime())) return [];
  try {
    const f12 = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    const f24 = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return Object.freeze([f12, f24]);
  } catch {
    return Object.freeze([]);
  }
}

/**
 * Summarizes a PreparedPlan into structured candidate fields for reasoning input.
 * Eliminates free-text headline fields to keep reasoning inputs strictly bounded.
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
    times: Object.freeze([...new Set(times)]),
    timezone: plan.timezone,
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
  memory: readonly MemoryFact[]
): ReasoningInput {
  const candidates = plans.map(summarizePlanForReasoning);
  const availableSignalIds = snapshot.signals.map(s => `${s.kind}:${s.issuedAt}`);
  const confirmedFactKeys = memory.filter(m => m.status === 'confirmed').map(m => m.key);

  return Object.freeze({
    candidates: Object.freeze(candidates),
    availableSignalIds: Object.freeze([...new Set(availableSignalIds)]),
    confirmedFactKeys: Object.freeze([...new Set(confirmedFactKeys)]),
    timeZone: snapshot.timezone,
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

  const allowedRationaleKeys = new Set([
    'planId',
    'citedSignalIds',
    'citedFactKeys',
    'text',
    'reasonCode',
    'reasonCodes',
  ]);
  const availableSignals = new Set(input.availableSignalIds);
  const confirmedFacts = new Set(input.confirmedFactKeys);

  // Aggregate supplied facts for fact-checking rationale text
  // Convert candidate instant times to their local display forms in the candidate/snapshot timezone (P2 fix)
  const allSuppliedTimes: string[] = [];
  const allSuppliedPlaces: string[] = [];
  for (const cand of input.candidates) {
    const tz = cand.timezone || input.timeZone || input.timezone;
    for (const t of cand.times) {
      allSuppliedTimes.push(t);
      if (tz) {
        const localTimes = convertInstantToLocalDisplayTimes(t, tz);
        allSuppliedTimes.push(...localTimes);
      }
    }
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

    // Validate reasonCode if provided
    let validatedReasonCode: ReasoningReasonCode | undefined;
    if (ratObj.reasonCode !== undefined) {
      if (typeof ratObj.reasonCode !== 'string' || !VALID_REASON_CODES.has(ratObj.reasonCode)) {
        return {
          valid: false,
          reason: 'schema_invalid',
          error: `Invalid or unrecognized reasonCode '${ratObj.reasonCode}'`,
        };
      }
      validatedReasonCode = ratObj.reasonCode as ReasoningReasonCode;
    }

    // Validate reasonCodes array if provided
    let validatedReasonCodes: ReasoningReasonCode[] | undefined;
    if (ratObj.reasonCodes !== undefined) {
      if (!Array.isArray(ratObj.reasonCodes) || ratObj.reasonCodes.length === 0) {
        return {
          valid: false,
          reason: 'schema_invalid',
          error: "'reasonCodes' must be a non-empty array of valid reason codes",
        };
      }
      validatedReasonCodes = [];
      for (const rc of ratObj.reasonCodes) {
        if (typeof rc !== 'string' || !VALID_REASON_CODES.has(rc)) {
          return {
            valid: false,
            reason: 'schema_invalid',
            error: `Invalid reason code '${rc}' in reasonCodes`,
          };
        }
        validatedReasonCodes.push(rc as ReasoningReasonCode);
      }
    }

    // Ensure at least one explanation form is provided (reasonCode, reasonCodes, or text)
    if (!validatedReasonCode && !validatedReasonCodes && ratObj.text === undefined) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'Rationale must supply at least one valid reasonCode, reasonCodes, or text',
      };
    }

    if (ratObj.text !== undefined) {
      if (typeof ratObj.text !== 'string' || ratObj.text.trim().length === 0) {
        return {
          valid: false,
          reason: 'schema_invalid',
          error: 'Rationale text must be a non-empty string when provided',
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
    }

    validatedRationales.push(
      Object.freeze({
        planId: ratObj.planId,
        citedSignalIds: Object.freeze(citedSignals),
        citedFactKeys: Object.freeze(citedFacts),
        reasonCode: validatedReasonCode,
        reasonCodes: validatedReasonCodes ? Object.freeze(validatedReasonCodes) : undefined,
        text: typeof ratObj.text === 'string' ? ratObj.text : undefined,
      })
    );
  }

  // 3. Validate optional proposedIntent
  let validatedProposedIntent: ProposedIntent | undefined;
  if (record.proposedIntent !== undefined && record.proposedIntent !== null) {
    if (typeof record.proposedIntent !== 'object' || Array.isArray(record.proposedIntent)) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'proposedIntent must be an object',
      };
    }

    const propObj = record.proposedIntent as Record<string, unknown>;
    const allowedPropKeys = new Set(['intent', 'confidence', 'citedSignalIds']);
    for (const pk of Object.keys(propObj)) {
      if (!allowedPropKeys.has(pk)) {
        return {
          valid: false,
          reason: 'extra_keys',
          error: `Unauthorized key '${pk}' in proposedIntent`,
        };
      }
    }

    if (typeof propObj.intent !== 'string' || propObj.intent.trim().length === 0) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'proposedIntent.intent must be a non-empty string',
      };
    }

    if (
      typeof propObj.confidence !== 'number' ||
      !Number.isFinite(propObj.confidence) ||
      propObj.confidence < 0 ||
      propObj.confidence > 1
    ) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: 'proposedIntent.confidence must be a number between 0 and 1',
      };
    }

    if (!Array.isArray(propObj.citedSignalIds) || propObj.citedSignalIds.length === 0) {
      return {
        valid: false,
        reason: 'missing_citation',
        error: 'proposedIntent.citedSignalIds must be a non-empty array of signal IDs',
      };
    }

    const citedSignals: string[] = [];
    for (const sid of propObj.citedSignalIds) {
      if (typeof sid !== 'string' || !availableSignals.has(sid)) {
        return {
          valid: false,
          reason: 'unknown_signal_id',
          error: `proposedIntent cites unknown signal ID '${sid}'`,
        };
      }
      citedSignals.push(sid);
    }

    validatedProposedIntent = Object.freeze({
      intent: propObj.intent.trim(),
      confidence: propObj.confidence,
      citedSignalIds: Object.freeze(citedSignals),
    });
  }

  return {
    valid: true,
    data: Object.freeze({
      orderedPlanIds: Object.freeze(record.orderedPlanIds as string[]),
      rationale: Object.freeze(validatedRationales),
      proposedIntent: validatedProposedIntent,
    }),
  };
}

/**
 * Returns deterministic fallback ordering identical to engine output.
 * Preserves the original engine order with zero rationale statements.
 */
export function deterministicReasoningFallback(input: ReasoningInput): ReasoningOutput {
  const orderedPlanIds = input.candidates.map(c => c.id);
  return Object.freeze({
    orderedPlanIds: Object.freeze(orderedPlanIds),
    rationale: Object.freeze([]),
  });
}

/**
 * Reorders candidate plans based on reasoning output.
 * Keeps candidate plans byte-for-byte intact (Requirement 3: model may only reorder candidates).
 * Plans omitted by the model are appended at the end in their original deterministic order.
 */
export function reorderPlansWithReasoning(
  plans: readonly PreparedPlan[],
  reasoning: ReasoningOutput
): readonly PreparedPlan[] {
  const planMap = new Map<string, PreparedPlan>();
  for (const p of plans) {
    planMap.set(p.id, p);
  }

  const result: PreparedPlan[] = [];
  const addedIds = new Set<string>();

  for (const id of reasoning.orderedPlanIds) {
    const plan = planMap.get(id);
    if (plan && !addedIds.has(id)) {
      result.push(plan);
      addedIds.add(id);
    }
  }

  // Append any plans not explicitly mentioned in their original order
  for (const p of plans) {
    if (!addedIds.has(p.id)) {
      result.push(p);
      addedIds.add(p.id);
    }
  }

  return Object.freeze(result);
}

/**
 * Creates an IntentCandidate from a validated ProposedIntent.
 * Passes through the standard pipeline (SharedPolicy) just like any engine candidate (Requirement 3, AC-202-3).
 */
export function createModelIntentCandidate(
  proposed: ProposedIntent,
  availableSignals: readonly ContextSignal[]
): IntentCandidate {
  const matchedSignals = availableSignals.filter(s =>
    proposed.citedSignalIds.includes(`${s.kind}:${s.issuedAt}`)
  );

  return Object.freeze({
    intent: proposed.intent,
    confidence: proposed.confidence,
    evidence: Object.freeze(matchedSignals),
    metadata: Object.freeze({
      source: 'model_reasoning',
      citedSignalIds: proposed.citedSignalIds,
    }),
  });
}

export type DecisionCommandIntent =
  | 'LEAVE_LATER'
  | 'CHANGE_ROUTE'
  | 'FIND_LUNCH'
  | 'FIND_FUEL'
  | 'WHY'
  | 'ACCEPT'
  | 'UNDO'
  | 'UNSUPPORTED';

export const CLOSED_DECISION_INTENTS: ReadonlySet<string> = new Set([
  'LEAVE_LATER',
  'CHANGE_ROUTE',
  'FIND_LUNCH',
  'FIND_FUEL',
  'WHY',
  'ACCEPT',
  'UNDO',
  'UNSUPPORTED',
]);

export interface DecisionCommandOutput {
  readonly intent: DecisionCommandIntent;
  readonly slots: {
    readonly deltaMinutes?: number;
    readonly mode?: 'drive' | 'bus';
    readonly filters?: readonly string[];
  };
  readonly reply?: string;
  readonly situationAttribution?: {
    readonly signalId: string;
    readonly reasonCode: ReasoningReasonCode;
    readonly explanation?: string;
    readonly citedFactKeys?: readonly string[];
  };
  readonly recommendedOptionDelta?: number;
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
  readonly reasonCodes: readonly ReasoningReasonCode[];
  readonly explanation?: string;
}

export interface DecisionCommandValidationContext {
  readonly availableModes?: readonly string[];
  readonly availableSignalIds?: readonly string[];
  readonly knownFactKeys?: readonly string[];
  readonly confirmedFactKeys?: readonly string[];
  readonly validTimes?: readonly string[];
  readonly validPlaces?: readonly string[];
  readonly suppliedDistances?: readonly string[];
  readonly suppliedRatings?: readonly string[];
  readonly suppliedPrices?: readonly string[];
  readonly suppliedWeather?: string;
  readonly evidenceBundle?: { getRecord(id: string): unknown; hasRecord?(id: string): boolean } | null;
}

export const ALLOWED_DECISION_COMMAND_TOP_KEYS: ReadonlySet<string> = new Set([
  'intent',
  'slots',
  'situationAttribution',
  'recommendedOptionDelta',
  'citedSignalIds',
  'citedFactKeys',
  'reasonCodes',
  'explanation',
  'reply',
]);

export const ALLOWED_DECISION_COMMAND_SLOT_KEYS: ReadonlySet<string> = new Set([
  'deltaMinutes',
  'mode',
  'filters',
]);

export const ALLOWED_SITUATION_ATTRIBUTION_KEYS: ReadonlySet<string> = new Set([
  'signalId',
  'reasonCode',
  'explanation',
  'citedFactKeys',
]);

/**
 * Validates Muse Spark Decision Engine output against strict schema, closed intents, and citations.
 * Discards any uncited claims, out-of-set intents, or unlisted tokens.
 */
export function validateDecisionCommandOutput(
  raw: unknown,
  context?: DecisionCommandValidationContext
):
  | { readonly valid: true; readonly data: DecisionCommandOutput }
  | {
      readonly valid: false;
      readonly reason: string;
      readonly error: string;
      readonly rejectedReasonCodes?: readonly RejectedReasonCodeTelemetry[];
    } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'schema_invalid', error: 'Output must be a non-null JSON object' };
  }

  const obj = raw as Record<string, unknown>;

  // Check top-level extra keys
  for (const k of Object.keys(obj)) {
    if (!ALLOWED_DECISION_COMMAND_TOP_KEYS.has(k)) {
      return {
        valid: false,
        reason: 'extra_keys',
        error: `Unauthorized top-level key '${sanitizeModelText(k)}' in decision command output`,
      };
    }
  }

  // 1. Intent must be in the closed set
  if (typeof obj.intent !== 'string' || !CLOSED_DECISION_INTENTS.has(obj.intent)) {
    return {
      valid: false,
      reason: 'out_of_set_intent',
      error: `Intent '${String(obj.intent)}' is outside the closed intent set`,
    };
  }

  // 2. Validate slots
  if (!obj.slots || typeof obj.slots !== 'object' || Array.isArray(obj.slots)) {
    return { valid: false, reason: 'schema_invalid', error: "'slots' must be an object" };
  }
  const slots = obj.slots as Record<string, unknown>;
  for (const k of Object.keys(slots)) {
    if (!ALLOWED_DECISION_COMMAND_SLOT_KEYS.has(k)) {
      return {
        valid: false,
        reason: 'extra_keys',
        error: `Unauthorized key '${sanitizeModelText(k)}' in slots`,
      };
    }
  }
  if (slots.mode !== undefined) {
    if (slots.mode !== 'drive' && slots.mode !== 'bus') {
      return { valid: false, reason: 'schema_invalid', error: `Unsupported mode '${sanitizeModelText(slots.mode)}'` };
    }
    if (context?.availableModes && !context.availableModes.includes(slots.mode as string)) {
      return { valid: false, reason: 'unknown_mode', error: `Mode '${sanitizeModelText(slots.mode)}' not in available modes` };
    }
  }
  if (slots.deltaMinutes !== undefined) {
    if (typeof slots.deltaMinutes !== 'number' || !Number.isInteger(slots.deltaMinutes) || slots.deltaMinutes <= 0 || slots.deltaMinutes > 240) {
      return { valid: false, reason: 'schema_invalid', error: `Invalid deltaMinutes '${sanitizeModelText(slots.deltaMinutes)}'` };
    }
  }
  if (slots.filters !== undefined) {
    if (!Array.isArray(slots.filters)) {
      return { valid: false, reason: 'schema_invalid', error: "'filters' must be an array" };
    }
    const allowedFilters = new Set(['quieter', 'vegetarian', 'nearer']);
    for (const f of slots.filters) {
      if (typeof f !== 'string' || !allowedFilters.has(f)) {
        return { valid: false, reason: 'unknown_filter', error: `Unsupported filter '${sanitizeModelText(f)}'` };
      }
    }
  }

  // Validate recommendedOptionDelta if present
  if (obj.recommendedOptionDelta !== undefined) {
    if (
      typeof obj.recommendedOptionDelta !== 'number' ||
      !Number.isFinite(obj.recommendedOptionDelta) ||
      !Number.isInteger(obj.recommendedOptionDelta) ||
      obj.recommendedOptionDelta < 0 ||
      obj.recommendedOptionDelta > 240
    ) {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: `Invalid recommendedOptionDelta '${sanitizeModelText(obj.recommendedOptionDelta)}'`,
      };
    }
  }

  // 3. Validate reasonCodes array and situationAttribution reasonCode
  const rejectedReasonCodes: RejectedReasonCodeTelemetry[] = [];

  if (!Array.isArray(obj.reasonCodes)) {
    return { valid: false, reason: 'schema_invalid', error: "'reasonCodes' must be an array" };
  }
  for (let i = 0; i < obj.reasonCodes.length; i++) {
    const code = obj.reasonCodes[i];
    if (typeof code !== 'string' || !VALID_REASON_CODES.has(code)) {
      if (rejectedReasonCodes.length < 10) {
        rejectedReasonCodes.push({
          field: `reasonCodes[${i}]`,
          code: sanitizeReasonCodeForTelemetry(code),
        });
      }
    }
  }

  // 4. Validate situationAttribution reasonCode early if present
  if (obj.situationAttribution !== undefined) {
    if (
      !obj.situationAttribution ||
      typeof obj.situationAttribution !== 'object' ||
      Array.isArray(obj.situationAttribution)
    ) {
      return { valid: false, reason: 'schema_invalid', error: "'situationAttribution' must be an object" };
    }
    const saObj = obj.situationAttribution as Record<string, unknown>;
    for (const k of Object.keys(saObj)) {
      if (!ALLOWED_SITUATION_ATTRIBUTION_KEYS.has(k)) {
        return {
          valid: false,
          reason: 'extra_keys',
          error: `Unauthorized key '${sanitizeModelText(k)}' in situationAttribution`,
        };
      }
    }
    if (typeof saObj.reasonCode !== 'string' || !VALID_REASON_CODES.has(saObj.reasonCode)) {
      if (rejectedReasonCodes.length < 10) {
        rejectedReasonCodes.push({
          field: 'situationAttribution.reasonCode',
          code: sanitizeReasonCodeForTelemetry(saObj.reasonCode),
        });
      }
    }
    if (saObj.explanation !== undefined) {
      if (typeof saObj.explanation !== 'string') {
        return {
          valid: false,
          reason: 'schema_invalid',
          error: 'situationAttribution.explanation must be a string',
        };
      }
      if (saObj.explanation.length > 0) {
        const validTimes = context?.validTimes ?? [];
        const validPlaces = context?.validPlaces ?? [];
        const check = validateFactsInWording(saObj.explanation, {
          times: validTimes,
          places: validPlaces,
        });
        if (!check.valid) {
          return {
            valid: false,
            reason: 'unlisted_fact_token',
            error: `situationAttribution explanation contains unlisted token: ${check.unlistedTokens.join(', ')}`,
          };
        }
      }
    }
  }

  if (rejectedReasonCodes.length > 0) {
    const capped = rejectedReasonCodes.slice(0, 10);
    return {
      valid: false,
      reason: 'invalid_reason_code',
      error: `Invalid reason code(s): ${capped.map(r => `${r.field}=${r.code}`).join(', ')}`,
      rejectedReasonCodes: capped,
    };
  }

  // 5. Fact check on explanation text (defense in depth)
  if (obj.explanation !== undefined) {
    if (typeof obj.explanation !== 'string') {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: "'explanation' must be a string",
      };
    }
    if (obj.explanation.length > 0) {
      const validTimes = context?.validTimes ?? [];
      const validPlaces = context?.validPlaces ?? [];
      const check = validateFactsInWording(obj.explanation, {
        times: validTimes,
        places: validPlaces,
      });
      if (!check.valid) {
        return {
          valid: false,
          reason: 'unlisted_fact_token',
          error: `Explanation contains unlisted token: ${check.unlistedTokens.join(', ')}`,
        };
      }
    }
  }

  // 6. Validate citedFactKeys (existence against knownFactKeys, always enforced)
  if (!Array.isArray(obj.citedFactKeys)) {
    return { valid: false, reason: 'schema_invalid', error: "'citedFactKeys' must be an array" };
  }
  const knownFactList =
    context?.knownFactKeys !== undefined
      ? context.knownFactKeys
      : (context?.confirmedFactKeys ?? []);
  const knownFactSet = new Set(knownFactList);
  for (const factKey of obj.citedFactKeys) {
    if (typeof factKey !== 'string') {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: "Items in 'citedFactKeys' must be strings",
      };
    }
    if (
      factKey === '__proto__' ||
      factKey === 'constructor' ||
      factKey === 'prototype' ||
      !knownFactSet.has(factKey)
    ) {
      return {
        valid: false,
        reason: 'unknown_fact_key',
        error: `Fact citation '${factKey}' not found in knownFactKeys`,
      };
    }
  }

  // 7. Validate situationAttribution fact citations & preference discipline
  if (obj.situationAttribution !== undefined) {
    const sa = obj.situationAttribution as Record<string, unknown>;
    if (sa.citedFactKeys !== undefined) {
      if (!Array.isArray(sa.citedFactKeys)) {
        return {
          valid: false,
          reason: 'schema_invalid',
          error: 'situationAttribution.citedFactKeys must be an array',
        };
      }
      for (const factKey of sa.citedFactKeys) {
        if (typeof factKey !== 'string') {
          return {
            valid: false,
            reason: 'schema_invalid',
            error: 'Items in situationAttribution.citedFactKeys must be strings',
          };
        }
        if (
          factKey === '__proto__' ||
          factKey === 'constructor' ||
          factKey === 'prototype' ||
          !knownFactSet.has(factKey)
        ) {
          return {
            valid: false,
            reason: 'unknown_fact_key',
            error: `situationAttribution fact citation '${factKey}' not found in knownFactKeys`,
          };
        }
      }
    }
  }

  // 8. Validate confirmed preference discipline:
  // matches_confirmed_preference (reason code or attribution) must require citedFactKeys
  // to be non-empty and a subset of confirmedFactKeys.
  // When SA carries its own citedFactKeys, those are subset-checked as well.
  const confirmedFactSet = new Set(context?.confirmedFactKeys ?? []);
  const hasConfirmedPrefReason = obj.reasonCodes.includes('matches_confirmed_preference');
  const sa =
    obj.situationAttribution &&
    typeof obj.situationAttribution === 'object' &&
    !Array.isArray(obj.situationAttribution)
      ? (obj.situationAttribution as Record<string, unknown>)
      : undefined;
  const saReasonCode = sa?.reasonCode;
  const hasConfirmedPrefAttribution = saReasonCode === 'matches_confirmed_preference';

  if (hasConfirmedPrefReason || hasConfirmedPrefAttribution) {
    if (obj.citedFactKeys.length === 0) {
      return {
        valid: false,
        reason: 'unconfirmed_fact_used',
        error: "Reason code 'matches_confirmed_preference' requires non-empty citedFactKeys",
      };
    }
    for (const factKey of obj.citedFactKeys) {
      if (!confirmedFactSet.has(factKey as string)) {
        return {
          valid: false,
          reason: 'unconfirmed_fact_used',
          error: `Reason code 'matches_confirmed_preference' requires all cited facts to be confirmed; '${factKey}' is unconfirmed`,
        };
      }
    }
    if (sa && Array.isArray(sa.citedFactKeys)) {
      if (sa.citedFactKeys.length === 0) {
        return {
          valid: false,
          reason: 'unconfirmed_fact_used',
          error: "situationAttribution with 'matches_confirmed_preference' requires non-empty citedFactKeys",
        };
      }
      for (const factKey of sa.citedFactKeys) {
        if (!confirmedFactSet.has(factKey as string)) {
          return {
            valid: false,
            reason: 'unconfirmed_fact_used',
            error: `situationAttribution requires all cited facts to be confirmed for 'matches_confirmed_preference'; '${factKey}' is unconfirmed`,
          };
        }
      }
    }
  }

  // 9. Validate citedSignalIds (fails closed when availableSignalIds is undefined or empty)
  if (!Array.isArray(obj.citedSignalIds)) {
    return { valid: false, reason: 'schema_invalid', error: "'citedSignalIds' must be an array" };
  }
  for (const sigId of obj.citedSignalIds) {
    if (typeof sigId !== 'string') {
      return {
        valid: false,
        reason: 'schema_invalid',
        error: "Items in 'citedSignalIds' must be strings",
      };
    }
    if (sigId === '__proto__' || sigId === 'constructor' || sigId === 'prototype') {
      return {
        valid: false,
        reason: 'unknown_signal_id',
        error: `Invalid signal citation '${sigId}'`,
      };
    }
  }
  if (obj.citedSignalIds.length > 0) {
    if (context?.availableSignalIds === undefined || context.availableSignalIds.length === 0) {
      return {
        valid: false,
        reason: 'unknown_signal_id',
        error: `Signal citation requires availableSignalIds to be provided and non-empty`,
      };
    }
    const allowedSignalSet = new Set(context.availableSignalIds);
    for (const sigId of obj.citedSignalIds) {
      if (!allowedSignalSet.has(sigId)) {
        return {
          valid: false,
          reason: 'unknown_signal_id',
          error: `Signal citation '${sigId}' not found in availableSignalIds`,
        };
      }
    }
  }

  // 10. Validate situationAttribution signal citation & evidence bundle resolution
  if (obj.situationAttribution !== undefined) {
    const saRec = obj.situationAttribution as Record<string, unknown>;
    if (typeof saRec.signalId !== 'string') {
      return { valid: false, reason: 'schema_invalid', error: 'situationAttribution.signalId must be a string' };
    }
    if (saRec.signalId === '__proto__' || saRec.signalId === 'constructor' || saRec.signalId === 'prototype') {
      return {
        valid: false,
        reason: 'unknown_signal_id',
        error: `situationAttribution signalId '${saRec.signalId}' is invalid`,
      };
    }
    if (context?.availableSignalIds === undefined || context.availableSignalIds.length === 0) {
      return {
        valid: false,
        reason: 'unknown_signal_id',
        error: `situationAttribution signalId '${saRec.signalId}' requires availableSignalIds to be provided and non-empty`,
      };
    }
    const allowedSignalSet = new Set(context.availableSignalIds);
    if (!allowedSignalSet.has(saRec.signalId)) {
      return {
        valid: false,
        reason: 'unknown_signal_id',
        error: `situationAttribution signalId '${saRec.signalId}' not in availableSignalIds`,
      };
    }
    if (context?.evidenceBundle && typeof context.evidenceBundle.getRecord === 'function') {
      const rec = context.evidenceBundle.getRecord(saRec.signalId);
      if (!rec) {
        return {
          valid: false,
          reason: 'unknown_signal_id',
          error: `situationAttribution signalId '${saRec.signalId}' not found in evidenceBundle`,
        };
      }
    }
  }

  // 11. Validate assistant reply (if present)
  if (obj.reply !== undefined) {
    const slots = (obj.slots as Record<string, unknown>) || {};
    const replyValidation = validateAssistantReply(
      obj.reply as string,
      {
        times: context?.validTimes ?? [],
        places: context?.validPlaces ?? [],
        distances: (context as any)?.suppliedDistances ?? [],
        ratings: (context as any)?.suppliedRatings ?? [],
        durations: (context as any)?.suppliedDurations ?? [],
        weather: (context as any)?.suppliedWeather ?? [],
        prices: (context as any)?.suppliedPrices ?? [],
      },
      typeof obj.intent === 'string' ? obj.intent : undefined,
      {
        intent: typeof obj.intent === 'string' ? (obj.intent as any) : undefined,
        deltaMinutes: typeof slots.deltaMinutes === 'number' ? slots.deltaMinutes : undefined,
        mode: typeof slots.mode === 'string' ? (slots.mode as any) : undefined,
      }
    );
    if (!replyValidation.valid) {
      return {
        valid: false,
        reason: replyValidation.reason || 'unlisted_fact_token',
        error: replyValidation.error || 'Invalid assistant reply',
      };
    }
  }

  return {
    valid: true,
    data: obj as unknown as DecisionCommandOutput,
  };
}
