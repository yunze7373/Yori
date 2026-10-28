/**
 * UserRequestOverride & prepareWithRequest Unit Tests (V2a-1)
 * Governed by LIVING_CONTEXT_V2.md §2.3 and Rev4 Condition C5.
 */

import { describe, it, expect } from 'vitest';
import { DepartPreparer } from './preparer.js';
import { createUserRequestOverride } from './request-override.js';
import {
  d2Scenario,
  d2MemoryFacts,
} from '../../../tests/fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../app/scenario-player/index.js';
import type { IntentCandidate } from '../../core/contracts/index.js';

describe('UserRequestOverride & prepareWithRequest (LIVING_CONTEXT_V2.md §2.3)', () => {
  const preparer = new DepartPreparer();

  const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
  const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
  const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;

  const validDepartCandidate: IntentCandidate = {
    intent: 'depart',
    confidence: 0.95,
    evidence: [d2Snapshot.signals.find(s => s.kind === 'calendar')!],
  };

  it('LEAVE_LATER: shifts leave and prepare equally and flags requiresConfirmation when arriving late', () => {
    // Piano lesson at 3:00 PM (15:00).
    // Original Drive: leave 2:30 PM (14:30), prep 2:10 PM (14:10), travel 25m, buffer 5m.
    // Shift by +15 min:
    // New leave = 2:45 PM (14:45), prep = 2:25 PM (14:25).
    // Arrival = 14:45 + 25m = 15:10 (3:10 PM), which is 10 min late (margin = -10m).
    const override = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 15,
      at: '2026-10-28T20:35:00.000Z',
    });

    const plan = preparer.prepareWithRequest(validDepartCandidate, d2Snapshot, d2MemoryFacts, override);
    expect(plan).not.toBeNull();

    // Check shifted times on primary option (drive)
    expect(plan!.leaveAt).toBe('2026-10-28T21:45:00.000Z');
    expect(plan!.prepareAt).toBe('2026-10-28T21:25:00.000Z');
    expect(plan!.headline).toContain('2:45 PM');
    expect(plan!.headline).toContain('2:25 PM');

    // Invariant: delta that arrives after appointment start goes to needs-confirmation (never silent late plan)
    expect(plan!.requiresConfirmation).toBe(true);

    const driveOpt = plan!.optionsOrSteps.find(o => typeof o !== 'string' && o.mode === 'drive');
    expect(driveOpt).toBeDefined();
    expect(typeof driveOpt !== 'string' && driveOpt!.requiresConfirmation).toBe(true);
    expect(typeof driveOpt !== 'string' && driveOpt!.details).toContain('late by 10m');

    // C2: Why shows "Because you asked: leave 15 min later · this time only" with user_request provenance
    expect(plan!.why.derivation).toContain('Because you asked: leave 15 min later · this time only');
    const userReqEvidence = plan!.why.evidenceSignals.find(s => s.kind === 'user_request');
    expect(userReqEvidence).toBeDefined();
    expect(userReqEvidence!.kind).toBe('user_request');
    expect(userReqEvidence!.source).toBe('simulated');
    expect(userReqEvidence!.description).toContain('this time only');
  });

  it('LEAVE_LATER: on-time delta (e.g. 5 min later with 5m buffer) preserves requiresConfirmation=false', () => {
    // Original Drive: leave 2:30 PM (14:30), travel 25m, arrive 14:55. Buffer was 5m.
    // Shift by +5 min:
    // New leave = 2:35 PM (14:35), prep = 2:15 PM (14:15).
    // Arrival = 14:35 + 25m = 15:00 (3:00 PM), arriving exactly on time (margin = 0m).
    const override = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 5,
      at: '2026-10-28T20:35:00.000Z',
    });

    const plan = preparer.prepareWithRequest(validDepartCandidate, d2Snapshot, d2MemoryFacts, override);
    expect(plan).not.toBeNull();
    expect(plan!.requiresConfirmation).toBe(false);
    expect(plan!.leaveAt).toBe('2026-10-28T21:35:00.000Z');
    expect(plan!.prepareAt).toBe('2026-10-28T21:15:00.000Z');
    expect(plan!.headline).toContain('2:35 PM');
    expect(plan!.headline).toContain('2:15 PM');
  });

  it('ROUTE_PREFERENCE: switches primary mode to bus and updates options ordering', () => {
    // In D2, confirmed habit is drive_first. User asks to switch to bus.
    const override = createUserRequestOverride({
      kind: 'route_preference',
      mode: 'bus',
      at: '2026-10-28T20:35:00.000Z',
    });

    const plan = preparer.prepareWithRequest(validDepartCandidate, d2Snapshot, d2MemoryFacts, override);
    expect(plan).not.toBeNull();

    // First option in optionsOrSteps is now bus!
    const firstOption = plan!.optionsOrSteps[0];
    expect(typeof firstOption !== 'string').toBe(true);
    expect((firstOption as any).mode).toBe('bus');
    expect((firstOption as any).label).toContain('bus leave 2:15 PM');

    // Primary timing is bus timing (leave 2:15 PM, prepare 1:55 PM)
    expect(plan!.headline).toContain('prepare 1:55 PM, leave 2:15 PM');
    expect(plan!.why.derivation).toContain('Because you asked: switch to bus · this time only');
  });

  it('Negative test: storage and memory facts are NEVER mutated during prepareWithRequest', () => {
    const memoryBefore = JSON.stringify(d2MemoryFacts);
    const override = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 15,
      at: '2026-10-28T20:35:00.000Z',
    });

    preparer.prepareWithRequest(validDepartCandidate, d2Snapshot, d2MemoryFacts, override);

    const memoryAfter = JSON.stringify(d2MemoryFacts);
    expect(memoryAfter).toBe(memoryBefore);
  });

  it('C1: returns null if candidate is not admitted or intent is not depart', () => {
    const invalidCandidate: IntentCandidate = {
      intent: 'lunch',
      confidence: 0.9,
      evidence: [],
    };
    const override = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 15,
      at: '2026-10-28T20:35:00.000Z',
    });

    const result = preparer.prepareWithRequest(invalidCandidate, d2Snapshot, d2MemoryFacts, override);
    expect(result).toBeNull();
  });
});
