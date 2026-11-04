/**
 * ModelCommandInterpreter (V2a-2, Condition C5, C6 & C7)
 * Governed by LIVING_CONTEXT_V2.md §9 R1 and conditions C6/C7.
 *
 * Implements the CommandInterpreter seam:
 * - Maps utterances to the closed intent set and slots, validated against schema.
 * - Enforces situation attribution with enumerated reason codes over signal IDs.
 * - Candidate selection/ranking among preparer-produced options with enumerated reason codes.
 * - Strict schema validation and fact-checker: model NEVER originates facts/times/places.
 * - Uncited or unsupported output is discarded to deterministic grammar fallback.
 * - Records all decisions to the Redacted Decision Log (C7).
 * - Tracks engine status: 'Meta model · live' vs 'Recorded model output · replay' vs 'Offline fallback · deterministic' (C6).
 */

import {
  type CommandInterpreter,
  type CommandInterpretationContext,
  type InterpretedCommand,
  defaultCommandInterpreter,
} from './grammar.js';
import {
  type DecisionLogger,
  type EngineStatus,
  globalDecisionLogger,
} from '../../adapters/model/decision-log.js';
import {
  VALID_REASON_CODES,
  sanitizeReasonCodeForTelemetry,
  sanitizeModelText,
  type RejectedReasonCodeTelemetry,
  ALLOWED_DECISION_COMMAND_TOP_KEYS,
  ALLOWED_DECISION_COMMAND_SLOT_KEYS,
  ALLOWED_SITUATION_ATTRIBUTION_KEYS,
  CLOSED_DECISION_INTENTS,
} from '../../adapters/model/reasoning.js';

export { CLOSED_DECISION_INTENTS, CLOSED_DECISION_INTENTS as CLOSED_INTENTS } from '../../adapters/model/reasoning.js';
import { validateFactsInWording, validateAssistantReply } from '../../adapters/model/fact-checker.js';
import {
  DEFAULT_LIVE_MODEL_TIMEOUT_MS,
  MIN_MODEL_TIMEOUT_MS,
  MAX_MODEL_TIMEOUT_MS,
  resolveModelTimeoutMs,
  resolveCandidatesTimeoutMs,
} from '../../adapters/model/timeout-config.js';

export {
  DEFAULT_LIVE_MODEL_TIMEOUT_MS,
  MIN_MODEL_TIMEOUT_MS,
  MAX_MODEL_TIMEOUT_MS,
  resolveModelTimeoutMs,
  resolveCandidatesTimeoutMs,
};
import {
  type ModelCommandDecisionOutput,
  FIXTURE_CMD_LEAVE_LATER_GENERIC,
  FIXTURE_CMD_LEAVE_15_MIN,
  FIXTURE_CMD_CHANGE_ROUTE_BUS,
  FIXTURE_CMD_CHANGE_ROUTE_DRIVE,
  FIXTURE_CMD_ACCEPT,
  FIXTURE_CMD_UNDO,
  FIXTURE_CMD_WHY,
  FIXTURE_CMD_FIND_LUNCH_GENERIC,
  FIXTURE_CMD_FIND_LUNCH_QUIET_VEG,
  FIXTURE_CMD_FIND_LUNCH_NEARBY,
  FIXTURE_CMD_FIND_LUNCH_VEGETARIAN,
  FIXTURE_CMD_FIND_LUNCH_QUIET,
} from '../../../tests/fixtures/model-command-fixtures.js';

export type ModelInterpreterMode =
  | 'live'
  | 'recorded_replay'
  | 'scripted_fixture'
  | 'replay'
  | 'offline';

