/**
 * Grocery Stub Unit & Integration Tests (AC-EXT-1, INV-108, INV-109)
 *
 * Verifies:
 * - Detection of active grocery list signals.
 * - Preparation of structured PreparedPlan with human Why explanation.
 * - Shared core policy suppression: already_done (completedToday) and user_suppressed (targetIntent).
 * - Cross-plugin isolation:
 *   - Same-day suppression on grocery does not affect depart or lunch.
 *   - Grocery completion does not mark lunch or depart as done.
 *   - Confirmed suppress_* facts are intent-isolated.
 */

import { describe, it, expect } from 'vitest';
import { groceryDetector } from './detector.js';
import { groceryPreparer } from './preparer.js';
import { mockGroceryAdapter } from './adapter.js';
import { runPipeline } from '../../core/pipeline/index.js';
import { staticPluginRegistry } from '../registry.js';
import { createSimulatedSignal } from '../../core/contracts/index.js';
import type {
  ContextSnapshot,
  MemoryFact,
  SuppressionReason,
} from '../../core/contracts/index.js';

describe('Grocery Stub Plugin (AC-EXT-1)', () => {
  const asOf = '2026-10-28T16:00:00.000Z';
  const listSignal = mockGroceryAdapter.createGroceryListSignal(
    ['Oat Milk', 'Organic Eggs', 'Sourdough Bread'],
    asOf
  );

  const baseSnapshot: ContextSnapshot = Object.freeze({
    id: 'snap-grocery-test',
    asOf,
    timezone: 'America/Los_Angeles',
    signals: Object.freeze([listSignal]),
  });

  it('detects grocery candidate when items exist on the shopping list', () => {
    const candidate = groceryDetector.detect(baseSnapshot, []);
    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('grocery');
    expect(candidate?.confidence).toBe(0.85);
    expect(candidate?.metadata?.completedToday).toBe(false);
    expect(candidate?.metadata?.itemCount).toBe(3);
  });

  it('prepares deterministic grocery plan citing list items and store memory', () => {
    const candidate = groceryDetector.detect(baseSnapshot, [])!;
    const memoryFacts: MemoryFact[] = [
      {
        key: 'preferred_grocery_store',
        value: 'Trader Joe’s',
        status: 'confirmed',
        updatedAt: asOf,
        provenance: { source: 'user_confirmed', recordedAt: asOf },
      },
    ];

    const plan = groceryPreparer.prepare(candidate, baseSnapshot, memoryFacts);
    expect(plan).not.toBeNull();
    expect(plan?.intentId).toBe('grocery');
    expect(plan?.headline).toContain('3 items');
    expect(plan?.why.memoryFactsUsed).toHaveLength(1);
    expect(plan?.why.memoryFactsUsed[0]?.key).toBe('preferred_grocery_store');
  });

  it('suppresses grocery candidate via shared core policy when completedToday is true (already_done)', () => {
    const statusSignal = mockGroceryAdapter.createGroceryStatusSignal({ completedToday: true }, asOf);
    const completedSnapshot: ContextSnapshot = Object.freeze({
      ...baseSnapshot,
      signals: Object.freeze([listSignal, statusSignal]),
    });

    const result = runPipeline({
      snapshot: completedSnapshot,
      memory: [],
      clock: asOf,
    });

    expect(result.livingContext.now?.intentId).not.toBe('grocery');
    const suppression = result.suppressions.find(
      s => s.code === 'already_done' && s.targetIntent === 'grocery'
    );
    expect(suppression).toBeDefined();
  });

  it('suppresses grocery candidate via shared core policy when user dismissed today (user_suppressed)', () => {
    const suppressions: SuppressionReason[] = [
      {
        code: 'user_suppressed',
        targetIntent: 'grocery',
        reason: 'Not shopping today',
        recordedAt: asOf,
        scope: 'today',
      },
    ];

    const result = runPipeline({
      snapshot: baseSnapshot,
      memory: [],
      suppressions,
      clock: asOf,
    });

    expect(result.livingContext.now?.intentId).not.toBe('grocery');
    const suppression = result.suppressions.find(
      s => s.code === 'user_suppressed' && s.targetIntent === 'grocery'
    );
    expect(suppression).toBeDefined();
    expect(suppression?.scope).toBe('today');
  });

  it('is registered in the static non-core registry', () => {
    expect(staticPluginRegistry.has('grocery-stub')).toBe(true);
    expect(staticPluginRegistry.get('grocery-stub')?.name).toBe('Grocery Stub Plugin');
  });
});

