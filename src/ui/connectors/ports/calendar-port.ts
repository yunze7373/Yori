/**
 * Calendar Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS.
 *
 * Implements truthful runtime state:
 * - No calendar adapter exists (calendar OAuth is out of hackathon scope).
 * - Always 'unavailable' with detail 'Not available yet'.
 * - No connect affordance, no toggle.
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';

export class CalendarConnectorPort implements ConnectorPort {
  public readonly id = 'calendar' as const;

  public async status(): Promise<ConnectorStatus> {
    return {
      id: this.id,
      state: 'unavailable',
      detail: 'Not available yet',
      source: 'Local capability audit',
      updatedAt: new Date().toISOString(),
    };
  }
}

export const calendarConnectorPort = new CalendarConnectorPort();
