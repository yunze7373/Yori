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
import type { AppliedAction } from '../../adapters/model/types.js';

export type CommandIntent =
  | 'LEAVE_LATER'
  | 'CHANGE_ROUTE'
  | 'FIND_LUNCH'
  | 'FIND_FUEL'
  | 'FIND_ESSENTIALS'
  | 'WHY'
  | 'ACCEPT'
  | 'UNDO'
  | 'UNSUPPORTED';

export type SupportedMode = 'drive' | 'bus';
export type SupportedLunchFilter = 'quieter' | 'vegetarian' | 'nearer';
export type SupportedEssentialCategory = 'supermarket' | 'convenience' | 'shopping_mall' | 'pharmacy';

export interface CommandSlotValues {
  readonly deltaMinutes?: number;
  readonly mode?: SupportedMode;
  readonly filters?: readonly SupportedLunchFilter[];
  readonly ambiguous?: boolean;
  readonly category?: SupportedEssentialCategory | string;
  readonly amenity?: string;
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
  readonly reply?: string;
  readonly honestAnswer?: string;
  readonly situationAttribution?: SituationAttribution;
  readonly recommendedOptionDelta?: number;
  readonly reasonCodes?: readonly ReasoningReasonCode[];
  readonly citedSignalIds?: readonly string[];
  readonly citedFactKeys?: readonly string[];
  readonly engineStatus?: EngineStatus;
  readonly fallbackReason?: string;
}

export interface CommandSuppliedFacts {
  readonly cardType?: string;
  readonly places?: readonly string[];
  readonly times?: readonly string[];
  readonly distances?: readonly string[];
  readonly ratings?: readonly string[];
  readonly openStatuses?: readonly string[];
  readonly weather?: string;
  readonly routes?: readonly string[];
  readonly habits?: readonly string[];
  readonly durations?: readonly string[];
  readonly prices?: readonly string[];
  readonly appliedAction?: AppliedAction;
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
  readonly suppliedFacts?: CommandSuppliedFacts;
}

export interface CommandInterpreter {
  interpret(input: string, context?: CommandInterpretationContext): InterpretedCommand;
}


