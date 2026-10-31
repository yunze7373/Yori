/**
 * XMemo Dev Proxy Unit & Integration Tests
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  XMemoDevProxy,
  createXMemoProxyMiddleware,
  generatePkcePair,
  generateState,
  resolveXMemoConfig,
  UNVERIFIED_XMEMO_MCP_MAPPING,
  normalizeIssuer,
  isLoopbackHost,
  validateEndpointUrl,
  YORI_MANAGED_FACT_KEYS,
  isYoriManagedFactKey,
  extractCandidateFacts,
  hasYoriProvenance,
  verifyFactProvenance,
} from './server-proxy.js';
import { humanizeMemoryKey } from '../../ui/review/why-sheet.js';
import { collectPluginManagedMemoryKeys } from '../../plugins/registry.js';
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
          key: 'rain_transport_preference',
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
        'rain_transport_preference'
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
          key: 'rain_transport_preference',
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
          key: 'rain_transport_preference',
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
            issuer: 'https://xmemo.dev',
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
      redirect_uris: [
        'http://127.0.0.1:5173/api/xmemo/callback',
        'http://127.0.0.1:4173/api/xmemo/callback',
        'http://127.0.0.1:4174/api/xmemo/callback',
        'http://localhost:4173/api/xmemo/callback',
        'http://localhost:4174/api/xmemo/callback',
        'http://localhost:5173/api/xmemo/callback',
      ],
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
        issuer: 'https://custom-auth.example.com',
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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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
          json: async () => ({
            issuer: 'http://127.0.0.1:9999',
            registration_endpoint: 'http://127.0.0.1:9999/oauth/register',
          }),
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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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
    expect(regPayload.redirect_uris).toEqual([
      'http://127.0.0.1:5173/api/xmemo/callback',
      'http://127.0.0.1:4173/api/xmemo/callback',
      'http://127.0.0.1:4174/api/xmemo/callback',
      'http://localhost:4173/api/xmemo/callback',
      'http://localhost:4174/api/xmemo/callback',
      'http://localhost:5173/api/xmemo/callback',
    ]);

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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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

describe('RFC 8414 §3.3 Issuer Normalization & Endpoint Origin Allowlist (GATE-X1-HARDEN)', () => {
  it('normalizes issuer URLs by stripping trailing slashes without modifying path', () => {
    expect(normalizeIssuer('https://xmemo.dev')).toBe('https://xmemo.dev');
    expect(normalizeIssuer('https://xmemo.dev/')).toBe('https://xmemo.dev');
    expect(normalizeIssuer('https://xmemo.dev///')).toBe('https://xmemo.dev');
    expect(normalizeIssuer('https://xmemo.dev/oauth/')).toBe('https://xmemo.dev/oauth');
    expect(normalizeIssuer('https://xmemo.dev/oauth')).toBe('https://xmemo.dev/oauth');
    expect(normalizeIssuer('http://127.0.0.1:9999/')).toBe('http://127.0.0.1:9999');
  });

  it('validates loopback host detection correctly', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('sub.localhost')).toBe(true);
    expect(isLoopbackHost('xmemo.dev')).toBe(false);
    expect(isLoopbackHost('evil.example')).toBe(false);
  });

  it('validates endpoint URLs against issuer origin and scheme rules', () => {
    // Valid HTTPS matching origin
    expect(validateEndpointUrl('https://xmemo.dev/oauth/token', 'https://xmemo.dev').valid).toBe(true);
    expect(validateEndpointUrl('https://xmemo.dev/mcp', 'https://xmemo.dev').valid).toBe(true);

    // Foreign origin (different host)
    const foreignHost = validateEndpointUrl('https://evil.example/token', 'https://xmemo.dev');
    expect(foreignHost.valid).toBe(false);
    expect(foreignHost.reason).toContain('Endpoint origin');

    // Foreign origin (different port)
    const foreignPort = validateEndpointUrl('https://xmemo.dev:8443/token', 'https://xmemo.dev');
    expect(foreignPort.valid).toBe(false);
    expect(foreignPort.reason).toContain('Endpoint origin');

    // Protocol downgrade on non-loopback issuer
    const downgrade = validateEndpointUrl('http://xmemo.dev/oauth/token', 'https://xmemo.dev');
    expect(downgrade.valid).toBe(false);

    // Valid loopback HTTP
    expect(validateEndpointUrl('http://127.0.0.1:9999/oauth/token', 'http://127.0.0.1:9999').valid).toBe(true);
    expect(validateEndpointUrl('http://localhost:5173/mcp', 'http://localhost:5173').valid).toBe(true);

    // Loopback HTTP port mismatch
    const portMismatch = validateEndpointUrl('http://127.0.0.1:8888/token', 'http://127.0.0.1:9999');
    expect(portMismatch.valid).toBe(false);

    // Non-loopback HTTP issuer is rejected
    const nonLoopbackHttp = validateEndpointUrl('http://insecure.example/token', 'http://insecure.example');
    expect(nonLoopbackHttp.valid).toBe(false);
    expect(nonLoopbackHttp.reason).toContain('HTTP is only permitted for loopback issuer');

    // Malformed URL
    const malformed = validateEndpointUrl('not-a-valid-url', 'https://xmemo.dev');
    expect(malformed.valid).toBe(false);
    expect(malformed.reason).toContain('Malformed URL');
  });

  describe('Discovery Hardening & No Tokens to Foreign Origin (AC-1, AC-2, AC-3)', () => {
    let tmpDir: string;
    let stateFile: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmemo-harden-test-'));
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

    it('fails closed when discovery document is missing issuer field', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              // Missing issuer field
              registration_endpoint: 'https://xmemo.dev/oauth/register',
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

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('issuer_mismatch');
      expect(proxy.getStatus().statusText).toBe('registration rejected: issuer_mismatch');
      expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: issuer_mismatch/);
    });

    it('fails closed when discovery issuer does not match configured issuer', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://evil.example',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('issuer_mismatch');
      expect(proxy.getStatus().statusText).toBe('registration rejected: issuer_mismatch');
      expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: issuer_mismatch/);
    });

    it('succeeds when discovery issuer matches configured issuer with trailing slash normalization', async () => {
      const mockFetch = (async (url: string) => {
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev/', // Trailing slash
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ client_id: 'client-with-trailing-slash-issuer' }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(true);
      expect(res.clientId).toBe('client-with-trailing-slash-issuer');
    });

    it('rejects foreign registration_endpoint and NEVER sends registration payload to foreign host', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              registration_endpoint: 'https://evil.example/register',
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_endpoint_origin');
      expect(proxy.getStatus().statusText).toBe('registration rejected: invalid_endpoint_origin');

      // Assert fetch was NEVER called with evil host
      expect(fetchedUrls.some((u) => u.includes('evil.example'))).toBe(false);
    });

    it('rejects foreign authorization_endpoint and createAuthUrl NEVER points to foreign host', async () => {
      const mockFetch = (async (url: string) => {
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              authorization_endpoint: 'https://evil.example/oauth/authorize',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ client_id: 'client-123' }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_endpoint_origin');
      expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: invalid_endpoint_origin/);
    });

    it('rejects foreign token_endpoint and NEVER sends code or verifier to foreign host', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              token_endpoint: 'https://evil.example/oauth/token',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ client_id: 'client-123' }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_endpoint_origin');
      expect(proxy.getStatus().statusText).toBe('registration rejected: invalid_endpoint_origin');
      expect(fetchedUrls.some((u) => u.includes('evil.example'))).toBe(false);
    });

    it('rejects foreign revocation_endpoint in discovery', async () => {
      const mockFetch = (async (url: string) => {
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              revocation_endpoint: 'https://evil.example/oauth/revoke',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_endpoint_origin');
    });

    it('rejects HTTP downgrade endpoint on non-loopback issuer', async () => {
      const mockFetch = (async (url: string) => {
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              token_endpoint: 'http://xmemo.dev/oauth/token', // HTTP downgrade!
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        () => {},
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_endpoint_origin');
    });

    it('ignores foreign mcp_endpoint from discovery and retains default issuer origin', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
              authorization_endpoint: 'https://xmemo.dev/oauth/authorize',
              token_endpoint: 'https://xmemo.dev/oauth/token',
              revocation_endpoint: 'https://xmemo.dev/oauth/revoke',
              mcp_endpoint: 'https://evil.example/mcp', // Malicious foreign MCP!
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ client_id: 'client-mcp-test' }),
          };
        }
        if (url.includes('/mcp')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jsonrpc: '2.0',
              result: {
                memories: [
                  {
                    key: 'prep_buffer_minutes',
                    value: 5,
                    tag: 'yori:living-context',
                  },
                ],
              },
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const logs: string[] = [];
      const proxy = new XMemoDevProxy(
        { enabled: true, issuer: 'https://xmemo.dev', clientStoragePath: stateFile },
        (msg) => logs.push(msg),
        undefined,
        mockFetch
      );

      const res = await proxy.ensureRegistered(mockFetch);
      expect(res.success).toBe(true);

      // Warning logged about ignoring foreign mcp_endpoint
      expect(logs.some((l) => l.includes('Ignoring discovered mcp_endpoint'))).toBe(true);

      // MCP URL retained default issuer origin
      const cfg = proxy.getConfig();
      expect(cfg.mcpUrl).toBe('https://xmemo.dev/mcp');

      // Set session to test MCP read/write calls
      (proxy as any).session = { accessToken: 'valid-test-token' };

      await proxy.readPreferences('test', mockFetch);
      await proxy.writeConfirmedFact(
        {
          key: 'prep_buffer_minutes',
          value: '5',
          status: 'confirmed',
          provenance: { source: 'user', timestamp: new Date().toISOString() },
        },
        mockFetch
      );
      await proxy.deleteFact('prep_buffer_minutes', mockFetch);

      // Assert evil host was NEVER fetched
      expect(fetchedUrls.some((u) => u.includes('evil.example'))).toBe(false);
      // Assert all MCP calls targeted https://xmemo.dev/mcp
      // 1 readPreferences + 1 writeConfirmedFact + 1 deleteFact (pre-read + forget = 2) = 4 calls
      const mcpCalls = fetchedUrls.filter((u) => u.includes('/mcp'));
      expect(mcpCalls.length).toBe(4);
      for (const callUrl of mcpCalls) {
        expect(callUrl).toBe('https://xmemo.dev/mcp');
      }
    });

    it('rejects configured foreign endpoints in constructor', () => {
      const logs: string[] = [];
      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          issuer: 'https://xmemo.dev',
          tokenUrl: 'https://evil.example/oauth/token',
        },
        (msg) => logs.push(msg)
      );

      expect(proxy.getStatus().statusText).toBe('registration rejected: invalid_endpoint_origin');
      expect(() => proxy.createAuthUrl()).toThrow(/registration rejected: invalid_endpoint_origin/);
      expect(logs.some((l) => l.includes('Configured tokenUrl has invalid origin'))).toBe(true);
    });

    it('aborts exchangeCode and MCP calls if endpoint origin is invalid', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = (async (url: string) => {
        fetchedUrls.push(url);
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          issuer: 'https://xmemo.dev',
          clientId: 'valid-client',
        },
        () => {},
        undefined,
        mockFetch
      );

      // Mutate endpoint URLs to simulate bypass attempt
      (proxy as any).tokenUrl = 'https://evil.example/token';
      (proxy as any).mcpUrl = 'https://evil.example/mcp';
      (proxy as any).revokeUrl = 'https://evil.example/revoke';
      (proxy as any).pendingStates.set('valid-state', {
        codeVerifier: 'verifier',
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
        createdAt: Date.now(),
      });
      (proxy as any).session = { accessToken: 'token' };

      // exchangeCode fails closed
      const exRes = await proxy.exchangeCode('code', 'valid-state', mockFetch);
      expect(exRes.success).toBe(false);
      expect(exRes.error).toContain('tokenUrl origin invalid');

      // readPreferences fails closed
      const readRes = await proxy.readPreferences('test', mockFetch);
      expect(readRes.status).toBe(502);
      expect((readRes.data as any).error).toContain('mcpUrl origin invalid');

      // writeConfirmedFact fails closed
      const writeRes = await proxy.writeConfirmedFact(
        {
          key: 'k',
          value: 'v',
          status: 'confirmed',
          provenance: { source: 'u', timestamp: new Date().toISOString() },
        },
        mockFetch
      );
      expect(writeRes.status).toBe(502);
      expect((writeRes.data as any).error).toContain('mcpUrl origin invalid');

      // deleteFact fails closed
      const delRes = await proxy.deleteFact('k', mockFetch);
      expect(delRes.status).toBe(502);
      expect((delRes.data as any).error).toContain('mcpUrl origin invalid');

      // disconnect skips foreign revokeUrl
      await proxy.disconnect(mockFetch);

      // ZERO fetch calls made to evil host
      expect(fetchedUrls.length).toBe(0);
    });
  });

  describe('Transient Network Error Retry vs Sticky 4xx (AC-4)', () => {
    let tmpDir: string;
    let stateFile: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmemo-retry-test-'));
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

    it('retries registration on next Connect after networkRetryIntervalMs elapses', async () => {
      let callCount = 0;
      let networkDown = true;

      const mockFetch = (async (url: string) => {
        callCount++;
        if (networkDown) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:9999');
        }
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ client_id: 'recovered-client-id' }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          clientStoragePath: stateFile,
          networkRetryIntervalMs: 50, // 50ms interval for fast test execution
        },
        () => {},
        undefined,
        mockFetch
      );

      // 1. Initial attempt fails with network_error
      const req1 = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
      const res1 = createMockRes();
      await proxy.handleHttpRequest(req1, res1);
      expect(JSON.parse(res1.body).statusText).toBe('registration rejected: network_error');
      expect(callCount).toBe(1);

      // 2. Immediate subsequent request (<50ms): throttled, returns cached error without fetch
      const req2 = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
      const res2 = createMockRes();
      await proxy.handleHttpRequest(req2, res2);
      expect(res2.statusCode).toBe(500);
      expect(JSON.parse(res2.body).error).toContain('registration rejected: network_error');
      expect(callCount).toBe(1); // Call count unchanged!

      // 3. Network recovers
      networkDown = false;

      // 4. Wait for networkRetryIntervalMs to elapse
      await new Promise((resolve) => setTimeout(resolve, 60));

      // 5. Next Connect request (POST /api/xmemo/auth-url) retries registration and succeeds!
      const req3 = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
      const res3 = createMockRes();
      await proxy.handleHttpRequest(req3, res3);
      expect(res3.statusCode).toBe(200);
      const authData = JSON.parse(res3.body);
      expect(authData.authUrl).toContain('https://xmemo.dev/oauth/authorize');
      expect(authData.authUrl).toContain('client_id=recovered-client-id');
      expect(callCount).toBe(3); // 1 initial fail + 1 discovery retry + 1 register call = 3

      // Status is now ready
      expect(proxy.getStatus().statusText).toBe('XMemo OAuth enabled (disconnected)');
    });

    it('4xx rejection sticks permanently and is NEVER retried even after interval elapses', async () => {
      let callCount = 0;
      const mockFetch = (async (url: string) => {
        callCount++;
        if (url.includes('.well-known')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ error: 'invalid_redirect_uri' }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          clientStoragePath: stateFile,
          networkRetryIntervalMs: 50,
        },
        () => {},
        undefined,
        mockFetch
      );

      // Initial call fails with 400 invalid_redirect_uri
      const req1 = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
      const res1 = createMockRes();
      await proxy.handleHttpRequest(req1, res1);
      expect(JSON.parse(res1.body).statusText).toBe('registration rejected: invalid_redirect_uri');
      expect(callCount).toBe(2); // 1 discovery + 1 register

      // Wait past the retry interval
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Subsequent call: does NOT retry, error sticks!
      const req2 = createMockReq({ url: '/api/xmemo/auth-url', method: 'POST' });
      const res2 = createMockRes();
      await proxy.handleHttpRequest(req2, res2);
      expect(res2.statusCode).toBe(500);
      expect(JSON.parse(res2.body).error).toContain('registration rejected: invalid_redirect_uri');
      expect(callCount).toBe(2); // No extra calls made!
    });
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
          json: async () => ({
            issuer: 'https://xmemo.dev',
            registration_endpoint: 'https://xmemo.dev/oauth/register',
          }),
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
        const body = JSON.parse(init?.body as string);
        if (body.params?.name === 'recall') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jsonrpc: '2.0',
              result: {
                facts: [
                  {
                    key: 'prep_buffer_minutes',
                    value: 5,
                    tag: 'yori:living-context',
                  },
                ],
              },
            }),
          };
        }
        if (body.params?.name === 'forget') {
          mcpBody = body;
          return {
            ok: true,
            status: 200,
            json: async () => ({ jsonrpc: '2.0', result: { content: [{ type: 'text', text: 'deleted' }] } }),
          };
        }
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
      body: JSON.stringify({ key: 'prep_buffer_minutes' }),
    });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(mcpBody).toBeDefined();
    expect(mcpBody.method).toBe('tools/call');
    expect(mcpBody.params.name).toBe('forget');
    expect(mcpBody.params.arguments).toEqual({ key: 'prep_buffer_minutes' });
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

describe('XKEY01: Server-only owner-key demo mode', () => {
  const MOCK_OWNER_KEY = 'xmemo_live_secret_key_1234567890';

  it('activates only when BOTH XMEMO_AUTH_MODE=owner_key AND XMEMO_KEY are set', async () => {
    // Both set: mode is active
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });
    expect(proxy.isOwnerKeyModeActive()).toBe(true);
    const status = proxy.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.mode).toBe('owner_key_demo');
  });

  it('refuses activation without explicit XMEMO_AUTH_MODE=owner_key flag', async () => {
    // Only key set, mode unset
    const proxy1 = new XMemoDevProxy({
      ownerKey: MOCK_OWNER_KEY,
    });
    expect(proxy1.isOwnerKeyModeActive()).toBe(false);
    expect(proxy1.getStatus().mode).toBeUndefined();
    expect(proxy1.getStatus().enabled).toBe(false);

    // Operational route returns 403
    const req = createMockReq({ url: '/api/xmemo/preferences', method: 'POST', body: '{}' });
    const res = createMockRes();
    await proxy1.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('XMemo OAuth disabled');

    // authMode set to other string
    const proxy2 = new XMemoDevProxy({
      authMode: 'oauth',
      ownerKey: MOCK_OWNER_KEY,
    });
    expect(proxy2.isOwnerKeyModeActive()).toBe(false);
  });

  it('refuses activation when XMEMO_KEY is missing or empty', async () => {
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: '',
    });
    expect(proxy.isOwnerKeyModeActive()).toBe(false);
    expect(proxy.getStatus().mode).toBeUndefined();
  });

  it('refuses to enable the mode when NODE_ENV=production', async () => {
    const logSpy = vi.fn();
    const proxy = new XMemoDevProxy(
      {
        authMode: 'owner_key',
        ownerKey: MOCK_OWNER_KEY,
        isProduction: true,
      },
      logSpy
    );

    expect(proxy.isOwnerKeyModeActive()).toBe(false);
    expect(proxy.getStatus().mode).toBeUndefined();
    expect(proxy.getStatus().enabled).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing owner-key demo mode: NODE_ENV=production'));

    // Operational route returns 403
    const req = createMockReq({ url: '/api/xmemo/preferences', method: 'POST', body: '{}' });
    const res = createMockRes();
    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects non-loopback host requests with 403 Forbidden', async () => {
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });

    const req = createMockReq({
      url: '/api/xmemo/status',
      method: 'GET',
      headers: { host: 'evil.external-domain.com' },
    });
    const res = createMockRes();
    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('Forbidden: non-local host access is blocked');
  });

  it('/api/xmemo/status reports mode=owner_key_demo with no token, length or prefix', async () => {
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });

    const req = createMockReq({ url: '/api/xmemo/status', method: 'GET' });
    const res = createMockRes();
    await proxy.handleHttpRequest(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.mode).toBe('owner_key_demo');
    expect(parsed.enabled).toBe(true);
    expect(parsed.connected).toBe(true);
    expect(parsed.statusText).toContain('owner-key demo mode');

    // Strict leak checks: key, token, prefix, length must never appear
    expect(res.body).not.toContain(MOCK_OWNER_KEY);
    expect(res.body).not.toContain('xmemo_live');
    expect(parsed.token).toBeUndefined();
    expect(parsed.key).toBeUndefined();
    expect(parsed.tokenLength).toBeUndefined();
    expect(parsed.keyLength).toBeUndefined();
    expect(parsed.prefix).toBeUndefined();

    // Mode is never represented as per-user OAuth consent
    expect(res.body.toLowerCase()).not.toContain('consent');
    expect(res.body.toLowerCase()).not.toContain('user granted');
  });

  it('key never appears in logs or error responses', async () => {
    const logs: string[] = [];
    const proxy = new XMemoDevProxy(
      {
        authMode: 'owner_key',
        ownerKey: MOCK_OWNER_KEY,
      },
      msg => logs.push(msg)
    );

    // Verify constructor logger
    for (const log of logs) {
      expect(log).not.toContain(MOCK_OWNER_KEY);
      expect(log).not.toContain('1234567890');
    }

    // Call preferences with upstream error
    const mockFetch = vi.fn().mockRejectedValue(new Error('upstream connection failed'));
    const res = await proxy.readPreferences('test', mockFetch as any);
    expect(JSON.stringify(res)).not.toContain(MOCK_OWNER_KEY);
    for (const log of logs) {
      expect(log).not.toContain(MOCK_OWNER_KEY);
    }
  });

  it('read preferences passes Authorization: Bearer XMEMO_KEY upstream', async () => {
    let capturedAuth = '';
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedAuth = init.headers?.['Authorization'] || init.headers?.['authorization'];
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { facts: [{ key: 'habit_rain_transit', value: 'drive' }] } }),
      };
    });

    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });

    const req = createMockReq({
      url: '/api/xmemo/preferences',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'preferences' }),
    });
    const res = createMockRes();
    (proxy as any).fetchFn = mockFetch;

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(capturedAuth).toBe(`Bearer ${MOCK_OWNER_KEY}`);
    expect(capturedBody.method).toBe('tools/call');
    expect(capturedBody.params.name).toBe('recall');
  });

  it('rejects unconfirmed writes with 400 (INV-107 confirm-only invariant)', async () => {
    const mockFetch = vi.fn();
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });
    (proxy as any).fetchFn = mockFetch;

    // 1. Pending fact rejected
    const reqPending = createMockReq({
      url: '/api/xmemo/confirmed-facts',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'habit_coffee',
        value: 'espresso',
        status: 'pending',
        provenance: { source: 'user_action' },
      }),
    });
    const resPending = createMockRes();
    await proxy.handleHttpRequest(reqPending, resPending);
    expect(resPending.statusCode).toBe(400);
    expect(resPending.body).toContain('Server invariant violation (INV-107)');
    expect(mockFetch).not.toHaveBeenCalled();

    // 2. Rejected fact rejected
    const reqRejected = createMockReq({
      url: '/api/xmemo/confirmed-facts',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'habit_coffee',
        value: 'espresso',
        status: 'rejected',
        provenance: { source: 'user_action' },
      }),
    });
    const resRejected = createMockRes();
    await proxy.handleHttpRequest(reqRejected, resRejected);
    expect(resRejected.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows confirmed write and passes Bearer key upstream', async () => {
    let capturedAuth = '';
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedAuth = init.headers?.['Authorization'] || init.headers?.['authorization'];
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });

    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });
    (proxy as any).fetchFn = mockFetch;

    const req = createMockReq({
      url: '/api/xmemo/confirmed-facts',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'prep_buffer_preference',
        value: 'espresso',
        status: 'confirmed',
        provenance: { source: 'user_explicit' },
      }),
    });
    const res = createMockRes();
    await proxy.handleHttpRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(capturedAuth).toBe(`Bearer ${MOCK_OWNER_KEY}`);
    expect(capturedBody.params.name).toBe('remember');
    expect(capturedBody.params.arguments.status).toBe('confirmed');
  });

  it('POST /api/xmemo/disconnect disables owner-key demo mode for the process', async () => {
    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });

    // 1. Initially connected
    expect(proxy.isOwnerKeyModeActive()).toBe(true);
    expect(proxy.getStatus().connected).toBe(true);

    // 2. Disconnect
    const reqDisc = createMockReq({ url: '/api/xmemo/disconnect', method: 'POST' });
    const resDisc = createMockRes();
    await proxy.handleHttpRequest(reqDisc, resDisc);
    expect(resDisc.statusCode).toBe(200);
    expect(proxy.isOwnerKeyModeActive()).toBe(false);

    // 3. Status reports disconnected
    const status = proxy.getStatus();
    expect(status.connected).toBe(false);
    expect(status.statusText).toContain('owner key disconnected');

    // 4. Subsequent operational call returns 401
    const reqRead = createMockReq({
      url: '/api/xmemo/preferences',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const resRead = createMockRes();
    await proxy.handleHttpRequest(reqRead, resRead);
    expect(resRead.statusCode).toBe(401);
    expect(resRead.body).toContain('Not connected to XMemo');
  });

  it('upstream 401 response clears the owner-key demo mode immediately', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const proxy = new XMemoDevProxy({
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
    });
    (proxy as any).fetchFn = mockFetch;

    expect(proxy.isOwnerKeyModeActive()).toBe(true);

    // Call readPreferences which encounters 401
    const res = await proxy.readPreferences('test');
    expect(res.status).toBe(401);
    expect((res.data as any).disconnected).toBe(true);

    // Mode is now cleared
    expect(proxy.isOwnerKeyModeActive()).toBe(false);
    expect(proxy.getStatus().connected).toBe(false);

    // Subsequent call returns 401 Not connected without making fetch
    mockFetch.mockClear();
    const res2 = await proxy.readPreferences('test');
    expect(res2.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deterministic conflict resolution: active OAuth session takes precedence over owner-key', async () => {
    let capturedAuth = '';
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedAuth = init.headers?.['Authorization'] || init.headers?.['authorization'];
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });

    // Both OAuth and owner-key configured, AND OAuth session is active with accessToken
    const proxy = new XMemoDevProxy({
      enabled: true,
      authMode: 'owner_key',
      ownerKey: MOCK_OWNER_KEY,
      clientId: 'mock-oauth-client',
    });
    (proxy as any).session = { accessToken: 'oauth-user-access-token-999' };
    (proxy as any).fetchFn = mockFetch;

    // Owner key mode is suppressed in favor of OAuth
    expect(proxy.isOwnerKeyModeActive()).toBe(false);
    expect(proxy.getStatus().mode).toBe('oauth');
    expect(proxy.getStatus().statusText).toBe('XMemo connected');

    // Upstream call uses OAuth access token, NOT owner key!
    await proxy.readPreferences('test');
    expect(capturedAuth).toBe('Bearer oauth-user-access-token-999');
    expect(capturedAuth).not.toContain(MOCK_OWNER_KEY);
  });

  it('grep dist after build guarantees zero occurrences of XMEMO_KEY and key value', () => {
    // Check that neither the key value nor XMEMO_KEY usage appears in compiled dist
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      const files = fs.readdirSync(path.join(distDir, 'assets'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(distDir, 'assets', file), 'utf-8');
        expect(content).not.toContain('XMEMO_KEY');
        expect(content).not.toContain(MOCK_OWNER_KEY);
      }
    }
  });

  describe('XKEY-DEL: Closed Fact-Key Registry, Pre-Delete Provenance, and User Confirmation Marker', () => {
    describe('1. Fact-Key Registry Completeness & Boundary Validation', () => {
      it('dynamically derives all real sources and verifies every key is in YORI_MANAGED_FACT_KEYS (XKEYDEL-P2)', () => {
        // Real Source 1: Switch cases strictly from why-sheet.ts humanizeMemoryKey
        const whySheetCode = fs.readFileSync(path.resolve('src/ui/review/why-sheet.ts'), 'utf-8');
        const humanizeMemFnMatch = whySheetCode.match(/function\s+humanizeMemoryKey[\s\S]*?default:/);
        const humanizeMemBody = humanizeMemFnMatch ? humanizeMemFnMatch[0] : '';
        const whySheetMatches = Array.from(humanizeMemBody.matchAll(/case\s+['"]([a-zA-Z0-9_-]+)['"]:/g)).map(m => m[1]);

        // Real Source 2: Switch cases strictly from presentation.ts humanizeProposalTitle
        const presCode = fs.readFileSync(path.resolve('src/ui/living-context/presentation.ts'), 'utf-8');
        const humanizePropFnMatch = presCode.match(/function\s+humanizeProposalTitle[\s\S]*?default:/);
        const humanizePropBody = humanizePropFnMatch ? humanizePropFnMatch[0] : '';
        const presMatches = Array.from(humanizePropBody.matchAll(/case\s+['"]([a-zA-Z0-9_-]+)['"]:/g)).map(m => m[1]);

        // Real Source 3: Plugin manifests declarative keys
        const pluginKeys = collectPluginManagedMemoryKeys();

        // Real Source 4: Core-adjacent grounding defaults
        const groundingKeys = ['rain_transport_preference', 'prep_buffer_minutes', 'prep_duration_minutes'];

        const allRealSources = new Set<string>([
          ...whySheetMatches.filter((s): s is string => typeof s === 'string' && s.length > 0),
          ...presMatches.filter((s): s is string => typeof s === 'string' && s.length > 0),
          ...pluginKeys,
          ...groundingKeys,
        ]);

        expect(allRealSources.size).toBeGreaterThanOrEqual(11);

        for (const k of allRealSources) {
          expect(
            YORI_MANAGED_FACT_KEYS.has(k),
            `Key '${k}' derived from real sources must be registered in YORI_MANAGED_FACT_KEYS`
          ).toBe(true);
          expect(isYoriManagedFactKey(k)).toBe(true);
          const label = humanizeMemoryKey(k);
          expect(label).toBeTruthy();
        }
      });

      it('covers the grocery keys decision explicitly (XKEYDEL-P2)', () => {
        const groceryKeys = ['grocery_store_preference', 'preferred_grocery_store'];
        for (const gk of groceryKeys) {
          expect(YORI_MANAGED_FACT_KEYS.has(gk)).toBe(true);
          expect(isYoriManagedFactKey(gk)).toBe(true);
          const label = humanizeMemoryKey(gk);
          expect(label).toBeTruthy();
        }
      });

      it('registry derivation test fails if a new UI or plugin key is added without registration (XKEYDEL-P2)', () => {
        const mockUnregisteredKey = 'unregistered_future_plugin_habit';
        const simulatedSourceWithNewKey = new Set([...YORI_MANAGED_FACT_KEYS, mockUnregisteredKey]);

        // Validate that if any real source adds an unregistered key, the check fails
        const unregistered = Array.from(simulatedSourceWithNewKey).filter(k => !isYoriManagedFactKey(k));
        expect(unregistered).toEqual([mockUnregisteredKey]);
        expect(unregistered.length).toBe(1);
      });

      it('rejects arbitrary personal memory keys', () => {
        expect(isYoriManagedFactKey('bank_pin')).toBe(false);
        expect(isYoriManagedFactKey('family/address')).toBe(false);
        expect(isYoriManagedFactKey('medical_records')).toBe(false);
        expect(isYoriManagedFactKey('social_security_number')).toBe(false);
        expect(isYoriManagedFactKey('credit_card')).toBe(false);
      });

      it('rejects prefix tricks, traversal, and lookalikes', () => {
        expect(isYoriManagedFactKey('yori:living-context/../x')).toBe(false);
        expect(isYoriManagedFactKey('yori:living-context:prep_buffer_minutes')).toBe(false);
        expect(isYoriManagedFactKey('../prep_buffer_minutes')).toBe(false);
        expect(isYoriManagedFactKey('prep_buffer_minutes/sub')).toBe(false);
      });

      it('rejects whitespace variants and casing differences', () => {
        expect(isYoriManagedFactKey(' prep_buffer_minutes')).toBe(false);
        expect(isYoriManagedFactKey('prep_buffer_minutes ')).toBe(false);
        expect(isYoriManagedFactKey('prep_buffer_minutes\n')).toBe(false);
        expect(isYoriManagedFactKey('PREP_BUFFER_MINUTES')).toBe(false);
        expect(isYoriManagedFactKey('Prep_Buffer_Minutes')).toBe(false);
        expect(isYoriManagedFactKey('taste_Preference')).toBe(false);
      });

      it('rejects non-string types, null, undefined, empty string', () => {
        expect(isYoriManagedFactKey(null)).toBe(false);
        expect(isYoriManagedFactKey(undefined)).toBe(false);
        expect(isYoriManagedFactKey('')).toBe(false);
        expect(isYoriManagedFactKey(123)).toBe(false);
        expect(isYoriManagedFactKey({})).toBe(false);
        expect(isYoriManagedFactKey([])).toBe(false);
      });
    });

    describe('2. Provenance Parsing & Verification Helpers', () => {
      it('extracts candidate facts from diverse MCP response shapes', () => {
        // Shape A: result.facts array
        const shapeA = { jsonrpc: '2.0', result: { facts: [{ key: 'prep_buffer_minutes', value: 5 }] } };
        expect(extractCandidateFacts(shapeA)).toEqual([{ key: 'prep_buffer_minutes', value: 5 }]);

        // Shape B: result.memories array
        const shapeB = { jsonrpc: '2.0', result: { memories: [{ key: 'prep_buffer_minutes', value: 5 }] } };
        expect(extractCandidateFacts(shapeB)).toEqual([{ key: 'prep_buffer_minutes', value: 5 }]);

        // Shape C: result.items array
        const shapeC = { jsonrpc: '2.0', result: { items: [{ key: 'prep_buffer_minutes', value: 5 }] } };
        expect(extractCandidateFacts(shapeC)).toEqual([{ key: 'prep_buffer_minutes', value: 5 }]);

        // Shape D: result.content MCP text json
        const shapeD = {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: JSON.stringify([{ key: 'prep_buffer_minutes', value: 5 }]) }],
          },
        };
        expect(extractCandidateFacts(shapeD)).toEqual([{ key: 'prep_buffer_minutes', value: 5 }]);

        // Shape E: result is array
        const shapeE = { jsonrpc: '2.0', result: [{ key: 'prep_buffer_minutes', value: 5 }] };
        expect(extractCandidateFacts(shapeE)).toEqual([{ key: 'prep_buffer_minutes', value: 5 }]);

        // Unknown shape returns null
        expect(extractCandidateFacts({ jsonrpc: '2.0', result: { unknownShape: true } })).toBeNull();
        expect(extractCandidateFacts(null)).toBeNull();
        expect(extractCandidateFacts('invalid')).toBeNull();
      });

      it('identifies Yori provenance across direct tags, array tags, and provenance objects', () => {
        expect(hasYoriProvenance({ tag: 'yori:living-context' })).toBe(true);
        expect(hasYoriProvenance({ tag: ['yori:living-context', 'other'] })).toBe(true);
        expect(hasYoriProvenance({ tags: 'yori:living-context' })).toBe(true);
        expect(hasYoriProvenance({ tags: ['yori:living-context'] })).toBe(true);
        expect(hasYoriProvenance({ provenance: { tag: 'yori:living-context' } })).toBe(true);
        expect(hasYoriProvenance({ provenance: { source: 'yori' } })).toBe(false); // P3: dropped source: "yori" without tag
        expect(hasYoriProvenance({ provenance: { source: 'yori:living-context' } })).toBe(true);

        // Foreign or missing tags
        expect(hasYoriProvenance({ tag: 'other:system' })).toBe(false);
        expect(hasYoriProvenance({ tags: ['personal', 'private'] })).toBe(false);
        expect(hasYoriProvenance({})).toBe(false);
      });

      it('verifyFactProvenance validates single match with provenance and fails closed otherwise', () => {
        const validData = {
          result: {
            facts: [{ key: 'prep_buffer_minutes', value: 5, tag: 'yori:living-context' }],
          },
        };
        expect(verifyFactProvenance(validData, 'prep_buffer_minutes')).toEqual({ ok: true });

        // Missing fact -> 409
        const missingData = { result: { facts: [] } };
        const missRes = verifyFactProvenance(missingData, 'prep_buffer_minutes');
        expect(missRes.ok).toBe(false);
        if (!missRes.ok) {
          expect(missRes.status).toBe(409);
          expect(missRes.error).toContain('fact not found');
        }

        // Ambiguous multiple matches -> 409
        const dupData = {
          result: {
            facts: [
              { key: 'prep_buffer_minutes', value: 5, tag: 'yori:living-context' },
              { key: 'prep_buffer_minutes', value: 10, tag: 'yori:living-context' },
            ],
          },
        };
        const dupRes = verifyFactProvenance(dupData, 'prep_buffer_minutes');
        expect(dupRes.ok).toBe(false);
        if (!dupRes.ok) {
          expect(dupRes.status).toBe(409);
          expect(dupRes.error).toContain('ambiguous');
        }

        // Missing Yori tag -> 409
        const untaggedData = {
          result: {
            facts: [{ key: 'prep_buffer_minutes', value: 5, tag: 'unrelated:tag' }],
          },
        };
        const untaggedRes = verifyFactProvenance(untaggedData, 'prep_buffer_minutes');
        expect(untaggedRes.ok).toBe(false);
        if (!untaggedRes.ok) {
          expect(untaggedRes.status).toBe(409);
          expect(untaggedRes.error).toContain('provenance');
        }

        // Provenance {source: 'yori'} without tag -> 409 (XKEYDEL-P2)
        const yoriSourceWithoutTag = {
          result: {
            facts: [{ key: 'prep_buffer_minutes', value: 5, provenance: { source: 'yori' } }],
          },
        };
        const yoriNoTagRes = verifyFactProvenance(yoriSourceWithoutTag, 'prep_buffer_minutes');
        expect(yoriNoTagRes.ok).toBe(false);
        if (!yoriNoTagRes.ok) {
          expect(yoriNoTagRes.status).toBe(409);
          expect(yoriNoTagRes.reason).toBe('missing_yori_provenance');
          expect(yoriNoTagRes.error).toContain('does not carry Yori provenance');
        }
        expect(hasYoriProvenance({ key: 'prep_buffer_minutes', provenance: { source: 'yori' } })).toBe(false);
        expect(hasYoriProvenance({ key: 'prep_buffer_minutes', provenance: { tag: 'yori:living-context' } })).toBe(true);

        // Unknown shape -> 424
        const unknownData = { result: { weird: true } };
        const unkRes = verifyFactProvenance(unknownData, 'prep_buffer_minutes');
        expect(unkRes.ok).toBe(false);
        if (!unkRes.ok) {
          expect(unkRes.status).toBe(424);
          expect(unkRes.error).toContain('unknown upstream read response shape');
        }
      });
    });

    describe('3. Write Fact Enforcement (writeConfirmedFact & POST /api/xmemo/confirmed-facts)', () => {
      it('rejects unmanaged key on writeConfirmedFact with 403 and NEVER invokes fetch', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const res = await proxy.writeConfirmedFact(
          {
            key: 'bank_pin',
            value: '1234',
            status: 'confirmed',
            provenance: { source: 'user' },
          },
          mockFetch as any
        );

        expect(res.status).toBe(403);
        expect((res.data as any).error).toContain('not a Yori-managed key');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('rejects unmanaged key on POST /api/xmemo/confirmed-facts with 403 and NEVER invokes fetch', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            key: 'family/address',
            value: 'secret-location',
            status: 'confirmed',
            provenance: { source: 'user' },
          }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toContain('not a Yori-managed key');
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('4. Delete Fact Enforcement & Negative Drill Scenarios', () => {
      it('arbitrary key (e.g. bank_pin, family/address) -> 403, zero fetch calls', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        for (const badKey of ['bank_pin', 'family/address']) {
          mockFetch.mockClear();
          const req = createMockReq({
            url: '/api/xmemo/confirmed-facts',
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: badKey }),
          });
          const res = createMockRes();
          await proxy.handleHttpRequest(req, res);

          expect(res.statusCode).toBe(403);
          expect(res.body).toContain('not a Yori-managed key');
          expect(mockFetch).not.toHaveBeenCalled();
        }
      });

      it('prefix trick, unicode lookalike, whitespace, case variant -> 403, zero fetch calls', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const tricks = [
          'yori:living-context/../x',
          ' prep_buffer_minutes ',
          'PREP_BUFFER_MINUTES',
          '\u202eprep_buffer_minutes',
          'prep_buffer_minutes\0',
        ];

        for (const trick of tricks) {
          mockFetch.mockClear();
          const req = createMockReq({
            url: '/api/xmemo/confirmed-facts',
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: trick }),
          });
          const res = createMockRes();
          await proxy.handleHttpRequest(req, res);

          expect(res.statusCode).toBe(403);
          expect(res.body).toContain('not a Yori-managed key');
          expect(mockFetch).not.toHaveBeenCalled();
        }
      });

      it('registry key whose stored fact lacks the tag -> 409, forget tool NEVER called', async () => {
        let forgetCalled = false;
        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                jsonrpc: '2.0',
                result: {
                  facts: [{ key: 'prep_buffer_minutes', value: 5 }],
                },
              }),
            };
          }
          if (body.params?.name === 'forget') {
            forgetCalled = true;
            return { ok: true, status: 200, json: async () => ({ result: { success: true } }) };
          }
          return { ok: false, status: 404 };
        });

        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body).toContain('fact does not carry Yori provenance');
        expect(forgetCalled).toBe(false);
      });

      it('upstream read failure (500) -> 424, forget tool NEVER called', async () => {
        let forgetCalled = false;
        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            return { ok: false, status: 500, json: async () => ({ error: 'internal error' }) };
          }
          if (body.params?.name === 'forget') {
            forgetCalled = true;
            return { ok: true, status: 200, json: async () => ({ result: { success: true } }) };
          }
          return { ok: false, status: 404 };
        });

        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(424);
        expect(res.body).toContain('upstream fact pre-read failed');
        expect(forgetCalled).toBe(false);
      });

      it('401 during pre-read in owner_key mode clears the mode and returns 401', async () => {
        let forgetCalled = false;
        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
          }
          if (body.params?.name === 'forget') {
            forgetCalled = true;
            return { ok: true, status: 200, json: async () => ({ result: { success: true } }) };
          }
          return { ok: false, status: 404 };
        });

        const proxy = new XMemoDevProxy({ authMode: 'owner_key', ownerKey: MOCK_OWNER_KEY }, () => {}, undefined, mockFetch as any);
        expect(proxy.isOwnerKeyModeActive()).toBe(true);

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes', confirmed: true }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(401);
        expect(proxy.isOwnerKeyModeActive()).toBe(false);
        expect(forgetCalled).toBe(false);
      });

      it('non-loopback Host header -> 403, zero fetch calls', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: true, clientId: 'test-client' }, () => {}, undefined, mockFetch as any);
        (proxy as any).session = { accessToken: 'valid-token' };

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json', host: 'attacker.com' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toContain('Forbidden: non-local host access is blocked');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('missing confirmation marker in owner_key mode -> 400, zero fetch calls', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ authMode: 'owner_key', ownerKey: MOCK_OWNER_KEY }, () => {}, undefined, mockFetch as any);

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toContain('owner_key delete requires explicit user confirmation marker');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('requires userConfirmed === true strict boolean in deleteFact; rejects string "true" with 400 (XKEYDEL-P2)', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ authMode: 'owner_key', ownerKey: MOCK_OWNER_KEY }, () => {}, undefined, mockFetch as any);

        // 1. Direct deleteFact call with string "true" -> 400
        const directRes = await proxy.deleteFact('prep_buffer_minutes', { userConfirmed: 'true' as any }, mockFetch as any);
        expect(directRes.status).toBe(400);
        expect((directRes.data as any).error).toContain('owner_key delete requires explicit user confirmation marker');
        expect(mockFetch).not.toHaveBeenCalled();

        // 2. HTTP route with body { userConfirmed: "true" } -> 400
        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes', userConfirmed: 'true' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toContain('owner_key delete requires explicit user confirmation marker');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('deleteFact halts with 409 when pre-read fact carries provenance {source: "yori"} without tag (XKEYDEL-P2)', async () => {
        let forgetCalled = false;
        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                result: {
                  facts: [{ key: 'prep_buffer_minutes', value: 5, provenance: { source: 'yori' } }],
                },
              }),
            };
          }
          if (body.params?.name === 'forget') {
            forgetCalled = true;
            return { ok: true, status: 200, json: async () => ({ result: { success: true } }) };
          }
          return { ok: false, status: 404 };
        });

        const proxy = new XMemoDevProxy({ authMode: 'owner_key', ownerKey: MOCK_OWNER_KEY }, () => {}, undefined, mockFetch as any);
        const delRes = await proxy.deleteFact('prep_buffer_minutes', { userConfirmed: true }, mockFetch as any);

        expect(delRes.status).toBe(409);
        expect((delRes.data as any).error).toContain('does not carry Yori provenance');
        expect(forgetCalled).toBe(false);
      });

      it('OAuth-disabled and owner_key mode off -> 403, zero fetch calls', async () => {
        const mockFetch = vi.fn();
        const proxy = new XMemoDevProxy({ enabled: false }, () => {}, undefined, mockFetch as any);

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toContain('XMemo OAuth disabled');
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('5. Positive Deletion & Secret Hygiene', () => {
      it('owner_key mode positive: registry key + user confirmation + tagged fact -> exactly one forget call', async () => {
        let recallCount = 0;
        let forgetCount = 0;
        let forgetPayload: any = null;
        let capturedAuth = '';

        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          capturedAuth = init.headers?.['Authorization'] || init.headers?.['authorization'];
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            recallCount++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                jsonrpc: '2.0',
                result: {
                  facts: [
                    {
                      key: 'prep_buffer_minutes',
                      value: 5,
                      tag: 'yori:living-context',
                    },
                  ],
                },
              }),
            };
          }
          if (body.params?.name === 'forget') {
            forgetCount++;
            forgetPayload = body;
            return {
              ok: true,
              status: 200,
              json: async () => ({ jsonrpc: '2.0', result: { success: true } }),
            };
          }
          return { ok: false, status: 404 };
        });

        const logs: string[] = [];
        const proxy = new XMemoDevProxy(
          { authMode: 'owner_key', ownerKey: MOCK_OWNER_KEY },
          msg => logs.push(msg),
          undefined,
          mockFetch as any
        );

        // Support confirmation via header x-yori-confirm: true
        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-yori-confirm': 'true' },
          body: JSON.stringify({ key: 'prep_buffer_minutes' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(200);
        expect(recallCount).toBe(1);
        expect(forgetCount).toBe(1);
        expect(forgetPayload.params.name).toBe('forget');
        expect(forgetPayload.params.arguments).toEqual({ key: 'prep_buffer_minutes' });
        expect(capturedAuth).toBe(`Bearer ${MOCK_OWNER_KEY}`);

        // Secret hygiene: key value and tokens never logged
        for (const log of logs) {
          expect(log).not.toContain(MOCK_OWNER_KEY);
          expect(log).not.toContain('1234567890');
        }
        expect(res.body).not.toContain(MOCK_OWNER_KEY);
      });

      it('OAuth mode positive: registry key + tagged fact -> exactly one forget call', async () => {
        let recallCount = 0;
        let forgetCount = 0;
        let forgetPayload: any = null;

        const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
          const body = JSON.parse(init.body);
          if (body.params?.name === 'recall') {
            recallCount++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                jsonrpc: '2.0',
                result: {
                  facts: [
                    {
                      key: 'rain_transport_preference',
                      value: 'drive_first',
                      tag: 'yori:living-context',
                    },
                  ],
                },
              }),
            };
          }
          if (body.params?.name === 'forget') {
            forgetCount++;
            forgetPayload = body;
            return {
              ok: true,
              status: 200,
              json: async () => ({ jsonrpc: '2.0', result: { success: true } }),
            };
          }
          return { ok: false, status: 404 };
        });

        const proxy = new XMemoDevProxy(
          { enabled: true, clientId: 'test-client' },
          () => {},
          undefined,
          mockFetch as any
        );
        (proxy as any).session = { accessToken: 'valid-oauth-token-123' };

        const req = createMockReq({
          url: '/api/xmemo/confirmed-facts',
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'rain_transport_preference' }),
        });
        const res = createMockRes();
        await proxy.handleHttpRequest(req, res);

        expect(res.statusCode).toBe(200);
        expect(recallCount).toBe(1);
        expect(forgetCount).toBe(1);
        expect(forgetPayload.params.name).toBe('forget');
        expect(forgetPayload.params.arguments).toEqual({ key: 'rain_transport_preference' });
      });
    });
  });
});
