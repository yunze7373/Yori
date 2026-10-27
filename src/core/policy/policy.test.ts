/**
 * Core Shared Policy Unit Tests
 * Governed by AC-104-1, AC-104-2, AC-104-3 and Invariants INV-105, INV-106, INV-108.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SharedPolicyEngine,
  DEFAULT_DAILY_PROMPT_BUDGET,
} from './index.js';
import {
  createSimulatedSignal,
  createMemoryFact,
  freezeSnapshot,
  type ContextSnapshot,
  type IntentCandidate,
  type MemoryFact,
} from '../contracts/index.js';

describe('Shared Policy Engine (INV-105, INV-106, INV-108)', () => {
  const policy = new SharedPolicyEngine();

  const baseSnapshot: ContextSnapshot = freezeSnapshot({
    id: 'snap-pol',
    asOf: '2026-10-28T12:00:00.000Z',
    timezone: 'America/Los_Angeles',
    signals: [
      createSimulatedSignal({
        kind: 'calendar',
        value: { title: 'Lunch Window' },
        issuedAt: '2026-10-28T12:00:00.000Z',
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

  describe('Prompt Budget Enforcement (INV-105, AC-104-2)', () => {
    it('allows candidates when prompt count is below cap', () => {
      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        promptCountToday: 2,
      });
      expect(suppression).toBeNull();
    });

    it('suppresses the 4th proactive prompt in a day with budget_exhausted reason (AC-104-2)', () => {
      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
        promptCountToday: 3, // Already used 3
        maxDailyPrompts: DEFAULT_DAILY_PROMPT_BUDGET,
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('budget_exhausted');
      expect(suppression?.scope).toBe('today');
      expect(suppression?.reason).toContain('Daily proactive prompt cap');
    });
  });

  describe('Reason-Coded Suppressions (INV-108, AC-104-1)', () => {
    it('suppresses with user_busy when schedule indicates isBusy=true (D4 Variant A)', () => {
      const busySnapshot: ContextSnapshot = freezeSnapshot({
        id: 'snap-busy',
        asOf: '2026-10-28T12:00:00.000Z',
        signals: [
          createSimulatedSignal({
            kind: 'schedule_window',
            value: { isBusy: true, currentEvent: 'Client Sync' },
            issuedAt: '2026-10-28T12:00:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      });

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: busySnapshot,
        memory: [],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('user_busy');
      expect(suppression?.reason).toContain('Client Sync');
    });

    it('suppresses with already_done when user has already eaten (D4 Variant B)', () => {
      const ateSnapshot: ContextSnapshot = freezeSnapshot({
        id: 'snap-ate',
        asOf: '2026-10-28T12:00:00.000Z',
        signals: [
          createSimulatedSignal({
            kind: 'eating_status',
            value: { eatenToday: true, lunchFinishedAt: '11:45 AM' },
            issuedAt: '2026-10-28T12:00:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      });

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: ateSnapshot,
        memory: [],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('already_done');
      expect(suppression?.scope).toBe('today');
    });

    it('suppresses with user_suppressed when user feedback declined today (D5)', () => {
      const memoryWithSuppression: readonly MemoryFact[] = [
        createMemoryFact(
          'suppress_lunch_recommendations',
          'user_requested_today',
          'pending',
          { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
          '2026-10-28T10:00:00Z'
        ),
      ];

      const suppression = policy.checkSuppression(sampleCandidate, {
        snapshot: baseSnapshot,
        memory: memoryWithSuppression,
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('user_suppressed');
      expect(suppression?.scope).toBe('today');
    });

    it('suppresses with low_confidence when candidate confidence is below 0.6', () => {
      const lowConfCandidate: IntentCandidate = {
        intent: 'lunch',
        confidence: 0.45,
        evidence: [baseSnapshot.signals[0]!],
      };

      const suppression = policy.checkSuppression(lowConfCandidate, {
        snapshot: baseSnapshot,
        memory: [],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('low_confidence');
    });

    it('suppresses with stale_signal when candidate evidence is expired', () => {
      const expiredSignal = createSimulatedSignal({
        kind: 'location',
        value: { lat: 37.77, lng: -122.41 },
        issuedAt: '2026-10-28T10:00:00.000Z',
        validFor: 1800000, // 30 minutes; asOf is 12:00 (1.5 hours later)
        confidence: 0.9,
        consentScope: 'device_only',
      });

      const staleCandidate: IntentCandidate = {
        intent: 'lunch',
        confidence: 0.9,
        evidence: [expiredSignal],
      };

      const suppression = policy.checkSuppression(staleCandidate, {
        snapshot: baseSnapshot,
        memory: [],
      });

      expect(suppression).not.toBeNull();
      expect(suppression?.code).toBe('stale_signal');
    });
  });

  describe('Signal Evaluation & Fail-Closed Notices (INV-106, AC-104-3)', () => {
    it('detects stale signals in snapshot and produces fail-closed notices (D6)', () => {
      const staleWeatherSnapshot: ContextSnapshot = freezeSnapshot({
        id: 'snap-d6-stale',
        asOf: '2026-10-28T21:00:00.000Z',
        signals: [
          createSimulatedSignal({
            kind: 'weather',
            value: { condition: 'sunny' },
            issuedAt: '2026-10-28T17:00:00.000Z',
            validFor: 1800000, // 30 min validity -> expired
            confidence: 0.9,
            consentScope: 'device_only',
          }),
        ],
      });

      const notices = policy.evaluateSignals(staleWeatherSnapshot);
      const staleNotice = notices.find(
        n => n.missingOrStaleSignalKind === 'weather' && n.isStale
      );
      expect(staleNotice).toBeDefined();
      expect(staleNotice?.kind).toBe('fail_closed_notice');
    });

    it('detects missing required weather signal when calendar event is present (D6)', () => {
      const missingWeatherSnapshot: ContextSnapshot = freezeSnapshot({
        id: 'snap-d6-missing',
        asOf: '2026-10-28T21:00:00.000Z',
        signals: [
          createSimulatedSignal({
            kind: 'calendar',
            value: { title: 'Piano lesson', startTime: '2026-10-28T15:00:00-07:00' },
            issuedAt: '2026-10-28T21:00:00.000Z',
            validFor: 36000000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      });

      const notices = policy.evaluateSignals(missingWeatherSnapshot);
      const missingNotice = notices.find(
        n => n.missingOrStaleSignalKind === 'weather' && !n.isStale
      );
      expect(missingNotice).toBeDefined();
      expect(missingNotice?.isStale).toBe(false);
    });
  });

  describe('Deterministic Ranking (INV-108)', () => {
    it('ranks candidates deterministically by confidence, preference, and recency', () => {
      const candA: IntentCandidate = {
        intent: 'depart',
        confidence: 0.9,
        evidence: [baseSnapshot.signals[0]!],
      };
      const candB: IntentCandidate = {
        intent: 'lunch',
        confidence: 0.9,
        evidence: [baseSnapshot.signals[0]!],
      };

      const memoryWithPreference = [
        createMemoryFact(
          'lunch_preference',
          'ramen',
          'confirmed',
          { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
          '2026-10-28T10:00:00Z'
        ),
      ];

      const ranked = policy.rankCandidates([candA, candB], {
        snapshot: baseSnapshot,
        memory: memoryWithPreference,
      });

      // Lunch receives preference multiplier and ranks first
      expect(ranked[0]?.intent).toBe('lunch');
      expect(ranked[1]?.intent).toBe('depart');
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
