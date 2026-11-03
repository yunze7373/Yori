/**
 * Open-Meteo Real Weather Provider Adapter
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103, INV-106.
 *
 * Requirements:
 * 1. Location: the configured coordinate — the fixed demo city (DEFAULT_DEMO_CITY) by default,
 *    or a consented device fix already rounded to 3 decimals by the first-party proxy (D1).
 *    NEVER calls browser geolocation APIs itself.
 * 2. Keyless / Free API: Open-Meteo endpoint (no API keys, zero paid services, CC BY 4.0).
 * 3. Signals: returns RealSignal<WeatherData> (source: 'real', label: 'real', bounded validFor: 1h).
 * 4. Fail-closed: network failure, 5xx, or malformed data returns empty list (INV-106).
 *    Never invents weather data (INV-103).
 * 5. Feature-flagged: WEATHER_LIVE_ENABLED (default: false). When false, no network calls are made.
 */

import type { RealProviderAdapter, RealSignal } from '../../core/contracts/index.js';
import { createRealSignal } from './real-signal.js';
import {
  DEFAULT_DEMO_CITY,
  type DemoCityCoordinate,
  type WeatherCondition,
  type WeatherData,
} from './weather-types.js';

export interface OpenMeteoAdapterOptions {
  readonly enabled?: boolean;
  readonly coordinate?: DemoCityCoordinate;
  readonly fetchFn?: typeof fetch;
  readonly validForMs?: number;
  readonly timeoutMs?: number;
}

export function mapWmoCodeToCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
    return 'rain';
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return 'snow';
  }
  return 'cloudy';
}

export function resolveOpenMeteoIsoTimestamp(
  timeStr: unknown,
  utcOffsetSeconds: unknown
): string | null {
  if (typeof timeStr !== 'string' || !timeStr.trim()) {
    return null;
  }

  // If timeStr already ends with Z or has an explicit offset (e.g. +00:00 or -07:00)
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(timeStr)) {
    const ms = Date.parse(timeStr);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  // Parse wall clock components e.g. "2026-10-28T12:00" or "2026-10-28T12:00:00"
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!match) {
    return null;
  }

  // utcOffsetSeconds is strictly required for wall clock times without embedded offset; fail closed if missing or invalid
  if (typeof utcOffsetSeconds !== 'number' || !Number.isFinite(utcOffsetSeconds)) {
    return null;
  }

  const offsetSec = utcOffsetSeconds;

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1;
  const day = parseInt(match[3]!, 10);
  const hour = parseInt(match[4]!, 10);
  const minute = parseInt(match[5]!, 10);
  const second = match[6] ? parseInt(match[6], 10) : 0;

  // Compute UTC timestamp strictly without host-local timezone contamination
  const wallUtcMs = Date.UTC(year, month, day, hour, minute, second);
  const realUtcMs = wallUtcMs - offsetSec * 1000;

  if (!Number.isFinite(realUtcMs)) {
    return null;
  }

  return new Date(realUtcMs).toISOString();
}

export class OpenMeteoWeatherAdapter implements RealProviderAdapter<WeatherData> {
  public readonly kind = 'open-meteo-weather-adapter';
  public readonly source = 'real' as const;

  private readonly enabled: boolean;
  private readonly coordinate: DemoCityCoordinate;
  private readonly fetchFn: typeof fetch;
  private readonly validForMs: number;
  private readonly timeoutMs: number;

