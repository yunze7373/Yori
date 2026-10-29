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
import { formatStraightLineDistance } from '../../adapters/providers/simulated-places-provider.js';
import type { UserRequestOverride } from '../depart/request-override.js';

export interface RankedPlaceOption {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes?: number;
  readonly requiresConfirmation: boolean;
  readonly noiseLevel?: string;
  readonly vegetarian?: boolean;
  readonly recordId?: string;
  readonly coords?: { readonly lat: number; readonly lng: number };
  readonly straightLineDistanceMeters?: number;
  readonly straightLineDistanceLabel?: string;
}

export class LunchPreparer implements Preparer {
  public readonly id = 'lunch-preparer';
  public readonly targetIntent = 'lunch';

  public prepare(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    return this.prepareWithRequest(candidate, snapshot, memory, null);
  }

  public prepareWithRequest(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[],
    override?: UserRequestOverride | null
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

    // 3. Locate places from snapshot signals (places_lunch or mock_places), or fall back to mockPlaceAdapter
    const lunchPlacesSignal = snapshot.signals.find(s => s.kind === 'places_lunch');
    const placesSignal = snapshot.signals.find(s => s.kind === 'mock_places');
    let availablePlaces: readonly MockPlaceItem[] = [];

    if (lunchPlacesSignal) {
      const val = lunchPlacesSignal.value as any;
      if (
        val?.status === 'error' ||
        val?.status === 'empty' ||
        !Array.isArray(val?.places) ||
        val.places.length === 0
      ) {
        // Fail closed on provider error or empty places per AC-213-1/AC-213-2
        return null;
      }
      availablePlaces = val.places.map((p: any) => {
        const distM = p.straightLineDistanceMeters ?? p.distanceMeters;
        const distLabel =
          p.straightLineDistanceLabel ??
          (typeof distM === 'number' ? formatStraightLineDistance(distM) : undefined);
        return {
          id: p.id || p.placeId,
          name: p.name,
          cuisine: p.cuisine || 'dining',
          distanceMinutes: undefined,
          noiseLevel: p.noiseLevel,
          vegetarian: p.vegetarian,
          coords: p.coords,
          straightLineDistanceMeters: distM,
          straightLineDistanceLabel: distLabel,
        };
      });
    } else if (placesSignal?.value && Array.isArray(placesSignal.value)) {
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

    // Filter to places matching at least one taste keyword (Non-resurrection invariant C1)
    const matchingPlaces = scoredPlaces.filter(p => p.matchScore > 0);
    if (matchingPlaces.length === 0) {
      // If none match confirmed taste, fail closed rather than proposing unsuitable options
      return null;
    }

    // 5. Evaluate filters from UserRequestOverride if present
    const filters = override?.kind === 'lunch_filter' && Array.isArray(override.filters)
      ? override.filters
      : [];

    const scoredWithOverride = matchingPlaces.map(item => {
      let filterScore = 0;
      if (filters.length > 0) {
        if (filters.includes('quieter') && item.place.noiseLevel === 'quiet') {
          filterScore += 100;
        }
        if (filters.includes('vegetarian') && item.place.vegetarian === true) {
          filterScore += 100;
        }
        if (filters.includes('nearer')) {
          if (typeof item.place.distanceMinutes === 'number') {
            filterScore += Math.max(0, 30 - item.place.distanceMinutes) * 2;
          } else if (typeof (item.place as any).straightLineDistanceMeters === 'number') {
            filterScore += Math.max(0, 3000 - (item.place as any).straightLineDistanceMeters) / 100;
          }
        }
      }
      return {
        ...item,
        totalScore: item.matchScore + filterScore,
      };
    });

    // Sort: highest total score first, then closest distance, then alphabetical by name
    scoredWithOverride.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      const distA =
        (a.place as any).straightLineDistanceMeters ??
        (typeof a.place.distanceMinutes === 'number' ? a.place.distanceMinutes * 80 : 0);
      const distB =
        (b.place as any).straightLineDistanceMeters ??
        (typeof b.place.distanceMinutes === 'number' ? b.place.distanceMinutes * 80 : 0);
      if (distA !== distB) {
        return distA - distB;
      }
      return a.place.name.localeCompare(b.place.name);
    });

