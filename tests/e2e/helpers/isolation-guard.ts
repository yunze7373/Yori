/**
 * E2E isolation guard (A22CFB incident 2026-11-03 ~20:35 JST: a default run silently reused the
 * owner's live preview on :4173). A test server must report every billed or live provider OFF:
 * weather, places and route status say enabled:false (or the route is not served to this Host),
 * and the model diagnostics say disabled. Anything else is a live server and the run must fail.
 */

export interface IsolationFinding {
  readonly url: string;
  readonly problem: string;
}

const STATUS_ROUTES = ['/api/weather/status', '/api/places/status', '/api/route/status'] as const;

export async function checkIsolatedServer(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<IsolationFinding[]> {
  const findings: IsolationFinding[] = [];
  const getJson = async (route: string): Promise<{ ok: boolean; status: number; body: any }> => {
    try {
      const r = await fetchFn(`${baseUrl}${route}`, { headers: { accept: 'application/json' } });
      const body = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, body };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  };
  for (const route of STATUS_ROUTES) {
    const r = await getJson(route);
    if (r.ok && r.body && r.body.enabled === true) findings.push({ url: `${baseUrl}${route}`, problem: 'provider is LIVE (enabled:true)' });
  }
  const diag = await getJson('/api/model/diagnostics');
  if (diag.ok && diag.body && diag.body.status === 'enabled') findings.push({ url: `${baseUrl}/api/model/diagnostics`, problem: 'model is LIVE (status enabled)' });
  return findings;
}

/** URLs the config publishes for specs that must address a server directly. */
export function configuredUrl(name: 'YORI_TEST_BUILD_URL' | 'YORI_SHIPPING_URL'): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set: run Playwright with playwright.config.ts (it publishes the server URLs)`);
  return v;
}
