/**
 * Fuel Plan Preparer (V5-FUEL / LIVING_CONTEXT_V2.md §10.3)
 *
 * Prepares fuel recommendation plans based on current location and PlacesProvider candidates.
 * Straight-line distances are computed accurately and labelled as "(straight-line)".
 * If location is unavailable/denied or no candidates exist, fails closed or returns null.
 */

import type {
  Preparer,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  PreparedPlan,
  EvidenceCitation,
} from '../../core/contracts/index.js';
import type { LocationCoords, LocationPort } from '../../adapters/providers/location-port.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import {
  computeHaversineDistanceMeters,
  formatStraightLineDistance,
  FIXTURE_PLACE_TEMPLATES,
  type SimulatedPlaceTemplate,
} from '../../adapters/providers/simulated-places-provider.js';
import type { FuelCandidateOption } from './types.js';
import type { UserRequestOverride } from '../depart/request-override.js';

export interface FuelPreparerOptions {
  readonly templates?: readonly SimulatedPlaceTemplate[];
  readonly maxRadiusMeters?: number;
  readonly locationPort?: LocationPort;
}

export class FuelPreparer implements Preparer {
  public readonly id = 'fuel-preparer';
  public readonly targetIntent = 'fuel';

  private readonly templates: readonly SimulatedPlaceTemplate[];
  private readonly maxRadiusMeters: number;
  private readonly locationPort: LocationPort;

  constructor(options: FuelPreparerOptions = {}) {
    this.templates = options.templates ?? FIXTURE_PLACE_TEMPLATES;
    this.maxRadiusMeters = options.maxRadiusMeters ?? 10000;
    this.locationPort = options.locationPort ?? defaultLocationPort;
  }

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
    _memory: readonly MemoryFact[],
    _override?: UserRequestOverride | null,
    coordsOverride?: LocationCoords
  ): PreparedPlan | null {
    if (!candidate || candidate.intent !== 'fuel' || !snapshot) {
      return null;
    }

    // 1. Resolve current coordinates from coordsOverride, snapshot signal, or locationPort
    let currentCoords: LocationCoords | undefined;
    if (coordsOverride !== undefined) {
      currentCoords = coordsOverride;
    } else {
      const locSig = snapshot.signals.find(s => s.kind === 'location_status' || s.kind === 'location');
      if (locSig && typeof locSig.value === 'object' && locSig.value !== null) {
        const val = locSig.value as Record<string, unknown>;
        if (typeof val.lat === 'number' && typeof val.lng === 'number') {
          currentCoords = { lat: val.lat, lng: val.lng };
        }
      }
      if (!currentCoords) {
        const locStatus = this.locationPort.getLocation();
        if (locStatus.status !== 'available' || !locStatus.coords) {
          // Location unavailable or denied -> fail closed (cannot search nearby fuel)
          return null;
        }
        currentCoords = locStatus.coords;
      }
    }

    if (!currentCoords) {
      return null;
    }

    // 2. Search nearby gas stations within search radius
    const options: FuelCandidateOption[] = [];
    for (const t of this.templates) {
      if (t.category !== 'gas_station') {
        continue;
      }

      const dist = computeHaversineDistanceMeters(currentCoords, t.coords);
      if (dist <= this.maxRadiusMeters) {
        options.push({
          id: t.id,
          name: t.name,
          label: `${t.name} (${formatStraightLineDistance(dist)})`,
          coords: t.coords,
          category: 'gas_station',
          source: 'simulated',
          address: t.address,
          straightLineDistanceMeters: dist,
          straightLineDistanceLabel: formatStraightLineDistance(dist),
          requiresConfirmation: false,
          brand: t.brand,
        });
      }
    }

    if (options.length === 0) {
      return null;
    }

    // Sort by distance ascending, take top 3
    options.sort((a, b) => a.straightLineDistanceMeters - b.straightLineDistanceMeters);
    const topCandidates = options.slice(0, 3);
    const topStation = topCandidates[0]!;

    const timezone = snapshot.timezone || 'America/Los_Angeles';
    const nowIso = snapshot.asOf || new Date().toISOString();

    const evidenceSignals: EvidenceCitation[] = [
      {
        kind: 'location',
        description: `Coordinates (${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}) · simulated`,
        source: 'simulated',
        issuedAt: nowIso,
      },
    ];

    const derivation = `Found nearby fuel: ${topCandidates.map(c => `${c.name} (${c.straightLineDistanceLabel})`).join(', ')}; ranked by straight-line distance; simulated data.`;

    const plan: PreparedPlan = {
      id: `fuel-plan-${nowIso}`,
      intentId: 'fuel',
      subjectTitle: 'Nearby Gas Stations',
      headline: `Nearby Fuel: ${topStation.name} (${topStation.straightLineDistanceLabel}) · simulated`,
      createdAt: nowIso,
      timezone,
      optionsOrSteps: topCandidates,
      requiresConfirmation: false,
      why: {
        derivation,
        evidenceSignals,
        memoryFactsUsed: [],
      },
    };

    return Object.freeze(plan);
  }
}

export const fuelPreparer = new FuelPreparer();
