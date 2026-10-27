/**
 * Grocery Intent Detector
 * Governed by AC-EXT-1, INV-108, INV-109.
 *
 * Detects grocery intent when items exist on the shopping list.
 * Evaluates completion and schedule state into candidate metadata for generic core policy handling.
 * Zero suppression logic inside the plugin (INV-108).
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
} from '../../core/contracts/index.js';

export class GroceryDetector implements IntentDetector {
  public readonly id = 'grocery-detector';
  public readonly targetIntent = 'grocery';

  public detect(
    snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): IntentCandidate | null {
    if (!snapshot || !Array.isArray(snapshot.signals) || snapshot.signals.length === 0) {
      return null;
    }

    const groceryListSignal = snapshot.signals.find(s => s.kind === 'grocery_list');
    if (!groceryListSignal || !groceryListSignal.value || typeof groceryListSignal.value !== 'object') {
      return null;
    }

    const val = groceryListSignal.value as Record<string, unknown>;
    const items = Array.isArray(val.items) ? val.items : [];
    if (items.length === 0) {
      return null;
    }

    const groceryStatusSignal = snapshot.signals.find(s => s.kind === 'grocery_status');
    let completedToday = false;
    if (groceryStatusSignal && groceryStatusSignal.value && typeof groceryStatusSignal.value === 'object') {
      const statusVal = groceryStatusSignal.value as Record<string, unknown>;
      if (statusVal.completedToday === true) {
        completedToday = true;
      }
    }

    const scheduleSignal = snapshot.signals.find(s => s.kind === 'schedule_window');
    let isUserBusy = false;
    if (scheduleSignal && scheduleSignal.value && typeof scheduleSignal.value === 'object') {
      const schedVal = scheduleSignal.value as Record<string, unknown>;
      if (schedVal.isBusy === true) {
        isUserBusy = true;
      }
    }

    const evidence: ContextSignal[] = [groceryListSignal];
    if (groceryStatusSignal) evidence.push(groceryStatusSignal);
    if (scheduleSignal) evidence.push(scheduleSignal);

    return Object.freeze({
      intent: 'grocery',
      confidence: 0.85,
      evidence: Object.freeze(evidence),
      urgency: 'low',
      suggestedPlanningHorizonMs: 7200000,
      suppressedBy: undefined, // Zero suppression inside plugin (INV-108)
      metadata: Object.freeze({
        isBusy: isUserBusy,
        completedToday,
        itemCount: items.length,
      }),
    });
  }
}

export const groceryDetector = new GroceryDetector();
