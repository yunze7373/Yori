/**
 * D6-MULTIMODAL-TRANSIT boundary tests for the Google Routes adapter and its ledger.
 * Fake fetch only (netguard blocks real calls). Verifies: key only in the header; exact field mask;
 * ledger refuses BEFORE the call (60/day, lowering-only, persisted); disabled key / quota /
 * timeout / no routes fail closed with codes only (Google's message is never echoed).
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GoogleRoutesAdapter,
  GOOGLE_ROUTES_FIELD_MASK,
  GOOGLE_ROUTES_URL,
  parseGoogleDurationSeconds,
} from '../../src/adapters/providers/google-routes-adapter.js';
import {
  FileGoogleRoutesLedger,
  MemoryGoogleRoutesLedger,
  DEFAULT_GOOGLE_ROUTES_DAILY_CAP,
} from '../../src/adapters/providers/google-routes-ledger.js';

const FAKE_KEY = 'AIzaFAKE_ROUTES_KEY_d6_0123456789';
const O = { lat: 35.69, lng: 139.701 };
const D = { lat: 35.66, lng: 139.729 };

function fake(status: number, body: unknown) {
  const calls: { url: string; init: any }[] = [];
  const fetchFn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as any;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const TRANSIT_BODY = {
  routes: [
    {
      duration: '1260s',
      distanceMeters: 6100,
      legs: [
        {
          steps: [
            { travelMode: 'WALK' },
            {
              travelMode: 'TRANSIT',
              transitDetails: {
                stopDetails: { departureStop: { name: 'Shinjuku' }, arrivalStop: { name: 'Roppongi' } },
                transitLine: { name: 'Toei Oedo Line', nameShort: 'E', vehicle: { type: 'SUBWAY' } },
                stopCount: 5,
                headsign: 'Daimon',
              },
            },
            { travelMode: 'WALK' },
          ],
        },
      ],
    },
  ],
};

describe('D6 Google Routes adapter', () => {
  it('key only in the X-Goog-Api-Key header; exact field mask; TRANSIT summary parsed', async () => {
    const f = fake(200, TRANSIT_BODY);
    const a = new GoogleRoutesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGoogleRoutesLedger(), fetchFn: f.fetchFn });
    const r = await a.computeRoute({ origin: O, destination: D, mode: 'TRANSIT', departureTime: '2026-11-04T01:00:00Z' });
    expect(r).toMatchObject({ ok: true, mode: 'TRANSIT', durationSeconds: 1260, distanceMeters: 6100 });
    if (r.ok) expect(r.transit).toEqual([{ line: 'E', vehicle: 'SUBWAY', from: 'Shinjuku', to: 'Roppongi', stops: 5, headsign: 'Daimon' }]);
    const { url, init } = f.calls[0]!;
    expect(url).toBe(GOOGLE_ROUTES_URL);
    expect(url).not.toContain(FAKE_KEY);
    expect(init.headers['X-Goog-Api-Key']).toBe(FAKE_KEY);
    expect(init.headers['X-Goog-FieldMask']).toBe(GOOGLE_ROUTES_FIELD_MASK);
    expect(GOOGLE_ROUTES_FIELD_MASK).not.toMatch(/polyline|location/i);
    expect(init.body).not.toContain(FAKE_KEY);
    expect(JSON.parse(init.body)).toMatchObject({ travelMode: 'TRANSIT', departureTime: '2026-11-04T01:00:00Z' });
  });

  it('ledger stop: refused BEFORE the call (zero fetch)', async () => {
    const f = fake(200, TRANSIT_BODY);
    const ledger = new MemoryGoogleRoutesLedger(1);
    const a = new GoogleRoutesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: f.fetchFn });
    expect((await a.computeRoute({ origin: O, destination: D, mode: 'DRIVE' })).ok).toBe(true);
    expect(await a.computeRoute({ origin: O, destination: D, mode: 'WALK' })).toEqual({ ok: false, mode: 'WALK', reason: 'ledger_stop' });
    expect(f.calls).toHaveLength(1);
  });

  it('disabled key / quota / no routes / malformed duration fail closed with codes only', async () => {
    const cases: [number, unknown, string][] = [
      [403, { error: { status: 'PERMISSION_DENIED', message: 'Routes API has not been used in project 123 ... SECRET-DETAIL', details: [{ reason: 'SERVICE_DISABLED' }] } }, 'key_not_enabled'],
      [400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } }, 'key_not_enabled'],
      [429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }, 'quota_exceeded'],
      [200, {}, 'no_routes'],
      [200, { routes: [{ duration: 'soon' }] }, 'no_routes'],
      [500, { error: { status: 'INTERNAL' } }, 'provider_error'],
    ];
    for (const [status, body, reason] of cases) {
      const a = new GoogleRoutesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGoogleRoutesLedger(), fetchFn: fake(status, body).fetchFn });
      const r = await a.computeRoute({ origin: O, destination: D, mode: 'TRANSIT' });
      expect(r, reason).toMatchObject({ ok: false, reason });
      if (reason === 'no_routes') expect((r as any).raw).toEqual(body);
      expect(JSON.stringify(r)).not.toMatch(/SECRET-DETAIL|not valid|project 123/);
    }
  });

  it('timeout fails closed', async () => {
    const fetchFn = vi.fn((_u: any, init: any) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))) as any;
    const a = new GoogleRoutesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGoogleRoutesLedger(), fetchFn, timeoutMs: 30 });
    expect(await a.computeRoute({ origin: O, destination: D, mode: 'DRIVE' })).toEqual({ ok: false, mode: 'DRIVE', reason: 'timeout' });
  });

  it('duration parsing is strict', () => {
    expect(parseGoogleDurationSeconds('1260s')).toBe(1260);
    expect(parseGoogleDurationSeconds('90.4s')).toBe(90);
    for (const bad of ['1260', '-5s', 'P1M', 12, null]) expect(parseGoogleDurationSeconds(bad)).toBeNull();
  });
});

describe('D6 Google Routes ledger', () => {
  it('file ledger: 60/day hard stop, persisted across restarts, cap lowering-only, counts only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-d6-'));
    const filePath = path.join(dir, 'google-routes-ledger.json');
    try {
      expect(DEFAULT_GOOGLE_ROUTES_DAILY_CAP).toBe(60);
      const raised = new FileGoogleRoutesLedger({ filePath, dailyCap: 500 });
      for (let i = 0; i < 59; i++) expect(raised.tryReserve('TRANSIT')).toBe(true);
      const restarted = new FileGoogleRoutesLedger({ filePath, dailyCap: 500 });
      expect(restarted.tryReserve('DRIVE')).toBe(true); // 60th
      expect(restarted.tryReserve('DRIVE')).toBe(false); // refused, cap 60 even though 500 was asked
      const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(state).toMatchObject({ total: 60, byMode: { TRANSIT: 59, DRIVE: 1 } });
      expect(Object.keys(state).sort()).toEqual(['byMode', 'date', 'lifetimeTotal', 'total']);
      const lowered = new FileGoogleRoutesLedger({ filePath: path.join(dir, 'l2.json'), dailyCap: 2 });
      expect([lowered.tryReserve('WALK'), lowered.tryReserve('WALK'), lowered.tryReserve('WALK')]).toEqual([true, true, false]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unwritable ledger refuses the call', () => {
    const blocker = path.join(os.tmpdir(), `yori-d6-blocker-${process.pid}`);
    fs.writeFileSync(blocker, 'x');
    try {
      const l = new FileGoogleRoutesLedger({ filePath: path.join(blocker, 'nested', 'ledger.json') });
      expect(l.tryReserve('DRIVE')).toBe(false);
    } finally {
      fs.rmSync(blocker, { force: true });
    }
  });
});
