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

/**
 * D5-LIVE-FORECAST: the /api/weather/forecast request for a trip window, or null when the client may
 * not send one. Live only, with the same consent and 3-decimal rounding as current conditions.
 * The window is [leave-by, appointment], clamped to the proxy's bounds (from >= now - 1 h, at most
 * 12 h long); a window that has already ended returns null.
 */
export function resolveWeatherForecastUrl(
  contextMode: string,
  location: LocationStatus,
  consent: string | undefined,
  window: { readonly leaveAt: string; readonly apptAt: string },
  nowMs: number
): string | null {
  if (contextMode !== 'live') return null;
  const current = resolveWeatherCurrentUrl(contextMode, location, consent);
  if (!current) return null;
  const coords = new URL(current, 'http://local').searchParams.get('coords');
  const leaveMs = Date.parse(window.leaveAt);
  const apptMs = Date.parse(window.apptAt);
  if (!coords || !Number.isFinite(leaveMs) || !Number.isFinite(apptMs)) return null;
  const toMs = apptMs;
  let fromMs = Math.max(leaveMs, nowMs - 30 * 60_000);
  if (toMs - fromMs > 12 * 3600_000) fromMs = toMs - 12 * 3600_000;
  if (toMs <= fromMs || toMs <= nowMs) return null;
  const iso = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
  return `/api/weather/forecast?coords=${encodeURIComponent(coords)}&from=${iso(fromMs)}&to=${iso(toMs)}`;
}
