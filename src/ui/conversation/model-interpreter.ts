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
} from '../../adapters/model/reasoning.js';
import { validateFactsInWording } from '../../adapters/model/fact-checker.js';
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

const CLOSED_INTENTS: ReadonlySet<string> = new Set([
  'LEAVE_LATER',
  'CHANGE_ROUTE',
  'FIND_LUNCH',
  'WHY',
  'ACCEPT',
  'UNDO',
  'UNSUPPORTED',
]);

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
};

function normalizeKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

export class ModelCommandInterpreter implements CommandInterpreter {
  private readonly mode: ModelInterpreterMode;
  private readonly fixtures: Record<string, ModelCommandDecisionOutput>;
  private readonly fallbackInterpreter: CommandInterpreter;
  private readonly logger: DecisionLogger;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: ModelInterpreterOptions = {}) {
    this.mode = options.mode ?? 'scripted_fixture';
    this.fixtures = options.fixtures ?? DEFAULT_RECORDED_FIXTURES;
    this.fallbackInterpreter = options.fallbackInterpreter ?? defaultCommandInterpreter;
    this.logger = options.logger ?? globalDecisionLogger;
    this.endpoint = options.endpoint ?? '/api/model/command';
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  /**
   * Validate model decision output against strict schema and citations.
   */
  public validateDecisionOutput(
    raw: unknown,
    context?: CommandInterpretationContext
  ): { valid: true; output: ModelCommandDecisionOutput } | { valid: false; reason: string; error: string } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, reason: 'schema_invalid', error: 'Output must be a non-null JSON object' };
    }

    const obj = raw as Record<string, unknown>;

    // 1. Intent must be in the closed set
    if (typeof obj.intent !== 'string' || !CLOSED_INTENTS.has(obj.intent)) {
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
    if (slots.mode !== undefined) {
      if (slots.mode !== 'drive' && slots.mode !== 'bus') {
        return { valid: false, reason: 'schema_invalid', error: `Unsupported mode '${String(slots.mode)}'` };
      }
      if (context?.availableModes && !context.availableModes.includes(slots.mode as string)) {
        return { valid: false, reason: 'unknown_mode', error: `Mode '${slots.mode}' not in available modes` };
      }
    }
    if (slots.deltaMinutes !== undefined) {
      if (typeof slots.deltaMinutes !== 'number' || slots.deltaMinutes <= 0 || slots.deltaMinutes > 240) {
        return { valid: false, reason: 'schema_invalid', error: `Invalid deltaMinutes '${String(slots.deltaMinutes)}'` };
      }
    }
    if (slots.filters !== undefined) {
      if (!Array.isArray(slots.filters)) {
        return { valid: false, reason: 'schema_invalid', error: "'filters' must be an array" };
      }
      const allowedFilters = new Set(['quieter', 'vegetarian', 'nearer']);
      for (const f of slots.filters) {
        if (typeof f !== 'string' || !allowedFilters.has(f)) {
          return { valid: false, reason: 'unknown_filter', error: `Unsupported filter '${String(f)}'` };
        }
      }
    }

    // 3. Validate citedSignalIds
    if (!Array.isArray(obj.citedSignalIds)) {
      return { valid: false, reason: 'schema_invalid', error: "'citedSignalIds' must be an array" };
    }
    if (context?.availableSignalIds && context.availableSignalIds.length > 0) {
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

    // 4. Validate citedFactKeys
    if (!Array.isArray(obj.citedFactKeys)) {
      return { valid: false, reason: 'schema_invalid', error: "'citedFactKeys' must be an array" };
    }
    if (context?.confirmedFactKeys && context.confirmedFactKeys.length > 0) {
      const allowedFactSet = new Set(context.confirmedFactKeys);
      for (const factKey of obj.citedFactKeys) {
        if (!allowedFactSet.has(factKey)) {
          return {
            valid: false,
            reason: 'unknown_fact_key',
            error: `Fact citation '${factKey}' not found in confirmedFactKeys`,
          };
        }
      }
    }

    // 5. Validate reasonCodes
    if (!Array.isArray(obj.reasonCodes)) {
      return { valid: false, reason: 'schema_invalid', error: "'reasonCodes' must be an array" };
    }
    for (const code of obj.reasonCodes) {
      if (typeof code !== 'string' || !VALID_REASON_CODES.has(code)) {
        return {
          valid: false,
          reason: 'invalid_reason_code',
          error: `Reason code '${String(code)}' is not in VALID_REASON_CODES`,
        };
      }
      if (code === 'matches_confirmed_preference') {
        const hasConfirmed = context?.confirmedFactKeys && context.confirmedFactKeys.length > 0;
        if (!hasConfirmed) {
          return {
            valid: false,
            reason: 'unconfirmed_fact_used',
            error: "Reason code 'matches_confirmed_preference' requires confirmed facts in context",
          };
        }
      }
    }

    // 6. Validate situationAttribution if present
    if (obj.situationAttribution !== undefined) {
      if (
        !obj.situationAttribution ||
        typeof obj.situationAttribution !== 'object' ||
        Array.isArray(obj.situationAttribution)
      ) {
        return { valid: false, reason: 'schema_invalid', error: "'situationAttribution' must be an object" };
      }
      const sa = obj.situationAttribution as Record<string, unknown>;
      if (typeof sa.signalId !== 'string') {
        return { valid: false, reason: 'schema_invalid', error: 'situationAttribution.signalId must be a string' };
      }
      if (context?.availableSignalIds && context.availableSignalIds.length > 0) {
        if (!context.availableSignalIds.includes(sa.signalId)) {
          return {
            valid: false,
            reason: 'unknown_signal_id',
            error: `situationAttribution signalId '${sa.signalId}' not in availableSignalIds`,
          };
        }
      }
      if (typeof sa.reasonCode !== 'string' || !VALID_REASON_CODES.has(sa.reasonCode)) {
        return {
          valid: false,
          reason: 'invalid_reason_code',
          error: `situationAttribution reasonCode '${String(sa.reasonCode)}' is not valid`,
        };
      }
      if (sa.reasonCode === 'matches_confirmed_preference') {
        const hasConfirmed = context?.confirmedFactKeys && context.confirmedFactKeys.length > 0;
        if (!hasConfirmed) {
          return {
            valid: false,
            reason: 'unconfirmed_fact_used',
            error: "situationAttribution reasonCode 'matches_confirmed_preference' requires confirmed facts in context",
          };
        }
      }
    }

    // 7. Fact check on explanation text (defense in depth)
    if (typeof obj.explanation === 'string' && obj.explanation.length > 0) {
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
      // Discard invalid / uncited output to deterministic fallback (C7)
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: [],
        outputIntent: undefined,
        validationResult: {
          valid: false,
          reason: validation.reason,
          error: validation.error,
        },
        engineStatus: 'offline_deterministic',
      });
      return {
        ...deterministic,
        engineStatus: 'offline_deterministic',
      };
    }

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
    if (this.mode !== 'live') {
      return this.interpret(input, context);
    }

    const now = new Date().toISOString();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
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
            confirmedFactKeys: context?.confirmedFactKeys ?? [],
            validTimes: context?.validTimes ?? [],
            validPlaces: context?.validPlaces ?? [],
            currentPlanIntent: context?.currentPlanIntent,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
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

      return {
        intent: out.intent,
        rawText: input,
        slots: out.slots,
        explanation: out.explanation,
        situationAttribution,
        recommendedOptionDelta: out.recommendedOptionDelta,
        reasonCodes: out.reasonCodes,
        citedSignalIds: out.citedSignalIds,
        citedFactKeys: out.citedFactKeys,
        engineStatus: 'meta_model_live',
      };
    } catch (err: unknown) {
      // Discard to deterministic fallback on any error, timeout, or 500
      const deterministic = this.fallbackInterpreter.interpret(input, context);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const reason = isTimeout ? 'timeout' : 'error';
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.logger.log({
        timestamp: now,
        templateId: 'decision_command',
        inputSignalIds: context?.availableSignalIds ?? [],
        inputFactKeys: context?.confirmedFactKeys ?? [],
        outputReasonCodes: [],
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
      };
    }
  }
}

export const defaultModelCommandInterpreter = new ModelCommandInterpreter({
  mode: 'scripted_fixture',
});
