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
  setDestination?(destination: DestinationInfo | null): void;
}

export class LiveDestinationAdapter implements DestinationPort {
  private destination: DestinationInfo | null = null;

  setDestination(destination: DestinationInfo | null): void {
    this.destination = destination;
  }

  async getLiveDestination(): Promise<DestinationInfo | null> {
    return this.destination;
  }
}
