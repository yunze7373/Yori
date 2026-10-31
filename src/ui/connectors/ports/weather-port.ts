/**
 * Weather Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and AC-204-2.
 *
 * Implements truthful runtime read:
 * - GET /api/weather/status
 * - enabled false -> owner_gated ('Live weather is off (owner setting)')
 * - enabled true -> connected ('Open-Meteo · <demoCity.name> · fixed demo city (not your location)')
 * - Fetch error / non-200 -> unavailable
 * - No user toggle; enabling remains owner-gated (GATE-W1).
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';

export class WeatherConnectorPort implements ConnectorPort {
  public readonly id = 'weather' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    try {
      const res = await fetch('/api/weather/status', { cache: 'no-store' });
      if (!res.ok) {
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'Weather service unavailable',
          source: '/api/weather/status',
          updatedAt,
        };
      }

      const data = await res.json();
      const rawCity = data?.demoCity;
      const cityName =
        typeof rawCity === 'object' && rawCity?.name
          ? rawCity.name
          : typeof rawCity === 'string'
            ? rawCity
            : 'San Francisco, CA';

      if (data?.enabled === true) {
        return {
          id: this.id,
          state: 'connected',
          detail: `Open-Meteo · ${cityName} · fixed demo city (not your location)`,
          source: '/api/weather/status',
          updatedAt,
        };
      }

      return {
        id: this.id,
        state: 'owner_gated',
        detail: 'Live weather is off (owner setting)',
        source: '/api/weather/status',
        updatedAt,
      };
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Weather service unavailable',
        source: '/api/weather/status',
        updatedAt,
      };
    }
  }
}

export const weatherConnectorPort = new WeatherConnectorPort();
