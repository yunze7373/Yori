/**
 * Grocery Plan Preparer
 * Governed by AC-EXT-1, INV-102, INV-103.
 * Prepares deterministic grocery shopping plan from detected candidate and memory facts.
 */

import type {
  Preparer,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  PreparedPlan,
  MemoryCitation,
} from '../../core/contracts/index.js';

export class GroceryPreparer implements Preparer {
  public readonly id = 'grocery-preparer';
  public readonly targetIntent = 'grocery';

  public prepare(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    if (candidate.intent !== 'grocery') {
      return null;
    }

    const groceryListSignal = candidate.evidence.find(s => s.kind === 'grocery_list');
    if (!groceryListSignal || !groceryListSignal.value || typeof groceryListSignal.value !== 'object') {
      return null;
    }

    const val = groceryListSignal.value as Record<string, unknown>;
    const items = Array.isArray(val.items) ? val.items : [];
    const itemCount = items.length;

    // Check confirmed store preference memory
    const storeFact = memory.find(
      f => (f.key === 'grocery_store_preference' || f.key === 'preferred_grocery_store') && f.status === 'confirmed'
    );

    const memoryFactsUsed: MemoryCitation[] = [];
    if (storeFact) {
      memoryFactsUsed.push({
        key: storeFact.key,
        value: storeFact.value,
        status: storeFact.status,
      });
    }

    const storeName = storeFact && typeof storeFact.value === 'string' ? storeFact.value : 'Trader Joe’s';

    const itemNames = items.slice(0, 3).map((it: unknown) => {
      if (typeof it === 'string') return it;
      if (typeof it === 'object' && it !== null && 'name' in it) {
        return String((it as { name: unknown }).name);
      }
      return 'item';
    });

    const headline = `Grocery run: ${itemCount} item${itemCount === 1 ? '' : 's'} on your list`;
    const planId = `plan-grocery-${Date.parse(snapshot.asOf)}`;

    return Object.freeze({
      id: planId,
      intentId: 'grocery',
      headline,
      optionsOrSteps: Object.freeze(itemNames),
      requiresConfirmation: false,
      why: Object.freeze({
        derivation: `Detected shopping list with ${itemCount} items. Recommended stopping at ${storeName}.`,
        evidenceSignals: Object.freeze([...candidate.evidence].map(e => ({
          kind: e.kind,
          source: e.source,
          issuedAt: e.issuedAt,
        }))),
        memoryFactsUsed: Object.freeze(memoryFactsUsed),
      }),
      createdAt: snapshot.asOf,
      timezone: snapshot.timezone ?? 'UTC',
      subjectTitle: `Grocery shopping (${storeName})`,
    });
  }
}

export const groceryPreparer = new GroceryPreparer();
