/**
 * Core Shared Policy Unit Tests
 * Governed by AC-104-1, AC-104-2, AC-104-3 and Invariants INV-105, INV-106, INV-108.
 *
 * Covers Reviewer Probes:
 * - R1: Memory facts with status 'rejected' or 'pending' do NOT suppress (INV-107).
 * - R2: Same-day suppression recorded yesterday does NOT suppress today (scope 'today' expiry).
 * - R3: Prompt budget does not blank on-open composition (only proactive prompts).
 * - R4: Stale prompt count from a previous day resets on a new day.
 * - AC-EXT-1 genericness: Dummy plugin declaring requiredSignals and completionFact works with zero core policy changes.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SharedPolicyEngine,
  DEFAULT_DAILY_PROMPT_BUDGET,
  getLocalDateString,
  isSameDay,
} from './index.js';
import {
  createSimulatedSignal,
  createMemoryFact,
  freezeSnapshot,
  type ContextSnapshot,
  type IntentCandidate,
  type MemoryFact,
  type Plugin,
  type SuppressionReason,
} from '../contracts/index.js';
import { YoriStorage, InMemoryStorageDriver } from '../storage/index.js';

describe('Shared Policy Engine (INV-105, INV-106, INV-108)', () => {
  const policy = new SharedPolicyEngine();

  const baseSnapshot: ContextSnapshot = freezeSnapshot({
    id: 'snap-pol',
    asOf: '2026-10-28T19:10:00.000Z', // 12:10 PM in America/Los_Angeles
    timezone: 'America/Los_Angeles',
    signals: [
      createSimulatedSignal({
        kind: 'calendar',
        value: { title: 'Lunch Window' },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    ],
  });

  const sampleCandidate: IntentCandidate = {
    intent: 'lunch',
    confidence: 0.9,
    evidence: [baseSnapshot.signals[0]!],
  };

  describe('Prompt Budget & On-Open Semantics (INV-105, ASM-007, Finding 3)', () => {
    it('does NOT suppress candidates during on-open composition even if budget is reached (Probe R3)', () => {
      // On-open composition is not a prompt (ASM-007, Finding 3)
      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        promptCountToday: 3,
        isProactivePrompt: false, // on-open composition
      });
      expect(suppression).toBeNull();
    });

    it('denies the 4th proactive prompt in a day via shouldPrompt and checkSuppression (AC-104-2)', () => {
      // When isProactivePrompt is true, budget cap is enforced
      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        promptCountToday: 3, // Already used 3
        maxDailyPrompts: DEFAULT_DAILY_PROMPT_BUDGET,
        isProactivePrompt: true,
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('budget_exhausted');
      expect(suppression?.scope).toBe('today');

      const canPrompt = policy.shouldPrompt(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        promptCountToday: 3,
      });
      expect(canPrompt).toBe(false);
    });

    it('resets budget count when stored date differs from snapshot local date (Probe R4)', () => {
      const driver = new InMemoryStorageDriver();
      const storage = new YoriStorage(driver);

      // Stored count of 3 from yesterday (2026-10-27)
      storage.save(
        {
          memoryFacts: [],
          proposals: [],
          suppressions: [],
          promptBudget: { date: '2026-10-27', count: 3 },
        },
        '2026-10-27T19:10:00.000Z'
      );

      // Snapshot is on 2026-10-28: Stale count from yesterday does not suppress today!
      const canPrompt = policy.shouldPrompt(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        storage,
      });
      expect(canPrompt).toBe(true);

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        storage,
        isProactivePrompt: true,
      });
      expect(suppression).toBeNull();
    });

    it('recordPrompt increments count in storage for the current local date', () => {
      expect(getLocalDateString('2026-10-28T19:10:00.000Z', 'America/Los_Angeles')).toBe('2026-10-28');
      expect(isSameDay('2026-10-28T19:10:00.000Z', '2026-10-28T22:00:00.000Z', 'America/Los_Angeles')).toBe(true);
      expect(isSameDay('2026-10-27T19:10:00.000Z', '2026-10-28T19:10:00.000Z', 'America/Los_Angeles')).toBe(false);

      const driver = new InMemoryStorageDriver();
      const storage = new YoriStorage(driver);

      const record1 = policy.recordPrompt(storage, '2026-10-28T19:10:00.000Z', 'America/Los_Angeles');
      expect(record1.date).toBe('2026-10-28');
      expect(record1.count).toBe(1);

      const record2 = policy.recordPrompt(storage, '2026-10-28T20:10:00.000Z', 'America/Los_Angeles');
      expect(record2.date).toBe('2026-10-28');
      expect(record2.count).toBe(2);
    });
  });

  describe('User Suppression & Memory Status Invariants (Finding 1 / INV-107)', () => {
    it('ignores memory facts with status rejected (Probe R1)', () => {
      const rejectedFact: MemoryFact = createMemoryFact(
        'suppress_lunch',
        'rejected_preference',
        'rejected', // Rejected proposals must NEVER suppress!
        { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      );

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [rejectedFact],
      });
      expect(suppression).toBeNull();
    });

    it('ignores memory facts with status pending (INV-107)', () => {
      const pendingFact: MemoryFact = createMemoryFact(
        'suppress_lunch_recommendations',
        'user_requested_today',
        'pending', // Pending proposal only appears in FOR YOU; does not change behavior
        { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      );

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [pendingFact],
      });
      expect(suppression).toBeNull();
    });

    it('applies suppression when memory fact has status confirmed', () => {
      const confirmedFact: MemoryFact = createMemoryFact(
        'suppress_lunch',
        'confirmed_preference',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      );

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [confirmedFact],
      });
      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('user_suppressed');
      expect(suppression?.scope).toBe('always');
    });

    it('applies same-day suppression record on the same date (D5)', () => {
      const todaySuppression: SuppressionReason = {
        code: 'user_suppressed',
        reason: "User dismissed lunch plan: don't suggest lunch",
        scope: 'today',
        recordedAt: '2026-10-28T19:15:00.000Z', // Same local day (2026-10-28)
        targetIntent: 'lunch',
      };

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        suppressions: [todaySuppression],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('user_suppressed');
      expect(suppression?.scope).toBe('today');
    });

    it('expires same-day suppression recorded on a previous day (Probe R2)', () => {
      const yesterdaySuppression: SuppressionReason = {
        code: 'user_suppressed',
        reason: "User dismissed lunch plan yesterday: don't suggest lunch",
        scope: 'today',
        recordedAt: '2026-10-27T19:15:00.000Z', // Yesterday in America/Los_Angeles
        targetIntent: 'lunch',
      };

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        suppressions: [yesterdaySuppression],
      });

      // Expired! Does not suppress lunch today!
      expect(suppression).toBeNull();
    });
  });

  describe('Generic Plugin Isolation & Zero Core Scenario Literals (Finding 2 / AC-EXT-1)', () => {
    it('handles generic completion signal via candidate metadata without intent-specific code', () => {
      const completedCandidate: IntentCandidate = {
        intent: 'custom_scenario',
        confidence: 0.95,
        evidence: [baseSnapshot.signals[0]!],
        metadata: { completedToday: true },
      };

      const suppression = policy.checkSuppression(completedCandidate, {
        snapshot: baseSnapshot,
        memory: [],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('already_done');
      expect(suppression?.scope).toBe('today');
    });

    it('handles generic missing required signals from plugin manifest without hardcoded kinds', () => {
      const dummyPlugin: Plugin = {
        id: 'grocery-ext',
        name: 'Grocery Extension Plugin',
        detector: { id: 'g-det', targetIntent: 'grocery', detect: () => null },
        preparer: { id: 'g-prep', targetIntent: 'grocery', prepare: () => null },
        requiredSignals: ['pantry_stock', 'grocery_store'],
        triggerSignalKinds: ['pantry_stock'],
      };

      const snapshotWithTriggerOnly: ContextSnapshot = freezeSnapshot({
        id: 'snap-grocery',
        asOf: '2026-10-28T19:10:00.000Z',
        signals: [
          createSimulatedSignal({
            kind: 'pantry_stock',
            value: { lowMilk: true },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      });

      const notices = policy.evaluateSignals(snapshotWithTriggerOnly, [dummyPlugin]);
      expect(notices.length).toBe(1);
      expect(notices[0]?.missingOrStaleSignalKind).toBe('grocery_store');
      expect(notices[0]?.isStale).toBe(false);
      expect(notices[0]?.reason).toContain("required by plugin 'grocery-ext'");
    });
  });

  describe('Static Audit: Zero Ambient Clock Calls', () => {
    it('ensures src/core/policy contains zero ambient clock calls (Date.now / new Date())', () => {
      const policyDir = path.resolve('src/core/policy');
      const files = fs
        .readdirSync(policyDir)
        .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(policyDir, file), 'utf-8');
        expect(content).not.toMatch(/\bDate\.now\(\)/);
        expect(content).not.toMatch(/\bnew\s+Date\(\)/);
      }
    });
  });
});
