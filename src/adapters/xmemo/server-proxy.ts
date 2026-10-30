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
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  deleteTool: 'forget',
  deleteKeyArg: 'key',
} as const;

export interface XMemoProxyConfig {
  readonly enabled: boolean;
  readonly issuer: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl: string;
  readonly mcpUrl: string;
  readonly registrationUrl?: string;
  readonly clientStoragePath?: string;
  readonly clientId?: string;
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
  const registrationUrl = env['XMEMO_REGISTRATION_URL'];
  const clientStoragePath = env['XMEMO_CLIENT_STORAGE_PATH'] || path.resolve(process.cwd(), '.xmemo-client.json');

  // Strict: remove 'yori-dev-client' placeholder fallback
  const clientId = env['XMEMO_CLIENT_ID'] || undefined;
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
    registrationUrl,
    clientStoragePath,
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
  private clientId?: string;
  private clientSecret?: string;
  private authorizeUrl: string;
  private tokenUrl: string;
  private revokeUrl: string;
  private mcpUrl: string;
  private registrationError?: string;
  private registrationPromise?: Promise<{ success: boolean; clientId?: string; error?: string }>;
  private readonly fetchFn: typeof fetch;

  constructor(
    configOverride?: Partial<XMemoProxyConfig>,
    private readonly logger: (msg: string) => void = () => {},
    rateLimiter?: RateLimiter,
    fetchFn?: typeof fetch
  ) {
    const resolved = resolveXMemoConfig(this.logger);
    const issuer = configOverride?.issuer ?? resolved.issuer;
    const authorizeUrl =
      configOverride?.authorizeUrl ??
      (configOverride?.issuer ? `${issuer}/oauth/authorize` : resolved.authorizeUrl);
    const tokenUrl =
      configOverride?.tokenUrl ??
      (configOverride?.issuer ? `${issuer}/oauth/token` : resolved.tokenUrl);
    const revokeUrl =
      configOverride?.revokeUrl ??
      (configOverride?.issuer ? `${issuer}/oauth/revoke` : resolved.revokeUrl);
    const mcpUrl =
      configOverride?.mcpUrl ??
      (configOverride?.issuer ? `${issuer}/mcp` : resolved.mcpUrl);

    // When configOverride is provided (typically in tests), do NOT default clientStoragePath to cwd
    // (.xmemo-client.json). Only default to cwd when configOverride is omitted (production/preview)
    // or when explicitly configured via process.env.XMEMO_CLIENT_STORAGE_PATH.
    const clientStoragePath =
      configOverride !== undefined
        ? (configOverride.clientStoragePath ?? (process.env.XMEMO_CLIENT_STORAGE_PATH || undefined))
        : resolved.clientStoragePath;

    this.config = {
      ...resolved,
      ...configOverride,
      issuer,
      authorizeUrl,
      tokenUrl,
      revokeUrl,
      mcpUrl,
      clientStoragePath,
      scopes: configOverride?.scopes ?? resolved.scopes,
    };
    this.rateLimiter = rateLimiter ?? new RateLimiter(60, 60_000);
    this.fetchFn =
      fetchFn ??
      (typeof fetch !== 'undefined'
        ? fetch
        : (() => Promise.reject(new Error('fetch unavailable'))) as any);

    this.clientId = this.config.clientId;
    this.clientSecret = this.config.clientSecret;
    this.authorizeUrl = this.config.authorizeUrl;
    this.tokenUrl = this.config.tokenUrl;
    this.revokeUrl = this.config.revokeUrl;
    this.mcpUrl = this.config.mcpUrl;

    if (this.config.enabled && !this.clientId) {
      this.tryLoadPersistedClientId();
    }
  }

  public resetRegistration(): void {
    this.clientId = this.config.clientId;
    this.clientSecret = this.config.clientSecret;
    this.registrationError = undefined;
    this.registrationPromise = undefined;
    if (this.config.enabled && !this.clientId) {
      this.tryLoadPersistedClientId();
    }
  }

