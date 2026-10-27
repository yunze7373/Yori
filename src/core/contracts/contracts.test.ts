import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type ContextSignal,
  type ContextSnapshot,
  type RealSignal,
  type MemoryFact,
  type IntentCandidate,
  type PreparedPlan,
  type LivingContext,
  type UserFeedback,
  type SimulatedProviderAdapter,
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

  describe('Type-level Negative Tests: required fields on ContextSignal (AC-101-1)', () => {
    it('rejects literals missing any required field', () => {
      // 1. Missing kind
      // @ts-expect-error ContextSignal requires 'kind'
      const _missingKind: ContextSignal = {
        value: 123,
        source: 'simulated',
        issuedAt: '2026-10-28T10:00:00Z',
        validFor: 1000,
        confidence: 1,
        consentScope: 'device_only',
      };
      expect(_missingKind).toBeDefined();

      // 2. Missing value
      // @ts-expect-error ContextSignal requires 'value'
      const _missingValue: ContextSignal = {
        kind: 'test',
        source: 'simulated',
        issuedAt: '2026-10-28T10:00:00Z',
        validFor: 1000,
        confidence: 1,
        consentScope: 'device_only',
      };
      expect(_missingValue).toBeDefined();

      // 3. Missing source
      // @ts-expect-error ContextSignal requires 'source'
      const _missingSource: ContextSignal = {
        kind: 'test',
        value: 123,
        issuedAt: '2026-10-28T10:00:00Z',
        validFor: 1000,
        confidence: 1,
        consentScope: 'device_only',
      };
      expect(_missingSource).toBeDefined();

      // 4. Missing issuedAt
      // @ts-expect-error ContextSignal requires 'issuedAt'
      const _missingIssuedAt: ContextSignal = {
        kind: 'test',
        value: 123,
        source: 'simulated',
        validFor: 1000,
        confidence: 1,
        consentScope: 'device_only',
      };
      expect(_missingIssuedAt).toBeDefined();

      // 5. Missing validFor
      // @ts-expect-error ContextSignal requires 'validFor'
      const _missingValidFor: ContextSignal = {
        kind: 'test',
        value: 123,
        source: 'simulated',
        issuedAt: '2026-10-28T10:00:00Z',
        confidence: 1,
        consentScope: 'device_only',
      };
      expect(_missingValidFor).toBeDefined();

      // 6. Missing confidence
      // @ts-expect-error ContextSignal requires 'confidence'
      const _missingConfidence: ContextSignal = {
        kind: 'test',
        value: 123,
        source: 'simulated',
        issuedAt: '2026-10-28T10:00:00Z',
        validFor: 1000,
        consentScope: 'device_only',
      };
      expect(_missingConfidence).toBeDefined();

      // 7. Missing consentScope
      // @ts-expect-error ContextSignal requires 'consentScope'
      const _missingConsentScope: ContextSignal = {
        kind: 'test',
        value: 123,
        source: 'simulated',
        issuedAt: '2026-10-28T10:00:00Z',
        validFor: 1000,
        confidence: 1,
      };
      expect(_missingConsentScope).toBeDefined();
    });
  });

  it('enforces deep snapshot immutability via freezeSnapshot', () => {
    const rawSignal: ContextSignal<{ precip: number; details: { rainChance: number } }> = {
      kind: 'weather',
      value: { precip: 0.0, details: { rainChance: 10 } },
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

    const val = frozen.signals[0]?.value as { precip: number; details: { rainChance: number } };
    expect(Object.isFrozen(val)).toBe(true);
    expect(Object.isFrozen(val.details)).toBe(true);

    // Attempting top-level property mutation should throw in strict mode
    expect(() => {
      // @ts-expect-error Attempting mutation on readonly property
      frozen.asOf = '2026-10-28T11:00:00Z';
    }).toThrow();

    // Attempting array mutation should throw in strict mode
    expect(() => {
      (frozen.signals as unknown as ContextSignal[]).push(rawSignal);
    }).toThrow();

    // Attempting nested value mutation should throw in strict mode
    expect(() => {
      val.precip = 0.5;
    }).toThrow();

    expect(() => {
      val.details.rainChance = 80;
    }).toThrow();
  });
});

