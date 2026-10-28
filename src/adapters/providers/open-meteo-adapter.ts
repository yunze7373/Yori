/**
 * Open-Meteo Real Weather Provider Adapter
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103, INV-106.
 *
 * Requirements:
 * 1. Location: strictly uses configured fixed demo-city coordinates (DEFAULT_DEMO_CITY).
 *    NEVER calls browser geolocation APIs or accesses device location.
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

  const offsetSec =
    typeof utcOffsetSeconds === 'number' && Number.isFinite(utcOffsetSeconds)
      ? utcOffsetSeconds
      : 0;

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
