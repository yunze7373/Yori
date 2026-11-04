/**
 * Closed Command Grammar Unit Tests (V2a-1)
 * Tests total parsing, every intent row, slot extraction, and unsupported fallbacks.
 */

import { describe, it, expect } from 'vitest';
import {
  DeterministicCommandInterpreter,
} from './grammar.js';

describe('Closed Command Grammar & Total Parser (LIVING_CONTEXT_V2.md §3)', () => {
  const interpreter = new DeterministicCommandInterpreter();

  describe('LEAVE_LATER Intent', () => {
    it("interprets 'Can I leave later?' without explicit delta (comparison mode)", () => {
      const res = interpreter.interpret('Can I leave later?');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBeUndefined();
    });

    it("interprets 'leave later' (case-insensitive) without explicit delta", () => {
      const res = interpreter.interpret('LEAVE LATER');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBeUndefined();
    });

    it("interprets explicit 'Leave 15 minutes later'", () => {
      const res = interpreter.interpret('Leave 15 minutes later');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(15);
    });

    it("interprets explicit 'Can I leave 10 minutes later?'", () => {
      const res = interpreter.interpret('Can I leave 10 minutes later?');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(10);
    });

    it("interprets shorthand 'leave 20 min later'", () => {
      const res = interpreter.interpret('leave 20 min later');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(20);
    });

    it("interprets 'delay departure by 5 minutes'", () => {
      const res = interpreter.interpret('delay departure by 5 minutes');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(5);
    });
  });

  describe('CHANGE_ROUTE Intent', () => {
    it("interprets 'Take the bus'", () => {
      const res = interpreter.interpret('Take the bus');
      expect(res.intent).toBe('CHANGE_ROUTE');
      expect(res.slots.mode).toBe('bus');
    });

    it("interprets 'take bus'", () => {
      const res = interpreter.interpret('take bus');
      expect(res.intent).toBe('CHANGE_ROUTE');
      expect(res.slots.mode).toBe('bus');
    });

    it("interprets 'switch to bus'", () => {
      const res = interpreter.interpret('switch to bus');
      expect(res.intent).toBe('CHANGE_ROUTE');
      expect(res.slots.mode).toBe('bus');
    });

    it("interprets 'Change route to driving'", () => {
      const res = interpreter.interpret('Change route to driving');
      expect(res.intent).toBe('CHANGE_ROUTE');
      expect(res.slots.mode).toBe('drive');
    });

    it("interprets 'drive instead'", () => {
      const res = interpreter.interpret('drive instead');
      expect(res.intent).toBe('CHANGE_ROUTE');
      expect(res.slots.mode).toBe('drive');
    });

    it('rejects mode not available in context plan options', () => {
      const res = interpreter.interpret('Take the bus', {
        availableModes: ['drive'], // bus is not available
      });
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('Mode "bus" is not available in the current plan');
    });

    it('rejects unsupported transit modes with honest answer (unknown slots map to UNSUPPORTED)', () => {
      const res = interpreter.interpret('Take the train');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('The route mode "train" is not available in fixture data');
    });

    it('rejects flight / helicopter with honest answer', () => {
      const res = interpreter.interpret('Take helicopter');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('The route mode "helicopter" is not available in fixture data');
    });
  });

  describe('WHY Intent', () => {
    it("interprets 'Why?'", () => {
      const res = interpreter.interpret('Why?');
      expect(res.intent).toBe('WHY');
    });

    it("interprets 'Why this one?'", () => {
      const res = interpreter.interpret('Why this one?');
      expect(res.intent).toBe('WHY');
    });

    it("interprets 'Why this plan'", () => {
      const res = interpreter.interpret('Why this plan');
      expect(res.intent).toBe('WHY');
    });

    it("interprets 'explain this'", () => {
      const res = interpreter.interpret('explain this');
      expect(res.intent).toBe('WHY');
    });
  });

  describe('ACCEPT Intent', () => {
    it("interprets 'Looks good'", () => {
      const res = interpreter.interpret('Looks good');
      expect(res.intent).toBe('ACCEPT');
    });

    it("interprets 'Accept'", () => {
      const res = interpreter.interpret('Accept');
      expect(res.intent).toBe('ACCEPT');
    });

    it("interprets 'confirm'", () => {
      const res = interpreter.interpret('confirm');
      expect(res.intent).toBe('ACCEPT');
    });

    it("interprets 'ok'", () => {
      const res = interpreter.interpret('ok');
      expect(res.intent).toBe('ACCEPT');
    });
  });

  describe('UNDO Intent', () => {
    it("interprets 'Undo'", () => {
      const res = interpreter.interpret('Undo');
      expect(res.intent).toBe('UNDO');
    });

    it("interprets 'revert'", () => {
      const res = interpreter.interpret('revert');
      expect(res.intent).toBe('UNDO');
    });

    it("interprets 'go back'", () => {
      const res = interpreter.interpret('go back');
      expect(res.intent).toBe('UNDO');
    });
  });

  describe('FIND_LUNCH Intent (V2b)', () => {
    it("interprets 'Find a quieter vegetarian lunch spot' with quieter and vegetarian filters", () => {
      const res = interpreter.interpret('Find a quieter vegetarian lunch spot');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toEqual(expect.arrayContaining(['quieter', 'vegetarian']));
      expect(res.slots.filters).toHaveLength(2);
    });

    it("interprets 'quieter + vegetarian' shorthand", () => {
      const res = interpreter.interpret('quieter + vegetarian');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toEqual(expect.arrayContaining(['quieter', 'vegetarian']));
      expect(res.slots.filters).toHaveLength(2);
    });

    it("interprets 'Find lunch nearby' with nearer filter", () => {
      const res = interpreter.interpret('Find lunch nearby');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toEqual(['nearer']);
    });

    it("interprets 'Quiet place for lunch' with quieter filter", () => {
      const res = interpreter.interpret('Quiet place for lunch');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toEqual(['quieter']);
    });

    it("interprets 'Find vegetarian lunch' with vegetarian filter", () => {
      const res = interpreter.interpret('Find vegetarian lunch');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toEqual(['vegetarian']);
    });

    it("interprets generic 'Find a lunch spot' without filters", () => {
      const res = interpreter.interpret('Find a lunch spot');
      expect(res.intent).toBe('FIND_LUNCH');
      expect(res.slots.filters).toBeUndefined();
    });

    it("maps unknown filter 'cheap' to UNSUPPORTED with honest answer", () => {
      const res = interpreter.interpret('Find cheap lunch');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('The filter "cheap" is not supported in this offline demo');
      expect(res.honestAnswer).toContain('Supported lunch filters: quieter, vegetarian, nearer');
    });

    it("maps unknown filter 'italian' to UNSUPPORTED with honest answer", () => {
      const res = interpreter.interpret('Find italian restaurant');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('The filter "italian" is not supported in this offline demo');
      expect(res.honestAnswer).toContain('Supported lunch filters: quieter, vegetarian, nearer');
    });
  });

  describe('FIND_FUEL Intent & Disambiguation', () => {
    it('interprets explicit gas / fuel queries deterministically', () => {
      const queries = ['Find a gas station', 'gas', 'need gas', 'where is gas', 'find petrol station', '加油站', '找加油站'];
      for (const q of queries) {
        const res = interpreter.interpret(q);
        expect(res.intent).toBe('FIND_FUEL');
        expect(res.slots.ambiguous).toBe(false);
      }
    });

    it('disambiguates Chinese "加油" based on context', () => {
      // Without travel context: ambiguous -> needs-confirmation
      const ambig = interpreter.interpret('加油', { sceneId: 'away-lunch' });
      expect(ambig.intent).toBe('FIND_FUEL');
      expect(ambig.slots.ambiguous).toBe(true);
      expect(ambig.honestAnswer).toBe('Did you mean: find a gas station?');

      // With travel context: direct FIND_FUEL
      const direct = interpreter.interpret('加油', { sceneId: 'rain', currentPlanIntent: 'depart' });
      expect(direct.intent).toBe('FIND_FUEL');
      expect(direct.slots.ambiguous).toBe(false);
    });
  });

  describe('UNSUPPORTED Intent & Capability Answers', () => {
    it("maps random chat to general honest capabilities", () => {
      const res = interpreter.interpret('What is the capital of France?');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain("I can help adjust your departure plan");
    });

    it("maps empty input to unsupported", () => {
      const res = interpreter.interpret('   ');
      expect(res.intent).toBe('UNSUPPORTED');
    });
  });

  describe('ASK-PROMPTS-PREMIUM Suggestion Chip Parsing', () => {
    it('correctly interprets all Live idle suggestion chips', () => {
      const lunchNearby = interpreter.interpret('Lunch nearby');
      expect(lunchNearby.intent).toBe('FIND_LUNCH');
      expect(lunchNearby.slots.filters).toContain('nearer');

      const somewhereQuiet = interpreter.interpret('Somewhere quiet');
      expect(somewhereQuiet.intent).toBe('FIND_LUNCH');
      expect(somewhereQuiet.slots.filters).toContain('quieter');

      const closerToMe = interpreter.interpret('Closer to me');
      expect(closerToMe.intent).toBe('FIND_LUNCH');
      expect(closerToMe.slots.filters).toContain('nearer');
    });

    it('correctly interprets all Lunch scene suggestion chips', () => {
      const somewhereQuieter = interpreter.interpret('Somewhere quieter');
      expect(somewhereQuieter.intent).toBe('FIND_LUNCH');
      expect(somewhereQuieter.slots.filters).toContain('quieter');

      const vegetarianOptions = interpreter.interpret('Vegetarian options');
      expect(vegetarianOptions.intent).toBe('FIND_LUNCH');
      expect(vegetarianOptions.slots.filters).toContain('vegetarian');

      const closerToMe = interpreter.interpret('Closer to me');
      expect(closerToMe.intent).toBe('FIND_LUNCH');
      expect(closerToMe.slots.filters).toContain('nearer');
    });

    it('correctly interprets all Depart scene suggestion chips', () => {
      const leaveLater = interpreter.interpret('Leave 15 minutes later');
      expect(leaveLater.intent).toBe('LEAVE_LATER');
      expect(leaveLater.slots.deltaMinutes).toBe(15);

      const takeBus = interpreter.interpret('Take the bus');
      expect(takeBus.intent).toBe('CHANGE_ROUTE');
      expect(takeBus.slots.mode).toBe('bus');
    });

    it('correctly interprets all Fuel scene suggestion chips', () => {
      const findGas = interpreter.interpret('Find gas nearby');
      expect(findGas.intent).toBe('FIND_FUEL');
      expect(findGas.slots.ambiguous).toBe(false);
    });
  });
});