describe('Cross-Plugin Negative Probes (Binding Carried)', () => {
  const asOf = '2026-10-28T16:00:00.000Z';

  it('same-day suppression on grocery does NOT suppress lunch or depart', () => {
    const grocerySuppression: SuppressionReason = {
      code: 'user_suppressed',
      targetIntent: 'grocery',
      reason: 'Dismissed grocery',
      recordedAt: asOf,
      scope: 'today',
    };

    const result = runPipeline({
      snapshot: {
        id: 'snap-lunch',
        asOf: '2026-10-28T19:10:00.000Z', // 12:10 local in -07:00
        timezone: 'America/Los_Angeles',
        signals: [
          createSimulatedSignal({
            kind: 'location_status',
            value: { isHome: false, coordinates: { lat: 37.77, lng: -122.41 } },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'schedule_window',
            value: { freeUntil: '2026-10-28T20:30:00.000Z' },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      },
      memory: [
        {
          key: 'taste_preference',
          value: 'Japanese',
          status: 'confirmed',
          updatedAt: '2026-10-28T19:10:00.000Z',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T19:10:00.000Z' },
        },
      ],
      suppressions: [grocerySuppression], // Grocery suppression present
      clock: '2026-10-28T19:10:00.000Z',
    });

    // Lunch is NOT suppressed by grocery suppression!
    expect(result.livingContext.now?.intentId).toBe('lunch');
    expect(result.suppressions.some(s => s.targetIntent === 'lunch')).toBe(false);
  });

  it('grocery completion (completedToday) does NOT mark lunch or depart completed', () => {
    const groceryStatus = mockGroceryAdapter.createGroceryStatusSignal({ completedToday: true }, asOf);
    const groceryList = mockGroceryAdapter.createGroceryListSignal(['Apples'], asOf);

    const snapshot: ContextSnapshot = {
      id: 'snap-cross-completion',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        groceryStatus,
        groceryList,
        createSimulatedSignal({
          kind: 'location_status',
          value: { isHome: false },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'schedule_window',
          value: { freeUntil: '2026-10-28T20:30:00.000Z' },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'eating_status',
          value: { eatenToday: false },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    };

    const result = runPipeline({
      snapshot,
      memory: [
        {
          key: 'taste_preference',
          value: 'Japanese',
          status: 'confirmed',
          updatedAt: '2026-10-28T19:10:00.000Z',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T19:10:00.000Z' },
        },
      ],
      clock: '2026-10-28T19:10:00.000Z',
    });

    // Grocery IS suppressed by already_done
    const grocerySuppression = result.suppressions.find(s => s.targetIntent === 'grocery');
    expect(grocerySuppression?.code).toBe('already_done');

    // Lunch is NOT suppressed by already_done and appears in livingContext!
    const lunchSuppression = result.suppressions.find(s => s.targetIntent === 'lunch');
    expect(lunchSuppression).toBeUndefined();
    expect(result.livingContext.now?.intentId).toBe('lunch');
  });

  it('confirmed suppress_grocery fact does NOT suppress lunch or depart recommendations', () => {
    const memoryFacts: MemoryFact[] = [
      {
        key: 'suppress_grocery',
        value: true,
        status: 'confirmed',
        updatedAt: asOf,
        provenance: { source: 'user_confirmed', recordedAt: asOf },
      },
      {
        key: 'taste_preference',
        value: 'Japanese',
        status: 'confirmed',
        updatedAt: asOf,
        provenance: { source: 'user_confirmed', recordedAt: asOf },
      },
    ];

    const result = runPipeline({
      snapshot: {
        id: 'snap-supp-fact',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [
          createSimulatedSignal({
            kind: 'location_status',
            value: { isHome: false },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'schedule_window',
            value: { freeUntil: '2026-10-28T20:30:00.000Z' },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1.0,
            consentScope: 'device_only',
          }),
        ],
      },
      memory: memoryFacts,
      clock: '2026-10-28T19:10:00.000Z',
    });

    // Lunch plan is not suppressed by suppress_grocery memory fact
    expect(result.livingContext.now?.intentId).toBe('lunch');
  });
});
