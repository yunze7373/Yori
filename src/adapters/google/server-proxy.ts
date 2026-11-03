/**
 * D11-GCAL-OAUTH: /api/google/* routes (server-side OAuth for Google Calendar; D12 adds Gmail).
 *
 * Guards on EVERY route (same as /api/model): a loopback socket peer, an allowlisted loopback Host,
 * and, for API calls, local Origin/Referer and no cross-site fetch. The callback is a top-level
 * redirect from Google, so it skips only the Origin/Referer checks; its protection is the
 * single-use state bound to the HttpOnly session cookie.
 *
 * Routes:
 *   GET  /api/google/status            -> { configured, disabledReason?, calendar } (booleans/states only)
 *   POST /api/google/oauth/start       -> { authUrl } + Set-Cookie session (calendar scope)
 *   GET  /api/google/oauth/callback    -> exchange; 302 back to the app, or 400 with no exchange
 *   POST /api/google/disconnect        -> revoke + delete tokens
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAllowlistedLoopbackHost, isLoopbackPeer } from '../xmemo/loopback-allowlist.js';
import {
  GoogleOAuthCore,
  buildGoogleRedirectUri,
  generateOpaqueId,
  getSharedGoogleOAuthCore,
} from './oauth-core.js';

export const GOOGLE_SESSION_COOKIE = 'yori_google_sid';

function isLocalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return isAllowlistedLoopbackHost(u.host);
  } catch {
    return false;
  }
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers['cookie'];
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      const value = v.join('=');
      return /^[a-f0-9]{32}$/.test(value) ? value : null;
    }
  }
  return null;
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, title: string, detail: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><p>${detail}</p><p><a href="/?tab=connectors">Back to Yori</a></p>`);
}

const CALLBACK_ERRORS: Record<string, string> = {
  invalid_state: 'This sign-in link is not valid or was already used. Start again from Connectors.',
  expired_state: 'This sign-in link expired. Start again from Connectors.',
  session_mismatch: 'This sign-in was started in a different browser session. Start again from Connectors.',
  exchange_failed: 'Google did not accept the sign-in. Start again from Connectors.',
  not_configured: 'Google sign-in is not set up on this server.',
};

export function createGoogleProxyMiddleware(coreOverride?: GoogleOAuthCore) {
  return async function googleProxyMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0] || '';
    if (!pathname.startsWith('/api/google/')) return next();
    const core = coreOverride ?? getSharedGoogleOAuthCore();

    // Guard 1: loopback socket peer (the Host header can be forged by a LAN client).
    if (!isLoopbackPeer(req.socket?.remoteAddress)) {
      return sendJson(res, 403, { error: 'Forbidden: non-loopback client is blocked' });
    }
    // Guard 2: allowlisted loopback Host.
    const host = req.headers['host'];
    if (!isAllowlistedLoopbackHost(typeof host === 'string' ? host : undefined)) {
      return sendJson(res, 403, { error: 'Forbidden: allowlisted loopback host required' });
    }

    if (pathname === '/api/google/oauth/callback') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
      const q = new URLSearchParams(rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '');
      const code = q.get('code');
      const state = q.get('state');
      if (q.get('error')) {
        return sendHtml(res, 400, 'Google Calendar was not connected', 'Consent was not given. Nothing was stored.');
      }
      if (!code || !state || code.length > 2048 || !/^[a-f0-9]{32}$/.test(state)) {
        return sendHtml(res, 400, 'Google Calendar was not connected', CALLBACK_ERRORS['invalid_state']!);
      }
      const result = await core.exchangeCode(code, state, readCookie(req, GOOGLE_SESSION_COOKIE));
      if (!result.ok) {
        return sendHtml(res, 400, 'Google Calendar was not connected', CALLBACK_ERRORS[result.error] ?? CALLBACK_ERRORS['exchange_failed']!);
      }
      res.writeHead(302, { Location: '/?tab=connectors&google=connected', 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    // Guard 3 (API routes): same-origin only.
    const origin = req.headers['origin'];
    if (typeof origin === 'string' && !isLocalUrl(origin)) {
      return sendJson(res, 403, { error: 'Forbidden: cross-origin access is blocked' });
    }
    const referer = req.headers['referer'];
    if (typeof referer === 'string' && !isLocalUrl(referer)) {
      return sendJson(res, 403, { error: 'Forbidden: non-local referer is blocked' });
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      return sendJson(res, 403, { error: 'Forbidden: cross-site requests are blocked' });
    }

    if (pathname === '/api/google/status') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
      return sendJson(res, 200, core.status());
    }

    if (pathname === '/api/google/oauth/start') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' });
      if (!core.config.configured) {
        return sendJson(res, 409, { error: 'Google sign-in is not set up', disabledReason: core.config.disabledReason });
      }
      const redirectUri = buildGoogleRedirectUri(typeof host === 'string' ? host : undefined);
      if (!redirectUri) {
        return sendJson(res, 403, {
          error: 'Google sign-in works only from http://localhost:4173, :4174 or :5173 (the registered redirect URIs)',
        });
      }
      const sessionId = readCookie(req, GOOGLE_SESSION_COOKIE) ?? generateOpaqueId();
      const { authUrl } = core.createAuthUrl({ sessionId, redirectUri, services: ['calendar'] });
      return sendJson(res, 200, { authUrl }, {
        'Set-Cookie': `${GOOGLE_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=600`,
      });
    }

    if (pathname === '/api/google/disconnect') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' });
      await core.disconnect();
      return sendJson(res, 200, core.status());
    }

    return sendJson(res, 404, { error: 'Endpoint not found' });
  };
}
