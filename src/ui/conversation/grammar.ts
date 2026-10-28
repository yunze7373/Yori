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

export type CommandIntent =
  | 'LEAVE_LATER'
  | 'CHANGE_ROUTE'
  | 'WHY'
  | 'ACCEPT'
  | 'UNDO'
  | 'UNSUPPORTED';

export type SupportedMode = 'drive' | 'bus';

export interface CommandSlotValues {
  readonly deltaMinutes?: number;
  readonly mode?: SupportedMode;
}

export interface InterpretedCommand {
  readonly intent: CommandIntent;
  readonly rawText: string;
  readonly slots: CommandSlotValues;
  readonly explanation?: string;
  readonly honestAnswer?: string;
}

export interface CommandInterpretationContext {
  readonly availableModes?: readonly string[];
  readonly currentPlanIntent?: string;
}

export interface CommandInterpreter {
  interpret(input: string, context?: CommandInterpretationContext): InterpretedCommand;
}


const HONEST_CAPABILITY_GENERAL =
  "I can help adjust your departure plan: ask 'Can I leave 15 minutes later?', 'Take the bus', 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.";

const HONEST_LUNCH_DEFERRED =
  "Finding lunch spots arrives in the next update (V2b). For this offline demo, I can help you adjust departure times ('Leave 15 minutes later') or switch route options ('Take the bus').";

const HONEST_FUEL_DEFERRED =
  "Finding fuel or charging stops arrives in V5-FUEL. For this offline demo, I can help you adjust departure times or switch route options.";

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

    // Explicit deferred intents (V2b lunch, V5 fuel)
    if (/\b(?:lunch|restaurant|vegetarian|cafe|food|eat|dinner)\b/i.test(normalized)) {
      return {
        intent: 'UNSUPPORTED',
        rawText,
        slots: {},
        honestAnswer: HONEST_LUNCH_DEFERRED,
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
      /^(?:looks\s+good(?:\s+to\s+me)?|accept|confirm|sounds\s+good|lgtm|ok|okay|yes|keep\s+it)$/i.test(
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

    // 6. TOTAL PARSER FALLBACK -> UNSUPPORTED
    return {
      intent: 'UNSUPPORTED',
      rawText,
      slots: {},
      honestAnswer: HONEST_CAPABILITY_GENERAL,
    };
  }
}

export const defaultCommandInterpreter = new DeterministicCommandInterpreter();