export interface ModelInterpreterOptions {
  readonly mode?: ModelInterpreterMode;
  readonly fixtures?: Record<string, ModelCommandDecisionOutput>;
  readonly fallbackInterpreter?: CommandInterpreter;
  readonly logger?: DecisionLogger;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

const DEFAULT_RECORDED_FIXTURES: Record<string, ModelCommandDecisionOutput> = {
  'can i leave later': FIXTURE_CMD_LEAVE_LATER_GENERIC,
  'leave later': FIXTURE_CMD_LEAVE_LATER_GENERIC,
  'can i leave 15 minutes later': FIXTURE_CMD_LEAVE_15_MIN,
  'can i leave 15 min later': FIXTURE_CMD_LEAVE_15_MIN,
  'leave 15 minutes later': FIXTURE_CMD_LEAVE_15_MIN,
  'leave 15 min later': FIXTURE_CMD_LEAVE_15_MIN,
  'take the bus': FIXTURE_CMD_CHANGE_ROUTE_BUS,
  'switch to bus': FIXTURE_CMD_CHANGE_ROUTE_BUS,
  'bus instead': FIXTURE_CMD_CHANGE_ROUTE_BUS,
  'drive instead': FIXTURE_CMD_CHANGE_ROUTE_DRIVE,
  'take the car': FIXTURE_CMD_CHANGE_ROUTE_DRIVE,
  'looks good': FIXTURE_CMD_ACCEPT,
  'confirm': FIXTURE_CMD_ACCEPT,
  'accept': FIXTURE_CMD_ACCEPT,
  'undo': FIXTURE_CMD_UNDO,
  'revert': FIXTURE_CMD_UNDO,
  'why': FIXTURE_CMD_WHY,
  'why this plan': FIXTURE_CMD_WHY,
  'why this one': FIXTURE_CMD_WHY,
  'find lunch': FIXTURE_CMD_FIND_LUNCH_GENERIC,
  'find a lunch spot': FIXTURE_CMD_FIND_LUNCH_GENERIC,
  'find a quieter vegetarian lunch spot': FIXTURE_CMD_FIND_LUNCH_QUIET_VEG,
  'quieter + vegetarian': FIXTURE_CMD_FIND_LUNCH_QUIET_VEG,
  'quieter vegetarian': FIXTURE_CMD_FIND_LUNCH_QUIET_VEG,
  'find lunch nearby': FIXTURE_CMD_FIND_LUNCH_NEARBY,
  'lunch nearby': FIXTURE_CMD_FIND_LUNCH_NEARBY,
  'find vegetarian lunch': FIXTURE_CMD_FIND_LUNCH_VEGETARIAN,
  'vegetarian lunch': FIXTURE_CMD_FIND_LUNCH_VEGETARIAN,
  'quiet place for lunch': FIXTURE_CMD_FIND_LUNCH_QUIET,
  'quiet lunch': FIXTURE_CMD_FIND_LUNCH_QUIET,
  'quieter lunch': FIXTURE_CMD_FIND_LUNCH_QUIET,
  'quieter': FIXTURE_CMD_FIND_LUNCH_QUIET,
  'vegetarian': FIXTURE_CMD_FIND_LUNCH_VEGETARIAN,
  'closer': FIXTURE_CMD_FIND_LUNCH_NEARBY,
  'nearer': FIXTURE_CMD_FIND_LUNCH_NEARBY,
  'closer lunch': FIXTURE_CMD_FIND_LUNCH_NEARBY,
};

function normalizeKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

export class ModelCommandInterpreter implements CommandInterpreter {
  private mode: ModelInterpreterMode;
  private readonly fixtures: Record<string, ModelCommandDecisionOutput>;
  private readonly fallbackInterpreter: CommandInterpreter;
  private readonly logger: DecisionLogger;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private consecutiveFailures = 0;
  private isPaused = false;
  private activeAbortController: AbortController | null = null;

  constructor(options: ModelInterpreterOptions = {}) {
    this.mode = options.mode ?? 'scripted_fixture';
    this.fixtures = options.fixtures ?? DEFAULT_RECORDED_FIXTURES;
    this.fallbackInterpreter = options.fallbackInterpreter ?? defaultCommandInterpreter;
    this.logger = options.logger ?? globalDecisionLogger;
    this.endpoint = options.endpoint ?? '/api/model/command';
    const envVal =
      typeof process !== 'undefined' && process.env?.MODEL_TIMEOUT_MS
        ? process.env.MODEL_TIMEOUT_MS
        : undefined;
    this.timeoutMs = options.timeoutMs !== undefined
      ? resolveModelTimeoutMs(options.timeoutMs, MAX_MODEL_TIMEOUT_MS)
      : resolveCandidatesTimeoutMs(envVal);
  }

  public isLiveMode(): boolean {
    return this.mode === 'live';
  }

