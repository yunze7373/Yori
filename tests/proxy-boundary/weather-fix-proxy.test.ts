/**
 * D1-LOCATION-WEATHER proxy-boundary tests (DEMO_RESCUE plan, TID INBOX-20261102-EC8E4D).
 *
 * Proves at the /api/weather/current boundary:
 * 1. coords=lat,lng is strictly validated; malformed or out-of-range input gives 400 with zero
 *    outbound calls and without echoing the rejected value.
 * 2. Only a 3-decimal fix reaches Open-Meteo, even if a client sends more precision.
 * 3. The response carries coordinate provenance (rounded fix, fetchedAt, source, CC BY 4.0).
 * 4. No coordinate (raw or rounded) is written to any console channel or stdout/stderr,
 *    including on provider failure.
 * 5. The flag stays authoritative: WEATHER_LIVE_ENABLED off means 403 and zero outbound calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createWeatherProxyMiddleware,
  parseWeatherCoordsParam,
  resetProxyTestSeams,
} from '../../src/adapters/providers/server-proxy.js';
import { OpenMeteoWeatherAdapter } from '../../src/adapters/providers/open-meteo-adapter.js';
import { DEFAULT_DEMO_CITY } from '../../src/adapters/providers/weather-types.js';

// Tokyo (Shinjuku fixture), deliberately with 6 decimals so any unrounded leak is detectable.
const RAW_LAT = '35.689487';
const RAW_LNG = '139.691706';
const ROUNDED_LAT = 35.689;
const ROUNDED_LNG = 139.692;

const OPEN_METEO_BODY = {
  latitude: 35.69,
  longitude: 139.69,
  timezone: 'Asia/Tokyo',
  utc_offset_seconds: 32400,
  current: {
    time: '2026-11-03T10:00',
    temperature_2m: 14.2,
    relative_humidity_2m: 61,
    precipitation: 0,
    weather_code: 1,
  },
  hourly: { precipitation_probability: [10] },
};

function createReqRes(url: string) {
  const req: any = { url, method: 'GET', headers: { host: '127.0.0.1:4174' } };
  const response = { statusCode: 0, body: '' };
  const res: any = {
    writeHead: vi.fn((code: number) => {
      response.statusCode = code;
    }),
    end: vi.fn((data: string) => {
      response.body = data;
    }),
  };
  return { req, res, next: vi.fn(), response };
}

function fakeFetch(impl?: () => Promise<Response>) {
  return vi.fn(
    impl ??
      (async () =>
        new Response(JSON.stringify(OPEN_METEO_BODY), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
  );
}

function middlewareWith(fetchFn: ReturnType<typeof fakeFetch>, enabled = true) {
  const adapter = new OpenMeteoWeatherAdapter({
    enabled,
    fetchFn: fetchFn as unknown as typeof fetch,
    coordinate: DEFAULT_DEMO_CITY,
  });
  return createWeatherProxyMiddleware({ enabled, demoCity: DEFAULT_DEMO_CITY }, adapter);
}

/** Captures every console channel plus raw stdout/stderr writes during a block. */
function captureAllLogs() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(record),
    vi.spyOn(console, 'info').mockImplementation(record),
    vi.spyOn(console, 'warn').mockImplementation(record),
    vi.spyOn(console, 'error').mockImplementation(record),
    vi.spyOn(console, 'debug').mockImplementation(record),
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      record(String(chunk));
      return true;
    }) as any),
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      record(String(chunk));
      return true;
    }) as any),
  ];
  return {
    lines,
    restore: () => spies.forEach(s => s.mockRestore()),
  };
}

function expectNoCoordinates(lines: string[]) {
  const joined = lines.join('\n');
  for (const needle of [RAW_LAT, RAW_LNG, String(ROUNDED_LAT), String(ROUNDED_LNG), '35.69', '139.69']) {
    expect(joined, `log output must not contain ${needle}`).not.toContain(needle);
  }
}

