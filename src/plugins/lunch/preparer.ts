/**
 * Lunch Plan Preparer
 * Governed by Invariants INV-103, INV-104, INV-107 and AC-103-1.
 *
 * Deterministically prepares lunch recommendation plans based on confirmed taste memory facts.
 * Fails closed (returns null) if no confirmed taste facts exist.
 * Ranks mock places by taste fit and returns at most 3 options.
 */

import type {
  Preparer,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  PreparedPlan,
  EvidenceCitation,
  MemoryCitation,
} from '../../core/contracts/index.js';
import { mockPlaceAdapter, type MockPlaceItem } from '../../adapters/mock/index.js';

export interface RankedPlaceOption {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes: number;
  readonly requiresConfirmation: boolean;
}

export class LunchPreparer implements Preparer {
  public readonly id = 'lunch-preparer';
  public readonly targetIntent = 'lunch';

  public prepare(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    if (!candidate || candidate.intent !== 'lunch' || !snapshot) {
      return null;
    }

    // 1. Invariant AC-103-1: Must cite confirmed taste facts; missing taste facts fail closed
    const confirmedTasteFacts = memory.filter(
      f =>
        f.status === 'confirmed' &&
        (f.key === 'taste_preference' ||
          f.key === 'favorite_cuisine' ||
          f.key.toLowerCase().includes('taste') ||
          f.key.toLowerCase().includes('cuisine') ||
          f.key.toLowerCase().includes('food'))
    );

    if (confirmedTasteFacts.length === 0) {
      // Fail closed: cannot prepare lunch recommendation without confirmed taste memory
      return null;
    }

    // 2. Extract taste keywords from confirmed facts
    const tasteKeywords: string[] = [];
    for (const fact of confirmedTasteFacts) {
      if (typeof fact.value === 'string') {
        // Split on separators like commas, underscores, or 'or'
        const tokens = fact.value
          .toLowerCase()
          .split(/[\s,_\/]+|\bor\b/)
          .map(t => t.trim())
          .filter(t => t.length > 1);
        tasteKeywords.push(...tokens);
      }
    }

    // 3. Locate mock places from snapshot signals, or fall back to mockPlaceAdapter
    const placesSignal = snapshot.signals.find(s => s.kind === 'mock_places');
    let availablePlaces: readonly MockPlaceItem[] = [];

    if (placesSignal?.value && Array.isArray(placesSignal.value)) {
      availablePlaces = placesSignal.value as readonly MockPlaceItem[];
    } else {
      availablePlaces = mockPlaceAdapter.getPlaces();
    }

    if (!availablePlaces || availablePlaces.length === 0) {
      return null;
    }

    // 4. Score and rank places by confirmed taste fit
    const scoredPlaces = availablePlaces.map(place => {
      const cuisineLower = place.cuisine.toLowerCase();
      const nameLower = place.name.toLowerCase();

      let matchScore = 0;
      for (const kw of tasteKeywords) {
        if (cuisineLower.includes(kw)) {
          matchScore += 2;
        }
        if (nameLower.includes(kw)) {
          matchScore += 1;
        }
      }

      return {
        place,
        matchScore,
      };
    });

    // Filter to places matching at least one taste keyword
    const matchingPlaces = scoredPlaces.filter(p => p.matchScore > 0);
    if (matchingPlaces.length === 0) {
      // If none match confirmed taste, fail closed rather than proposing unsuitable options
      return null;
    }

    // Sort: highest taste match first, then closest distance, then alphabetical by name
    matchingPlaces.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      if (a.place.distanceMinutes !== b.place.distanceMinutes) {
        return a.place.distanceMinutes - b.place.distanceMinutes;
      }
      return a.place.name.localeCompare(b.place.name);
    });

    // 5. Select at most 3 options (Section 7 outcome)
    const selected = matchingPlaces.slice(0, 3).map(m => m.place);

    const optionsOrSteps: RankedPlaceOption[] = selected.map((p, idx) =>
      Object.freeze({
        id: `opt-${idx + 1}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        label: `${p.name} (${p.cuisine}) · ${p.distanceMinutes}m away`,
        name: p.name,
        cuisine: p.cuisine,
        distanceMinutes: p.distanceMinutes,
        requiresConfirmation: false,
      })
    );

    // 6. Assemble evidence signals for Explainable Why (INV-103)
    const evidenceSignals: EvidenceCitation[] = [];
    for (const sig of candidate.evidence) {
      evidenceSignals.push(
        Object.freeze({
          kind: sig.kind,
          source: sig.source,
          issuedAt: sig.issuedAt,
          description: `${sig.kind} signal evaluated at ${sig.issuedAt}`,
        })
      );
    }
    if (placesSignal && !evidenceSignals.some(e => e.kind === 'mock_places')) {
      evidenceSignals.push(
        Object.freeze({
          kind: placesSignal.kind,
          source: placesSignal.source,
          issuedAt: placesSignal.issuedAt,
          description: 'Nearby mock places list',
        })
      );
    }

    const memoryFactsUsed: MemoryCitation[] = confirmedTasteFacts.map(f =>
      Object.freeze({
        key: f.key,
        value: f.value,
        status: f.status,
      })
    );

    const tasteFactSummary = confirmedTasteFacts
      .map(f => `${f.key}=${String(f.value)}`)
      .join(', ');

    return Object.freeze({
      id: `plan-lunch-${snapshot.asOf.replace(/[^0-9]/g, '')}`,
      intentId: 'lunch',
      headline: `Lunch options near you (${selected.length} places matching your tastes)`,
      optionsOrSteps: Object.freeze(optionsOrSteps),
      requiresConfirmation: false, // Informational recommendation card; not a booking or payment (INV-104)
      timezone: snapshot.timezone,
      createdAt: snapshot.asOf,
      why: Object.freeze({
        evidenceSignals: Object.freeze(evidenceSignals),
        memoryFactsUsed: Object.freeze(memoryFactsUsed),
        derivation: `Recommended ${selected.length} options matching confirmed taste preferences (${tasteFactSummary}).`,
      }),
    });
  }
}

export const lunchPreparer = new LunchPreparer();
