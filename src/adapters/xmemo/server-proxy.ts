/**
 * Server-Side XMemo Dev Proxy
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2.
 *
 * Requirements & Invariants:
 * 1. Feature-flagged: XMEMO_OAUTH_ENABLED (boolean, default: false).
 * 2. Server-side only: PKCE code_verifier, code exchange, and access/refresh tokens
 *    live in dev-server process memory.
 * 3. Zero credentials or tokens in browser storage, bundle, repo, or logs.
 * 4. Minimal scopes: exactly 'memory:read memory:write'.
 * 5. Data surface: MCP-over-HTTP at https://xmemo.dev/mcp with Bearer authorization.
 * 6. Isolated UNVERIFIED MCP tool mapping: server constructs JSON-RPC internally.
 *    No arbitrary client MCP passthrough allowed.
 * 7. Server-enforced confirm-only write-back (INV-107): non-confirmed writes rejected 400.
 * 8. OAuth callback handling: GET /api/xmemo/callback permits top-level cross-site redirect
 *    with local host check and one-time cryptographically random state verification.
 * 9. Security guards on all API routes: loopback bind, local Origin/Host validation (403),
 *    8KB body cap (413), application/json requirement (415), and rate limiting (429).
 */

import * as crypto from 'node:crypto';
import {
  isLocalHost,
  isLocalOrigin,
  isLocalReferer,
  RateLimiter,
  loadEnvLocal,
} from '../model/server-proxy.js';

/**
 * Isolated UNVERIFIED XMemo MCP Tool Mapping
 * Governed by XMEMO_AUTH_DECISION.md Section 5 and AC-203-2.
 *
 * Subject to owner-authorized live probe verification in Phase 2 live rollout.
 * Client code never invokes MCP directly; the dev proxy constructs JSON-RPC envelopes.
 */
export const UNVERIFIED_XMEMO_MCP_MAPPING = {
  readTool: 'recall',
  readQueryArg: 'query',
  readDefaultQuery: 'preferences',
  writeTool: 'remember',
  writeKeyArg: 'key',
  writeValueArg: 'value',
  writeStatusArg: 'status',
  writeTagArg: 'tag',
  writeTagValue: 'yori:living-context',
} as const;

export interface XMemoProxyConfig {
  readonly enabled: boolean;
  readonly issuer: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl: string;
  readonly mcpUrl: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

export interface XMemoProxyStatus {
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly statusText: string;
}

interface PendingAuthState {
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly createdAt: number;
}

interface XMemoSession {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  // RFC 7636 Section 4: 32 random bytes base64url-encoded produces 43 chars in [A-Za-z0-9_-]
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function resolveXMemoConfig(
  logger: (msg: string) => void = () => {},
  env: NodeJS.ProcessEnv = process.env
): XMemoProxyConfig {
  loadEnvLocal();

  const enabledVal = env['XMEMO_OAUTH_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';

  const issuer = env['XMEMO_ISSUER'] || 'https://xmemo.dev';
  const authorizeUrl = env['XMEMO_AUTHORIZE_URL'] || `${issuer}/oauth/authorize`;
  const tokenUrl = env['XMEMO_TOKEN_URL'] || `${issuer}/oauth/token`;
  const revokeUrl = env['XMEMO_REVOKE_URL'] || `${issuer}/oauth/revoke`;
  const mcpUrl = env['XMEMO_MCP_URL'] || `${issuer}/mcp`;
  const clientId = env['XMEMO_CLIENT_ID'] || 'yori-dev-client';
  const clientSecret = env['XMEMO_CLIENT_SECRET'];
  const redirectUri = env['XMEMO_REDIRECT_URI'] || 'http://127.0.0.1:5173/api/xmemo/callback';

  if (enabled) {
    logger(`[XMemoProxy] XMemo OAuth enabled. Target issuer: ${issuer}`);
  }

  return {
    enabled,
    issuer,
    authorizeUrl,
    tokenUrl,
    revokeUrl,
    mcpUrl,
    clientId,
    clientSecret,
    redirectUri,
    scopes: ['memory:read', 'memory:write'],
  };
}

export class XMemoDevProxy {
  private readonly config: XMemoProxyConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly pendingStates = new Map<string, PendingAuthState>();
  private session: XMemoSession = {};

  constructor(
    configOverride?: Partial<XMemoProxyConfig>,
    private readonly logger: (msg: string) => void = () => {},
    rateLimiter?: RateLimiter
  ) {
    const resolved = resolveXMemoConfig(this.logger);
    this.config = {
      ...resolved,
      ...configOverride,
      scopes: configOverride?.scopes ?? resolved.scopes,
    };
    this.rateLimiter = rateLimiter ?? new RateLimiter(60, 60_000);
  }

  public getConfig(): XMemoProxyConfig {
    return this.config;
  }

  public isConnected(): boolean {
    return Boolean(this.session.accessToken);
  }

  public getStatus(): XMemoProxyStatus {
    if (!this.config.enabled) {
      return {
        enabled: false,
        connected: false,
        statusText: 'XMemo OAuth disabled (default)',
      };
    }
    const connected = this.isConnected();
    return {
      enabled: true,
      connected,
      statusText: connected ? 'XMemo connected' : 'XMemo OAuth enabled (disconnected)',
    };
  }

  /**
   * Generates authorization URL with PKCE S256 and exact minimal scopes.
   * PKCE code_verifier is retained strictly in server memory.
   */
  public createAuthUrl(redirectUriOverride?: string): { authUrl: string; state: string } {
    if (!this.config.enabled) {
      throw new Error('XMemo OAuth disabled');
    }
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateState();
    const redirectUri = redirectUriOverride || this.config.redirectUri;

    // Prune stale states older than 10 minutes
    const now = Date.now();
    for (const [st, val] of this.pendingStates.entries()) {
      if (now - val.createdAt > 600_000) {
        this.pendingStates.delete(st);
      }
    }

    this.pendingStates.set(state, {
      codeVerifier,
      redirectUri,
      createdAt: now,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `${this.config.authorizeUrl}?${params.toString()}`,
      state,
    };
  }

  /**
   * Exchanges auth code for access token via token_endpoint using PKCE code_verifier.
   * Token is stored strictly in server memory; never returned to client.
   */
  public async exchangeCode(
    code: string,
    state: string,
    fetchFn: typeof fetch = fetch
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'XMemo OAuth disabled' };
    }
    const pending = this.pendingStates.get(state);
    if (!pending) {
      return { success: false, error: 'Invalid or expired state parameter' };
    }
    this.pendingStates.delete(state);

    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: this.config.clientId,
      code_verifier: pending.codeVerifier,
    };
    if (this.config.clientSecret) {
      bodyParams['client_secret'] = this.config.clientSecret;
    }

    try {
      const resp = await fetchFn(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(bodyParams).toString(),
      });

      if (!resp.ok) {
        return { success: false, error: `Token exchange failed with status ${resp.status}` };
      }

      const tokenData = (await resp.json()) as {
        access_token?: string;
        token_type?: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
      };

      if (!tokenData.access_token) {
        return { success: false, error: 'Invalid token response: missing access_token' };
      }

      this.session = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      };

