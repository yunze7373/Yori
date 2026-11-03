/**
 * D11-GCAL-OAUTH (DEMO_RESCUE rev12): shared Google OAuth 2.0 core (D12 Gmail reuses it).
 *
 * Server-side only. Authorization-code flow with PKCE S256:
 * - GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET come from the owner's .env.local. They are
 *   never VITE_-prefixed, never logged, and never returned to the client.
 * - Scopes are requested incrementally (include_granted_scopes=true): D11 asks only for
 *   calendar.events.readonly; D12 can add gmail.readonly on the same grant.
 * - state + PKCE verifier are bound to a browser session id (HttpOnly cookie), single use, 10 min TTL.
 * - The redirect URI is built only from the loopback allowlist:
 *   http://localhost:{4173|4174|5173}/api/google/oauth/callback. LAN / demo:https origins are not
 *   Google-registrable for this client and are refused.
 * - Tokens live in memory with a gitignored .yori-runtime fallback file (0600), refreshed here, and
 *   never sent to the client; status exposes booleans only (no email, no token, no expiry).
 * - Endpoint overrides (GOOGLE_OAUTH_*_URL, GOOGLE_CALENDAR_API_BASE) exist only for the recorded
 *   e2e mock and are honoured ONLY when they point at a loopback host; anything else disables the
 *   connector (fail closed).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ALLOWLISTED_LOOPBACK_PORTS } from '../xmemo/loopback-allowlist.js';

export const GOOGLE_SCOPES = Object.freeze({
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
} as const);
export type GoogleService = keyof typeof GOOGLE_SCOPES;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com';

export const GOOGLE_CALLBACK_PATH = '/api/google/oauth/callback';
export const GOOGLE_PENDING_TTL_MS = 10 * 60_000;
const REFRESH_SKEW_MS = 60_000;

export interface GoogleOAuthConfig {
  /** Client id present and the connector not switched off. */
  readonly configured: boolean;
  /** Why it is not configured (honest label source); undefined when configured. */
  readonly disabledReason?: 'no_client_id' | 'owner_off' | 'endpoint_override_rejected';
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl: string;
  readonly calendarApiBase: string;
  readonly tokenPath: string;
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  } catch {
    return false;
  }
}

export function resolveGoogleOAuthConfig(env: Record<string, string | undefined> = process.env): GoogleOAuthConfig {
  const clientId = env['GOOGLE_OAUTH_CLIENT_ID']?.trim() || undefined;
  const clientSecret = env['GOOGLE_OAUTH_CLIENT_SECRET']?.trim() || undefined;
  const enabledRaw = env['GOOGLE_OAUTH_ENABLED']?.trim().toLowerCase();
  const ownerOff = enabledRaw === 'false' || enabledRaw === '0';
  const tokenPath = env['GOOGLE_OAUTH_TOKEN_PATH']?.trim() || path.join(process.cwd(), '.yori-runtime', 'google-oauth-tokens.json');

  let rejected = false;
  const endpoint = (key: string, fallback: string) => {
    const v = env[key]?.trim();
    if (!v) return fallback;
    if (!isLoopbackUrl(v)) {
      rejected = true;
      return fallback;
    }
    return v.replace(/\/$/, '');
  };
  const authUrl = endpoint('GOOGLE_OAUTH_AUTH_URL', GOOGLE_AUTH_URL);
  const tokenUrl = endpoint('GOOGLE_OAUTH_TOKEN_URL', GOOGLE_TOKEN_URL);
  const revokeUrl = endpoint('GOOGLE_OAUTH_REVOKE_URL', GOOGLE_REVOKE_URL);
  const calendarApiBase = endpoint('GOOGLE_CALENDAR_API_BASE', GOOGLE_CALENDAR_API_BASE);

  const disabledReason = !clientId ? 'no_client_id' : ownerOff ? 'owner_off' : rejected ? 'endpoint_override_rejected' : undefined;
  return {
    configured: disabledReason === undefined,
    disabledReason,
    clientId,
    clientSecret,
    authUrl,
    tokenUrl,
    revokeUrl,
    calendarApiBase,
    tokenPath,
  };
}

/**
 * Redirect URI from the request Host, ONLY for http://localhost on an allowlisted port. 127.0.0.1 is
 * refused too: Google matches the registered URI exactly and the session cookie is host-scoped.
 */
