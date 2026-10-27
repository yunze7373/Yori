/**
 * Mock Grocery Provider Adapter
 * Governed by AC-EXT-1 and Invariant INV-102.
 * Returns only SimulatedSignal with label 'simulated'.
 */

import {
  createSimulatedSignal,
  type SimulatedProviderAdapter,
  type SimulatedSignal,
} from '../../core/contracts/index.js';

export interface GroceryItem {
  readonly id: string;
  readonly name: string;
  readonly quantity?: string;
}

export class MockGroceryAdapter implements SimulatedProviderAdapter {
  public readonly kind = 'mock-grocery-adapter';
  public readonly source = 'simulated' as const;

  public createGroceryListSignal(
    items: readonly (string | GroceryItem)[],
    issuedAt: string
  ): SimulatedSignal {
    const normalizedItems = items.map(item =>
      typeof item === 'string' ? { id: item.toLowerCase().replace(/\s+/g, '-'), name: item } : item
    );

    return createSimulatedSignal({
      kind: 'grocery_list',
      value: {
        itemCount: normalizedItems.length,
        items: normalizedItems,
      },
      issuedAt,
      validFor: 86400000,
      confidence: 1.0,
      consentScope: 'device_only',
    });
  }

  public createGroceryStatusSignal(
    options: { completedToday?: boolean; shoppedAt?: string },
    issuedAt: string
  ): SimulatedSignal {
    return createSimulatedSignal({
      kind: 'grocery_status',
      value: {
        completedToday: options.completedToday ?? false,
        shoppedAt: options.shoppedAt,
      },
      issuedAt,
      validFor: 86400000,
      confidence: 1.0,
      consentScope: 'device_only',
    });
  }

  public signals(asOfIso: string = '2026-10-28T16:00:00.000Z'): readonly SimulatedSignal[] {
    return Object.freeze([
      this.createGroceryListSignal(['Milk', 'Eggs', 'Bread'], asOfIso),
    ]);
  }
}

export const mockGroceryAdapter = new MockGroceryAdapter();
