/**
 * D1-LOCATION-WEATHER: which /api/weather/current request (if any) the client may send.
 *
 * - Live: only a consented geolocation fix (or a location the user typed in) is used,
 *   rounded to 3 decimals (~100 m) before it leaves the page. No fix or no consent -> null,
 *   so Live never falls back to the demo city and renders honest unavailable instead.
 * - Demo (dev-only, ?dev=1) and recorded tests: the coords-less request keeps the demo city.
 */

import type { LocationStatus } from '../../adapters/providers/location-port.js';

export const WEATHER_FIX_DECIMALS = 3;

export function roundFixCoordinate(value: number): string {
  const factor = 10 ** WEATHER_FIX_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  // Avoid "-0.000" for fixes that round to zero.
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(WEATHER_FIX_DECIMALS);
}

export function resolveWeatherCurrentUrl(
  contextMode: string,
  location: LocationStatus,
  consent: string | undefined
): string | null {
  if (contextMode !== 'live') {
    return '/api/weather/current';
  }
  const coords = location.coords;
  if (location.status !== 'available' || !coords) return null;
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;
  const consented =
    location.source === 'manual' || (location.source === 'geolocation' && consent === 'granted');
  if (!consented) return null;
  const value = `${roundFixCoordinate(coords.lat)},${roundFixCoordinate(coords.lng)}`;
  return `/api/weather/current?coords=${encodeURIComponent(value)}`;
}