export function buildGoogleRedirectUri(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const m = /^localhost:(\d{2,5})$/.exec(hostHeader.trim().toLowerCase());
  if (!m) return null;
  const port = Number(m[1]);
  if (!(ALLOWLISTED_LOOPBACK_PORTS as readonly number[]).includes(port)) return null;
  return `http://localhost:${port}${GOOGLE_CALLBACK_PATH}`;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateOpaqueId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

interface PendingAuth {
  readonly codeVerifier: string;
  readonly sessionId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly createdAt: number;
}

interface StoredTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: number;
  readonly scopes: readonly string[];
}

export type GoogleGrantState = 'connected' | 'expired' | 'disconnected';

export interface GoogleStatus {
  readonly configured: boolean;
  readonly disabledReason?: GoogleOAuthConfig['disabledReason'];
  readonly calendar: GoogleGrantState;
}

export type ExchangeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'not_configured' | 'invalid_state' | 'session_mismatch' | 'expired_state' | 'exchange_failed' };

export class GoogleOAuthCore {
  private readonly pending = new Map<string, PendingAuth>();
  private tokens: StoredTokens | null = null;
  /** Set when a refresh was refused (revoked, or the 7-day Testing-mode refresh expiry). */
  private grantExpired = false;
  private refreshing: Promise<string | null> | null = null;

  constructor(
    public readonly config: GoogleOAuthConfig = resolveGoogleOAuthConfig(),
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
    private readonly now: () => number = () => Date.now()
  ) {
    if (this.config.configured) this.tokens = this.readTokenFile();
  }

  status(): GoogleStatus {
    if (!this.config.configured) {
      return { configured: false, disabledReason: this.config.disabledReason, calendar: 'disconnected' };
    }
    const calendar: GoogleGrantState = this.hasScope(GOOGLE_SCOPES.calendar)
      ? 'connected'
      : this.grantExpired
        ? 'expired'
        : 'disconnected';
    return { configured: true, calendar };
  }

  hasScope(scope: string): boolean {
    return Boolean(this.tokens && this.tokens.scopes.includes(scope));
  }

  /** Builds the consent URL; the verifier stays here, bound to the session. */
  createAuthUrl(params: { sessionId: string; redirectUri: string; services: readonly GoogleService[] }): { authUrl: string; state: string } {
    if (!this.config.configured || !this.config.clientId) throw new Error('google_oauth_not_configured');
    const scopes = [...new Set(params.services.map(s => GOOGLE_SCOPES[s]))];
    if (scopes.length === 0) throw new Error('no_scopes');
    this.prunePending();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateOpaqueId();
    this.pending.set(state, { codeVerifier, sessionId: params.sessionId, redirectUri: params.redirectUri, scopes, createdAt: this.now() });
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: params.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    return { authUrl: `${this.config.authUrl}?${q.toString()}`, state };
  }

