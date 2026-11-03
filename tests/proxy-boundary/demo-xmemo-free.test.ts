/**
 * DEMO-XMEMO-FREE boundary tests: the server-side demo-recording switch.
 * - Off (default): /api/weather/status carries no `demo` field and XMemo routes behave as before.
 * - On (YORI_DEMO_HIDE_XMEMO=1): /api/weather/status carries demo.hideXmemo=true and every XMemo
 *   route answers disabled (status {enabled:false, connected:false}; others 403), with no fetch.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createWeatherProxyMiddleware } from '../../src/adapters/providers/server-proxy.js';
import { XMemoDevProxy } from '../../src/adapters/xmemo/server-proxy.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

function reqRes(url: string, method = 'GET') {
  const req: any = { url, method, headers: { host: '127.0.0.1:4173' }, socket: { remoteAddress: '127.0.0.1' }, on: () => {} };
  const out: { status: number; body: string } = { status: 200, body: '' };
  const res: any = {
    writeHead: (s: number) => { out.status = s; },
    setHeader: () => {},
    end: (b?: string) => { if (b) out.body = b; },
  };
  Object.defineProperty(res, 'statusCode', { get: () => out.status, set: (v: number) => { out.status = v; } });
  return { req, res, out };
}

async function weatherStatus() {
  const mw = createWeatherProxyMiddleware({ enabled: false });
  const r = reqRes('/api/weather/status');
  await mw(r.req, r.res, () => {});
  return JSON.parse(r.out.body);
}

describe('DEMO-XMEMO-FREE server switch', () => {
  it('off by default: the weather status payload is unchanged (no demo field)', async () => {
    delete process.env['YORI_DEMO_HIDE_XMEMO'];
    expect(await weatherStatus()).not.toHaveProperty('demo');
    process.env['YORI_DEMO_HIDE_XMEMO'] = 'true'; // only '1' switches it on
    expect(await weatherStatus()).not.toHaveProperty('demo');
  });

  it('on: the weather status carries the flag; every XMemo route answers disabled without any fetch', async () => {
    process.env['YORI_DEMO_HIDE_XMEMO'] = '1';
    expect((await weatherStatus()).demo).toEqual({ hideXmemo: true });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    const proxy = new XMemoDevProxy();
    const status = reqRes('/api/xmemo/status');
    expect(await proxy.handleHttpRequest(status.req, status.res)).toBe(true);
    expect(JSON.parse(status.out.body)).toEqual({ enabled: false, connected: false });
    for (const [url, method] of [
      ['/api/xmemo/auth-url', 'POST'],
      ['/api/xmemo/callback?code=x&state=y', 'GET'],
      ['/api/xmemo/disconnect', 'POST'],
      ['/api/xmemo/preferences', 'GET'],
      ['/api/xmemo/confirmed-facts', 'GET'],
    ]) {
      const r = reqRes(url!, method);
      expect(await proxy.handleHttpRequest(r.req, r.res), url).toBe(true);
      expect(r.out.status, url).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
