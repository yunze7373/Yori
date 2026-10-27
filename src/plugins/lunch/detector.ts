/**
 * Lunch Intent Detector
 * Governed by Invariants INV-108, INV-109, and AC-103-1.
 *
 * Detects lunch intent when away from home, during a free window, or when eating status signals are present.
 * Invariant INV-108: Detector carries zero suppression logic. Suppressions (user_busy, already_done,
 * user_suppressed, budget_exhausted) are evaluated exclusively by the shared core policy engine.
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
} from '../../core/contracts/index.js';

export class LunchDetector implements IntentDetector {
  public readonly id = 'lunch-detector';
  public readonly targetIntent = 'lunch';

  public detect(
    snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): IntentCandidate | null {
    if (!snapshot || !Array.isArray(snapshot.signals) || snapshot.signals.length === 0) {
      return null;
    }

    const signals = snapshot.signals;

    // Locate lunch-relevant environmental signals
    const locationSignal = signals.find(s => s.kind === 'location_status');
    const scheduleSignal = signals.find(s => s.kind === 'schedule_window');
    const eatingSignal = signals.find(s => s.kind === 'eating_status');
    const mockPlacesSignal = signals.find(s => s.kind === 'mock_places');

    // If user is explicitly at home (isHome === true) and there is no schedule/eating trigger, no lunch-away candidate
    if (locationSignal && locationSignal.value && typeof locationSignal.value === 'object') {
      const locVal = locationSignal.value as Record<string, unknown>;
      if (locVal.isHome === true && !scheduleSignal && !eatingSignal) {
        return null;
      }
    }

    // Must have at least one lunch-relevant signal: location_status (away), schedule_window, eating_status, or mock_places
    const relevantSignals: ContextSignal[] = [];
    if (locationSignal) relevantSignals.push(locationSignal);
    if (scheduleSignal) relevantSignals.push(scheduleSignal);
    if (eatingSignal) relevantSignals.push(eatingSignal);
    if (mockPlacesSignal) relevantSignals.push(mockPlacesSignal);

    if (relevantSignals.length === 0) {
      return null;
    }

    // Check validity of evidence signals (fail closed if required signals have expired)
    const snapshotAsOfMs = Date.parse(snapshot.asOf);
    for (const sig of relevantSignals) {
      if (
        typeof sig.validFor === 'number' &&
        typeof sig.issuedAt === 'string' &&
        Number.isFinite(snapshotAsOfMs)
      ) {
        const issuedAtMs = Date.parse(sig.issuedAt);
        if (Number.isFinite(issuedAtMs) && snapshotAsOfMs - issuedAtMs > sig.validFor) {
          // Expired signal is handled by policy fail-closed evaluation
        }
      }
    }

    // Base confidence from relevant signals (min 0.85 to be above low_confidence 0.6 threshold)
    const confidences = relevantSignals
      .map(s => s.confidence)
      .filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
    const confidence = confidences.length > 0 ? Math.min(...confidences) : 0.85;

    return Object.freeze({
      intent: 'lunch',
      confidence,
      evidence: Object.freeze(relevantSignals),
      urgency: 'medium',
      suggestedPlanningHorizonMs: 3600000,
      suppressedBy: undefined, // Zero suppression in plugins (INV-108)
    });
  }
}

export const lunchDetector = new LunchDetector();
