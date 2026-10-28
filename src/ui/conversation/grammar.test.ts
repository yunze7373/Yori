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
    it("interprets 'Can I leave later?' with default 15m delta", () => {
      const res = interpreter.interpret('Can I leave later?');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(15);
    });

    it("interprets 'leave later' (case-insensitive)", () => {
      const res = interpreter.interpret('LEAVE LATER');
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.slots.deltaMinutes).toBe(15);
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

  describe('UNSUPPORTED Intent & Capability Answers', () => {
    it("maps lunch requests to honest deferred notice (V2b non-goal)", () => {
      const res = interpreter.interpret('Find a quieter vegetarian lunch spot');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('Finding lunch spots arrives in the next update (V2b)');
    });

    it("maps fuel/charging requests to honest deferred notice (V5-FUEL non-goal)", () => {
      const res = interpreter.interpret('Find a gas station');
      expect(res.intent).toBe('UNSUPPORTED');
      expect(res.honestAnswer).toContain('Finding fuel or charging stops arrives in V5-FUEL');
    });

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
});