  constructor(options: OpenMeteoAdapterOptions = {}) {
    this.enabled =
      options.enabled ??
      (typeof process !== 'undefined' && process.env?.['WEATHER_LIVE_ENABLED'] === 'true');
    this.coordinate = options.coordinate ?? DEFAULT_DEMO_CITY;
    this.fetchFn = options.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as unknown as typeof fetch));
    this.validForMs = options.validForMs ?? 3600000; // 1 hour bounded validity (AC-204-1)
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getCoordinate(): DemoCityCoordinate {
    return this.coordinate;
  }

  /**
   * Returns an adapter with the same flag, fetch and validity settings bound to another
   * coordinate (D1: the consented, 3-decimal-rounded device fix). The caller owns rounding.
   */
  public withCoordinate(coordinate: DemoCityCoordinate): OpenMeteoWeatherAdapter {
    return new OpenMeteoWeatherAdapter({
      enabled: this.enabled,
      coordinate,
      fetchFn: this.fetchFn,
      validForMs: this.validForMs,
      timeoutMs: this.timeoutMs,
    });
  }

  /**
   * Fetches live weather from Open-Meteo and returns a frozen RealSignal.
   * If flag is OFF, offline, or request fails, returns empty array (fail-closed).
   */
  public async signals(_asOfIso?: string): Promise<readonly RealSignal<WeatherData>[]> {
    if (!this.enabled) {
      return Object.freeze([]);
    }

    if (!this.fetchFn) {
      return Object.freeze([]);
    }

    const { latitude, longitude, timezone, name } = this.coordinate;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,weather_code');
    url.searchParams.set('hourly', 'precipitation_probability');
    url.searchParams.set('timezone', timezone);

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

      const response = await this.fetchFn(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        return Object.freeze([]);
      }

      const data = (await response.json()) as Record<string, any>;
      const current = data?.current;
      if (!current || typeof current !== 'object') {
        return Object.freeze([]);
      }

      const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : 0;
      const condition = mapWmoCodeToCondition(weatherCode);
      const temperatureC = typeof current.temperature_2m === 'number' ? current.temperature_2m : undefined;
      const precipMm = typeof current.precipitation === 'number' ? current.precipitation : 0;

      // Determine precipitation probability
      let precipProbability = 0.0;
      if (Array.isArray(data?.hourly?.precipitation_probability) && data.hourly.precipitation_probability.length > 0) {
        const hourlyProb = data.hourly.precipitation_probability[0];
        if (typeof hourlyProb === 'number') {
          precipProbability = Math.min(1.0, Math.max(0.0, hourlyProb / 100));
        }
      } else if (precipMm > 0 || condition === 'rain') {
        precipProbability = 0.9;
      }

      // Determine rainfall descriptor if condition is rain
      let rainfall: string | undefined = undefined;
      if (condition === 'rain') {
        if (precipMm > 4.0) rainfall = 'heavy';
        else if (precipMm > 1.0) rainfall = 'moderate';
        else rainfall = 'light';
      }

      const issuedAt = resolveOpenMeteoIsoTimestamp(current.time, data?.utc_offset_seconds);
      if (!issuedAt) {
        // Fail closed on invalid timestamp; never invent ambient time (INV-103)
        return Object.freeze([]);
      }

      const value: WeatherData = {
        condition,
        precipProbability,
        temperatureC,
        rainfall,
        weatherCode,
        city: name,
      };

      const signal = createRealSignal<WeatherData>({
        kind: 'weather',
        value,
        issuedAt,
        validFor: this.validForMs,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      return Object.freeze([signal]);
    } catch {
      // Fail-closed on network error, timeout, or parse failure (INV-103, INV-106)
      return Object.freeze([]);
    }
  }
}

/**
 * D5-LIVE-FORECAST (DEMO_RESCUE rev12): Open-Meteo HOURLY bins for a target window
 * [from, to] (the next real plan's depart -> arrive). Same keyless endpoint, ToS and attribution.
 * - Fields mask: hourly precipitation_probability, precipitation, weather_code only; times in UTC.
 * - A forecast is never certain: confidence is below 1.0 and it carries issuedAt, validFor and the
 *   validAt window it describes.
 * - Fail closed: an HTTP error, timeout, malformed payload, or bins that do not cover the window
 *   return { ok: false, reason } so the caller falls back to CURRENT conditions, labelled as such.
 */
export const FORECAST_CONFIDENCE = 0.8;
export const FORECAST_VALID_FOR_MS = 3600_000;
/** Rain in a bin: probability >= 50 %, or >= 0.3 mm forecast, or a rain/shower WMO code. */
export const FORECAST_RAIN_PROBABILITY = 0.5;
export const FORECAST_RAIN_MM = 0.3;
export const FORECAST_HOURLY_FIELDS = 'precipitation_probability,precipitation,weather_code';

export interface ForecastBin {
  /** Start of the hour, UTC ISO. */
  readonly time: string;
  readonly precipProbability: number;
  readonly precipitationMm: number;
  readonly condition: WeatherCondition;
  readonly rain: boolean;
}

export interface ForecastWindowSignal {
  readonly kind: 'weather_forecast';
  readonly provenance: 'open_meteo_forecast';
  readonly issuedAt: string;
  readonly validFor: number;
  readonly validAt: { readonly from: string; readonly to: string };
  readonly confidence: number;
  readonly bins: readonly ForecastBin[];
  /** Rain anywhere in the window, and the first-to-last rainy hour span (UTC ISO). */
  readonly rainExpected: boolean;
  readonly rainFrom?: string;
  readonly rainTo?: string;
  readonly maxPrecipProbability: number;
}

