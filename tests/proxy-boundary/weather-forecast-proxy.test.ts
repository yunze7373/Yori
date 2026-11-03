/**
 * D5-LIVE-FORECAST boundary tests (DEMO_RESCUE rev12, TID INBOX-20261103-16B58D).
 * Recorded hourly bins only (injected fetch; netguard blocks any real call).
 * - /api/weather/forecast: strict coords + time-window validation (400, never echoing input);
 *   disabled -> 403 with no upstream call; fields mask (hourly precip/probability/code only, UTC).
 * - Signal: issuedAt, validFor, validAt window, confidence < 1.0, provenance open_meteo_forecast.
 * - Fail closed: gaps in the window, HTTP errors, malformed payloads and timeouts -> no forecast,
 *   with a reason, so the client falls back to current conditions (labelled).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createWeatherProxyMiddleware,
  parseForecastWindowParams,
} from '../../src/adapters/providers/server-proxy.js';
import {
  FORECAST_CONFIDENCE,
  fetchOpenMeteoHourlyForecast,
  mapOpenMeteoHourly,
} from '../../src/adapters/providers/open-meteo-adapter.js';

const NOW = Date.now();
const hour = (n: number) => {
  const base = NOW - (NOW % 3600_000);
  return base + n * 3600_000;
};
const omTime = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const iso = (ms: number) => new Date(ms).toISOString();

/** Open-Meteo-shaped hourly payload (timezone=GMT) for hours h0..h0+n-1. */
function hourly(h0: number, probs: number[], mm: number[] = probs.map(() => 0), codes: number[] = probs.map(() => 3)) {
  return {
    utc_offset_seconds: 0,
    hourly: {
      time: probs.map((_, i) => omTime(hour(h0 + i))),
      precipitation_probability: probs,
      precipitation: mm,
      weather_code: codes,
    },
  };
}

