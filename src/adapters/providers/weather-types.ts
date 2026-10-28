/**
 * Weather Provider Types & Configuration
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103.
 *
 * Enforces:
 * 1. Fixed demo-city coordinates only (DEMO_CITY_LAT / DEMO_CITY_LON).
 * 2. Zero device geolocation or browser location access.
 * 3. Typed weather data schema consumed by plugins (depart, lunch).
 */

export type WeatherCondition = 'clear' | 'rain' | 'cloudy' | 'snow' | 'fog';

export interface WeatherData {
  readonly condition: WeatherCondition;
  readonly precipProbability?: number; // 0.0 to 1.0
  readonly temperatureC?: number;
  readonly rainfall?: string; // 'light' | 'moderate' | 'heavy'
  readonly weatherCode?: number; // WMO standard weather code
  readonly city?: string;
}

export interface DemoCityCoordinate {
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly timezone: string;
}

/**
 * Default configured demo-city coordinate (San Francisco, CA).
 * Matches the scenario timeline timezone (America/Los_Angeles).
 * Under AC-204-2, only this configured coordinate is ever sent in weather requests.
 */
export const DEFAULT_DEMO_CITY: DemoCityCoordinate = Object.freeze({
  latitude: 37.7749,
  longitude: -122.4194,
  name: 'San Francisco, CA',
  timezone: 'America/Los_Angeles',
});

export const OPEN_METEO_ATTRIBUTION = Object.freeze({
  text: 'Weather data by Open-Meteo.com',
  url: 'https://open-meteo.com/',
  license: 'CC BY 4.0',
});