const HONEST_CAPABILITY_GENERAL =
  "I can help adjust your departure plan ('Leave 15 minutes later', 'Take the bus'), find lunch spots ('Find a quieter vegetarian lunch spot'), find nearby fuel ('Find gas'), or find nearby essentials ('Supermarket nearby').";

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
      ) ||
      // D4: "why this restaurant/place/cafe?" and Chinese "为什么(推荐)这家" ask for the pick's reason.
      /^why\s+(?:this|that|the)\s+(?:restaurant|place|spot|cafe|one\s+for\s+lunch)$/i.test(normalized) ||
      /^为什么(?:推荐|选)?(?:这家|这个|它)/.test(rawText.trim())
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

    // 6b. D4: bare refinements of the lunch card ("closer", "quieter", "somewhere quiet", "closer to me", 近一点, 安静一点)
    if (/^(?:something\s+|somewhere\s+)?(?:closer|nearer)(?:\s+to\s+me)?(?:\s+please)?$/i.test(normalized) || /^(?:近一点|更近|再近一点)/.test(rawText.trim())) {
      return { intent: 'FIND_LUNCH', rawText, slots: { filters: ['nearer'] }, explanation: 'Finding lunch options matching nearer.' };
    }
    if (/^(?:something\s+|somewhere\s+)?(?:quieter|quiet)(?:\s+please)?$/i.test(normalized) || /^(?:安静一点|更安静)/.test(rawText.trim())) {
      return { intent: 'FIND_LUNCH', rawText, slots: { filters: ['quieter'] }, explanation: 'Finding lunch options matching quieter.' };
    }

    // 6a. D2: Chinese "food nearby" asks (附近吃什么 / 附近的餐厅 / 周边有什么好吃的) -> unfiltered FIND_LUNCH
    if (
      /(?:附近|周边|周围|旁边|这附近)[^。！？?!]{0,8}(?:吃|饭|餐|馆|美食)/.test(rawText) ||
      /(?:吃什么|吃点什么|去哪(?:里|儿)?吃|找(?:个|家)?(?:饭店|餐厅|饭馆|吃的))/.test(rawText)
    ) {
      return {
        intent: 'FIND_LUNCH',
        rawText,
        slots: {},
        explanation: 'Finding restaurants near you.',
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

    // 7. FIND_FUEL ('gas', 'find gas', '加油', 'gas station' per LIVING_CONTEXT_V2.md §10.3)
    const isExplicitFuel =
      /\b(?:gas|fuel|petrol)\b/i.test(normalized) ||
      /\b(?:gas\s*station|fuel\s*station|petrol\s*station|find\s+gas|get\s+gas|need\s+gas|where\s+is\s+gas)\b/i.test(
        normalized
      ) ||
      /(?:加油站|去加油|帮我找加油站|找加油站)/.test(rawText);

    const isChineseJiayou = /(?:^|\s)加油(?:\s|$|[!！。?？])/i.test(rawText.trim());

    if (isExplicitFuel || isChineseJiayou) {
      // Disambiguation check for "加油" (also means encouragement in Chinese)
      if (isChineseJiayou && !isExplicitFuel && !/(?:站|车|油箱)/.test(rawText)) {
        const hasTravelContext =
          context?.currentPlanIntent === 'depart' ||
          context?.currentPlanIntent === 'fuel' ||
          context?.sceneId === 'rain' ||
          context?.sceneId === 'clear' ||
          context?.sceneId === 'fuel';

        if (!hasTravelContext) {
          // Ambiguous: ask in needs-confirmation state instead of guessing
          return {
            intent: 'FIND_FUEL',
            rawText,
            slots: { ambiguous: true },
            honestAnswer: 'Did you mean: find a gas station?',
            explanation: 'Disambiguation needed: "加油" can mean encouragement or refueling.',
          };
        }
      }

      return {
        intent: 'FIND_FUEL',
        rawText,
        slots: { ambiguous: false },
        explanation: 'Finding nearby gas stations.',
      };
    }

    // 8. FIND_ESSENTIALS ('supermarket nearby', 'mall nearby', 'convenience store', 'pharmacy')
    const isSupermarket =
      /\b(?:supermarkets?|grocery|groceries|grocery\s+stores?)\b/i.test(normalized) ||
      /(?:超市|找超市|附近的超市|买菜)/.test(rawText);

    const isMall =
      /\b(?:shopping\s+malls?|malls?)\b/i.test(normalized) ||
      /(?:商场|购物中心|附近的商场)/.test(rawText);

    const isConvenience =
      /\b(?:convenience\s+stores?|convenience)\b/i.test(normalized) ||
      /(?:便利店|附近的便利店)/.test(rawText);

    const isPharmacy =
      /\b(?:pharmac(?:y|ies)|drugstores?|chemists?)\b/i.test(normalized) ||
      /(?:药店|药房|附近的药店)/.test(rawText);

    const isGenericEssentials =
      /\b(?:essentials?|nearby\s+essentials?|essentials?\s+nearby)\b/i.test(normalized) ||
      /(?:日常用品|附近的生活用品|生活必需品)/.test(rawText);

    if (isSupermarket || isMall || isConvenience || isPharmacy || isGenericEssentials) {
      let category: SupportedEssentialCategory = 'supermarket';
      let desc = 'supermarkets';
      if (isPharmacy) {
        category = 'pharmacy';
        desc = 'pharmacies';
      } else if (isConvenience) {
        category = 'convenience';
        desc = 'convenience stores';
      } else if (isMall) {
        category = 'shopping_mall';
        desc = 'shopping malls';
      } else if (isSupermarket || isGenericEssentials) {
        category = 'supermarket';
        desc = 'supermarkets';
      }

      return {
        intent: 'FIND_ESSENTIALS',
        rawText,
        slots: { category, amenity: category },
        explanation: `Finding nearby ${desc}.`,
      };
    }

    // 9. TOTAL PARSER FALLBACK -> UNSUPPORTED
    return {
      intent: 'UNSUPPORTED',
      rawText,
      slots: {},
      honestAnswer: HONEST_CAPABILITY_GENERAL,
    };
  }
}

export const defaultCommandInterpreter = new DeterministicCommandInterpreter();
