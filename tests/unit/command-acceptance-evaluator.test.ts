/**
 * Unit Tests for Command Acceptance Evaluator (S1-LIVE-3 / S1-CMD-RC)
 * Tests code-evaluated acceptance criteria:
 * - Accept (clean valid shift & refusal commands)
 * - Invalid reason code (schema validation / telemetry)
 * - Unknown intent (outside closed intent set)
 * - Invented fact key (citation not in confirmedFactKeys)
 * - Truncated response (finish_reason=length)
 * - Suppression violated (active user suppression bypassed)
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCommandAcceptance,
  COMMAND_PER_RUN_MAX_CALLS,
  MIN_COMMAND_LIVE_MAX_TOKENS,
  MIN_COMMAND_LIVE_TIMEOUT_MS,
  type CommandEvaluationContext,
} from '../../src/adapters/model/command-acceptance-evaluator.js';
import { CANONICAL_COMMAND_PROMPTS } from '../../scripts/live-verify-spark.js';

describe('Command Acceptance Evaluator (S1-LIVE-3)', () => {
  const baseContext: CommandEvaluationContext = {
    utterance: 'Can I leave later?',
    availableModes: ['drive', 'bus'],
    availableSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
    knownFactKeys: ['habit_rain_transit', 'prep_buffer_minutes'],
    confirmedFactKeys: ['habit_rain_transit', 'prep_buffer_minutes'],
    validTimes: ['2:45 PM'],
    validPlaces: ['Piano Studio'],
  };

  describe('Constant Invariants', () => {
    it('enforces COMMAND_PER_RUN_MAX_CALLS <= 6', () => {
      expect(COMMAND_PER_RUN_MAX_CALLS).toBe(6);
    });

    it('enforces MIN_COMMAND_LIVE_MAX_TOKENS >= 4096', () => {
      expect(MIN_COMMAND_LIVE_MAX_TOKENS).toBe(4096);
    });

    it('enforces MIN_COMMAND_LIVE_TIMEOUT_MS >= 20000', () => {
      expect(MIN_COMMAND_LIVE_TIMEOUT_MS).toBe(20000);
    });

    it('has exactly 6 canonical command prompts matching S1-LIVE-3 budget', () => {
      expect(CANONICAL_COMMAND_PROMPTS).toHaveLength(6);
    });

    it('each canonical prompt defines expectedIntent and valid properties', () => {
      for (const p of CANONICAL_COMMAND_PROMPTS) {
        expect(p.expectedIntent).toBeDefined();
        expect(p.utterance).toBeTruthy();
        expect(p.evalContext.expectedIntent).toBe(p.expectedIntent);
      }
    });

    it('prompt 2 specifies deltaMinutes 15 for leave later', () => {
      expect(CANONICAL_COMMAND_PROMPTS[1]!.expectedIntent).toBe('LEAVE_LATER');
      expect(CANONICAL_COMMAND_PROMPTS[1]!.expectedSlots?.deltaMinutes).toBe(15);
    });
  });

  describe('Test Case 1: Accept (Positive Acceptance)', () => {
    it('accepts clean valid shift command with valid signals and confirmed citations', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted', 'time_critical'],
        situationAttribution: {
          signalId: 'weather:2026-10-28T20:35:00.000Z',
          reasonCode: 'weather_adjusted',
          explanation: 'Piano Studio depart at 2:45 PM',
          citedFactKeys: ['habit_rain_transit'],
        },
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(true);
      expect(outcome.failureReason).toBeUndefined();
      expect(outcome.error).toBeUndefined();
      expect(outcome.audit).toEqual({
        closedIntent: true,
        intentMatchesExpectation: true,
        slotsMatchExpectation: true,
        validReasonCodes: true,
        factKeyParity: true,
        stopFinishReason: true,
        suppressionHonoured: true,
      });
      expect(outcome.details?.intent).toBe('LEAVE_LATER');
      expect(outcome.details?.finishReason).toBe('stop');
    });

    it('accepts clean out-of-scope refusal returning UNSUPPORTED', () => {
      const result = {
        intent: 'UNSUPPORTED',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: [],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Book a flight to Hawaii',
        },
      });

      expect(outcome.accepted).toBe(true);
      expect(outcome.audit.closedIntent).toBe(true);
      expect(outcome.audit.suppressionHonoured).toBe(true);
    });
  });

  describe('Test Case 2: Invalid Reason Code (Fail-Closed)', () => {
    it('rejects unknown reason code in reasonCodes array', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: {},
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted', 'nonexistent_invented_code'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invalid_reason_code');
      expect(outcome.error).toContain('Invalid reason code');
      expect(outcome.audit.validReasonCodes).toBe(false);
    });

    it('rejects uppercase reason code without case-folding (WEATHER_ADJUSTED)', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: {},
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['WEATHER_ADJUSTED'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invalid_reason_code');
      expect(outcome.audit.validReasonCodes).toBe(false);
    });

    it('rejects invalid reason code in situationAttribution', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: {},
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
        situationAttribution: {
          signalId: 'weather:2026-10-28T20:35:00.000Z',
          reasonCode: 'bad_sa_code',
        },
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invalid_reason_code');
      expect(outcome.audit.validReasonCodes).toBe(false);
    });

    it('rejects call when proxy fallback carries rejectedReasonCodes telemetry', () => {
      const outcome = evaluateCommandAcceptance({
        result: null,
        usedFallback: true,
        fallbackReason: 'invalid_reason_code',
        rejectedReasonCodes: [{ field: 'reasonCodes[0]', code: 'unregistered_reason' }],
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invalid_reason_code');
      expect(outcome.error).toContain('unregistered_reason');
      expect(outcome.audit.validReasonCodes).toBe(false);
    });
  });

  describe('Test Case 3: Unknown Intent (Outside Closed Intent Set)', () => {
    it('rejects intent outside closed set (e.g. BOOK_FLIGHT)', () => {
      const result = {
        intent: 'BOOK_FLIGHT',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: [],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('out_of_set_intent');
      expect(outcome.error).toContain('BOOK_FLIGHT');
      expect(outcome.audit.closedIntent).toBe(false);
    });

    it('rejects proxy fallback due to out_of_set_intent', () => {
      const outcome = evaluateCommandAcceptance({
        result: null,
        usedFallback: true,
        fallbackReason: 'out_of_set_intent',
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('out_of_set_intent');
      expect(outcome.audit.closedIntent).toBe(false);
    });
  });

  describe('Test Case 4: Invented Fact Key (Fact-Key Parity)', () => {
    it('rejects fact key cited in citedFactKeys that is not in confirmedFactKeys', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit', 'invented_unconfirmed_key_xyz'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invented_fact_key');
      expect(outcome.error).toContain('invented_unconfirmed_key_xyz');
      expect(outcome.audit.factKeyParity).toBe(false);
    });

    it('rejects unconfirmed fact cited in situationAttribution.citedFactKeys', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: {},
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
        situationAttribution: {
          signalId: 'weather:2026-10-28T20:35:00.000Z',
          reasonCode: 'weather_adjusted',
          citedFactKeys: ['hallucinated_memory_fact'],
        },
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invented_fact_key');
      expect(outcome.error).toContain('hallucinated_memory_fact');
      expect(outcome.audit.factKeyParity).toBe(false);
    });

    it('rejects matches_confirmed_preference when citedFactKeys is empty', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: {},
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: [],
        reasonCodes: ['matches_confirmed_preference'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('invented_fact_key');
      expect(outcome.audit.factKeyParity).toBe(false);
    });
  });

  describe('Test Case 5: Truncated Response (finish_reason=length)', () => {
    it('rejects response with finishReason="length"', () => {
      const outcome = evaluateCommandAcceptance({
        result: { intent: 'LEAVE_LATER', slots: {} },
        usedFallback: false,
        finishReason: 'length',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('truncated');
      expect(outcome.error).toContain('finish_reason: "length"');
      expect(outcome.audit.stopFinishReason).toBe(false);
    });

    it('rejects proxy fallback with fallbackReason="truncated"', () => {
      const outcome = evaluateCommandAcceptance({
        result: null,
        usedFallback: true,
        fallbackReason: 'truncated',
        finishReason: 'length',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('truncated');
      expect(outcome.audit.stopFinishReason).toBe(false);
    });
  });

  describe('Test Case 6: Suppression Violated', () => {
    it('rejects recommendation when target intent is actively suppressed by user', () => {
      const result = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['vegetarian'] },
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          activeSuppressions: [
            {
              code: 'user_suppressed',
              targetIntent: 'lunch',
              scope: 'today',
              reason: 'User dismissed lunch for today',
            },
          ],
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('suppression_violated');
      expect(outcome.error).toContain('actively suppressed');
      expect(outcome.audit.suppressionHonoured).toBe(false);
    });

    it('rejects active recommendation when command requested dismissal of current plan', () => {
      const result = {
        intent: 'FIND_LUNCH',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: "Don't suggest lunch today",
          currentPlanIntent: 'lunch',
          isDismissalOrSuppression: true,
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('suppression_violated');
      expect(outcome.audit.suppressionHonoured).toBe(false);
    });
  });

  describe('Test Case 7: Schema Invalid / General Fallback', () => {
    it('rejects null result with schema_invalid', () => {
      const outcome = evaluateCommandAcceptance({
        result: null,
        usedFallback: false,
        finishReason: 'stop',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('schema_invalid');
    });

    it('maps disabled proxy fallback reason accurately', () => {
      const outcome = evaluateCommandAcceptance({
        result: null,
        usedFallback: true,
        fallbackReason: 'disabled',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('disabled');
    });
  });

  describe('Test Case 8: Missing or Non-Stop Finish Reason', () => {
    it('rejects non-fallback response with missing finish reason', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: undefined,
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('missing_finish_reason');
      expect(outcome.error).toContain('Missing finish_reason');
      expect(outcome.audit.stopFinishReason).toBe(false);
    });

    it('rejects non-fallback response with non-stop finish reason (e.g. content_filter)', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'content_filter',
        context: baseContext,
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('truncated');
      expect(outcome.error).toContain('content_filter');
      expect(outcome.audit.stopFinishReason).toBe(false);
    });
  });

  describe('Test Case 9: Prompt Intent Correspondence (wrong_intent)', () => {
    it('rejects adversarial prompt when out-of-scope prompt returns LEAVE_LATER instead of UNSUPPORTED', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Book a flight to Hawaii for next weekend',
          expectedIntent: 'UNSUPPORTED',
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_intent');
      expect(outcome.error).toContain('does not match expected intent "UNSUPPORTED"');
      expect(outcome.audit.intentMatchesExpectation).toBe(false);
    });

    it('rejects shift prompt when model returns FIND_LUNCH instead of LEAVE_LATER', () => {
      const result = {
        intent: 'FIND_LUNCH',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Can I leave later?',
          expectedIntent: 'LEAVE_LATER',
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_intent');
      expect(outcome.audit.intentMatchesExpectation).toBe(false);
    });

    it('rejects disallowed intent when model returns suppressed intent', () => {
      const result = {
        intent: 'FIND_LUNCH',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'I already ate lunch today, do not suggest lunch',
          disallowedIntents: ['FIND_LUNCH'],
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_intent');
      expect(outcome.audit.intentMatchesExpectation).toBe(false);
      expect(outcome.audit.suppressionHonoured).toBe(false);
    });

    it('rejects intent when not contained in allowedIntents whitelist', () => {
      const result = {
        intent: 'FIND_FUEL',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Change the plan',
          allowedIntents: ['LEAVE_LATER', 'UNDO'],
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_intent');
      expect(outcome.audit.intentMatchesExpectation).toBe(false);
    });
  });

  describe('Test Case 10: Slot Constraints Correspondence (wrong_slots)', () => {
    it('rejects mode mismatch when expected mode is bus but received drive', () => {
      const result = {
        intent: 'CHANGE_ROUTE',
        slots: { mode: 'drive' },
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['traffic_avoidance'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Take the bus instead',
          expectedIntent: 'CHANGE_ROUTE',
          expectedSlots: { mode: 'bus' },
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_slots');
      expect(outcome.error).toContain('Slot "mode" was "drive", expected "bus"');
      expect(outcome.audit.slotsMatchExpectation).toBe(false);
    });

    it('rejects deltaMinutes mismatch when expected deltaMinutes is 15 but received 30', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 30 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Leave 15 minutes later',
          expectedIntent: 'LEAVE_LATER',
          expectedSlots: { deltaMinutes: 15 },
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_slots');
      expect(outcome.error).toContain('Slot "deltaMinutes" was "30", expected "15"');
      expect(outcome.audit.slotsMatchExpectation).toBe(false);
    });

    it('rejects filter mismatch when expected filter is missing', () => {
      const result = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['vegan'] },
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Find vegetarian food',
          expectedIntent: 'FIND_LUNCH',
          expectedSlots: { filters: ['vegetarian'] },
        },
      });

      expect(outcome.accepted).toBe(false);
      expect(outcome.failureReason).toBe('wrong_slots');
      expect(outcome.error).toContain('Expected filter "vegetarian" missing');
      expect(outcome.audit.slotsMatchExpectation).toBe(false);
    });

    it('accepts matching slots for mode and deltaMinutes', () => {
      const result = {
        intent: 'LEAVE_LATER',
        slots: { deltaMinutes: 15 },
        citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        citedFactKeys: ['habit_rain_transit'],
        reasonCodes: ['weather_adjusted'],
      };

      const outcome = evaluateCommandAcceptance({
        result,
        usedFallback: false,
        finishReason: 'stop',
        context: {
          ...baseContext,
          utterance: 'Leave 15 minutes later',
          expectedIntent: 'LEAVE_LATER',
          expectedSlots: { deltaMinutes: 15 },
        },
      });

      expect(outcome.accepted).toBe(true);
      expect(outcome.audit.intentMatchesExpectation).toBe(true);
      expect(outcome.audit.slotsMatchExpectation).toBe(true);
    });
  });
});
