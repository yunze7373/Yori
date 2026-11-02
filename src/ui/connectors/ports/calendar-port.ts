/**
 * Calendar Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Implements truthful runtime state:
 * - GET /api/calendar/status
 * - configured=true && enabled=true -> 'connected' ('iCalendar feed connected (read-only)')
 * - configured=true && enabled=false -> 'owner_gated' ('Live calendar is off (owner setting)')
 * - configured=false -> 'unavailable' ('Not available yet' with actionRequired instruction)
 * - Fetch error / non-200 -> 'unavailable' ('Not available yet')
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';

export interface CalendarStatusResponse {
  readonly enabled?: boolean;
  readonly configured?: boolean;
  readonly provider?: string;
  readonly attribution?: string;
  readonly actionRequired?: string;
}

export class CalendarConnectorPort implements ConnectorPort {
  public readonly id = 'calendar' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    try {
      if (typeof fetch === 'undefined') {
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'Not available yet',
          source: 'Local capability audit',
          updatedAt,
        };
      }

      const res = await fetch('/api/calendar/status', { cache: 'no-store' });
      if (!res.ok) {
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'Not available yet',
          source: '/api/calendar/status',
          updatedAt,
        };
      }

      const data = (await res.json()) as CalendarStatusResponse;

      if (data.configured === true && data.enabled === true) {
        return {
          id: this.id,
          state: 'connected',
          detail: 'iCalendar feed connected (read-only)',
          source: '/api/calendar/status',
          updatedAt,
        };
      }

      if (data.configured === true && data.enabled === false) {
        return {
          id: this.id,
          state: 'owner_gated',
          detail: 'Live calendar is off (owner setting)',
          source: '/api/calendar/status',
          updatedAt,
        };
      }

      // configured === false: honest connection-block state
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Not available yet',
        source: '/api/calendar/status',
        updatedAt,
      };
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Not available yet',
        source: '/api/calendar/status',
        updatedAt,
      };
    }
  }

  public async getStatusPayload(): Promise<CalendarStatusResponse> {
    try {
      if (typeof fetch === 'undefined') {
        return { enabled: false, configured: false };
      }
      const res = await fetch('/api/calendar/status', { cache: 'no-store' });
      if (res.ok) {
        return (await res.json()) as CalendarStatusResponse;
      }
      return { enabled: false, configured: false };
    } catch {
      return { enabled: false, configured: false };
    }
  }
}

export const calendarConnectorPort = new CalendarConnectorPort();
