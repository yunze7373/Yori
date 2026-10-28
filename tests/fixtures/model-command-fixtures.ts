/**
 * Scripted Model Decision Command Fixtures (V2a-2, Condition C6)
 * Governed by LIVING_CONTEXT_V2.md §9 R1 and conditions C6/C7.
 *
 * All fixtures are completely offline and deterministic with zero live API calls.
 * Used for scripted fixture testing ('Scripted model fixture · not a live model call')
 * and fault injection testing.
 */

import type { ReasoningReasonCode } from '../../src/adapters/model/reasoning.js';
import type { CommandIntent, SupportedMode, SupportedLunchFilter } from '../../src/ui/conversation/grammar.js';

export interface ModelCommandDecisionOutput {
  readonly intent: CommandIntent;
  readonly slots: {
    readonly deltaMinutes?: number;
    readonly mode?: SupportedMode;
    readonly filters?: readonly SupportedLunchFilter[];
  };
  readonly situationAttribution?: {
    readonly signalId: string;
    readonly reasonCode: ReasoningReasonCode;
    readonly explanation?: string;
  };
  readonly recommendedOptionDelta?: number;
  readonly citedSignalIds: readonly string[];
  readonly citedFactKeys: readonly string[];
  readonly reasonCodes: readonly ReasoningReasonCode[];
  readonly explanation?: string;
}

/**
 * 1. Leave Later (generic): "Can I leave later?"
 * Situation attribution: Rain signal cited, reason code 'weather_adjusted'.
 * Recommends latest on-time departure option (+5m, 0m buffer) with 'time_critical'.
 */
export const FIXTURE_CMD_LEAVE_LATER_GENERIC: ModelCommandDecisionOutput = {
  intent: 'LEAVE_LATER',
  slots: {},
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'weather_adjusted',
    explanation: 'Rain forecast requires adjusted travel buffer and departure options.',
  },
  recommendedOptionDelta: 5,
  citedSignalIds: [
    'weather:2026-10-28T20:35:00.000Z',
    'calendar:2026-10-28T17:00:00.000Z',
  ],
  citedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
  reasonCodes: ['weather_adjusted', 'time_critical'],
  explanation: 'Departure options compared with rain travel buffer.',
};

/**
 * 2. Leave 15 minutes later (explicit): "Can I leave 15 minutes later?"
 * Situation attribution: Rain forecast cited with weather_adjusted.
 */
export const FIXTURE_CMD_LEAVE_15_MIN: ModelCommandDecisionOutput = {
  intent: 'LEAVE_LATER',
  slots: {
    deltaMinutes: 15,
  },
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'weather_adjusted',
    explanation: 'Departure shifted 15 minutes later with rain buffer applied.',
  },
  citedSignalIds: [
    'weather:2026-10-28T20:35:00.000Z',
    'calendar:2026-10-28T17:00:00.000Z',
  ],
  citedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
  reasonCodes: ['weather_adjusted', 'time_critical'],
  explanation: 'Shift departure 15 minutes later for this time only.',
};

/**
 * 3. Change Route: "Take the bus"
 * Situation attribution: Rain forecast cited, preference matches habit.
 */
export const FIXTURE_CMD_CHANGE_ROUTE_BUS: ModelCommandDecisionOutput = {
  intent: 'CHANGE_ROUTE',
  slots: {
    mode: 'bus',
  },
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'weather_adjusted',
    explanation: 'Transit option selected under rain forecast.',
  },
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: ['rain_transport_preference'],
  reasonCodes: ['weather_adjusted', 'matches_confirmed_preference'],
  explanation: 'Switch travel mode to bus.',
};

/**
 * 4. Change Route: "Drive instead"
 */
export const FIXTURE_CMD_CHANGE_ROUTE_DRIVE: ModelCommandDecisionOutput = {
  intent: 'CHANGE_ROUTE',
  slots: {
    mode: 'drive',
  },
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'shorter_trip',
    explanation: 'Direct driving route selected.',
  },
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: ['rain_transport_preference'],
  reasonCodes: ['shorter_trip', 'matches_confirmed_preference'],
  explanation: 'Switch travel mode to drive.',
};

