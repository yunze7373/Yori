/**
 * Closed Command Grammar & Deterministic Command Interpreter (V2a-1)
 * Governed by LIVING_CONTEXT_V2.md §3 and §8 D3/D4/D5.
 *
 * Implements a total, deterministic closed English grammar:
 * - LEAVE_LATER ('Can I leave later?', 'Leave 15 minutes later')
 * - CHANGE_ROUTE ('Take the bus', 'Change route to driving')
 * - WHY ('Why?', 'Why this one?')
 * - ACCEPT ('Looks good', 'Confirm')
 * - UNDO ('Undo', 'Revert')
 * - UNSUPPORTED (Honest capability answers; total mapping for any unrecognized utterance)
 *
 * Invariants:
 * - Total parser: every string maps to exactly one CommandIntent.
 * - Unknown slots / modes map to UNSUPPORTED with honest explanations.
 * - FIND_LUNCH is V2b and FIND_FUEL is V5-FUEL; both cleanly map to UNSUPPORTED.
 */

import type { ReasoningReasonCode } from '../../adapters/model/reasoning.js';
import type { EngineStatus } from '../../adapters/model/decision-log.js';

export type CommandIntent =
  | 'LEAVE_LATER'
  | 'CHANGE_ROUTE'
  | 'FIND_LUNCH'
  | 'WHY'
  | 'ACCEPT'
  | 'UNDO'
  | 'UNSUPPORTED';

export type SupportedMode = 'drive' | 'bus';
export type SupportedLunchFilter = 'quieter' | 'vegetarian' | 'nearer';

export interface CommandSlotValues {
  readonly deltaMinutes?: number;
  readonly mode?: SupportedMode;
  readonly filters?: readonly SupportedLunchFilter[];
}

export interface SituationAttribution {
  readonly signalId: string;
  readonly reasonCode: ReasoningReasonCode;
  readonly explanation?: string;
  readonly citedFactKeys?: readonly string[];
}

export interface InterpretedCommand {
  readonly intent: CommandIntent;
  readonly rawText: string;
  readonly slots: CommandSlotValues;
  readonly explanation?: string;
  readonly honestAnswer?: string;
  readonly situationAttribution?: SituationAttribution;
  readonly recommendedOptionDelta?: number;
  readonly reasonCodes?: readonly ReasoningReasonCode[];
  readonly citedSignalIds?: readonly string[];
  readonly citedFactKeys?: readonly string[];
  readonly engineStatus?: EngineStatus;
}

export interface CommandInterpretationContext {
  readonly availableModes?: readonly string[];
  readonly currentPlanIntent?: string;
  readonly availableSignalIds?: readonly string[];
  readonly knownFactKeys?: readonly string[];
  readonly confirmedFactKeys?: readonly string[];
  readonly validTimes?: readonly string[];
  readonly validPlaces?: readonly string[];
  readonly sceneId?: string;
  readonly evidenceBundle?: { getRecord(id: string): unknown; hasRecord?(id: string): boolean } | null;
}

export interface CommandInterpreter {
  interpret(input: string, context?: CommandInterpretationContext): InterpretedCommand;
}


const HONEST_CAPABILITY_GENERAL =
  "I can help adjust your departure plan ('Leave 15 minutes later', 'Take the bus') or find lunch spots ('Find a quieter vegetarian lunch spot', 'Find lunch nearby'). You can also ask 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.";

const HONEST_FUEL_DEFERRED =
  "Finding fuel or charging stops arrives in V5-FUEL. For this offline demo, I can help you adjust departure times or switch route options.";

const LUNCH_STOP_WORDS: ReadonlySet<string> = new Set([
  'find', 'me', 'a', 'an', 'the', 'spot', 'spots', 'place', 'places',
  'for', 'to', 'eat', 'eating', 'food', 'lunch', 'restaurant', 'restaurants',
  'options', 'and', 'with', 'in', 'around', 'here', 'can', 'i', 'get', 'have',
  'some', 'where', 'is', 'what', 'are', 'please', 'show', 'suggest', 'recommend',
  'go', 'at', 'dining', 'spot?'
]);

/**
 * Clean and normalize raw input string for deterministic pattern matching.
 */
function normalizeInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, '') // strip trailing punctuation
    .replace(/\s+/g, ' ');
}

export class DeterministicCommandInterpreter implements CommandInterpreter {
  public interpret(input: string, context?: CommandInterpretationContext): InterpretedCommand {
    const rawText = input;
    const normalized = normalizeInput(input);

    if (!normalized) {
      return {
        intent: 'UNSUPPORTED',
        rawText,
        slots: {},
        honestAnswer: HONEST_CAPABILITY_GENERAL,
      };
    }

    if (/\b(?:gas|fuel|charging|charge|station)\b/i.test(normalized)) {
      return {
        intent: 'UNSUPPORTED',
        rawText,
        slots: {},
        honestAnswer: HONEST_FUEL_DEFERRED,
      };
    }

    // 1. ACCEPT ('Looks good', 'Accept', 'Confirm', 'Ok', etc.)
    if (
      /^(?:looks\s+good(?:\s+to\s+me)?|accept|confirm|sounds\s+good|lgtm|ok|okay|yes|keep\s+it|keep\s+current(?:\s+departure|\s+plan)?|keep\s+departure)$/i.test(
        normalized
      )
    ) {
      return {
        intent: 'ACCEPT',
        rawText,
        slots: {},
        explanation: 'Confirmed and accepted plan.',
      };
    }

    // 2. UNDO ('Undo', 'Revert', 'Go back', etc.)
    if (/^(?:undo|revert|go\s+back|cancel(?:\s+change)?|reset(?:\s+plan)?)$/i.test(normalized)) {
      return {
        intent: 'UNDO',
        rawText,
        slots: {},
        explanation: 'Restoring prior plan state.',
      };
    }

    // 3. WHY ('Why?', 'Why this one?', 'Why this plan?')
    if (
      /^(?:why|why\s+this\s+one|why\s+this\s+plan|why\s+this\s+route|why\s+so\s+early|explain(?:\s+this|\s+why)?|how\s+was\s+this\s+calculated)$/i.test(
        normalized
      )
    ) {
      return {
        intent: 'WHY',
        rawText,
        slots: {},
        explanation: 'Opening Why derivation for the current plan.',
      };
    }

    // 4. LEAVE_LATER ('Can I leave later?', 'Leave 15 minutes later', etc.)
    // Matches patterns with explicit minutes or generic "leave later"
    const leaveLaterExplicitMatch = normalized.match(
      /^(?:can\s+i\s+)?(?:leave|depart)\s+(\d+)\s*(?:m|min|mins|minutes)?\s+later$/i
    );
    const leaveLaterByMatch = normalized.match(
      /^(?:can\s+i\s+)?(?:delay|push\s+back|postpone|shift)\s+(?:leave|departure|depart)?\s*(?:by\s+)?(\d+)\s*(?:m|min|mins|minutes)?$/i
    );
    const leaveLaterGenericMatch = normalized.match(
      /^(?:can\s+i\s+)?(?:leave|depart)\s+later$/i
    );

    if (leaveLaterExplicitMatch || leaveLaterByMatch) {
      const numStr = (leaveLaterExplicitMatch ?? leaveLaterByMatch)![1]!;
      const parsedDelta = parseInt(numStr, 10);
      if (Number.isFinite(parsedDelta) && parsedDelta > 0 && parsedDelta <= 240) {
        return {
          intent: 'LEAVE_LATER',
          rawText,
          slots: { deltaMinutes: parsedDelta },
          explanation: `Compare leaving ${parsedDelta} minutes later.`,
        };
      }
    }

    if (leaveLaterGenericMatch) {
      return {
        intent: 'LEAVE_LATER',
        rawText,
        slots: {},
        explanation: 'Comparing departure options for leaving later.',
      };
    }

    // 5. CHANGE_ROUTE ('Take the bus', 'Change route to driving', 'Take driving', etc.)
    const busMatch = /^(?:take\s+(?:the\s+)?bus|switch\s+to\s+bus|change\s+route\s+to\s+bus|use\s+bus|bus\s+instead)$/i.test(
      normalized
    );
    const driveMatch = /^(?:take\s+(?:the\s+)?(?:car|drive|driving)|switch\s+to\s+(?:drive|driving)|change\s+route\s+to\s+(?:drive|driving)|use\s+car|drive\s+instead)$/i.test(
      normalized
    );

    // Unsupported modes check (e.g. walk, train, bike, taxi, flight)
    const unsupportedModeMatch = normalized.match(
      /^(?:take\s+(?:the\s+)?|switch\s+to\s+|change\s+route\s+to\s+|use\s+)(walk|walking|train|transit|subway|metro|bike|bicycle|cycling|taxi|uber|lyft|helicopter|flight|plane)(?:\s+instead)?$/i
    );
    if (unsupportedModeMatch) {
      const requested = unsupportedModeMatch[1]!;
      const availableStr = context?.availableModes?.length
        ? `Available modes for this trip: ${context.availableModes.join(', ')}.`
        : 'Available modes: drive, bus.';
      return {
        intent: 'UNSUPPORTED',
        rawText,
        slots: {},
        honestAnswer: `The route mode "${requested}" is not available in fixture data. ${availableStr}`,
      };
    }

    if (busMatch || driveMatch) {
      const mode: SupportedMode = busMatch ? 'bus' : 'drive';

      // Check mode existence in current plan options if context provided
      if (context?.availableModes && !context.availableModes.includes(mode)) {
        return {
          intent: 'UNSUPPORTED',
          rawText,
          slots: {},
          honestAnswer: `Mode "${mode}" is not available in the current plan. Available modes: ${context.availableModes.join(', ')}.`,
        };
      }

      return {
        intent: 'CHANGE_ROUTE',
        rawText,
        slots: { mode },
        explanation: `Switch primary travel mode to ${mode}.`,
      };
    }

    // 6. FIND_LUNCH ('Find a quieter vegetarian lunch spot', 'Find lunch nearby', 'quieter + vegetarian')
    const isLunchQuery =
      /\b(?:lunch|restaurant|restaurants|cafe|food|eat|dining|vegetarian|quieter)\b/i.test(normalized) ||
      /\b(?:quieter\s*\+\s*vegetarian|vegetarian\s*\+\s*quieter)\b/i.test(normalized) ||
      /^(?:quiet\s+place(?:\s+for\s+lunch)?|quieter\s+place)$/i.test(normalized);

    if (isLunchQuery) {
      // Split tokens on whitespace, commas, +, &
      const rawTokens = normalized
        .replace(/[+&/,]+/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const filtersSet = new Set<SupportedLunchFilter>();
      const unsupportedFilters: string[] = [];

      for (const token of rawTokens) {
        if (token === 'quieter' || token === 'quiet') {
          filtersSet.add('quieter');
        } else if (token === 'vegetarian' || token === 'veggie' || token === 'vegan') {
          filtersSet.add('vegetarian');
        } else if (token === 'nearer' || token === 'nearby' || token === 'close' || token === 'closer' || token === 'near') {
          filtersSet.add('nearer');
        } else if (LUNCH_STOP_WORDS.has(token)) {
          // Allowed structural / stop words
          continue;
        } else {
          unsupportedFilters.push(token);
        }
      }

      if (unsupportedFilters.length > 0) {
        return {
          intent: 'UNSUPPORTED',
          rawText,
          slots: {},
          honestAnswer: `The filter "${unsupportedFilters[0]}" is not supported in this offline demo. Supported lunch filters: quieter, vegetarian, nearer.`,
        };
      }

      const filters = Array.from(filtersSet);
      const filterDesc = filters.length > 0 ? filters.join(' and ') : 'lunch';

      return {
        intent: 'FIND_LUNCH',
        rawText,
        slots: { filters: filters.length > 0 ? filters : undefined },
        explanation: `Finding lunch options matching ${filterDesc}.`,
      };
    }

    // 7. TOTAL PARSER FALLBACK -> UNSUPPORTED
    return {
      intent: 'UNSUPPORTED',
      rawText,
      slots: {},
      honestAnswer: HONEST_CAPABILITY_GENERAL,
    };
  }
}

export const defaultCommandInterpreter = new DeterministicCommandInterpreter();
