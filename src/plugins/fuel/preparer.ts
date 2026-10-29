/**
 * Fuel Plan Preparer (V5-FUEL / LIVING_CONTEXT_V2.md §10.3)
 *
 * Prepares fuel recommendation plans based on current location and PlacesProvider candidates.
 * Consumes PlaceItems from the PlacesProvider seam (or places_fuel signal).
 * Invariant: Zero template imports; provider failure or empty results fails closed.
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
import type { PlaceItem, PlacesProvider } from '../../adapters/providers/places-types.js';
import { defaultSimulatedPlacesProvider, computeHaversineDistanceMeters, formatStraightLineDistance } from '../../adapters/providers/simulated-places-provider.js';
import type { FuelCandidateOption } from './types.js';
import type { PlacesFuelSignalValue } from './adapter.js';
import type { UserRequestOverride } from '../depart/request-override.js';

export interface FuelPreparerOptions {
  readonly placesProvider?: PlacesProvider;
  readonly maxRadiusMeters?: number;
  readonly locationPort?: LocationPort;
}

export class FuelPreparer implements Preparer {
  public readonly id = 'fuel-preparer';
  public readonly targetIntent = 'fuel';

  private readonly placesProvider: PlacesProvider;
  private readonly maxRadiusMeters: number;
  private readonly locationPort: LocationPort;

  constructor(options: FuelPreparerOptions = {}) {
    this.placesProvider = options.placesProvider ?? defaultSimulatedPlacesProvider;
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

    // 2. Obtain PlaceItems from snapshot places_fuel signal or query the PlacesProvider seam
    let placeItems: readonly PlaceItem[] = [];
    const placesSig = snapshot.signals.find(s => s.kind === 'places_fuel');
    if (placesSig && typeof placesSig.value === 'object' && placesSig.value !== null) {
      const pVal = placesSig.value as PlacesFuelSignalValue;
      if (pVal.status === 'error') {
        return null; // Provider failure -> fail closed
      }
      placeItems = pVal.places ?? [];
    } else if (this.placesProvider && this.placesProvider.searchNearbySync) {
      try {
        placeItems = this.placesProvider.searchNearbySync({
          location: currentCoords,
          category: 'gas_station',
          radiusMeters: this.maxRadiusMeters,
        });
      } catch {
        return null; // Provider failure -> fail closed
      }
    }

    if (placeItems.length === 0) {
      return null; // Zero results -> fail closed
    }

    // 3. Map PlaceItems to FuelCandidateOptions
    const options: FuelCandidateOption[] = placeItems.map(p => {
      const distMeters = p.straightLineDistanceMeters ?? computeHaversineDistanceMeters(currentCoords!, p.coords);
      const distLabel = p.straightLineDistanceLabel ?? formatStraightLineDistance(distMeters);
      return {
        id: p.placeId,
        name: p.name,
        label: `${p.name} (${distLabel})`,
        coords: p.coords,
        category: 'gas_station',
        source: p.source,
        address: p.address,
        straightLineDistanceMeters: distMeters,
        straightLineDistanceLabel: distLabel,
        requiresConfirmation: false,
        brand: p.brand,
      };
    });

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

    const distClean = topStation.straightLineDistanceLabel
      ? topStation.straightLineDistanceLabel.replace(' (straight-line)', ' straight-line')
      : undefined;
    const headline = distClean ? `${topStation.name} · ${distClean}` : topStation.name;

    const plan: PreparedPlan = {
      id: `fuel-plan-${nowIso}`,
      intentId: 'fuel',
      subjectTitle: 'Nearby Gas Stations',
      headline,
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
