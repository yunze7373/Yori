/**
 * Destination Port Interface and Live Destination Adapter
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Current Live destination source is NONE (no calendar or geocoder connected;
 * L3 places will connect later). The UI must never invent destinations in Live mode.
 */

import type { DestinationInfo } from './routing-types.js';

export interface DestinationPort {
  getLiveDestination(): Promise<DestinationInfo | null>;
}

export class LiveDestinationAdapter implements DestinationPort {
  async getLiveDestination(): Promise<DestinationInfo | null> {
    // Zero invented destinations. Returns null until real calendar or geocoder/places connects.
    return null;
  }
}