describe('AC-101-3 & INV-102: Fail-Closed Validation & Mock Adapter Isolation', () => {
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

  describe('Fail-Closed Boundary & Validation Testing (P2 Finding 1)', () => {
    const validParams = {
      kind: 'test',
      value: { foo: 'bar' },
      issuedAt: '2026-10-28T12:00:00Z',
      validFor: 1000,
      confidence: 0.8,
      consentScope: 'device_only' as const,
    };

    it('rejects NaN, Infinity, negative, and zero for validFor', () => {
      expect(() => createSimulatedSignal({ ...validParams, validFor: NaN })).toThrow(
        /validFor must be a finite positive number/
      );
      expect(() => createSimulatedSignal({ ...validParams, validFor: Infinity })).toThrow(
        /validFor must be a finite positive number/
      );
      expect(() => createSimulatedSignal({ ...validParams, validFor: -Infinity })).toThrow(
        /validFor must be a finite positive number/
      );
      expect(() => createSimulatedSignal({ ...validParams, validFor: 0 })).toThrow(
        /validFor must be a finite positive number/
      );
      expect(() => createSimulatedSignal({ ...validParams, validFor: -500 })).toThrow(
        /validFor must be a finite positive number/
      );
    });

    it('rejects NaN, Infinity, <0, and >1 for confidence', () => {
      expect(() => createSimulatedSignal({ ...validParams, confidence: NaN })).toThrow(
        /confidence must be a finite number between 0 and 1/
      );
      expect(() => createSimulatedSignal({ ...validParams, confidence: Infinity })).toThrow(
        /confidence must be a finite number between 0 and 1/
      );
      expect(() => createSimulatedSignal({ ...validParams, confidence: -0.1 })).toThrow(
        /confidence must be a finite number between 0 and 1/
      );
      expect(() => createSimulatedSignal({ ...validParams, confidence: 1.01 })).toThrow(
        /confidence must be a finite number between 0 and 1/
      );
    });

    it('rejects invalid or non-ISO issuedAt dates', () => {
      expect(() => createSimulatedSignal({ ...validParams, issuedAt: 'not-a-date' })).toThrow(
        /issuedAt must be a valid ISO-8601 string/
      );
      expect(() => createSimulatedSignal({ ...validParams, issuedAt: '2026/10/28' })).toThrow(
        /issuedAt must be a valid ISO-8601 string/
      );
      expect(() => createSimulatedSignal({ ...validParams, issuedAt: '' })).toThrow(
        /issuedAt must be a valid ISO-8601 string/
      );
      expect(() => createSimulatedSignal({ ...validParams, issuedAt: '2026-99-99T99:99:99Z' })).toThrow(
        /issuedAt must be a valid ISO-8601 string/
      );
    });
  });

  describe('Provider Adapter Isolation Contracts (P2 Finding 5)', () => {
    it('statically guarantees SimulatedProviderAdapter cannot return real signals', () => {
      const validSimAdapter: SimulatedProviderAdapter<{ status: string }> = {
        kind: 'mock-weather',
        source: 'simulated',
        signals: () => [
          createSimulatedSignal({
            kind: 'weather',
            value: { status: 'rain' },
            issuedAt: '2026-10-28T12:00:00Z',
            validFor: 3600000,
            confidence: 0.9,
            consentScope: 'device_only',
          }),
        ],
      };
      expect(validSimAdapter.source).toBe('simulated');

      // Negative type test: SimulatedProviderAdapter returning RealSignal triggers type error
      const _invalidAdapter: SimulatedProviderAdapter = {
        kind: 'bad-adapter',
        source: 'simulated',
        // @ts-expect-error Type 'RealSignal<unknown>[]' is not assignable to 'readonly SimulatedSignal<unknown>[]'
        signals: () => {
          const realSig: RealSignal = {
            kind: 'weather',
            value: {},
            source: 'real',
            label: 'real',
            issuedAt: '2026-10-28T12:00:00Z',
            validFor: 1000,
            confidence: 1,
            consentScope: 'device_only',
          };
          return [realSig];
        },
      };
      expect(_invalidAdapter).toBeDefined();

      // Negative type test: SimulatedProviderAdapter with source: 'real' triggers type error
      const _wrongSourceAdapter: SimulatedProviderAdapter = {
        kind: 'fake',
        // @ts-expect-error Type '"real"' is not assignable to type '"simulated"'
        source: 'real',
        signals: () => [],
      };
      expect(_wrongSourceAdapter).toBeDefined();
    });
  });
});

describe('INV-107: MemoryFact Contracts & Deterministic Clock (P2 Finding 3)', () => {
  it('requires explicit updatedAt parameter and enforces valid ISO timestamp', () => {
    const fact: MemoryFact<string> = createMemoryFact(
      'user_diet',
      'vegetarian',
      'pending',
      {
        source: 'user_feedback',
        recordedAt: '2026-10-28T12:00:00Z',
        note: 'Proposal pending user confirm',
      },
      '2026-10-28T12:00:00Z'
    );

    expect(fact.status).toBe('pending');
    expect(fact.provenance.source).toBe('user_feedback');
    expect(fact.updatedAt).toBe('2026-10-28T12:00:00Z');
    expect(Object.isFrozen(fact)).toBe(true);

    expect(() =>
      // @ts-expect-error updatedAt is required and cannot be omitted
      createMemoryFact(
        'user_diet',
        'vegetarian',
        'pending',
        { source: 'user_feedback', recordedAt: '2026-10-28T12:00:00Z' }
      )
    ).toThrow();

    expect(() =>
      createMemoryFact(
        'user_diet',
        'vegetarian',
        'pending',
        { source: 'user_feedback', recordedAt: '2026-10-28T12:00:00Z' },
        'invalid-date'
      )
    ).toThrow(/updatedAt must be a valid ISO-8601 string/);
  });

  it('static audit: ensures src/core contains zero ambient clock calls (Date.now / new Date)', () => {
    const contractsDir = path.resolve('src/core/contracts');
    const files = fs.readdirSync(contractsDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(contractsDir, file), 'utf-8');
      expect(content).not.toMatch(/\bDate\.now\(\)/);
      expect(content).not.toMatch(/\bnew\s+Date\(\)/);
    }
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

describe('INV-108: IntentCandidate & Closed Suppression Unions (P3 Finding 6)', () => {
  it('captures suppression details when candidate is suppressed with closed union types', () => {
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

    // Negative type test: arbitrary misspelled suppression code triggers type error
    const _invalidCandidate: IntentCandidate = {
      intent: 'lunch',
      confidence: 0.85,
      evidence: [],
      suppressedBy: {
        // @ts-expect-error Type '"budget_exausted"' is not assignable to type 'SuppressionCode'
        code: 'budget_exausted',
        reason: 'Typo in code',
        scope: 'today',
        recordedAt: '2026-10-28T13:00:00Z',
      },
    };
    expect(_invalidCandidate).toBeDefined();
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

  it('structures UserFeedback with accept, adjust, dismiss actions and closed scope union', () => {
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

    const mockPlugin: Plugin<SimulatedProviderAdapter> = {
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
      adapter: {
        kind: 'test',
        source: 'simulated',
        signals: () => [],
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
