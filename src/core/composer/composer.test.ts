/**
 * Core HomeComposer Unit Tests
 * Governed by Architecture Rev3 Section 5 and Acceptance Criteria AC-105-1.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoreHomeComposer } from './index.js';
import {
  createMemoryFact,
  createSimulatedSignal,
  type PreparedPlan,
  type MemoryFact,
  type SpatialMapEvidence,
} from '../contracts/index.js';

describe('HomeComposer Unit Tests (AC-105-1, Section 5)', () => {
  const composer = new CoreHomeComposer();

  const mockPlan = (id: string, intentId = 'depart'): PreparedPlan => ({
    id,
    intentId,
    headline: `Headline for ${id}`,
    optionsOrSteps: ['Step 1'],
    requiresConfirmation: false,
    createdAt: '2026-10-28T14:05:00.000Z',
    why: {
      evidenceSignals: [],
      memoryFactsUsed: [],
      derivation: 'Test derivation',
    },
  });

  it('enforces NOW <= 1 and AHEAD <= 3 caps', () => {
    const nowPlan = mockPlan('plan-now');
    const aheadPlans = [
      mockPlan('ahead-1'),
      mockPlan('ahead-2'),
      mockPlan('ahead-3'),
      mockPlan('ahead-4'), // 4th plan should be dropped by cap <= 3
      mockPlan('ahead-5'),
    ];

    const context = composer.compose(nowPlan, aheadPlans, []);

    expect(context.now?.id).toBe('plan-now');
    expect(context.ahead.length).toBe(3);
    expect(context.ahead.map(p => p.id)).toEqual(['ahead-1', 'ahead-2', 'ahead-3']);
  });

  it('filters FOR YOU to include only pending memory proposals/insights (INV-107)', () => {
    const memoryFacts: MemoryFact[] = [
      createMemoryFact(
        'pending_preference',
        'value_1',
        'pending',
        { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      ),
      createMemoryFact(
        'confirmed_habit',
        'value_2',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      ),
      createMemoryFact(
        'rejected_fact',
        'value_3',
        'rejected',
        { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      ),
    ];

    const context = composer.compose(null, [], memoryFacts);

    expect(context.forYou.length).toBe(1);
    expect(context.forYou[0]?.key).toBe('pending_preference');
    expect(context.forYou[0]?.status).toBe('pending');
  });

  it('renders map ONLY when spatial evidence exists (no evidence -> map: null)', () => {
    // 1. Without map evidence
    const withoutMap = composer.compose(mockPlan('plan-1'), [], [], null);
    expect(withoutMap.map).toBeNull();

    // 2. With valid spatial evidence
    const validSpatialSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.77, lng: -122.41 },
      issuedAt: '2026-10-28T14:00:00.000Z',
      validFor: 3600000,
      confidence: 0.95,
      consentScope: 'device_only',
    });

    const spatialEvidence: SpatialMapEvidence = {
      placeOrRoute: { name: 'Piano Studio', address: '123 Music Ave' },
      spatialEvidence: validSpatialSignal,
    };

    const withMap = composer.compose(mockPlan('plan-1'), [], [], spatialEvidence);
    expect(withMap.map).not.toBeNull();
    expect(withMap.map?.placeOrRoute).toEqual({ name: 'Piano Studio', address: '123 Music Ave' });
    expect(withMap.map?.spatialEvidence.kind).toBe('location_status');
  });

  it('produces an honest quiet state when nothing qualifies (D4)', () => {
    const quiet = composer.compose(null, [], []);
    expect(quiet.now).toBeNull();
    expect(quiet.ahead).toEqual([]);
    expect(quiet.forYou).toEqual([]);
    expect(quiet.map).toBeNull();
  });

  it('is deterministic: identical inputs yield deep-equal LivingContext', () => {
    const plan = mockPlan('plan-det');
    const ctx1 = composer.compose(plan, [mockPlan('ahead-1')], []);
    const ctx2 = composer.compose(plan, [mockPlan('ahead-1')], []);
    expect(ctx1).toEqual(ctx2);
  });

  describe('Static Audit: Zero Ambient Clock Calls', () => {
    it('ensures src/core/composer contains zero ambient clock calls', () => {
      const composerDir = path.resolve('src/core/composer');
      const files = fs
        .readdirSync(composerDir)
        .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(composerDir, file), 'utf-8');
        expect(content).not.toMatch(/\bDate\.now\(\)/);
        expect(content).not.toMatch(/\bnew\s+Date\(\)/);
      }
    });
  });
});