  public setMode(mode: ModelInterpreterMode): void {
    this.mode = mode;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public isInFlight(): boolean {
    return this.activeAbortController !== null;
  }

  public cancelInFlight(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  public isModelPaused(): boolean {
    return this.isPaused;
  }

  public resetPause(): void {
    this.isPaused = false;
    this.consecutiveFailures = 0;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Validate model decision output against strict schema and citations.
   */
  public validateDecisionOutput(
    raw: unknown,
    context?: CommandInterpretationContext
  ):
    | { valid: true; output: ModelCommandDecisionOutput }
    | {
        valid: false;
        reason: string;
        error: string;
        rejectedReasonCodes?: readonly RejectedReasonCodeTelemetry[];
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
      const replyValidation = validateAssistantReply(
        obj.reply as string,
        {
          times: context?.validTimes ?? [],
          places: context?.validPlaces ?? [],
          distances: context?.suppliedFacts?.distances ?? [],
          ratings: context?.suppliedFacts?.ratings ?? [],
          durations: context?.suppliedFacts?.durations ?? [],
          weather: context?.suppliedFacts?.weather ? [context.suppliedFacts.weather] : [],
          routes: context?.availableModes ?? context?.suppliedFacts?.routes ?? [],
          openStatuses: context?.suppliedFacts?.openStatuses ?? [],
          habits: context?.suppliedFacts?.habits ?? [],
          prices: context?.suppliedFacts?.prices ?? [],
        },
        typeof obj.intent === 'string' ? (obj.intent as string) : undefined,
        context?.suppliedFacts?.appliedAction ?? {
          intent: typeof obj.intent === 'string' ? (obj.intent as any) : undefined,
          deltaMinutes: typeof slots.deltaMinutes === 'number' ? slots.deltaMinutes : undefined,
          mode: typeof slots.mode === 'string' ? (slots.mode as any) : undefined,
        }
      );
      if (!replyValidation.valid) {
        return {
          valid: false,
          reason: (replyValidation.reason as any) || 'unlisted_fact_token',
          error: replyValidation.error || 'Invalid assistant reply',
        };
      }
    }

    return {
      valid: true,
      output: obj as unknown as ModelCommandDecisionOutput,
    };
  }

  /**
   * Synchronous interpretation:
   * Uses recorded fixtures when in 'replay' mode, or deterministic fallback if in 'offline' mode
   * or when output is invalid/uncited.
   */
  public interpret(input: string, context?: CommandInterpretationContext): InterpretedCommand {
    const rawText = input;
    const key = normalizeKey(input);
    const now = new Date().toISOString();

    // G4 Breaker: If model is paused, stop calling model and fall back to deterministic directly
    if (this.isPaused) {
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

    // Mode: Offline fallback directly
    if (this.mode === 'offline') {
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: [],
        outputIntent: deterministic.intent,
        validationResult: { valid: true, reason: 'offline_mode' },
        engineStatus: 'offline_deterministic',
      });
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

    // Mode: Replay from recorded fixtures
    const candidateFixture = this.fixtures[key];

    if (!candidateFixture) {
      // No recorded fixture matches: gracefully fall back to deterministic grammar
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: [],
        outputIntent: deterministic.intent,
        validationResult: { valid: true, reason: 'unmatched_fixture_fallback' },
        engineStatus: 'offline_deterministic',
      });
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

    // Validate the fixture against schema, closed intent, and citations
    const validation = this.validateDecisionOutput(candidateFixture, context);

    if (!validation.valid) {
      this.consecutiveFailures++;
      const reachedPauseThreshold = this.consecutiveFailures >= 3;
      if (reachedPauseThreshold && !this.isPaused) {
        this.isPaused = true;
      }

      // Discard invalid / uncited output to deterministic fallback (C7)
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: reachedPauseThreshold ? ['model_paused'] : [],
        outputIntent: undefined,
        validationResult: {
          valid: false,
          reason: reachedPauseThreshold ? 'model_paused' : validation.reason,
          error: reachedPauseThreshold ? 'model paused' : validation.error,
        },
        engineStatus: 'offline_deterministic',
      });
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

    // Valid fixture: reset consecutive failure counter
    this.consecutiveFailures = 0;

    // Valid fixture: emit truthfully according to mode ('scripted_fixture' vs 'recorded_model_replay')
    const out = validation.output;
    const engineStatus: EngineStatus =
      this.mode === 'recorded_replay' ? 'recorded_model_replay' : 'scripted_fixture';

    this.logger.log({
      timestamp: now,
      templateId: 'decision_command',
      inputSignalIds: context?.availableSignalIds ?? [],
      inputFactKeys: context?.confirmedFactKeys ?? [],
      outputReasonCodes: out.reasonCodes,
      outputIntent: out.intent,
      validationResult: { valid: true },
      engineStatus,
    });

    const situationAttribution = out.situationAttribution
      ? {
          ...out.situationAttribution,
          citedFactKeys: out.citedFactKeys,
        }
      : undefined;

    return {
      intent: out.intent,
      rawText,
      slots: out.slots,
      explanation: out.explanation,
      reply: out.reply,
      situationAttribution,
      recommendedOptionDelta: out.recommendedOptionDelta,
      reasonCodes: out.reasonCodes,
      citedSignalIds: out.citedSignalIds,
      citedFactKeys: out.citedFactKeys,
      engineStatus,
    };
  }