    // 6. Select at most 3 options (Section 7 outcome)
    const selected = scoredWithOverride.slice(0, 3).map(m => m.place);

    const optionsOrSteps: RankedPlaceOption[] = selected.map((p, idx) => {
      const extraTags: string[] = [];
      if (p.noiseLevel) extraTags.push(p.noiseLevel);
      if (p.vegetarian) extraTags.push('vegetarian');
      const tagsSuffix = extraTags.length > 0 ? ` · ${extraTags.join(' · ')}` : '';
      const matchedAdapterPlace = mockPlaceAdapter.getPlaces().find(ap => ap.name === p.name);
      const placeId = p.id || matchedAdapterPlace?.id;
      const pAny = p as any;

      const distLabel =
        pAny.straightLineDistanceLabel ??
        (typeof p.distanceMinutes === 'number' ? `${p.distanceMinutes}m away` : '');
      const label = distLabel
        ? `${p.name} (${p.cuisine}) · ${distLabel}${tagsSuffix}`
        : `${p.name} (${p.cuisine})${tagsSuffix}`;

      return Object.freeze({
        id: `opt-${idx + 1}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        recordId: placeId,
        label,
        name: p.name,
        cuisine: p.cuisine,
        distanceMinutes: p.distanceMinutes,
        coords: pAny.coords,
        straightLineDistanceMeters: pAny.straightLineDistanceMeters,
        straightLineDistanceLabel: pAny.straightLineDistanceLabel,
        requiresConfirmation: false,
        noiseLevel: p.noiseLevel,
        vegetarian: p.vegetarian,
      });
    });

    // 7. Assemble evidence signals for Explainable Why (INV-103)
    const evidenceSignals: EvidenceCitation[] = [];

    if (override && override.kind === 'lunch_filter' && filters.length > 0) {
      const filterLabels = filters.join(', ');
      evidenceSignals.push(
        Object.freeze({
          kind: 'user_request',
          source: 'simulated',
          issuedAt: override.provenance.at,
          description: `Because you asked: ${filterLabels} · this time only`,
        })
      );
    }

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
    if (lunchPlacesSignal && !evidenceSignals.some(e => e.kind === 'places_lunch')) {
      evidenceSignals.push(
        Object.freeze({
          kind: lunchPlacesSignal.kind,
          source: lunchPlacesSignal.source,
          issuedAt: lunchPlacesSignal.issuedAt,
          description: 'Simulated restaurant places from provider',
        })
      );
    } else if (placesSignal && !evidenceSignals.some(e => e.kind === 'mock_places')) {
      evidenceSignals.push(
        Object.freeze({
          kind: placesSignal.kind,
          source: placesSignal.source,
          issuedAt: placesSignal.issuedAt,
          description: 'Demo place list',
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

    const filterNote = filters.length > 0
      ? `Because you asked: ${filters.join(', ')} · this time only; `
      : '';

    const headline = filters.length > 0
      ? `Lunch options near you · prioritized for ${filters.join(', ')}`
      : `Lunch options near you (${selected.length} places matching your tastes)`;

    const isUserConfirmed = confirmedTasteFacts.every(
      f => (f.provenance as any)?.source === 'user_confirmed'
    );
    const tasteDesc = isUserConfirmed
      ? 'confirmed taste preferences'
      : 'sample taste preferences from the demo profile';

    return Object.freeze({
      id: `plan-lunch-${snapshot.asOf.replace(/[^0-9]/g, '')}`,
      intentId: 'lunch',
      headline,
      optionsOrSteps: Object.freeze(optionsOrSteps),
      requiresConfirmation: false, // Informational recommendation card; not a booking or payment (INV-104)
      timezone: snapshot.timezone,
      createdAt: snapshot.asOf,
      why: Object.freeze({
        evidenceSignals: Object.freeze(evidenceSignals),
        memoryFactsUsed: Object.freeze(memoryFactsUsed),
        derivation: `${filterNote}Recommended ${selected.length} options matching ${tasteDesc} (${tasteFactSummary}).`,
      }),
    });
  }
}

export const lunchPreparer = new LunchPreparer();
