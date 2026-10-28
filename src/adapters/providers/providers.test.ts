/**
 * Provider Increment Contract & Security Test Suite
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103, INV-106.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  RealSystemClock,
  FixedClock,
  MockWeatherAdapter,
  OpenMeteoWeatherAdapter,
  DEFAULT_DEMO_CITY,
  createRealSignal,
  OPEN_METEO_ATTRIBUTION,
  mapWmoCodeToCondition,
  resolveOpenMeteoIsoTimestamp,
} from './index.js';
import {
  createWeatherProxyMiddleware,
  resolveWeatherConfig,
} from './server-proxy.js';
import {
  RECORDED_OPEN_METEO_CLEAR_RESPONSE,
  RECORDED_OPEN_METEO_RAIN_RESPONSE,
  RECORDED_OPEN_METEO_MALFORMED_RESPONSE,
} from '../../../tests/fixtures/weather-fixtures.js';
import { runPipeline } from '../../core/pipeline/index.js';
import { staticPluginRegistry } from '../../plugins/registry.js';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
} from '../../../tests/fixtures/index.js';
import { createScenarioPlayer } from '../../app/scenario-player/index.js';

describe('PH-002 D1: Clock Provider Seam (AC-204-1)', () => {
  it('RealSystemClock returns current system ISO timestamp with real source attribution', () => {
    const clock = new RealSystemClock();
    expect(clock.kind).toBe('real-system-clock');
    expect(clock.source).toBe('real');

    const before = Date.now();
    const iso = clock.now();
    const after = Date.now();

    const parsed = Date.parse(iso);
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it('FixedClock returns deterministic anchored timestamp for reproducible replay', () => {
    const fixedIso = '2026-10-28T17:00:00.000Z';
    const clock = new FixedClock(fixedIso);
    expect(clock.kind).toBe('fixed-clock');
    expect(clock.source).toBe('simulated');
    expect(clock.now()).toBe(fixedIso);
    expect(clock.now()).toBe(fixedIso);
  });

  it('FixedClock rejects invalid timestamp formats fail-closed', () => {
    expect(() => new FixedClock('not-a-timestamp')).toThrow(/Invalid ISO timestamp/);
  });
});

describe('PH-002 D1: Mock Weather Adapter Twin (AC-204-1)', () => {
  it('MockWeatherAdapter emits SimulatedSignal strictly source: simulated and label: simulated', () => {
    const adapter = new MockWeatherAdapter();
    expect(adapter.kind).toBe('mock-weather-adapter');
    expect(adapter.source).toBe('simulated');

    const signals = adapter.signals('2026-10-28T17:00:00.000Z');
    expect(signals).toHaveLength(1);

    const sig = signals[0]!;
    expect(sig.kind).toBe('weather');
    expect(sig.source).toBe('simulated');
    expect(sig.label).toBe('simulated');
    expect(sig.validFor).toBeGreaterThan(0);
    expect(sig.value.condition).toBe('clear');
    expect(Object.isFrozen(sig)).toBe(true);
    expect(Object.isFrozen(sig.value)).toBe(true);
  });
});

describe('PH-002 D1: Real Signal Construction & Validation (INV-101, INV-102)', () => {
  it('createRealSignal creates validated, frozen RealSignal with source real and label real', () => {
    const sig = createRealSignal({
      kind: 'weather',
      value: { condition: 'clear' },
      issuedAt: '2026-10-28T17:00:00.000Z',
      validFor: 3600000,
      confidence: 1.0,
      consentScope: 'device_only',
    });

    expect(sig.kind).toBe('weather');
    expect(sig.source).toBe('real');
    expect(sig.label).toBe('real');
    expect(sig.validFor).toBe(3600000);
    expect(sig.consentScope).toBe('device_only');
    expect(Object.isFrozen(sig)).toBe(true);
  });

  it('createRealSignal validates validFor, confidence, and timestamp bounds', () => {
    expect(() =>
      createRealSignal({
        kind: 'weather',
        value: {},
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: -10,
        confidence: 0.9,
        consentScope: 'device_only',
      })
    ).toThrow(/validFor must be a finite positive number/);

    expect(() =>
      createRealSignal({
        kind: 'weather',
        value: {},
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: 1000,
        confidence: 1.5,
        consentScope: 'device_only',
      })
    ).toThrow(/confidence must be a finite number between 0 and 1/);

    expect(() =>
      createRealSignal({
        kind: 'weather',
        value: {},
        issuedAt: 'invalid-date',
        validFor: 1000,
        confidence: 0.9,
        consentScope: 'device_only',
      })
    ).toThrow(/issuedAt must be a valid ISO-8601 string/);
  });
});

describe('PH-002 D1: Open-Meteo Real Weather Adapter (AC-204-1, AC-204-2)', () => {
  it('maps standard WMO weather codes accurately to domain conditions', () => {
    expect(mapWmoCodeToCondition(0)).toBe('clear');
    expect(mapWmoCodeToCondition(1)).toBe('cloudy');
    expect(mapWmoCodeToCondition(3)).toBe('cloudy');
    expect(mapWmoCodeToCondition(45)).toBe('fog');
    expect(mapWmoCodeToCondition(61)).toBe('rain'); // slight rain
    expect(mapWmoCodeToCondition(63)).toBe('rain'); // moderate rain
    expect(mapWmoCodeToCondition(80)).toBe('rain'); // shower
    expect(mapWmoCodeToCondition(95)).toBe('rain'); // thunderstorm
    expect(mapWmoCodeToCondition(71)).toBe('snow');
  });

  it('resolveOpenMeteoIsoTimestamp computes strict instant using utc_offset_seconds independent of host timezone', () => {
    // San Francisco (PDT = UTC-7 = -25200s): 10:00 AM wall time -> 17:00:00.000Z UTC
    expect(resolveOpenMeteoIsoTimestamp('2026-10-28T10:00', -25200)).toBe('2026-10-28T17:00:00.000Z');
    // San Francisco 1:35 PM wall time -> 20:35:00.000Z UTC
    expect(resolveOpenMeteoIsoTimestamp('2026-10-28T13:35', -25200)).toBe('2026-10-28T20:35:00.000Z');
    // Tokyo (JST = UTC+9 = +32400s): 12:00 PM wall time -> 03:00:00.000Z UTC
    expect(resolveOpenMeteoIsoTimestamp('2026-10-28T12:00', 32400)).toBe('2026-10-28T03:00:00.000Z');
    // London (UTC = 0s): 12:00 PM wall time -> 12:00:00.000Z UTC
    expect(resolveOpenMeteoIsoTimestamp('2026-10-28T12:00', 0)).toBe('2026-10-28T12:00:00.000Z');
    // Explicit Z timestamp preserves instant
    expect(resolveOpenMeteoIsoTimestamp('2026-10-28T17:00:00Z', 0)).toBe('2026-10-28T17:00:00.000Z');
  });

  it('resolveOpenMeteoIsoTimestamp returns null and never invents time on missing or malformed input (INV-103)', () => {
    expect(resolveOpenMeteoIsoTimestamp(undefined, -25200)).toBeNull();
    expect(resolveOpenMeteoIsoTimestamp(null, -25200)).toBeNull();
    expect(resolveOpenMeteoIsoTimestamp('', -25200)).toBeNull();
    expect(resolveOpenMeteoIsoTimestamp('   ', -25200)).toBeNull();
    expect(resolveOpenMeteoIsoTimestamp('invalid-date-format', -25200)).toBeNull();
  });

  it('flag-off default makes ZERO network calls and returns empty array', async () => {
    const mockFetch = vi.fn();
    const adapter = new OpenMeteoWeatherAdapter({
      enabled: false,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(signals).toHaveLength(0);
    expect(adapter.isEnabled()).toBe(false);
  });

  it('sends ONLY configured demo-city coordinates and parses recorded clear weather fixture', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => RECORDED_OPEN_METEO_CLEAR_RESPONSE,
      } as Response;
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      coordinate: DEFAULT_DEMO_CITY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Rule 1 & AC-204-2: Proves URL contains ONLY configured coordinates
    const parsedUrl = new URL(capturedUrl);
    expect(parsedUrl.origin).toBe('https://api.open-meteo.com');
    expect(parsedUrl.pathname).toBe('/v1/forecast');
    expect(parsedUrl.searchParams.get('latitude')).toBe(String(DEFAULT_DEMO_CITY.latitude));
    expect(parsedUrl.searchParams.get('longitude')).toBe(String(DEFAULT_DEMO_CITY.longitude));
    expect(parsedUrl.searchParams.get('timezone')).toBe(DEFAULT_DEMO_CITY.timezone);

    // Rule 3: Validates real signal attributes
    expect(signals).toHaveLength(1);
    const sig = signals[0]!;
    expect(sig.kind).toBe('weather');
    expect(sig.source).toBe('real');
    expect(sig.label).toBe('real');
    expect(sig.issuedAt).toBe('2026-10-28T17:00:00.000Z');
    expect(sig.validFor).toBe(3600000); // 1h bounded validity
    expect(sig.confidence).toBe(1.0);
    expect(sig.consentScope).toBe('device_only');
    expect(sig.value.condition).toBe('clear');
    expect(sig.value.temperatureC).toBe(19.5);
    expect(sig.value.precipProbability).toBe(0.0);
    expect(Object.isFrozen(sig)).toBe(true);
  });

  it('parses recorded rain fixture with precipitation probability and rainfall descriptor', async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => RECORDED_OPEN_METEO_RAIN_RESPONSE,
      } as Response;
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      coordinate: DEFAULT_DEMO_CITY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(signals).toHaveLength(1);
    const sig = signals[0]!;
    expect(sig.source).toBe('real');
    expect(sig.issuedAt).toBe('2026-10-28T20:35:00.000Z');
    expect(sig.value.condition).toBe('rain');
    expect(sig.value.weatherCode).toBe(63);
    expect(sig.value.rainfall).toBe('moderate');
    expect(sig.value.precipProbability).toBe(0.85);
  });

  it('fails closed when current.time is missing without fabricating now() (INV-103)', async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 37.7749,
          longitude: -122.4194,
          utc_offset_seconds: -25200,
          current: {
            temperature_2m: 20,
            weather_code: 0,
            // current.time omitted
          },
        }),
      } as Response;
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(signals).toHaveLength(0);
  });

  it('fails closed gracefully on HTTP 500 error without throwing or inventing weather (INV-103)', async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: true }),
      } as Response;
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(signals).toHaveLength(0);
  });

  it('fails closed gracefully on network error / fetch rejection', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('fetch failed (ECONNREFUSED)');
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(signals).toHaveLength(0);
  });

  it('fails closed on malformed response missing current object', async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => RECORDED_OPEN_METEO_MALFORMED_RESPONSE,
      } as Response;
    });

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const signals = await adapter.signals();
    expect(signals).toHaveLength(0);
  });

  it('stale real weather signal triggers fail-closed notice in core pipeline (D6 compliance)', () => {
    const staleSignal = createRealSignal({
      kind: 'weather',
      value: { condition: 'clear' },
      issuedAt: '2026-10-28T15:00:00.000Z',
      validFor: 3600000, // expired at 16:00:00Z
      confidence: 1.0,
      consentScope: 'device_only',
    });

    const player = createScenarioPlayer(d1Scenario, new FixedClock(D1_INITIAL_CLOCK));
    const baseSnapshot = player.getSnapshots()[0]!;

    // Replace simulated weather with the stale real signal
    const snapshotWithStaleReal = {
      ...baseSnapshot,
      signals: [
        ...baseSnapshot.signals.filter(s => s.kind !== 'weather'),
        staleSignal,
      ],
    };

    const result = runPipeline({
      snapshot: snapshotWithStaleReal,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK, // 17:00Z
      plugins: staticPluginRegistry.getAll(),
    });

    // Core policy detects expired weather and emits notice (INV-106)
    const weatherNotice = result.notices.find(
      n => n.missingOrStaleSignalKind === 'weather' && n.isStale === true
    );
    expect(weatherNotice).toBeDefined();
  });

  it('missing weather (from fail-closed adapter) triggers fail-closed missing notice', () => {
    const player = createScenarioPlayer(d1Scenario, new FixedClock(D1_INITIAL_CLOCK));
    const baseSnapshot = player.getSnapshots()[0]!;

    // Remove weather signal completely
    const snapshotWithoutWeather = {
      ...baseSnapshot,
      signals: baseSnapshot.signals.filter(s => s.kind !== 'weather'),
    };

    const result = runPipeline({
      snapshot: snapshotWithoutWeather,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK,
      plugins: staticPluginRegistry.getAll(),
    });

    const missingNotice = result.notices.find(
      n => n.missingOrStaleSignalKind === 'weather' && !n.isStale
    );
    expect(missingNotice).toBeDefined();
  });
});

describe('PH-002 D1: Weather Dev Server Proxy Middleware Security', () => {
  it('resolves config with WEATHER_LIVE_ENABLED default false', () => {
    const config = resolveWeatherConfig({});
    expect(config.enabled).toBe(false);
    expect(config.demoCity.latitude).toBe(DEFAULT_DEMO_CITY.latitude);
    expect(config.demoCity.longitude).toBe(DEFAULT_DEMO_CITY.longitude);
  });

  it('resolves custom demo city coordinates from env', () => {
    const config = resolveWeatherConfig({
      WEATHER_LIVE_ENABLED: 'true',
      DEMO_CITY_LAT: '35.6764',
      DEMO_CITY_LON: '139.6500',
      DEMO_CITY_NAME: 'Tokyo',
      DEMO_CITY_TIMEZONE: 'Asia/Tokyo',
    });
    expect(config.enabled).toBe(true);
    expect(config.demoCity.latitude).toBe(35.6764);
    expect(config.demoCity.longitude).toBe(139.65);
    expect(config.demoCity.name).toBe('Tokyo');
    expect(config.demoCity.timezone).toBe('Asia/Tokyo');
  });

  it('rejects external non-loopback host header with 403 Forbidden', async () => {
    const middleware = createWeatherProxyMiddleware();
    const req: any = {
      url: '/api/weather/status',
      headers: { host: 'external-evil.com' },
    };
    const res: any = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects cross-site Sec-Fetch-Site requests with 403 Forbidden', async () => {
    const middleware = createWeatherProxyMiddleware();
    const req: any = {
      url: '/api/weather/status',
      headers: {
        host: '127.0.0.1:5173',
        'sec-fetch-site': 'cross-site',
      },
    };
    const res: any = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
  });

  it('GET /api/weather/status returns 200 with config and Open-Meteo attribution', async () => {
    const middleware = createWeatherProxyMiddleware({ enabled: false });
    const req: any = {
      url: '/api/weather/status',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    };
    let responseBody = '';
    const res: any = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => {
        responseBody = data;
      }),
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    const data = JSON.parse(responseBody);
    expect(data.enabled).toBe(false);
    expect(data.provider).toBe('open-meteo');
    expect(data.attribution.text).toBe(OPEN_METEO_ATTRIBUTION.text);
    expect(data.attribution.url).toBe(OPEN_METEO_ATTRIBUTION.url);
  });

  it('GET /api/weather/current returns 403 when WEATHER_LIVE_ENABLED is false', async () => {
    const middleware = createWeatherProxyMiddleware({ enabled: false });
    const req: any = {
      url: '/api/weather/current',
      method: 'GET',
      headers: { host: 'localhost:5173' },
    };
    let responseBody = '';
    const res: any = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => {
        responseBody = data;
      }),
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    const data = JSON.parse(responseBody);
    expect(data.enabled).toBe(false);
  });

  it('GET /api/weather/current returns 200 with real signals when enabled', async () => {
    const mockAdapter = {
      signals: vi.fn(async () => [
        createRealSignal({
          kind: 'weather',
          value: { condition: 'clear', temperatureC: 22 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ]),
    } as unknown as OpenMeteoWeatherAdapter;

    const middleware = createWeatherProxyMiddleware({ enabled: true }, mockAdapter);
    const req: any = {
      url: '/api/weather/current',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    };
    let responseBody = '';
    const res: any = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => {
        responseBody = data;
      }),
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    const data = JSON.parse(responseBody);
    expect(data.enabled).toBe(true);
    expect(data.signals).toHaveLength(1);
    expect(data.signals[0].source).toBe('real');
    expect(data.attribution.text).toBe(OPEN_METEO_ATTRIBUTION.text);
  });
});
