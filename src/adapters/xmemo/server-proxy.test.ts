/**
 * XMemo Dev Proxy Unit & Integration Tests
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  XMemoDevProxy,
  createXMemoProxyMiddleware,
  generatePkcePair,
  generateState,
  resolveXMemoConfig,
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

  it('operational endpoints return 403 Forbidden when flag is off', async () => {
    const endpoints = [
      { url: '/api/xmemo/auth-url', method: 'POST' },
      { url: '/api/xmemo/callback', method: 'POST', body: '{}' },
      { url: '/api/xmemo/disconnect', method: 'POST' },
      { url: '/api/xmemo/mcp', method: 'POST', body: '{}' },
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

  it('POST /api/xmemo/mcp returns 401 when disconnected', async () => {
    const req = createMockReq({
      url: '/api/xmemo/mcp',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }),
    });
    const res = createMockRes();

    await proxy.handleHttpRequest(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Not connected to XMemo');
  });

  it('POST /api/xmemo/mcp proxies request to upstream with Bearer token on 200', async () => {
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
    const mockMcpFetch = (async (url: string, init: any) => {
      expect(url).toBe('https://xmemo.dev/mcp');
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: 'confirmed' }],
          },
        }),
      };
    }) as any;

    const mcpResult = await proxy.proxyMcp(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'recall' } },
      mockMcpFetch
    );

    expect(mcpResult.status).toBe(200);
    expect(capturedHeaders['Authorization']).toBe('Bearer valid-bearer-token');
    expect((mcpResult.data as any).result.content[0].text).toBe('confirmed');
  });

  it('POST /api/xmemo/mcp on upstream 401 clears server session and returns 401 fallback', async () => {
    const { state } = proxy.createAuthUrl();
    await proxy.exchangeCode(
      'code-1',
      state,
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'expired-token' }),
      })) as any
    );
    expect(proxy.isConnected()).toBe(true);

    const mockMcp401 = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_token' }),
    })) as any;

    const mcpResult = await proxy.proxyMcp({ method: 'tools/call' }, mockMcp401);
    expect(mcpResult.status).toBe(401);
    expect((mcpResult.data as any).disconnected).toBe(true);
    // Verified: server session cleared
    expect(proxy.isConnected()).toBe(false);
    expect(proxy.getStatus().connected).toBe(false);
  });

  it('POST /api/xmemo/mcp on upstream 5xx returns 502 Bad Gateway without crashing', async () => {
    const { state } = proxy.createAuthUrl();
    await proxy.exchangeCode(
      'code-1',
      state,
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'valid-token' }),
      })) as any
    );

    const mockMcp500 = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    })) as any;

    const mcpResult = await proxy.proxyMcp({ method: 'tools/call' }, mockMcp500);
    expect(mcpResult.status).toBe(502);
    expect((mcpResult.data as any).error).toContain('error status 500');
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

    it('rejects cross-origin Origin header with 403', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { origin: 'https://attacker.example.com' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('cross-origin access is blocked');
    });

    it('rejects Sec-Fetch-Site: cross-site with 403', async () => {
      const req = createMockReq({
        url: '/api/xmemo/status',
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      const res = createMockRes();

      await proxy.handleHttpRequest(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('cross-site requests are blocked');
    });

    it('rejects non-local Referer with 403', async () => {
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
      const hugeBody = JSON.stringify({ data: 'x'.repeat(10000) });
      const req = createMockReq({
        url: '/api/xmemo/mcp',
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
      const limitedProxy = new XMemoDevProxy({ enabled: true }, () => {}, strictLimiter);

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