  /**
   * Asynchronous interpretation via ModelDevProxy or recorded fallback.
   */
  public async interpretAsync(
    input: string,
    context?: CommandInterpretationContext
  ): Promise<InterpretedCommand> {
    if (this.isPaused) {
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

    if (this.mode !== 'live') {
      return this.interpret(input, context);
    }

    const now = new Date().toISOString();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      this.activeAbortController = controller;
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'decision_command',
          facts: {
            utterance: input,
            availableModes: context?.availableModes ?? ['drive', 'bus'],
            availableSignalIds: context?.availableSignalIds ?? [],
            knownFactKeys: context?.knownFactKeys ?? [],
            confirmedFactKeys: context?.confirmedFactKeys ?? [],
            validTimes: context?.validTimes ?? [],
            validPlaces: context?.validPlaces ?? [],
            currentPlanIntent: context?.currentPlanIntent,
            cardType: context?.suppliedFacts?.cardType,
            suppliedPlaces: context?.suppliedFacts?.places ?? context?.validPlaces ?? [],
            suppliedTimes: context?.suppliedFacts?.times ?? context?.validTimes ?? [],
            suppliedDistances: context?.suppliedFacts?.distances ?? [],
            suppliedRatings: context?.suppliedFacts?.ratings ?? [],
            suppliedOpenStatuses: context?.suppliedFacts?.openStatuses ?? [],
            suppliedWeather: context?.suppliedFacts?.weather,
            suppliedHabits: context?.suppliedFacts?.habits ?? [],
            distances: context?.suppliedFacts?.distances ?? [],
            ratings: context?.suppliedFacts?.ratings ?? [],
            openStatuses: context?.suppliedFacts?.openStatuses ?? [],
            weather: context?.suppliedFacts?.weather,
            habits: context?.suppliedFacts?.habits ?? [],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.activeAbortController = null;
      const latencyMs = Date.now() - startTime;

      if (!resp.ok) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }

      const body = (await resp.json()) as {
        result?: unknown;
        usedFallback?: boolean;
        fallbackReason?: string;
      };

      if (body.usedFallback || !body.result) {
        throw new Error(body.fallbackReason ?? 'Model used fallback');
      }

      const validation = this.validateDecisionOutput(body.result, context);
      if (!validation.valid) {
        throw new Error(`Model validation failed: ${validation.error}`);
      }

      const out = validation.output;
      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: out.reasonCodes,
        outputIntent: out.intent,
        validationResult: { valid: true },
        engineStatus: 'meta_model_live',
        latencyMs,
      });

      const situationAttribution = out.situationAttribution
        ? {
            ...out.situationAttribution,
            citedFactKeys: out.citedFactKeys,
          }
        : undefined;

      this.consecutiveFailures = 0;
      return {
        intent: out.intent,
        rawText: input,
        slots: out.slots,
        explanation: out.explanation,
        reply: out.reply,
        situationAttribution,
        recommendedOptionDelta: out.recommendedOptionDelta,
        reasonCodes: out.reasonCodes,
        citedSignalIds: out.citedSignalIds,
        citedFactKeys: out.citedFactKeys,
        engineStatus: 'meta_model_live',
      };
    } catch (err: unknown) {
      this.activeAbortController = null;
      this.consecutiveFailures++;
      const reachedPauseThreshold = this.consecutiveFailures >= 3;
      if (reachedPauseThreshold && !this.isPaused) {
        this.isPaused = true;
      }

      // Discard to deterministic fallback on any error, timeout, or 500
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const isValidationFail = err instanceof Error && err.message.startsWith('Model validation failed');
      const reason = reachedPauseThreshold
        ? 'model_paused'
        : isTimeout
        ? 'timeout'
        : isValidationFail
        ? 'validation_failed'
        : 'error';
      const errorMsg = reachedPauseThreshold ? 'model paused' : (err instanceof Error ? err.message : String(err));

      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: reachedPauseThreshold ? ['model_paused'] : [],
        outputIntent: deterministic.intent,
        validationResult: {
          valid: false,
          reason,
          error: errorMsg,
        },
        engineStatus: 'offline_deterministic',
      });

      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
        fallbackReason: reason,
      };
    }
  }
}

export const defaultModelCommandInterpreter = new ModelCommandInterpreter({
  mode: 'scripted_fixture',
});
