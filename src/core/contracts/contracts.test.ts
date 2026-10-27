import { describe, it, expect } from 'vitest';
import {
  type ContextSignal,
  type ContextSnapshot,
  type SimulatedSignal,
  type RealSignal,
  type MemoryFact,
  type IntentCandidate,
  type PreparedPlan,
  type LivingContext,
  type UserFeedback,
  createSimulatedSignal,
  freezeSnapshot,
  createMemoryFact,
} from './index.js';
import { staticPluginRegistry, type Plugin } from '../../plugins/registry.js';
import { createFixedClock } from '../../app/scenario-player/index.js';

describe('AC-101-1 & INV-101: ContextSignal & Snapshot Contracts', () => {
  it('requires source, issuedAt, validFor, confidence, consentScope on ContextSignal', () => {
    const signal: ContextSignal<{ temp: number }> = {
      kind: 'weather',
      value: { temp: 22 },
      source: 'simulated',
      issuedAt: '2026-10-28T10:00:00Z',
      validFor: 3600000,
      confidence: 0.95,
      consentScope: 'device_only',
      label: 'simulated',
    };

    expect(signal.source).toBe('simulated');
    expect(signal.issuedAt).toBe('2026-10-28T10:00:00Z');
    expect(signal.validFor).toBe(3600000);
    expect(signal.confidence).toBe(0.95);
    expect(signal.consentScope).toBe('device_only');
    expect(signal.label).toBe('simulated');
  });

  it('enforces snapshot immutability via freezeSnapshot', () => {
    const rawSignal: ContextSignal<string> = {
      kind: 'location',
      value: 'home',
      source: 'simulated',
      issuedAt: '2026-10-28T10:00:00Z',
      validFor: 60000,
      confidence: 1.0,
      consentScope: 'device_only',
      label: 'simulated',
    };

    const snapshot: ContextSnapshot = {
      id: 'snap-001',
      asOf: '2026-10-28T10:00:00Z',
      signals: [rawSignal],
    };

    const frozen = freezeSnapshot(snapshot);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.signals)).toBe(true);
    expect(Object.isFrozen(frozen.signals[0])).toBe(true);

    // Attempting runtime mutation should throw in strict mode
    expect(() => {
      // @ts-expect-error Attempting mutation on readonly property
      frozen.asOf = '2026-10-28T11:00:00Z';
    }).toThrow();

    expect(() => {
      (frozen.signals as unknown as ContextSignal[]).push(rawSignal);
    }).toThrow();
  });
});

describe('AC-101-3 & INV-102: Simulated Labeling & Mock Adapter Isolation', () => {
  it('creates simulated signals with strict simulated label and source', () => {
    const simulated = createSimulatedSignal({
      kind: 'calendar',
      value: { title: 'Piano Lesson', time: '15:00' },
      issuedAt: '2026-10-28T12:00:00Z',
      validFor: 7200000,
      confidence: 1.0,
      consentScope: 'device_only',
    });

    expect(simulated.source).toBe('simulated');
    expect(simulated.label).toBe('simulated');
    expect(Object.isFrozen(simulated)).toBe(true);
  });

  it('rejects invalid validFor or confidence boundaries fail-closed', () => {
    expect(() => {
      createSimulatedSignal({
        kind: 'test',
        value: null,
        issuedAt: '2026-10-28T12:00:00Z',
        validFor: 0, // non-positive
        confidence: 0.5,
        consentScope: 'device_only',
      });
    }).toThrow(/validFor must be positive/);

    expect(() => {
      createSimulatedSignal({
        kind: 'test',
        value: null,
        issuedAt: '2026-10-28T12:00:00Z',
        validFor: 1000,
        confidence: 1.5, // > 1.0
        consentScope: 'device_only',
      });
    }).toThrow(/confidence must be between 0 and 1/);
  });

  it('static type safety: simulated and real signals cannot be interchanged without type errors', () => {
    const simSignal: SimulatedSignal<string> = createSimulatedSignal({
      kind: 'test',
      value: 'mock_val',
      issuedAt: '2026-10-28T12:00:00Z',
      validFor: 1000,
      confidence: 1.0,
      consentScope: 'device_only',
    });

    // @ts-expect-error SimulatedSignal cannot be assigned to RealSignal (INV-102)
    const _realSignal: RealSignal<string> = simSignal;
    expect(_realSignal).toBeDefined();

    // Verify mock adapters cannot construct a real signal:
    // Passing source: 'real' triggers a compile error because 'source' is not in MockSignalParams
    createSimulatedSignal({
      kind: 'test',
      value: 'val',
      // @ts-expect-error MockSignalParams forbids passing source: 'real'
      source: 'real',
      issuedAt: '2026-10-28T12:00:00Z',
      validFor: 1000,
      confidence: 1.0,
      consentScope: 'device_only',
    });
  });
});