  /** Single use: the state is consumed on the first attempt, whatever the outcome. */
  async exchangeCode(code: string, state: string, sessionId: string | null): Promise<ExchangeResult> {
    if (!this.config.configured || !this.config.clientId) return { ok: false, error: 'not_configured' };
    const pending = this.pending.get(state);
    if (!pending) return { ok: false, error: 'invalid_state' };
    this.pending.delete(state);
    if (this.now() - pending.createdAt > GOOGLE_PENDING_TTL_MS) return { ok: false, error: 'expired_state' };
    if (!sessionId || !timingSafeEqualStr(sessionId, pending.sessionId)) return { ok: false, error: 'session_mismatch' };

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: this.config.clientId,
      code_verifier: pending.codeVerifier,
    };
    if (this.config.clientSecret) body['client_secret'] = this.config.clientSecret;
    try {
      const resp = await this.fetchFn(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(body).toString(),
      });
      if (!resp.ok) return { ok: false, error: 'exchange_failed' };
      const json = (await resp.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };
      if (typeof json.access_token !== 'string' || !json.access_token) return { ok: false, error: 'exchange_failed' };
      const granted = typeof json.scope === 'string' && json.scope.trim() ? json.scope.trim().split(/\s+/) : [...pending.scopes];
      this.tokens = {
        accessToken: json.access_token,
        refreshToken: typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : this.tokens?.refreshToken,
        expiresAt: this.now() + (typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 3600) * 1000,
        scopes: [...new Set([...(this.tokens?.scopes ?? []), ...granted])],
      };
      this.grantExpired = false;
      this.writeTokenFile();
      return { ok: true };
    } catch {
      return { ok: false, error: 'exchange_failed' };
    }
  }

  /**
   * A valid access token for the scope, refreshing in place; null when not connected. A refused
   * refresh (invalid_grant: revoked or the Testing-mode 7-day expiry) clears the grant -> 'expired'.
   */
  async getAccessToken(scope: string): Promise<string | null> {
    if (!this.config.configured || !this.tokens || !this.tokens.scopes.includes(scope)) return null;
    if (this.tokens.expiresAt - REFRESH_SKEW_MS > this.now()) return this.tokens.accessToken;
    return this.refresh();
  }

  /** Called when the API rejected the token (401): force one refresh. */
  async forceRefresh(): Promise<string | null> {
    if (!this.tokens) return null;
    return this.refresh();
  }

  private refresh(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const current = this.tokens;
      if (!current?.refreshToken || !this.config.clientId) {
        this.expireGrant();
        return null;
      }
      const body: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        client_id: this.config.clientId,
      };
      if (this.config.clientSecret) body['client_secret'] = this.config.clientSecret;
      try {
        const resp = await this.fetchFn(this.config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams(body).toString(),
        });
        if (resp.status === 400 || resp.status === 401) {
          this.expireGrant();
          return null;
        }
        if (!resp.ok) return null; // transient: keep the grant, no token this time
        const json = (await resp.json()) as { access_token?: unknown; expires_in?: unknown };
        if (typeof json.access_token !== 'string' || !json.access_token) return null;
        this.tokens = {
          ...current,
          accessToken: json.access_token,
          expiresAt: this.now() + (typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 3600) * 1000,
        };
        this.writeTokenFile();
        return this.tokens.accessToken;
      } catch {
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** The API still refuses the token after a refresh (revoked / scope removed): treat as expired. */
  rejectGrant(): void {
    this.expireGrant();
  }

  private expireGrant(): void {
    this.tokens = null;
    this.grantExpired = true;
    this.deleteTokenFile();
  }

  /** Disconnect: revoke at Google (best effort) and delete every local copy of the tokens. */
  async disconnect(): Promise<void> {
    const t = this.tokens;
    this.tokens = null;
    this.grantExpired = false;
    this.deleteTokenFile();
    const token = t?.refreshToken || t?.accessToken;
    if (!token) return;
    try {
      await this.fetchFn(this.config.revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      // Local tokens are already gone; a failed revoke leaves nothing usable here.
    }
  }

  private prunePending(): void {
    const now = this.now();
    for (const [st, p] of this.pending) if (now - p.createdAt > GOOGLE_PENDING_TTL_MS) this.pending.delete(st);
  }

  private readTokenFile(): StoredTokens | null {
    try {
      if (!fs.existsSync(this.config.tokenPath)) return null;
      const raw = JSON.parse(fs.readFileSync(this.config.tokenPath, 'utf-8')) as Partial<StoredTokens>;
      if (typeof raw.accessToken !== 'string' || typeof raw.expiresAt !== 'number' || !Array.isArray(raw.scopes)) return null;
      return {
        accessToken: raw.accessToken,
        refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : undefined,
        expiresAt: raw.expiresAt,
        scopes: raw.scopes.filter((s): s is string => typeof s === 'string'),
      };
    } catch {
      return null;
    }
  }

  private writeTokenFile(): void {
    if (!this.tokens) return;
    try {
      fs.mkdirSync(path.dirname(this.config.tokenPath), { recursive: true });
      fs.writeFileSync(this.config.tokenPath, JSON.stringify(this.tokens), { encoding: 'utf-8', mode: 0o600 });
      fs.chmodSync(this.config.tokenPath, 0o600);
    } catch {
      // Memory copy still works for this process.
    }
  }

  private deleteTokenFile(): void {
    try {
      fs.rmSync(this.config.tokenPath, { force: true });
    } catch {
      // nothing to delete
    }
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

let sharedCore: GoogleOAuthCore | null = null;

/** One core per server process, shared by /api/google and the /api/calendar source selection. */
export function getSharedGoogleOAuthCore(): GoogleOAuthCore {
  if (!sharedCore) sharedCore = new GoogleOAuthCore();
  return sharedCore;
}

export function setSharedGoogleOAuthCoreForTests(core: GoogleOAuthCore | null): void {
  sharedCore = core;
}
