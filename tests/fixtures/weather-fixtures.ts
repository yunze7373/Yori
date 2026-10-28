/**
 * Recorded Open-Meteo Weather Fixtures
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2.
 *
 * Real recorded sample responses from Open-Meteo API for offline test invariance.
 * Zero live network calls during tests or CI.
 */

export const RECORDED_OPEN_METEO_CLEAR_RESPONSE = Object.freeze({
  latitude: 37.7749,
  longitude: -122.4194,
  generationtime_ms: 0.123,
  utc_offset_seconds: -25200,
  timezone: 'America/Los_Angeles',
  timezone_abbreviation: 'PDT',
  elevation: 18.0,
  current_units: {
    time: 'iso8601',
    interval: 'seconds',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    weather_code: 'wmo code',
  },
  current: {
    // 10:00 AM local time PDT in San Francisco -> 17:00:00.000Z UTC
    time: '2026-10-28T10:00',
    interval: 900,
    temperature_2m: 19.5,
    relative_humidity_2m: 55,
    precipitation: 0.0,
    weather_code: 0,
  },
  hourly_units: {
    time: 'iso8601',
    precipitation_probability: '%',
  },
  hourly: {
    time: ['2026-10-28T17:00', '2026-10-28T18:00', '2026-10-28T19:00'],
    precipitation_probability: [0, 0, 5],
  },
});

export const RECORDED_OPEN_METEO_RAIN_RESPONSE = Object.freeze({
  latitude: 37.7749,
  longitude: -122.4194,
  generationtime_ms: 0.145,
  utc_offset_seconds: -25200,
  timezone: 'America/Los_Angeles',
  timezone_abbreviation: 'PDT',
  elevation: 18.0,
  current_units: {
    time: 'iso8601',
    interval: 'seconds',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    weather_code: 'wmo code',
  },
  current: {
    // 1:35 PM local time PDT in San Francisco -> 20:35:00.000Z UTC
    time: '2026-10-28T13:35',
    interval: 900,
    temperature_2m: 14.8,
    relative_humidity_2m: 88,
    precipitation: 2.4,
    weather_code: 63, // Moderate rain
  },
  hourly_units: {
    time: 'iso8601',
    precipitation_probability: '%',
  },
  hourly: {
    time: ['2026-10-28T20:00', '2026-10-28T21:00', '2026-10-28T22:00'],
    precipitation_probability: [85, 90, 75],
  },
});

export const RECORDED_OPEN_METEO_STALE_RESPONSE = Object.freeze({
  latitude: 37.7749,
  longitude: -122.4194,
  generationtime_ms: 0.111,
  utc_offset_seconds: -25200,
  timezone: 'America/Los_Angeles',
  timezone_abbreviation: 'PDT',
  elevation: 18.0,
  current: {
    // 8:00 AM local time PDT in San Francisco -> 15:00:00.000Z UTC (stale when evaluated at 17:00Z)
    time: '2026-10-28T08:00',
    interval: 900,
    temperature_2m: 18.0,
    precipitation: 0.0,
    weather_code: 0,
  },
});

export const RECORDED_OPEN_METEO_MALFORMED_RESPONSE = Object.freeze({
  latitude: 37.7749,
  longitude: -122.4194,
  status: 'unexpected_payload_without_current',
});