describe('D1 /api/weather/current coords boundary', () => {
  beforeEach(() => resetProxyTestSeams());
  afterEach(() => {
    resetProxyTestSeams();
    vi.restoreAllMocks();
  });

  describe('parseWeatherCoordsParam', () => {
    it('absent coords is valid and means "no fix"', () => {
      expect(parseWeatherCoordsParam(null)).toEqual({ ok: true, coords: null });
    });

    it('accepts a fix and re-rounds it to 3 decimals', () => {
      expect(parseWeatherCoordsParam(`${RAW_LAT},${RAW_LNG}`)).toEqual({
        ok: true,
        coords: { latitude: ROUNDED_LAT, longitude: ROUNDED_LNG },
      });
      expect(parseWeatherCoordsParam('34.052235,-118.243683')).toEqual({
        ok: true,
        coords: { latitude: 34.052, longitude: -118.244 },
      });
      expect(parseWeatherCoordsParam('90,-180')).toEqual({ ok: true, coords: { latitude: 90, longitude: -180 } });
    });

    it.each([
      [''],
      ['abc'],
      ['35.689'],
      ['35.689,'],
      [',139.692'],
      ['35.689,139.692,10'],
      [' 35.689,139.692'],
      ['35.689, 139.692'],
      ['35.689;139.692'],
      ['1e1,2'],
      ['0x10,1'],
      ['NaN,1'],
      ['Infinity,1'],
      ['+35.689,139.692'],
      ['35.1234567,139.692'],
      ['90.001,0'],
      ['-90.5,0'],
      ['0,180.5'],
      ['0,-181'],
      ['1234,1'],
    ])('rejects malformed or out-of-range %j', raw => {
      expect(parseWeatherCoordsParam(raw)).toEqual({ ok: false });
    });
  });

  it('queries Open-Meteo only with the 3-decimal fix and returns coordinate provenance', async () => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes(
      `/api/weather/current?coords=${encodeURIComponent(`${RAW_LAT},${RAW_LNG}`)}`
    );

    const logs = captureAllLogs();
    try {
      await middleware(req, res, next);
    } finally {
      logs.restore();
    }

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const outbound = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(outbound.origin).toBe('https://api.open-meteo.com');
    expect(outbound.searchParams.get('latitude')).toBe(String(ROUNDED_LAT));
    expect(outbound.searchParams.get('longitude')).toBe(String(ROUNDED_LNG));
    expect(outbound.searchParams.get('timezone')).toBe('auto');
    // No unrounded fix on the wire, and never the demo city when a fix was given.
    expect(outbound.toString()).not.toContain(RAW_LAT);
    expect(outbound.toString()).not.toContain(RAW_LNG);
    expect(outbound.searchParams.get('latitude')).not.toBe(String(DEFAULT_DEMO_CITY.latitude));

    const data = JSON.parse(response.body);
    expect(data.enabled).toBe(true);
    expect(data.source).toBe('Open-Meteo');
    expect(Number.isFinite(Date.parse(data.fetchedAt))).toBe(true);
    expect(data.coordinate).toEqual({
      kind: 'device_fix',
      latitude: ROUNDED_LAT,
      longitude: ROUNDED_LNG,
      decimals: 3,
    });
    expect(data.attribution.license).toBe('CC BY 4.0');
    expect(data.attribution.url).toBe('https://open-meteo.com/');
    expect(response.body).not.toContain(RAW_LAT);
    expect(response.body).not.toContain(RAW_LNG);

    expect(data.signals).toHaveLength(1);
    const signal = data.signals[0];
    expect(signal.kind).toBe('weather');
    expect(signal.source).toBe('real');
    expect(signal.value.city).toBe('Near you');
    expect(signal.value.city).not.toBe(DEFAULT_DEMO_CITY.name);
    expect(signal.value.temperatureC).toBe(14.2);
    // 10:00 at UTC+9 is 01:00Z: the observation time is the fix's local time, not the demo city's.
    expect(signal.issuedAt).toBe('2026-11-03T01:00:00.000Z');

    expectNoCoordinates(logs.lines);
  });

  it('client-rounded coords pass through unchanged (idempotent rounding)', async () => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes('/api/weather/current?coords=35.689%2C139.692');
    await middleware(req, res, next);
    expect(response.statusCode).toBe(200);
    const outbound = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(outbound.searchParams.get('latitude')).toBe('35.689');
    expect(outbound.searchParams.get('longitude')).toBe('139.692');
  });

  it.each([
    ['abc'],
    ['91,0'],
    ['35.689,181'],
    ['35.689'],
    [`${RAW_LAT};${RAW_LNG}`],
    [`${RAW_LAT},${RAW_LNG},1`],
  ])('returns 400 for coords=%j with zero outbound calls and no echo', async raw => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes(`/api/weather/current?coords=${encodeURIComponent(raw)}`);

    const logs = captureAllLogs();
    try {
      await middleware(req, res, next);
    } finally {
      logs.restore();
    }

    expect(response.statusCode).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
    const data = JSON.parse(response.body);
    expect(data.code).toBe('invalid_coords');
    expect(response.body).not.toContain(raw);
    expectNoCoordinates(logs.lines);
  });

  it('empty coords value is malformed (400), not "no fix"', async () => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes('/api/weather/current?coords=');
    await middleware(req, res, next);
    expect(response.statusCode).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('provider failure (fetch rejects with the URL in the message) leaks no coordinate to logs or body', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new Error(`fetch failed for https://api.open-meteo.com/v1/forecast?latitude=${ROUNDED_LAT}&longitude=${ROUNDED_LNG}`);
    });
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes(
      `/api/weather/current?coords=${encodeURIComponent(`${RAW_LAT},${RAW_LNG}`)}`
    );

    const logs = captureAllLogs();
    try {
      await middleware(req, res, next);
    } finally {
      logs.restore();
    }

    expect(fetchFn).toHaveBeenCalledTimes(1);
    // The adapter fails closed to zero signals; the UI renders honest unavailable.
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.signals).toEqual([]);
    expectNoCoordinates(logs.lines);
    expect(response.body).not.toContain(RAW_LAT);
  });

  it('an adapter that throws gets a fixed 500 message (never the provider error text)', async () => {
    const throwingAdapter = {
      withCoordinate: () => ({
        signals: async () => {
          throw new Error(`boom at latitude=${ROUNDED_LAT}`);
        },
      }),
      signals: async () => [],
    } as unknown as OpenMeteoWeatherAdapter;
    const middleware = createWeatherProxyMiddleware({ enabled: true }, throwingAdapter);
    const { req, res, next, response } = createReqRes('/api/weather/current?coords=35.689%2C139.692');

    const logs = captureAllLogs();
    try {
      await middleware(req, res, next);
    } finally {
      logs.restore();
    }

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: 'Failed to fetch weather' });
    expectNoCoordinates(logs.lines);
  });

  it('without coords the dev/recorded path keeps the demo city and labels it as such', async () => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn);
    const { req, res, next, response } = createReqRes('/api/weather/current');
    await middleware(req, res, next);

    expect(response.statusCode).toBe(200);
    const outbound = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(outbound.searchParams.get('latitude')).toBe(String(DEFAULT_DEMO_CITY.latitude));
    const data = JSON.parse(response.body);
    expect(data.coordinate.kind).toBe('demo_city');
    expect(data.coordinate.name).toBe(DEFAULT_DEMO_CITY.name);
  });

  it('flag off: coords request is refused with 403 and zero outbound calls', async () => {
    const fetchFn = fakeFetch();
    const middleware = middlewareWith(fetchFn, false);
    const { req, res, next, response } = createReqRes('/api/weather/current?coords=35.689%2C139.692');
    await middleware(req, res, next);
    expect(response.statusCode).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