  private tryLoadPersistedClientId(): boolean {
    if (!this.config.clientStoragePath) return false;
    try {
      if (fs.existsSync(this.config.clientStoragePath)) {
        const raw = fs.readFileSync(this.config.clientStoragePath, 'utf-8');
        const data = JSON.parse(raw);
        if (typeof data.client_id === 'string' && data.client_id.trim()) {
          // Validate issuer matches configured issuer
          if (data.issuer !== this.config.issuer) {
            this.logger(
              `[XMemoProxy] Persisted client registration issuer mismatch: stored '${data.issuer}' != configured '${this.config.issuer}'. Ignoring persisted registration.`
            );
            return false;
          }

          // Resolve stored redirect_uri: explicit field or extract from RFC 7591 JWT payload
          let storedRedirectUri = data.redirect_uri;
          if (!storedRedirectUri && typeof data.client_id === 'string' && data.client_id.startsWith('xmemo-dcr.')) {
            try {
              const parts = data.client_id.split('.');
              if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
                if (Array.isArray(payload.redirect_uris) && payload.redirect_uris.length > 0) {
                  storedRedirectUri = payload.redirect_uris[0];
                }
              }
            } catch {
              // ignore malformed token payload
            }
          }

          // Validate redirect_uri matches configured redirectUri
          if (!storedRedirectUri || storedRedirectUri !== this.config.redirectUri) {
            this.logger(
              `[XMemoProxy] Persisted client registration redirect_uri mismatch: stored '${storedRedirectUri}' != configured '${this.config.redirectUri}'. Ignoring persisted registration.`
            );
            return false;
          }

          this.clientId = data.client_id.trim();
          if (typeof data.client_secret === 'string' && data.client_secret.trim()) {
            this.clientSecret = data.client_secret.trim();
          }
          this.logger(`[XMemoProxy] Loaded persisted client_id: ${this.clientId}`);
          return true;
        }
      }
    } catch (err: unknown) {
      this.logger(`[XMemoProxy] Failed to load persisted client registration: ${(err as Error).message}`);
    }
    return false;
  }

  private persistRegistration(clientId: string, clientSecret?: string): void {
    if (!this.config.clientStoragePath) return;
    try {
      const dir = path.dirname(this.config.clientStoragePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: Record<string, string> = {
        client_id: clientId,
        issuer: this.config.issuer,
        redirect_uri: this.config.redirectUri,
        registered_at: new Date().toISOString(),
      };
      if (clientSecret) {
        data['client_secret'] = clientSecret;
      }
      fs.writeFileSync(this.config.clientStoragePath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      try {
        fs.chmodSync(this.config.clientStoragePath, 0o600);
      } catch {
        // Ignore chmod error on unsupported filesystems
      }
      this.logger(`[XMemoProxy] Persisted client_id to ${this.config.clientStoragePath}`);
    } catch (err: unknown) {
      this.logger(`[XMemoProxy] Failed to persist client credentials: ${(err as Error).message}`);
    }
  }

  public async ensureRegistered(
    fetchFn: typeof fetch = this.fetchFn
  ): Promise<{ success: boolean; clientId?: string; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'XMemo OAuth disabled' };
    }
    if (this.clientId) {
      return { success: true, clientId: this.clientId };
    }
    if (this.registrationError) {
      return { success: false, error: this.registrationError };
    }
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = (async () => {
      try {
        let registrationEndpoint = this.config.registrationUrl;
        if (!registrationEndpoint) {
          try {
            const discoveryUrl = `${this.config.issuer}/.well-known/oauth-authorization-server`;
            const discoRes = await fetchFn(discoveryUrl, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (discoRes.ok) {
              const discoData = (await discoRes.json()) as any;
              if (discoData && typeof discoData.registration_endpoint === 'string' && discoData.registration_endpoint.trim()) {
                registrationEndpoint = discoData.registration_endpoint.trim();
              }
              if (discoData && typeof discoData.authorization_endpoint === 'string' && discoData.authorization_endpoint.trim()) {
                this.authorizeUrl = discoData.authorization_endpoint.trim();
              }
              if (discoData && typeof discoData.token_endpoint === 'string' && discoData.token_endpoint.trim()) {
                this.tokenUrl = discoData.token_endpoint.trim();
              }
              if (discoData && typeof discoData.revocation_endpoint === 'string' && discoData.revocation_endpoint.trim()) {
                this.revokeUrl = discoData.revocation_endpoint.trim();
              }
              if (discoData && typeof discoData.mcp_endpoint === 'string' && discoData.mcp_endpoint.trim()) {
                this.mcpUrl = discoData.mcp_endpoint.trim();
              }
            }
          } catch {
            // Fall through to default registration endpoint
          }
          if (!registrationEndpoint) {
            registrationEndpoint = `${this.config.issuer}/oauth/register`;
          }
        }

        const registrationPayload = {
          redirect_uris: [this.config.redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: this.config.scopes.join(' '),
          client_name: 'Yori (local dev)',
        };

        const regRes = await fetchFn(registrationEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(registrationPayload),
        });

        if (!regRes.ok) {
          let errCode = String(regRes.status);
          try {
            const errBody = await regRes.json();
            if (errBody && typeof errBody.error === 'string' && errBody.error.trim()) {
              errCode = errBody.error.trim();
            } else if (errBody && typeof errBody.message === 'string' && errBody.message.trim()) {
              errCode = errBody.message.trim();
            }
          } catch {
            // Body was not JSON
          }
          this.registrationError = errCode;
          this.logger(`[XMemoProxy] Dynamic registration rejected: ${errCode}`);
          return { success: false, error: errCode };
        }

        let regData: any;
        try {
          regData = await regRes.json();
        } catch {
          this.registrationError = 'malformed_response';
          this.logger('[XMemoProxy] Dynamic registration response malformed');
          return { success: false, error: 'malformed_response' };
        }

        if (!regData || typeof regData.client_id !== 'string' || !regData.client_id.trim()) {
          this.registrationError = 'malformed_response';
          this.logger('[XMemoProxy] Dynamic registration missing client_id');
          return { success: false, error: 'malformed_response' };
        }

        this.clientId = regData.client_id.trim();
        if (typeof regData.client_secret === 'string' && regData.client_secret.trim()) {
          this.clientSecret = regData.client_secret.trim();
        }

        this.persistRegistration(this.clientId!, this.clientSecret);
        this.logger(`[XMemoProxy] Dynamic registration succeeded. Client ID: ${this.clientId}`);
        return { success: true, clientId: this.clientId };
      } catch (err: unknown) {
        const errCode = 'network_error';
        this.registrationError = errCode;
        this.logger(`[XMemoProxy] Dynamic registration network error: ${(err as Error).message}`);
        return { success: false, error: errCode };
      } finally {
        this.registrationPromise = undefined;
      }
    })();

    return this.registrationPromise;
  }

  public getConfig(): XMemoProxyConfig {
    return {
      ...this.config,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      authorizeUrl: this.authorizeUrl,
      tokenUrl: this.tokenUrl,
      revokeUrl: this.revokeUrl,
      mcpUrl: this.mcpUrl,
    };
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
    if (this.registrationError) {
      return {
        enabled: true,
        connected: false,
        statusText: `registration rejected: ${this.registrationError}`,
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
    if (this.registrationError) {
      throw new Error(`registration rejected: ${this.registrationError}`);
    }
    if (!this.clientId) {
      throw new Error('XMemo registration required: no client_id available');
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
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `${this.authorizeUrl}?${params.toString()}`,
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
    fetchFn: typeof fetch = this.fetchFn
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'XMemo OAuth disabled' };
    }
    const pending = this.pendingStates.get(state);
    if (!pending) {
      return { success: false, error: 'Invalid or expired state parameter' };
    }
    this.pendingStates.delete(state);

    const effectiveClientId = this.clientId || this.config.clientId || '';
    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: effectiveClientId,
      code_verifier: pending.codeVerifier,
    };
    const effectiveSecret = this.clientSecret || this.config.clientSecret;
    if (effectiveSecret) {
      bodyParams['client_secret'] = effectiveSecret;
    }

    try {
      const resp = await fetchFn(this.tokenUrl, {
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
  public async disconnect(fetchFn: typeof fetch = this.fetchFn): Promise<{ success: boolean }> {
    if (this.session.accessToken && this.revokeUrl) {
      try {
        await fetchFn(this.revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: this.session.accessToken,
            client_id: this.clientId || this.config.clientId || '',
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
    fetchFn: typeof fetch = this.fetchFn
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
      const resp = await fetchFn(this.mcpUrl, {
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
    fetchFn: typeof fetch = this.fetchFn
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
      const resp = await fetchFn(this.mcpUrl, {
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
   * Server-built delete fact route.
   * Constructs JSON-RPC call from isolated UNVERIFIED_XMEMO_MCP_MAPPING.
   */
  public async deleteFact(
    key: string,
    fetchFn: typeof fetch = this.fetchFn
  ): Promise<{ status: number; data: unknown }> {
    if (!this.config.enabled) {
      return { status: 403, data: { error: 'XMemo OAuth disabled' } };
    }
    if (!this.session.accessToken) {
      return { status: 401, data: { error: 'Not connected to XMemo' } };
    }

    if (typeof key !== 'string' || !key.trim() || key.length > 100) {
      return {
        status: 400,
        data: { error: 'Bad Request: key must be a non-empty string <= 100 characters' },
      };
    }

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: UNVERIFIED_XMEMO_MCP_MAPPING.deleteTool,
        arguments: {
          [UNVERIFIED_XMEMO_MCP_MAPPING.deleteKeyArg]: key,
        },
      },
    };

    try {
      const resp = await fetchFn(this.mcpUrl, {
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
      if (this.config.enabled && !this.clientId && !this.registrationError) {
        await this.ensureRegistered();
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
      if (this.config.enabled && !this.clientId && !this.registrationError) {
        await this.ensureRegistered();
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

    // Route: POST / DELETE /api/xmemo/confirmed-facts (Narrow server-built write/delete route, confirm-only enforced)
    if (urlPath === '/api/xmemo/confirmed-facts') {
      if (req.method === 'POST') {
        const writeResult = await this.writeConfirmedFact(payload);
        res.statusCode = writeResult.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(writeResult.data));
        return true;
      }

      if (req.method === 'DELETE') {
        const key = (payload as any)?.key;
        if (typeof key !== 'string' || !key.trim() || key.length > 100) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Bad Request: key must be string <= 100 characters' }));
          return true;
        }

        const deleteResult = await this.deleteFact(key);
        res.statusCode = deleteResult.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(deleteResult.data));
        return true;
      }

      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
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
  if (proxy.getConfig().enabled && !proxy.getConfig().clientId) {
    void proxy.ensureRegistered();
  }

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