/**
 * 5. Confirm / Accept: "Looks good"
 */
export const FIXTURE_CMD_ACCEPT: ModelCommandDecisionOutput = {
  intent: 'ACCEPT',
  slots: {},
  citedSignalIds: ['calendar:2026-10-28T17:00:00.000Z'],
  citedFactKeys: [],
  reasonCodes: ['time_critical'],
  explanation: 'Plan confirmed for this time only.',
};

/**
 * 6. Undo: "Undo"
 */
export const FIXTURE_CMD_UNDO: ModelCommandDecisionOutput = {
  intent: 'UNDO',
  slots: {},
  citedSignalIds: [],
  citedFactKeys: [],
  reasonCodes: [],
  explanation: 'Restoring prior plan state.',
};

/**
 * 7. Why: "Why?"
 */
export const FIXTURE_CMD_WHY: ModelCommandDecisionOutput = {
  intent: 'WHY',
  slots: {},
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'weather_adjusted',
    explanation: 'Weather forecast updated to rain.',
  },
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: ['rain_transport_preference'],
  reasonCodes: ['weather_adjusted'],
  explanation: 'Why derivation for current rain plan.',
};

/**
 * 8. Find Lunch (generic): "Find a lunch spot"
 */
export const FIXTURE_CMD_FIND_LUNCH_GENERIC: ModelCommandDecisionOutput = {
  intent: 'FIND_LUNCH',
  slots: {},
  situationAttribution: {
    signalId: 'mock_places:2026-10-28T19:10:00.000Z',
    reasonCode: 'free_window_fit',
    explanation: 'Lunch window identified away from home.',
  },
  citedSignalIds: [
    'mock_places:2026-10-28T19:10:00.000Z',
    'location_status:2026-10-28T19:10:00.000Z',
  ],
  citedFactKeys: [],
  reasonCodes: ['free_window_fit'],
  explanation: 'Candidate places ranked for lunch.',
};

/**
 * 9. Find Lunch (quieter + vegetarian): "Find a quieter vegetarian lunch spot" / "quieter + vegetarian"
 */
export const FIXTURE_CMD_FIND_LUNCH_QUIET_VEG: ModelCommandDecisionOutput = {
  intent: 'FIND_LUNCH',
  slots: {
    filters: ['quieter', 'vegetarian'],
  },
  situationAttribution: {
    signalId: 'mock_places:2026-10-28T19:10:00.000Z',
    reasonCode: 'free_window_fit',
    explanation: 'Prioritizing quiet atmosphere and vegetarian options.',
  },
  citedSignalIds: [
    'mock_places:2026-10-28T19:10:00.000Z',
    'location_status:2026-10-28T19:10:00.000Z',
  ],
  citedFactKeys: [],
  reasonCodes: ['free_window_fit', 'shorter_trip'],
  explanation: 'Candidate places filtered by quiet atmosphere and vegetarian options.',
};

/**
 * 10. Find Lunch (nearby): "Find lunch nearby"
 */
export const FIXTURE_CMD_FIND_LUNCH_NEARBY: ModelCommandDecisionOutput = {
  intent: 'FIND_LUNCH',
  slots: {
    filters: ['nearer'],
  },
  situationAttribution: {
    signalId: 'mock_places:2026-10-28T19:10:00.000Z',
    reasonCode: 'shorter_trip',
    explanation: 'Prioritizing closest walking distance.',
  },
  citedSignalIds: [
    'mock_places:2026-10-28T19:10:00.000Z',
    'location_status:2026-10-28T19:10:00.000Z',
  ],
  citedFactKeys: [],
  reasonCodes: ['shorter_trip', 'free_window_fit'],
  explanation: 'Candidate places ranked by closest distance.',
};

/**
 * 11. Find Lunch (vegetarian): "Find vegetarian lunch"
 */