export type ForecastResult =
  | { readonly ok: true; readonly forecast: ForecastWindowSignal }
  | { readonly ok: false; readonly reason: 'bins_missing' | 'provider_error' };

const hourFloorMs = (ms: number) => ms - (ms % 3600_000);
const toOpenMeteoHour = (ms: number) => new Date(ms).toISOString().slice(0, 13) + ':00';

export function buildOpenMeteoForecastUrl(coordinate: { latitude: number; longitude: number }, fromMs: number, toMs: number): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(coordinate.latitude));
  url.searchParams.set('longitude', String(coordinate.longitude));
  url.searchParams.set('hourly', FORECAST_HOURLY_FIELDS);
  url.searchParams.set('timezone', 'GMT');
  url.searchParams.set('start_hour', toOpenMeteoHour(hourFloorMs(fromMs)));
  url.searchParams.set('end_hour', toOpenMeteoHour(hourFloorMs(toMs)));
  return url.toString();
}

/** Maps an Open-Meteo hourly payload to bins covering [from, to]; null when coverage is incomplete. */
export function mapOpenMeteoHourly(data: unknown, fromMs: number, toMs: number): ForecastBin[] | null {
  const d = (data ?? {}) as Record<string, any>;
  const h = d.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.precipitation_probability)) return null;
  const offset = typeof d.utc_offset_seconds === 'number' ? d.utc_offset_seconds : null;
  const bins: ForecastBin[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const iso = resolveOpenMeteoIsoTimestamp(h.time[i], offset);
    const prob = h.precipitation_probability[i];
    if (!iso || typeof prob !== 'number' || !Number.isFinite(prob)) continue;
    const ms = Date.parse(iso);
    if (ms + 3600_000 <= fromMs || ms > toMs) continue;
    const mm = Array.isArray(h.precipitation) && typeof h.precipitation[i] === 'number' ? h.precipitation[i] : 0;
    const code = Array.isArray(h.weather_code) && typeof h.weather_code[i] === 'number' ? h.weather_code[i] : null;
    const condition = code === null ? 'cloudy' : mapWmoCodeToCondition(code);
    const precipProbability = Math.min(1, Math.max(0, prob / 100));
    bins.push({
      time: iso,
      precipProbability,
      precipitationMm: Math.max(0, mm),
      condition,
      rain: precipProbability >= FORECAST_RAIN_PROBABILITY || mm >= FORECAST_RAIN_MM || condition === 'rain',
    });
  }
  bins.sort((a, b) => a.time.localeCompare(b.time));
  // Every hour touched by the window must be present, or the forecast is not trusted.
  for (let t = hourFloorMs(fromMs); t <= hourFloorMs(toMs); t += 3600_000) {
    if (!bins.some(b => Date.parse(b.time) === t)) return null;
  }
  return bins;
}

export async function fetchOpenMeteoHourlyForecast(params: {
  readonly coordinate: { latitude: number; longitude: number };
  readonly fromMs: number;
  readonly toMs: number;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
  readonly nowMs?: number;
}): Promise<ForecastResult> {
  const fetchFn = params.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), params.timeoutMs ?? 5000) : null;
  try {
    const resp = await fetchFn(buildOpenMeteoForecastUrl(params.coordinate, params.fromMs, params.toMs), {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!resp.ok) return { ok: false, reason: 'provider_error' };
    const bins = mapOpenMeteoHourly(await resp.json(), params.fromMs, params.toMs);
    if (!bins || bins.length === 0) return { ok: false, reason: 'bins_missing' };
    const rainy = bins.filter(b => b.rain);
    return {
      ok: true,
      forecast: {
        kind: 'weather_forecast',
        provenance: 'open_meteo_forecast',
        issuedAt: new Date(params.nowMs ?? Date.now()).toISOString(),
        validFor: FORECAST_VALID_FOR_MS,
        validAt: { from: new Date(params.fromMs).toISOString(), to: new Date(params.toMs).toISOString() },
        confidence: FORECAST_CONFIDENCE,
        bins,
        rainExpected: rainy.length > 0,
        rainFrom: rainy[0]?.time,
        rainTo: rainy.length ? new Date(Date.parse(rainy[rainy.length - 1]!.time) + 3600_000).toISOString() : undefined,
        maxPrecipProbability: Math.max(...bins.map(b => b.precipProbability)),
      },
    };
  } catch {
    return { ok: false, reason: 'provider_error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
