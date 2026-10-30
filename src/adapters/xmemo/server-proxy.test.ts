/**
 * XMemo Dev Proxy Unit & Integration Tests
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  XMemoDevProxy,
  createXMemoProxyMiddleware,
  generatePkcePair,
  generateState,
  resolveXMemoConfig,
  UNVERIFIED_XMEMO_MCP_MAPPING,
} from './server-proxy.js';
import { RateLimiter } from '../model/server-proxy.js';

function createMockReq(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  const req = {
    url: options.url || '/api/xmemo/status',
    method: options.method || 'GET',
    headers: {
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      'sec-fetch-site': 'same-origin',
      referer: 'http://127.0.0.1:5173/',
      ...options.headers,
    },
    on(event: string, callback: (...args: any[]) => void) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
      return req;
    },
    destroy() {
      // noop
    },
  };

  setTimeout(() => {
    if (options.body !== undefined) {
      const dataListeners = listeners['data'] || [];
      for (const cb of dataListeners) {
        cb(Buffer.from(options.body));
      }
    }
    const endListeners = listeners['end'] || [];
    for (const cb of endListeners) {
      cb();
    }
  }, 1);

  return req;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, val: string) {
      res.headers[name] = val;
    },
    end(content?: string) {
      if (content) res.body = content;
    },
  };
  return res;
}

describe('PKCE & Config Helpers', () => {
  it('generates valid RFC 7636 PKCE pair and random state', () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier).toBeDefined();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBeDefined();
    expect(codeVerifier).not.toBe(codeChallenge);

    const state1 = generateState();
    const state2 = generateState();
    expect(state1).not.toBe(state2);
    expect(state1.length).toBe(32);
  });

  it('resolves config with XMEMO_OAUTH_ENABLED default false', () => {
    const config = resolveXMemoConfig(() => {}, { XMEMO_OAUTH_ENABLED: 'false' });
    expect(config.enabled).toBe(false);
    expect(config.scopes).toEqual(['memory:read', 'memory:write']);
    expect(config.issuer).toBe('https://xmemo.dev');
  });

  it('resolves config with XMEMO_OAUTH_ENABLED true', () => {
    const config = resolveXMemoConfig(() => {}, { XMEMO_OAUTH_ENABLED: 'true' });
    expect(config.enabled).toBe(true);
  });

  it('exposes isolated UNVERIFIED MCP mapping with expected tool names and args', () => {
    expect(UNVERIFIED_XMEMO_MCP_MAPPING.readTool).toBe('recall');
    expect(UNVERIFIED_XMEMO_MCP_MAPPING.writeTool).toBe('remember');
    expect(UNVERIFIED_XMEMO_MCP_MAPPING.writeTagValue).toBe('yori:living-context');
  });
});

describe('XMemoDevProxy: Flag OFF by default', () => {
  let proxy: XMemoDevProxy;

  beforeEach(() => {
    proxy = new XMemoDevProxy({ enabled: false });
  });

  it('status reports disabled by default', () => {
    const status = proxy.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.statusText).toContain('XMemo OAuth disabled (default)');
  });

  it('GET /api/xmemo/status returns 200 with disabled status', async () => {
    const req = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const res = createMockRes();

    const handled = await proxy.handleHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.enabled).toBe(false);
    expect(json.connected).toBe(false);
  });

  it('operational endpoints return 403 Forbidden and make zero xmemo.dev calls when flag is off', async () => {
    const endpoints = [
      { url: '/api/xmemo/auth-url', method: 'POST' },
      { url: '/api/xmemo/callback', method: 'POST', body: '{}' },
      { url: '/api/xmemo/disconnect', method: 'POST' },
      { url: '/api/xmemo/preferences', method: 'POST', body: '{}' },
      { url: '/api/xmemo/confirmed-facts', method: 'POST', body: '{}' },
    ];

    for (const ep of endpoints) {
      const req = createMockReq({
        url: ep.url,
        method: ep.method,
        headers: { 'content-type': 'application/json' },
        body: ep.body || '{}',
      });
      const res = createMockRes();
      const handled = await proxy.handleHttpRequest(req, res);
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('XMemo OAuth disabled');
    }
  });

  it('arbitrary or legacy /api/xmemo/mcp passthrough is not handled (404/pass to next)', async () => {
    const req = createMockReq({
      url: '/api/xmemo/mcp',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call' }),
    });
    const res = createMockRes();
    const handled = await proxy.handleHttpRequest(req, res);
    expect(handled).toBe(false);
  });
});

describe('XMemoDevProxy: Flag ON', () => {
  let proxy: XMemoDevProxy;

  beforeEach(() => {
    proxy = new XMemoDevProxy({
      enabled: true,
      issuer: 'https://xmemo.dev',
      authorizeUrl: 'https://xmemo.dev/oauth/authorize',
      tokenUrl: 'https://xmemo.dev/oauth/token',
      revokeUrl: 'https://xmemo.dev/oauth/revoke',
      mcpUrl: 'https://xmemo.dev/mcp',
      clientId: 'yori-dev-client',
      redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
      scopes: ['memory:read', 'memory:write'],
    });
  });

  it('GET /api/xmemo/status returns 200 with enabled true, connected false', async () => {
    const req = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.enabled).toBe(true);
    expect(json.connected).toBe(false);
  });

  it('POST /api/xmemo/auth-url generates valid PKCE authorization URL with exact scopes', async () => {
    const req = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.authUrl).toBeDefined();
    expect(json.state).toBeDefined();

    const parsed = new URL(json.authUrl);
    expect(parsed.origin).toBe('https://xmemo.dev');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('yori-dev-client');
    expect(parsed.searchParams.get('scope')).toBe('memory:read memory:write');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeDefined();
    // Verify code_verifier is strictly omitted from the response
    expect((json as any).codeVerifier).toBeUndefined();
    expect((json as any).code_verifier).toBeUndefined();
  });

  describe('OAuth Callback & Cross-Site Redirect Order (Finding 2)', () => {
    it('GET /api/xmemo/callback allows top-level cross-site redirect from xmemo.dev with valid state', async () => {
      const { state } = proxy.createAuthUrl();

      // Mock upstream token endpoint
      let tokenExchangeCalled = false;
      const mockFetch = (async (url: string) => {
        if (url === 'https://xmemo.dev/oauth/token') {
          tokenExchangeCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'redirect-acquired-token',
              token_type: 'Bearer',
              expires_in: 3600,
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      // Simulate top-level browser redirect navigation from xmemo.dev
      const req = createMockReq({
        url: `/api/xmemo/callback?code=mock-code&state=${state}`,
        method: 'GET',
        headers: {
          host: '127.0.0.1:5173',
          'sec-fetch-site': 'cross-site', // from https://xmemo.dev
          referer: 'https://xmemo.dev/oauth/authorize',
        },
      });
      const res = createMockRes();

      // Inject mock fetch for exchangeCode
      proxy['exchangeCode'] = (code: string, st: string) =>
        XMemoDevProxy.prototype.exchangeCode.call(proxy, code, st, mockFetch);

      const handled = await proxy.handleHttpRequest(req, res);
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(302);
      expect(res.headers['Location']).toBe('/?tab=me&xmemo=connected');
      expect(tokenExchangeCalled).toBe(true);
      expect(proxy.isConnected()).toBe(true);
    });

    it('GET /api/xmemo/callback rejects replayed or unknown state with 400', async () => {
      const req = createMockReq({
        url: '/api/xmemo/callback?code=mock-code&state=unknown-replayed-state',
        method: 'GET',
        headers: {
          host: '127.0.0.1:5173',
          'sec-fetch-site': 'cross-site',
          referer: 'https://xmemo.dev/',
        },
      });
      const res = createMockRes();

      const handled = await proxy.handleHttpRequest(req, res);
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Authentication Failed');
    });

    it('POST /api/xmemo/callback rejects invalid or unknown state with 400', async () => {
      const req = createMockReq({
        url: '/api/xmemo/callback',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-123', state: 'unknown-state' }),
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Invalid or expired state');
    });

    it('POST /api/xmemo/callback handles successful token exchange and stores token in server memory', async () => {
      const { state } = proxy.createAuthUrl();

      // Mock upstream token exchange endpoint
      let capturedBody = '';
      const mockFetch = (async (url: string, init: any) => {
        expect(url).toBe('https://xmemo.dev/oauth/token');
        capturedBody = init.body;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'secret-token-xyz-123',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'memory:read memory:write',
          }),
        };
      }) as any;

      const exchangeResult = await proxy.exchangeCode('valid-auth-code', state, mockFetch);
      expect(exchangeResult.success).toBe(true);
      expect(proxy.isConnected()).toBe(true);
      expect(proxy.getStatus().connected).toBe(true);
      expect(capturedBody).toContain('code=valid-auth-code');
      expect(capturedBody).toContain('grant_type=authorization_code');
      expect(capturedBody).toContain('code_verifier=');
    });
  });

  describe('Narrow Read Preferences Route (Finding 1)', () => {
    it('POST /api/xmemo/preferences returns 401 when disconnected', async () => {
      const req = createMockReq({
        url: '/api/xmemo/preferences',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'preferences' }),
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toContain('Not connected to XMemo');
    });

    it('POST /api/xmemo/preferences builds JSON-RPC from UNVERIFIED mapping and passes Bearer token', async () => {
      const { state } = proxy.createAuthUrl();
      await proxy.exchangeCode(
        'code-1',
        state,
        (async () => ({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'valid-bearer-token' }),
        })) as any
      );

      let capturedHeaders: Record<string, string> = {};
      let capturedPayload: any;
      const mockMcpFetch = (async (url: string, init: any) => {
        expect(url).toBe('https://xmemo.dev/mcp');
        capturedHeaders = init.headers;
        capturedPayload = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              memories: [{ key: 'transit_habit', value: 'drive' }],
            },
          }),
        };
      }) as any;

      const readResult = await proxy.readPreferences('custom-pref', mockMcpFetch);
      expect(readResult.status).toBe(200);
      expect(capturedHeaders['Authorization']).toBe('Bearer valid-bearer-token');
      expect(capturedPayload.params.name).toBe(UNVERIFIED_XMEMO_MCP_MAPPING.readTool);
      expect(capturedPayload.params.arguments[UNVERIFIED_XMEMO_MCP_MAPPING.readQueryArg]).toBe(
        'custom-pref'
      );
    });

    it('POST /api/xmemo/preferences rejects invalid query types with 400', async () => {
      const req = createMockReq({
        url: '/api/xmemo/preferences',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'a'.repeat(150) }), // > 100 chars
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('query must be string <= 100');
    });
  });

  describe('Narrow Write Confirmed Fact Route & Server-Side Confirm-Only (Finding 1)', () => {
    beforeEach(async () => {
      const { state } = proxy.createAuthUrl();
      await proxy.exchangeCode(
        'code-1',
        state,
        (async () => ({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'valid-bearer-token' }),
        })) as any
      );
    });

    it('rejects pending fact write with 400 and NEVER calls upstream fetch (Server-Side INV-107)', async () => {
      let upstreamCalled = false;
      const mockFetch = (async () => {
        upstreamCalled = true;
        return { ok: true, status: 200 };
      }) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'transit_pref',
          value: 'drive',
          status: 'pending', // FORBIDDEN!
          provenance: { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mockFetch
      );

      expect(writeResult.status).toBe(400);
      expect((writeResult.data as any).error).toContain('INV-107');
      expect(upstreamCalled).toBe(false);
    });

    it('rejects rejected fact write with 400 and NEVER calls upstream fetch (Server-Side INV-107)', async () => {
      let upstreamCalled = false;
      const mockFetch = (async () => {
        upstreamCalled = true;
        return { ok: true, status: 200 };
      }) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'transit_pref',
          value: 'drive',
          status: 'rejected', // FORBIDDEN!
          provenance: { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mockFetch
      );

      expect(writeResult.status).toBe(400);
      expect((writeResult.data as any).error).toContain('INV-107');
      expect(upstreamCalled).toBe(false);
    });

    it('rejects fact with missing or oversize key with 400 and NEVER calls upstream fetch', async () => {
      let upstreamCalled = false;
      const mockFetch = (async () => {
        upstreamCalled = true;
        return { ok: true, status: 200 };
      }) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'x'.repeat(150), // oversize
          value: 'drive',
          status: 'confirmed',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mockFetch
      );

      expect(writeResult.status).toBe(400);
      expect(upstreamCalled).toBe(false);
    });

    it('accepts confirmed fact, builds scoped JSON-RPC payload, and dispatches to upstream', async () => {
      let capturedPayload: any;
      const mockFetch = (async (url: string, init: any) => {
        expect(url).toBe('https://xmemo.dev/mcp');
        capturedPayload = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: { success: true } }),
        };
      }) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'rain_habit',
          value: 'drive',
          status: 'confirmed',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mockFetch
      );

      expect(writeResult.status).toBe(200);
      expect((writeResult.data as any).success).toBe(true);
      expect(capturedPayload.params.name).toBe(UNVERIFIED_XMEMO_MCP_MAPPING.writeTool);
      expect(capturedPayload.params.arguments[UNVERIFIED_XMEMO_MCP_MAPPING.writeKeyArg]).toBe(
        'rain_habit'
      );
      expect(capturedPayload.params.arguments[UNVERIFIED_XMEMO_MCP_MAPPING.writeStatusArg]).toBe(
        'confirmed'
      );
      expect(capturedPayload.params.arguments[UNVERIFIED_XMEMO_MCP_MAPPING.writeTagArg]).toBe(
        UNVERIFIED_XMEMO_MCP_MAPPING.writeTagValue
      );
    });

    it('upstream 401 on write clears server session and returns 401 fallback', async () => {
      const mock401 = (async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_token' }),
      })) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'rain_habit',
          value: 'drive',
          status: 'confirmed',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mock401
      );

      expect(writeResult.status).toBe(401);
      expect((writeResult.data as any).disconnected).toBe(true);
      expect(proxy.isConnected()).toBe(false);
    });

    it('upstream 5xx on write returns 502 Bad Gateway without crashing', async () => {
      const mock500 = (async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      })) as any;

      const writeResult = await proxy.writeConfirmedFact(
        {
          key: 'rain_habit',
          value: 'drive',
          status: 'confirmed',
          provenance: { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
        },
        mock500
      );

      expect(writeResult.status).toBe(502);
      expect((writeResult.data as any).error).toContain('error status 500');
    });
  });

  it('POST /api/xmemo/disconnect calls upstream revoke endpoint and clears session', async () => {
    const { state } = proxy.createAuthUrl();
    await proxy.exchangeCode(
      'code-1',
      state,
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'to-revoke-token' }),
      })) as any
    );
    expect(proxy.isConnected()).toBe(true);

    let revokeCalled = false;
    let revokeBody = '';
    const mockRevokeFetch = (async (url: string, init: any) => {
      expect(url).toBe('https://xmemo.dev/oauth/revoke');
      revokeCalled = true;
      revokeBody = init.body;
      return { ok: true, status: 200 };
    }) as any;

    const res = await proxy.disconnect(mockRevokeFetch);
    expect(res.success).toBe(true);
    expect(revokeCalled).toBe(true);
    expect(revokeBody).toContain('token=to-revoke-token');
    expect(proxy.isConnected()).toBe(false);
  });

  describe('Security Guards', () => {
    it('rejects non-local Host header with 403', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { host: 'evil-phishing.com' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('non-local host access is blocked');
    });

    it('rejects cross-origin Origin header with 403 on API routes', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { origin: 'https://attacker.example.com' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('cross-origin access is blocked');
    });

    it('rejects Sec-Fetch-Site: cross-site with 403 on API routes', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('cross-site requests are blocked');
    });

    it('rejects non-local Referer with 403 on API routes', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { referer: 'https://malicious.org/exploit' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('non-local referer is blocked');
    });

    it('rejects POST with non-JSON Content-Type (e.g. text/plain) with 415', async () => {
      const req = createMockReq({
        url: '/api/xmemo/callback',
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'code=123',
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(415);
      expect(res.body).toContain('application/json required');
    });

    it('rejects payload exceeding 8KB cap with 413', async () => {
      const hugeBody = JSON.stringify({ key: 'x'.repeat(10000) });
      const req = createMockReq({
        url: '/api/xmemo/confirmed-facts',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: hugeBody,
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(413);
      expect(res.body).toContain('Payload Too Large');
    });

    it('enforces rate limiting with 429 when quota exceeded', async () => {
      const strictLimiter = new RateLimiter(2, 60_000);
      const limitedProxy = new XMemoDevProxy(
        { enabled: true, clientId: 'mock-rate-limit-client' },
        () => {},
        strictLimiter
      );

      const makeReq = () => {
        const req = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
        const res = createMockRes();
        return limitedProxy.handleHttpRequest(req, res).then(() => res.statusCode);
      };

      expect(await makeReq()).toBe(200);
      expect(await makeReq()).toBe(200);
      expect(await makeReq()).toBe(429);
    });

    it('middleware passes through non-xmemo routes with next()', async () => {
      const middleware = createXMemoProxyMiddleware(proxy);
      const req = createMockReq({ url: '/api/model/refine' });
      const res = createMockRes();
      let nextCalled = false;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });
});

describe('RFC 7591 Dynamic Client Registration & Persistence', () => {
  let tmpDir: string;
  let stateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmemo-proxy-test-'));
    stateFile = path.join(tmpDir, '.xmemo-client.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup error
    }
  });

  it('removes yori-dev-client fallback: clientId is undefined when not in env', () => {
    const config = resolveXMemoConfig(() => {}, { XMEMO_OAUTH_ENABLED: 'true' });
    expect(config.clientId).toBeUndefined();
  });

  it('discovers endpoint and registers with exact RFC 7591 request body', async () => {
    let discoveryCalled = false;
    let registrationPayload: any = null;
    let registrationHeaders: any = null;

    const mockFetch = (async (url: string, init?: RequestInit) => {
      if (url === 'https://xmemo.dev/.well-known/oauth-authorization-server') {
        discoveryCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
        };
      }

      if (url === 'https://xmemo.dev/oauth/register') {
        registrationHeaders = init?.headers;
        registrationPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            client_id: 'dyn-client-test-777',
            client_name: 'Yori (local dev)',
          }),
        };
      }

      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        issuer: 'https://xmemo.dev',
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
        clientStoragePath: stateFile,
      },
      () => {},
      undefined,
      mockFetch
    );

    const result = await proxy.ensureRegistered(mockFetch);
    expect(result.success).toBe(true);
    expect(result.clientId).toBe('dyn-client-test-777');
    expect(discoveryCalled).toBe(true);

    // Exact RFC 7591 registration payload check
    expect(registrationPayload).toEqual({
      redirect_uris: ['http://127.0.0.1:5173/api/xmemo/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'memory:read memory:write',
      client_name: 'Yori (local dev)',
    });

    expect(registrationHeaders['Content-Type']).toBe('application/json');
    expect(registrationHeaders['Accept']).toBe('application/json');
  });

  it('skips discovery when XMEMO_REGISTRATION_URL override is configured', async () => {
    let discoveryCalled = false;
    let registrationUrlCalled = '';

    const mockFetch = (async (url: string, _init?: RequestInit) => {
      if (url.includes('.well-known')) {
        discoveryCalled = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (url === 'https://custom-auth.example.com/register') {
        registrationUrlCalled = url;
        return {
          ok: true,
          status: 201,
          json: async () => ({ client_id: 'custom-reg-id' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        registrationUrl: 'https://custom-auth.example.com/register',
        clientStoragePath: stateFile,
      },
      () => {},
      undefined,
      mockFetch
    );

    const result = await proxy.ensureRegistered(mockFetch);
    expect(result.success).toBe(true);
    expect(result.clientId).toBe('custom-reg-id');
    expect(discoveryCalled).toBe(false);
    expect(registrationUrlCalled).toBe('https://custom-auth.example.com/register');
  });

  it('persists client_id to local state file (mode 0600) and reuses across restarts', async () => {
    let regCallCount = 0;
    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        regCallCount++;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            client_id: 'persisted-client-id-888',
            client_secret: 'mock_secret_server_only',
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    // Instance 1: registers and persists
    const proxy1 = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      () => {},
      undefined,
      mockFetch
    );
    const res1 = await proxy1.ensureRegistered(mockFetch);
    expect(res1.success).toBe(true);
    expect(res1.clientId).toBe('persisted-client-id-888');
    expect(regCallCount).toBe(1);

    // Verify file exists on disk
    expect(fs.existsSync(stateFile)).toBe(true);
    const stat = fs.statSync(stateFile);
    // Mode check (0600)
    expect(stat.mode & 0o777).toBe(0o600);
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(content.client_id).toBe('persisted-client-id-888');
    expect(content.client_secret).toBe('mock_secret_server_only');
    expect(content.redirect_uri).toBe('http://127.0.0.1:5173/api/xmemo/callback');
    expect(content.issuer).toBe('https://xmemo.dev');

    // Instance 2 (restart simulation): loads from file with 0 registration calls
    const rejectingFetch = (async () => {
      throw new Error('Should NOT be called because client_id is persisted');
    }) as any;

    const proxy2 = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      () => {},
      undefined,
      rejectingFetch
    );

    const res2 = await proxy2.ensureRegistered(rejectingFetch);
    expect(res2.success).toBe(true);
    expect(res2.clientId).toBe('persisted-client-id-888');
    expect(regCallCount).toBe(1); // Still 1, no second call!
  });

  it('does NOT default clientStoragePath to cwd when configOverride is provided', () => {
    const proxyWithOverride = new XMemoDevProxy({ enabled: true });
    expect((proxyWithOverride as any).config.clientStoragePath).toBeUndefined();

    const proxyWithoutOverride = new XMemoDevProxy();
    expect((proxyWithoutOverride as any).config.clientStoragePath).toBe(
      path.resolve(process.cwd(), '.xmemo-client.json')
    );
  });

  it('ignores persisted client_id when stored issuer does not match current config (mock vs real)', async () => {
    // 1. Write persisted record with mock issuer
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        client_id: 'mock-sink-client-id',
        issuer: 'http://127.0.0.1:9999',
        redirect_uri: 'http://127.0.0.1:5173/api/xmemo/callback',
        registered_at: new Date().toISOString(),
      }),
      { encoding: 'utf-8', mode: 0o600 }
    );

    let regCalled = false;
    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        regCalled = true;
        return {
          ok: true,
          status: 201,
          json: async () => ({ client_id: 'real-fresh-client-id' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    // Config has real issuer https://xmemo.dev
    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        issuer: 'https://xmemo.dev',
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
        clientStoragePath: stateFile,
      },
      () => {},
      undefined,
      mockFetch
    );

    const result = await proxy.ensureRegistered(mockFetch);
    expect(result.success).toBe(true);
    expect(result.clientId).toBe('real-fresh-client-id');
    expect(regCalled).toBe(true);

    const updated = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(updated.client_id).toBe('real-fresh-client-id');
    expect(updated.issuer).toBe('https://xmemo.dev');
  });

  it('ignores persisted client_id when stored issuer does not match current config (real vs mock)', async () => {
    // 1. Write persisted record with real issuer
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        client_id: 'real-xmemo-client-id',
        issuer: 'https://xmemo.dev',
        redirect_uri: 'http://127.0.0.1:5173/api/xmemo/callback',
        registered_at: new Date().toISOString(),
      }),
      { encoding: 'utf-8', mode: 0o600 }
    );

    let regCalled = false;
    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'http://127.0.0.1:9999/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        regCalled = true;
        return {
          ok: true,
          status: 201,
          json: async () => ({ client_id: 'mock-sink-fresh-client-id' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    // Config has mock issuer http://127.0.0.1:9999
    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        issuer: 'http://127.0.0.1:9999',
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
        clientStoragePath: stateFile,
      },
      () => {},
      undefined,
      mockFetch
    );

    const result = await proxy.ensureRegistered(mockFetch);
    expect(result.success).toBe(true);
    expect(result.clientId).toBe('mock-sink-fresh-client-id');
    expect(regCalled).toBe(true);

    const updated = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(updated.client_id).toBe('mock-sink-fresh-client-id');
    expect(updated.issuer).toBe('http://127.0.0.1:9999');
  });

  it('ignores persisted client_id when stored redirect_uri does not match current config', async () => {
    // Write persisted record with different redirect_uri
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        client_id: 'different-redirect-client-id',
        issuer: 'https://xmemo.dev',
        redirect_uri: 'http://127.0.0.1:9999/other/callback',
        registered_at: new Date().toISOString(),
      }),
      { encoding: 'utf-8', mode: 0o600 }
    );

    let regPayload: any = null;
    const mockFetch = (async (url: string, init?: RequestInit) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        regPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({ client_id: 'fresh-matching-redirect-client-id' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        issuer: 'https://xmemo.dev',
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
        clientStoragePath: stateFile,
      },
      () => {},
      undefined,
      mockFetch
    );

    const result = await proxy.ensureRegistered(mockFetch);
    expect(result.success).toBe(true);
    expect(result.clientId).toBe('fresh-matching-redirect-client-id');
    expect(regPayload.redirect_uris).toEqual(['http://127.0.0.1:5173/api/xmemo/callback']);

    const updated = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(updated.client_id).toBe('fresh-matching-redirect-client-id');
    expect(updated.redirect_uri).toBe('http://127.0.0.1:5173/api/xmemo/callback');
  });
});

describe('Fail-Closed Behavior on Registration Failure', () => {
  let tmpDir: string;
  let stateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmemo-fail-test-'));
    stateFile = path.join(tmpDir, '.xmemo-client.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('fails closed when registration returns 400 invalid_redirect_uri', async () => {
    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_redirect_uri',
            error_description: 'Loopback redirect URIs are not allowed',
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      () => {},
      undefined,
      mockFetch
    );

    // 1. GET /api/xmemo/status triggers registration and reports clear rejection status
    const reqStatus = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const resStatus = createMockRes();
    await proxy.handleHttpRequest(reqStatus, resStatus);

    expect(resStatus.statusCode).toBe(200);
    const statusData = JSON.parse(resStatus.body);
    expect(statusData.enabled).toBe(true);
    expect(statusData.connected).toBe(false);
    expect(statusData.statusText).toBe('registration rejected: invalid_redirect_uri');

    // 2. POST /api/xmemo/auth-url refuses to generate authorize URL
    const reqAuth = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
    const resAuth = createMockRes();
    await proxy.handleHttpRequest(reqAuth, resAuth);

    expect(resAuth.statusCode).toBe(500);
    const authData = JSON.parse(resAuth.body);
    expect(authData.error).toContain('registration rejected: invalid_redirect_uri');
    expect(authData.authUrl).toBeUndefined();

    // 3. createAuthUrl() directly throws
    expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: invalid_redirect_uri/);
  });

  it('fails closed on network error during registration', async () => {
    const mockFetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:9999');
    }) as any;

    const proxy = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      () => {},
      undefined,
      mockFetch
    );

    const reqStatus = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const resStatus = createMockRes();
    await proxy.handleHttpRequest(reqStatus, resStatus);

    expect(resStatus.statusCode).toBe(200);
    const statusData = JSON.parse(resStatus.body);
    expect(statusData.enabled).toBe(true);
    expect(statusData.connected).toBe(false);
    expect(statusData.statusText).toBe('registration rejected: network_error');

    expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: network_error/);
  });

  it('fails closed on malformed response without client_id', async () => {
    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ something_else: 'no client_id here' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      () => {},
      undefined,
      mockFetch
    );

    const reqStatus = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const resStatus = createMockRes();
    await proxy.handleHttpRequest(reqStatus, resStatus);

    expect(resStatus.statusCode).toBe(200);
    const statusData = JSON.parse(resStatus.body);
    expect(statusData.statusText).toBe('registration rejected: malformed_response');
  });
});

describe('Secret Hygiene (Finding 5)', () => {
  let tmpDir: string;
  let stateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmemo-secret-test-'));
    stateFile = path.join(tmpDir, '.xmemo-client.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('sentinel tokens and client_secret never appear in logs, status JSON, browser responses or test output', async () => {
    const SENTINEL_SECRET = 'sentinel_secret_xyz123_NEVER_LEAK';
    const SENTINEL_ACCESS = 'sentinel_access_abc789_NEVER_LEAK';
    const SENTINEL_REFRESH = 'sentinel_refresh_def456_NEVER_LEAK';

    const logs: string[] = [];
    const logger = (msg: string) => logs.push(msg);

    const mockFetch = (async (url: string) => {
      if (url.includes('.well-known')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ registration_endpoint: 'https://xmemo.dev/oauth/register' }),
        };
      }
      if (url.includes('/oauth/register')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            client_id: 'sentinel-client-id-001',
            client_secret: SENTINEL_SECRET,
          }),
        };
      }
      if (url.includes('/oauth/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: SENTINEL_ACCESS,
            refresh_token: SENTINEL_REFRESH,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        };
      }
      if (url.includes('/mcp')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            result: { memories: [] },
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      { enabled: true, clientStoragePath: stateFile },
      logger,
      undefined,
      mockFetch
    );

    const responseBodies: string[] = [];

    // 1. Status (triggers registration)
    const req1 = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const res1 = createMockRes();
    await proxy.handleHttpRequest(req1, res1);
    responseBodies.push(res1.body);

    // 2. Auth URL
    const req2 = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
    const res2 = createMockRes();
    await proxy.handleHttpRequest(req2, res2);
    responseBodies.push(res2.body);
    const authUrlData = JSON.parse(res2.body);

    // 3. Callback token exchange
    const req3 = createMockReq({
      url: '/api/xmemo/callback',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'mock-code', state: authUrlData.state }),
    });
    const res3 = createMockRes();
    await proxy.handleHttpRequest(req3, res3);
    responseBodies.push(res3.body);

    // 4. Connected status
    const req4 = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const res4 = createMockRes();
    await proxy.handleHttpRequest(req4, res4);
    responseBodies.push(res4.body);

    // 5. Read preferences
    const req5 = createMockReq({
      url: '/api/xmemo/preferences',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'prefs' }),
    });
    const res5 = createMockRes();
    await proxy.handleHttpRequest(req5, res5);
    responseBodies.push(res5.body);

    // Combine all outputs
    const allLogs = logs.join('\n');
    const allBodies = responseBodies.join('\n');
    const statusJson = JSON.stringify(proxy.getStatus());

    for (const secret of [SENTINEL_SECRET, SENTINEL_ACCESS, SENTINEL_REFRESH]) {
      expect(allLogs).not.toContain(secret);
      expect(allBodies).not.toContain(secret);
      expect(statusJson).not.toContain(secret);
    }
  });
});

describe('DELETE /api/xmemo/confirmed-facts', () => {
  it('calls MCP forget tool to delete confirmed fact', async () => {
    let mcpBody: any = null;
    const mockFetch = (async (url: string, init?: RequestInit) => {
      if (url.includes('/mcp')) {
        mcpBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ jsonrpc: '2.0', result: { content: [{ type: 'text', text: 'deleted' }] } }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const proxy = new XMemoDevProxy(
      { enabled: true, clientId: 'test-client' },
      () => {},
      undefined,
      mockFetch
    );
    // Set active session
    (proxy as any).session = { accessToken: 'valid-test-token' };

    const req = createMockReq({
      url: '/api/xmemo/confirmed-facts',
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'yori:pref:coffee' }),
    });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(mcpBody).toBeDefined();
    expect(mcpBody.method).toBe('tools/call');
    expect(mcpBody.params.name).toBe('forget');
    expect(mcpBody.params.arguments).toEqual({ key: 'yori:pref:coffee' });
  });

  it('rejects DELETE without key or with invalid key with 400', async () => {
    const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' });
    (proxy as any).session = { accessToken: 'valid-test-token' };

    const req = createMockReq({
      url: '/api/xmemo/confirmed-facts',
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Bad Request: key must be string');
  });
});

describe('NetGuard external call interceptor (setup-netguard.ts)', () => {
  it('blocks unmocked non-loopback network fetch attempts to xmemo.dev', async () => {
    await expect(globalThis.fetch('https://xmemo.dev/oauth/register')).rejects.toThrow(
      /\[NETGUARD\] Blocked unmocked non-loopback network fetch to: https:\/\/xmemo\.dev\/oauth\/register/
    );
  });

  it('permits loopback network fetch attempts to 127.0.0.1 and localhost', async () => {
    // A fetch to an unused local port fails with connection refused, NOT NetGuard blocked
    await expect(globalThis.fetch('http://127.0.0.1:19999/test-health')).rejects.not.toThrow(
      /\[NETGUARD\] Blocked/
    );
  });
});