function recorded(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: any) => {
    calls.push(String(url));
    return { ok: status === 200, status, json: async () => body } as any;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

function reqRes(url: string) {
  const req: any = { url, method: 'GET', headers: { host: 'localhost:4173' }, socket: { remoteAddress: '127.0.0.1' } };
  const out = { status: 0, body: '' };
  const res: any = { writeHead: (s: number) => { out.status = s; }, end: (b?: string) => { if (b) out.body = b; } };
  return { req, res, next: vi.fn(), out };
}

async function call(mw: any, url: string) {
  const r = reqRes(url);
  await mw(r.req, r.res, r.next);
  return { status: r.out.status, json: r.out.body ? JSON.parse(r.out.body) : null, body: r.out.body };
}

const FROM = iso(hour(2) + 15 * 60_000); // depart
const TO = iso(hour(3) + 30 * 60_000); // arrive
const COORDS = '35.6895,139.6917';

describe('D5 forecast window validation', () => {
  it('accepts a bounded UTC window; rejects offsets, inverted, too long, too far, garbage', () => {
    expect(parseForecastWindowParams(FROM, TO, NOW)).toMatchObject({ ok: true });
    for (const [f, t] of [
      [null, TO],
      [FROM, null],
      ['2026-11-03T14:00:00+09:00', TO],
      ['tomorrow', TO],
      [TO, FROM],
      [FROM, FROM],
      [iso(hour(1)), iso(hour(14))], // > 12 h
      [iso(NOW - 2 * 3600_000), iso(NOW)], // from more than 1 h ago
      [iso(hour(40)), iso(hour(50))], // beyond 48 h
      [`${FROM}&x=1`, TO],
    ] as const) {
      expect(parseForecastWindowParams(f as any, t as any, NOW), `${f} ${t}`).toEqual({ ok: false });
    }
  });
});

describe('D5 /api/weather/forecast route', () => {
  it('400 on bad coords or window, never echoing the input; no upstream call', async () => {
    const g = recorded(hourly(2, [10, 10]));
    const mw = createWeatherProxyMiddleware({ enabled: true }, undefined, g.fetchFn);
    const badCoords = await call(mw, `/api/weather/forecast?coords=35.68951234567,999&from=${FROM}&to=${TO}`);
    expect(badCoords.status).toBe(400);
    expect(badCoords.json.code).toBe('invalid_coords');
    expect(badCoords.body).not.toContain('35.68951234567');
    const badWindow = await call(mw, `/api/weather/forecast?coords=${COORDS}&from=SECRET-INPUT-1&to=${TO}`);
    expect(badWindow.status).toBe(400);
    expect(badWindow.json.code).toBe('invalid_window');
    expect(badWindow.body).not.toContain('SECRET-INPUT-1');
    expect(g.calls).toHaveLength(0);
  });

  it('disabled (WEATHER_LIVE off) -> 403 and zero upstream calls', async () => {
    const g = recorded(hourly(2, [10, 10]));
    const mw = createWeatherProxyMiddleware({ enabled: false }, undefined, g.fetchFn);
    expect((await call(mw, `/api/weather/forecast?coords=${COORDS}&from=${FROM}&to=${TO}`)).status).toBe(403);
    expect(g.calls).toHaveLength(0);
  });

  it('fields mask + UTC hours + 3-decimal coords upstream; signal has issuedAt, validFor, validAt, confidence < 1', async () => {
    const g = recorded(hourly(2, [20, 70], [0, 1.2], [3, 61]));
    const mw = createWeatherProxyMiddleware({ enabled: true }, undefined, g.fetchFn);
    const r = await call(mw, `/api/weather/forecast?coords=35.6895,139.6917&from=${FROM}&to=${TO}`);
    expect(r.status).toBe(200);
    const u = new URL(g.calls[0]!);
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('hourly')).toBe('precipitation_probability,precipitation,weather_code');
    expect(u.searchParams.get('current')).toBeNull();
    expect(u.searchParams.get('timezone')).toBe('GMT');
    expect(u.searchParams.get('latitude')).toBe('35.69');
    expect(u.searchParams.get('longitude')).toBe('139.692');
    expect(u.searchParams.get('start_hour')).toBe(omTime(hour(2)));
    expect(u.searchParams.get('end_hour')).toBe(omTime(hour(3)));
    const f = r.json.forecast;
    expect(f).toMatchObject({
      kind: 'weather_forecast',
      provenance: 'open_meteo_forecast',
      validFor: 3600_000,
      validAt: { from: FROM, to: TO },
      confidence: FORECAST_CONFIDENCE,
      rainExpected: true,
      rainFrom: iso(hour(3)),
      rainTo: iso(hour(4)),
    });
    expect(f.confidence).toBeLessThan(1);
    expect(Number.isFinite(Date.parse(f.issuedAt))).toBe(true);
    expect(r.json.attribution).toBeTruthy();
    expect(r.json.coordinate).toEqual({ kind: 'device_fix', decimals: 3 });
    expect(r.body).not.toContain('139.69');
  });

  it('fail closed: a gap in the window, HTTP 5xx, malformed body -> forecast null with a reason', async () => {
    for (const [body, status, reason] of [
      [hourly(2, [20]), 200, 'bins_missing'], // the 3rd hour is missing
      [{ hourly: { time: 'x' } }, 200, 'bins_missing'],
      [{}, 500, 'provider_error'],
    ] as const) {
      const g = recorded(body, status);
      const mw = createWeatherProxyMiddleware({ enabled: true }, undefined, g.fetchFn);
      const r = await call(mw, `/api/weather/forecast?coords=${COORDS}&from=${FROM}&to=${TO}`);
      expect(r.status, reason).toBe(200);
      expect(r.json).toMatchObject({ enabled: true, forecast: null, unavailableReason: reason });
    }
  });
});

describe('D5 forecast mapping and timeout', () => {
  it('rain from probability, millimetres or a rain code; dry window -> no rain', () => {
    const fromMs = hour(2);
    const toMs = hour(4);
    const bins = mapOpenMeteoHourly(hourly(2, [10, 40, 20], [0, 0.4, 0], [3, 3, 61]), fromMs, toMs)!;
    expect(bins.map(b => b.rain)).toEqual([false, true, true]);
    const dry = mapOpenMeteoHourly(hourly(2, [10, 20, 5]), fromMs, toMs)!;
    expect(dry.every(b => !b.rain)).toBe(true);
    expect(mapOpenMeteoHourly(hourly(2, [10, 20]), fromMs, toMs)).toBeNull(); // hour 4 missing
    // Wall-clock times without utc_offset_seconds are not trusted.
    const noOffset = hourly(2, [10, 20, 5]) as any;
    delete noOffset.utc_offset_seconds;
    expect(mapOpenMeteoHourly(noOffset, fromMs, toMs)).toBeNull();
  });

  it('times out and fails closed', async () => {
    const fetchFn = vi.fn((_u: any, init: any) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) as any;
    const r = await fetchOpenMeteoHourlyForecast({ coordinate: { latitude: 35.69, longitude: 139.692 }, fromMs: hour(2), toMs: hour(3), fetchFn, timeoutMs: 30 });
    expect(r).toEqual({ ok: false, reason: 'provider_error' });
  });
});