      this.logger('[XMemoProxy] Access token stored in server process memory');
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Revokes token at revocation_endpoint and clears server session.
   */
  public async disconnect(fetchFn: typeof fetch = fetch): Promise<{ success: boolean }> {
    if (this.session.accessToken && this.config.revokeUrl) {
      try {
        await fetchFn(this.config.revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: this.session.accessToken,
            client_id: this.config.clientId,
          }).toString(),
        });
      } catch {
        // Silently clear local session even if remote revocation fails
      }
    }
    this.session = {};
    this.pendingStates.clear();
    this.logger('[XMemoProxy] Disconnected and server session cleared');
    return { success: true };
  }

  /**
   * Server-built read preferences route.
   * Constructs JSON-RPC call from isolated UNVERIFIED_XMEMO_MCP_MAPPING.
   */
  public async readPreferences(
    query?: string,
    fetchFn: typeof fetch = fetch
  ): Promise<{ status: number; data: unknown }> {
    if (!this.config.enabled) {
      return { status: 403, data: { error: 'XMemo OAuth disabled' } };
    }
    if (!this.session.accessToken) {
      return { status: 401, data: { error: 'Not connected to XMemo' } };
    }

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: UNVERIFIED_XMEMO_MCP_MAPPING.readTool,
        arguments: {
          [UNVERIFIED_XMEMO_MCP_MAPPING.readQueryArg]:
            query || UNVERIFIED_XMEMO_MCP_MAPPING.readDefaultQuery,
        },
      },
    };

    try {
      const resp = await fetchFn(this.config.mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        this.session = {};
        this.logger('[XMemoProxy] Upstream 401: access token expired/revoked; session cleared');
        return {
          status: 401,
          data: { error: 'XMemo authorization expired or revoked', disconnected: true },
        };
      }

      if (!resp.ok) {
        return {
          status: resp.status >= 500 ? 502 : resp.status,
          data: { error: `Upstream XMemo MCP returned error status ${resp.status}` },
        };
      }

      const json = await resp.json();
      return { status: 200, data: json };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 502, data: { error: `Failed to connect to XMemo MCP: ${msg}` } };
    }
  }

  /**
   * Server-built write confirmed fact route.
   * Enforces server-side confirm-only validation (INV-107).
   * Constructs JSON-RPC call from isolated UNVERIFIED_XMEMO_MCP_MAPPING.
   */
  public async writeConfirmedFact(
    fact: unknown,
    fetchFn: typeof fetch = fetch
  ): Promise<{ status: number; data: unknown }> {
    if (!this.config.enabled) {
      return { status: 403, data: { error: 'XMemo OAuth disabled' } };
    }
    if (!this.session.accessToken) {
      return { status: 401, data: { error: 'Not connected to XMemo' } };
    }

    // Server-side validation
    if (!fact || typeof fact !== 'object') {
      return { status: 400, data: { error: 'Bad Request: fact object required' } };
    }

    const { key, value, status, provenance } = fact as any;

    // Strict server-side invariant check: INV-107 & AC-106-3
    if (status !== 'confirmed') {
      return {
        status: 400,
        data: {
          error: `Server invariant violation (INV-107): only confirmed facts can be written to remote vault. Got status '${status}'.`,
        },
      };
    }

    if (typeof key !== 'string' || !key.trim() || key.length > 100) {
      return {
        status: 400,
        data: { error: 'Bad Request: key must be a non-empty string <= 100 characters' },
      };
    }

    if (!provenance || typeof provenance !== 'object') {
      return {
        status: 400,
        data: { error: 'Bad Request: provenance object is required' },
      };
    }

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: UNVERIFIED_XMEMO_MCP_MAPPING.writeTool,
        arguments: {
          [UNVERIFIED_XMEMO_MCP_MAPPING.writeKeyArg]: key,
          [UNVERIFIED_XMEMO_MCP_MAPPING.writeValueArg]:
            typeof value === 'string' ? value : JSON.stringify(value),
          [UNVERIFIED_XMEMO_MCP_MAPPING.writeStatusArg]: 'confirmed',
          [UNVERIFIED_XMEMO_MCP_MAPPING.writeTagArg]: UNVERIFIED_XMEMO_MCP_MAPPING.writeTagValue,
          provenance,
        },
      },
    };

    try {
      const resp = await fetchFn(this.config.mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        this.session = {};
        this.logger('[XMemoProxy] Upstream 401: access token expired/revoked; session cleared');
        return {
          status: 401,
          data: { error: 'XMemo authorization expired or revoked', disconnected: true },
        };
      }

      if (!resp.ok) {
        return {
          status: resp.status >= 500 ? 502 : resp.status,
          data: { error: `Upstream XMemo MCP returned error status ${resp.status}` },
        };
      }

      return { status: 200, data: { success: true } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 502, data: { error: `Failed to connect to XMemo MCP: ${msg}` } };
    }
  }

  /**
   * Handles incoming HTTP requests for XMemo proxy routes with strict security guards.
   */
  public async handleHttpRequest(req: any, res: any): Promise<boolean> {
    const rawUrl = req.url || '';
    const urlPath = rawUrl.split('?')[0];

    if (
      urlPath !== '/api/xmemo/status' &&
      urlPath !== '/api/xmemo/auth-url' &&
      urlPath !== '/api/xmemo/callback' &&
      urlPath !== '/api/xmemo/disconnect' &&
      urlPath !== '/api/xmemo/preferences' &&
      urlPath !== '/api/xmemo/confirmed-facts'
    ) {
      return false;
    }

    // 1. Host header validation: local loopback host required on ALL routes
    const hostHeader = (req.headers?.['host'] || req.headers?.[':authority']) as string | undefined;
    if (!isLocalHost(hostHeader)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: non-local host access is blocked' }));
      return true;
    }

    // 2. Device testing mode isolation
    if (process.env.DEV_DEVICE_TESTING === 'true') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: XMemo proxy disabled in device-testing mode' }));
      return true;
    }

    // Special Route: GET /api/xmemo/callback (Browser OAuth redirect navigation from XMemo auth server)
    // For this top-level GET redirect, loopback Host check and one-time state token guard apply,
    // while skipping cross-site / external Referer guards that would otherwise reject top-level browser redirects.
    if (urlPath === '/api/xmemo/callback' && req.method === 'GET') {
      if (!this.config.enabled) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h1>403 Forbidden: XMemo OAuth disabled</h1>');
        return true;
      }

      const queryIdx = rawUrl.indexOf('?');
      const queryParams = new URLSearchParams(queryIdx >= 0 ? rawUrl.slice(queryIdx + 1) : '');
      const code = queryParams.get('code');
      const state = queryParams.get('state');

      if (!code || !state) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h1>400 Bad Request: Missing code or state</h1>');
        return true;
      }

      const result = await this.exchangeCode(code, state);
      if (!result.success) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<h1>Authentication Failed</h1><p>${result.error}</p>`);
        return true;
      }

      // Redirect browser back to living context app with success query
      res.statusCode = 302;
      res.setHeader('Location', '/?tab=me&xmemo=connected');
      res.end();
      return true;
    }

    // Full cross-site and origin security guards for all API operational routes:
    // 3. Origin validation
    const originHeader = req.headers?.['origin'] as string | undefined;
    if (originHeader && !isLocalOrigin(originHeader)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: cross-origin access is blocked' }));
      return true;
    }

    // 4. Sec-Fetch-Site validation
    const secFetchSite = req.headers?.['sec-fetch-site'] as string | undefined;
    if (secFetchSite === 'cross-site') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: cross-site requests are blocked' }));
      return true;
    }

    // 5. Referer validation
    const referer = req.headers?.['referer'] as string | undefined;
    if (referer && !isLocalReferer(referer)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: non-local referer is blocked' }));
      return true;
    }

    // Route: GET /api/xmemo/status
    if (urlPath === '/api/xmemo/status') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(this.getStatus()));
      return true;
    }

    // If disabled, all other operational endpoints return 403 Forbidden
    if (!this.config.enabled) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'XMemo OAuth disabled (set XMEMO_OAUTH_ENABLED=true)' }));
      return true;
    }

    // Rate limit check
    if (!this.rateLimiter.check()) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too Many Requests: rate limit exceeded' }));
      return true;
    }

    // Route: POST /api/xmemo/auth-url
    if (urlPath === '/api/xmemo/auth-url') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }
      try {
        const result = this.createAuthUrl();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch (err: unknown) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return true;
    }

    // Route: POST /api/xmemo/disconnect
    if (urlPath === '/api/xmemo/disconnect') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }
      const result = await this.disconnect();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    // For POST endpoints: Validate application/json Content-Type & Read request body with 8KB cap
    const contentType = ((req.headers?.['content-type'] as string) || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      res.statusCode = 415;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unsupported Media Type: application/json required' }));
      return true;
    }

    const bodyResult = await this.readRequestBody(req);
    if (!bodyResult.success) {
      res.statusCode = bodyResult.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: bodyResult.error }));
      return true;
    }

    const payload = bodyResult.data;

    // Route: POST /api/xmemo/callback (Programmatic / API test flow)
    if (urlPath === '/api/xmemo/callback') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }
      const { code, state } = (payload as any) || {};
      if (typeof code !== 'string' || typeof state !== 'string') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing or invalid code/state parameters' }));
        return true;
      }

      const result = await this.exchangeCode(code, state);
      res.statusCode = result.success ? 200 : 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    // Route: POST /api/xmemo/preferences (Narrow server-built read route)
    if (urlPath === '/api/xmemo/preferences') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }

      const query = (payload as any)?.query;
      if (query !== undefined && (typeof query !== 'string' || query.length > 100)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Bad Request: query must be string <= 100 characters' }));
        return true;
      }

      const readResult = await this.readPreferences(query);
      res.statusCode = readResult.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(readResult.data));
      return true;
    }

    // Route: POST /api/xmemo/confirmed-facts (Narrow server-built write route, confirm-only enforced)
    if (urlPath === '/api/xmemo/confirmed-facts') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return true;
      }

      const writeResult = await this.writeConfirmedFact(payload);
      res.statusCode = writeResult.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(writeResult.data));
      return true;
    }

    return false;
  }

  private readRequestBody(
    req: any,
    maxBytes: number = 8192
  ): Promise<{ success: true; data: unknown } | { success: false; status: number; error: string }> {
    return new Promise(resolve => {
      let body = '';
      let receivedBytes = 0;
      let aborted = false;

      req.on('data', (chunk: Buffer | string) => {
        if (aborted) return;
        const len = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf-8');
        receivedBytes += len;
        if (receivedBytes > maxBytes) {
          aborted = true;
          resolve({
            success: false,
            status: 413,
            error: `Payload Too Large: maximum allowed body size is ${maxBytes} bytes`,
          });
          req.destroy();
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        if (aborted) return;
        if (!body.trim()) {
          resolve({ success: true, data: {} });
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve({ success: true, data: parsed });
        } catch {
          resolve({
            success: false,
            status: 400,
            error: 'Bad Request: malformed JSON payload',
          });
        }
      });

      req.on('error', () => {
        if (aborted) return;
        resolve({
          success: false,
          status: 500,
          error: 'Internal Server Error while reading request body',
        });
      });
    });
  }
}

export function createXMemoProxyMiddleware(
  proxy: XMemoDevProxy = new XMemoDevProxy()
) {
  return async (req: any, res: any, next: () => void) => {
    try {
      const handled = await proxy.handleHttpRequest(req, res);
      if (!handled) {
        next();
      }
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error in XMemo proxy' }));
    }
  };
}
