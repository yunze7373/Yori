/**
 * Fuel Plugin Types (V5-FUEL / LIVING_CONTEXT_V2.md §10.3)
 */

import type { LocationCoords } from '../../adapters/providers/location-port.js';

export interface FuelCandidateOption {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly coords: LocationCoords;
  readonly category: 'gas_station';
  readonly source: 'simulated' | 'recorded' | 'live';
  readonly address?: string;
  readonly straightLineDistanceMeters: number;
  readonly straightLineDistanceLabel: string;
  readonly requiresConfirmation: boolean;
  readonly brand?: string;
}
