/**
 * Unit proof for tests/e2e/helpers/isolation-guard.ts (A22CFB incident 2026-11-03): a server that
 * reports a live provider or a live model is flagged; an isolated test server is not.
 */

import { describe, it, expect } from 'vitest';
import { checkIsolatedServer } from '../../tests/e2e/helpers/isolation-guard.js';

function fakeServer(routes: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (input: any) => {
    const u = new URL(String(input));
    const r = routes[u.pathname] ?? { status: 404, body: { error: 'not found' } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as any;
  }) as typeof fetch;
}

describe('e2e isolation guard', () => {
  it('passes an isolated test server (providers off, model disabled, or not served to this Host)', async () => {
    const isolated = fakeServer({
      '/api/weather/status': { status: 200, body: { enabled: false } },
      '/api/places/status': { status: 403, body: { error: 'Forbidden' } },
      '/api/route/status': { status: 200, body: { enabled: false } },
      '/api/model/diagnostics': { status: 200, body: { status: 'disabled' } },
    });
    expect(await checkIsolatedServer('http://localhost:4173', isolated)).toEqual([]);
  });

  it('FAILS a live-enabled owner preview, naming every live provider', async () => {
    const live = fakeServer({
      '/api/weather/status': { status: 200, body: { enabled: true } },
      '/api/places/status': { status: 200, body: { enabled: true, provider: 'google' } },
      '/api/route/status': { status: 200, body: { enabled: false } },
      '/api/model/diagnostics': { status: 200, body: { status: 'enabled' } },
    });
    const findings = await checkIsolatedServer('http://localhost:4173', live);
    expect(findings.map(f => f.url)).toEqual([
      'http://localhost:4173/api/weather/status',
      'http://localhost:4173/api/places/status',
      'http://localhost:4173/api/model/diagnostics',
    ]);
  });

  it('an unreachable server is not mistaken for a live one', async () => {
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await checkIsolatedServer('http://localhost:4173', down)).toEqual([]);
  });
});