export const FIXTURE_CMD_FIND_LUNCH_VEGETARIAN: ModelCommandDecisionOutput = {
  intent: 'FIND_LUNCH',
  slots: {
    filters: ['vegetarian'],
  },
  situationAttribution: {
    signalId: 'mock_places:2026-10-28T19:10:00.000Z',
    reasonCode: 'free_window_fit',
    explanation: 'Prioritizing vegetarian options.',
  },
  citedSignalIds: [
    'mock_places:2026-10-28T19:10:00.000Z',
    'location_status:2026-10-28T19:10:00.000Z',
  ],
  citedFactKeys: [],
  reasonCodes: ['free_window_fit'],
  explanation: 'Candidate places filtered by vegetarian options.',
};

/**
 * 12. Find Lunch (quieter): "Quiet place for lunch"
 */
export const FIXTURE_CMD_FIND_LUNCH_QUIET: ModelCommandDecisionOutput = {
  intent: 'FIND_LUNCH',
  slots: {
    filters: ['quieter'],
  },
  situationAttribution: {
    signalId: 'mock_places:2026-10-28T19:10:00.000Z',
    reasonCode: 'free_window_fit',
    explanation: 'Prioritizing quiet atmosphere.',
  },
  citedSignalIds: [
    'mock_places:2026-10-28T19:10:00.000Z',
    'location_status:2026-10-28T19:10:00.000Z',
  ],
  citedFactKeys: [],
  reasonCodes: ['free_window_fit'],
  explanation: 'Candidate places filtered by quiet atmosphere.',
};

// ============================================================================
// Fault Injection Fixtures (for negative / robustness testing)
// ============================================================================

/**
 * Fault 1: Out-of-set intent (e.g. BOOK_FLIGHT).
 * Model output must be rejected and fall back to deterministic UNSUPPORTED.
 */
export const FIXTURE_FAULT_OUT_OF_SET_INTENT: any = {
  intent: 'BOOK_FLIGHT',
  slots: {},
  citedSignalIds: [],
  citedFactKeys: [],
  reasonCodes: [],
};

/**
 * Fault 2: Uncited signal ID.
 * Model output cites a signal not in availableSignalIds.
 */
export const FIXTURE_FAULT_UNCITED_SIGNAL: ModelCommandDecisionOutput = {
  intent: 'LEAVE_LATER',
  slots: { deltaMinutes: 10 },
  citedSignalIds: ['unknown_signal_nonexistent_xyz'],
  citedFactKeys: [],
  reasonCodes: ['time_critical'],
};

/**
 * Fault 3: Uncited fact key.
 * Model output cites a memory fact key not in confirmedFactKeys.
 */
export const FIXTURE_FAULT_UNCITED_FACT: ModelCommandDecisionOutput = {
  intent: 'LEAVE_LATER',
  slots: {},
  situationAttribution: {
    signalId: 'weather:2026-10-28T20:35:00.000Z',
    reasonCode: 'weather_adjusted',
  },
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: ['unconfirmed_secret_fact_xyz'],
  reasonCodes: ['weather_adjusted'],
};

/**
 * Fault 4: Invalid / hallucinated reason code.
 */
export const FIXTURE_FAULT_INVALID_REASON_CODE: any = {
  intent: 'LEAVE_LATER',
  slots: {},
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: [],
  reasonCodes: ['invented_hallucinated_reason_code'],
};

/**
 * Fault 5: Invented time token in explanation.
 */
export const FIXTURE_FAULT_INVENTED_TIME: ModelCommandDecisionOutput = {
  intent: 'LEAVE_LATER',
  slots: {},
  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
  citedFactKeys: [],
  reasonCodes: ['weather_adjusted'],
  explanation: 'Departure scheduled for 7:45 PM to avoid rush hour.',
};

/**
 * Fault 6: Malformed schema (missing required fields).
 */
export const FIXTURE_FAULT_SCHEMA_INVALID: any = {
  intent: 'LEAVE_LATER',
  // missing slots, citedSignalIds, citedFactKeys, reasonCodes
};