describe('INV-107: MemoryFact Contracts', () => {
  it('enforces memory status values: confirmed | pending | rejected', () => {
    const fact: MemoryFact<string> = createMemoryFact(
      'user_diet',
      'vegetarian',
      'pending',
      {
        source: 'user_feedback',
        recordedAt: '2026-10-28T12:00:00Z',
        note: 'Proposal pending user confirm',
      }
    );

    expect(fact.status).toBe('pending');
    expect(fact.provenance.source).toBe('user_feedback');
    expect(Object.isFrozen(fact)).toBe(true);
  });
});

describe('INV-103 & INV-104: PreparedPlan & Explainable Why', () => {
  it('requires Why explanation and confirmation flag on PreparedPlan', () => {
    const plan: PreparedPlan = {
      id: 'plan-101',
      intentId: 'depart',
      headline: 'Time to leave for Piano lesson',
      optionsOrSteps: ['Walk to station', 'Take Line 1'],
      requiresConfirmation: true, // INV-104
      why: {
        evidenceSignals: [
          {
            kind: 'calendar',
            source: 'simulated',
            issuedAt: '2026-10-28T12:00:00Z',
            description: 'Piano lesson at 15:00',
          },
        ],
        memoryFactsUsed: [
          {
            key: 'buffer_minutes',
            value: 5,
            status: 'confirmed',
          },
        ],
        derivation: '15:00 - 30m travel - 5m buffer = 14:25 leave',
      },
      createdAt: '2026-10-28T14:00:00Z',
    };

    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.why.evidenceSignals).toHaveLength(1);
    expect(plan.why.memoryFactsUsed).toHaveLength(1);
    expect(plan.why.derivation).toContain('14:25 leave');
  });
});

describe('INV-108: IntentCandidate & Suppression Reason', () => {
  it('captures suppression details when candidate is suppressed', () => {
    const candidate: IntentCandidate = {
      intent: 'lunch',
      confidence: 0.85,
      evidence: [],
      suppressedBy: {
        code: 'budget_exhausted',
        reason: 'Daily proactive prompt cap (3) reached',
        scope: 'today',
        recordedAt: '2026-10-28T13:00:00Z',
      },
    };

    expect(candidate.suppressedBy?.code).toBe('budget_exhausted');
    expect(candidate.suppressedBy?.scope).toBe('today');
  });
});

describe('LivingContext & UserFeedback', () => {
  it('shapes LivingContext with NOW, AHEAD, FOR YOU and optional map evidence', () => {
    const context: LivingContext = {
      now: null, // D4: 0 prompts is valid
      ahead: [],
      forYou: [],
      map: null,
      asOf: '2026-10-28T12:00:00Z',
    };

    expect(context.now).toBeNull();
    expect(context.ahead).toHaveLength(0);
  });

  it('structures UserFeedback with accept, adjust, dismiss actions', () => {
    const feedback: UserFeedback = {
      planId: 'plan-101',
      action: 'dismiss',
      suppressScope: 'today',
      note: 'Already had lunch',
      timestamp: '2026-10-28T12:30:00Z',
    };

    expect(feedback.action).toBe('dismiss');
    expect(feedback.suppressScope).toBe('today');
  });
});

describe('INV-109: Static Plugin Registry Shape', () => {
  it('registers and retrieves plugins without modifying core', () => {
    staticPluginRegistry.clear();

    const mockPlugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      detector: {
        id: 'test-det',
        targetIntent: 'test',
        detect: () => null,
      },
      preparer: {
        id: 'test-prep',
        targetIntent: 'test',
        prepare: () => null,
      },
    };

    staticPluginRegistry.register(mockPlugin);
    expect(staticPluginRegistry.has('test-plugin')).toBe(true);
    expect(staticPluginRegistry.get('test-plugin')?.name).toBe('Test Plugin');
    expect(staticPluginRegistry.getAll()).toHaveLength(1);

    expect(() => staticPluginRegistry.register(mockPlugin)).toThrow(/already registered/);
  });
});

describe('Scenario Player Clock', () => {
  it('creates deterministic fixed clock for replayable scenarios (AC-101-2)', () => {
    const fixedIso = '2026-10-28T14:00:00.000Z';
    const clock = createFixedClock(fixedIso);

    expect(clock.now()).toBe(fixedIso);
    expect(clock.now()).toBe(fixedIso); // repeated calls return identical timestamp
  });
});
