/**
 * D11-GCAL-OAUTH boundary tests (DEMO_RESCUE rev12, TID INBOX-20261103-593C70).
 * Recorded only: every Google token / revoke / Calendar response is an injected fetch; zero live
 * calls (netguard also blocks any real non-loopback fetch).
 * - Core: PKCE S256, exact read-only scope with incremental grants, single-use session-bound state
 *   with TTL, 0600 token file, in-proxy refresh, expiry -> 'expired', disconnect revokes + deletes.
 * - Routes: loopback peer + Host allowlist + Origin guards; bad/replayed state -> 400 with no
 *   exchange; LAN peer / non-allowlisted Host -> 403; missing client id -> disabled, honest label.
 * - /api/calendar: unconfigured is byte-identical to the iCal-only build; connected -> Google events
 *   with provenance google_calendar and parity with the iCal mapping; 401 -> one refresh -> expired
 *   -> iCal fallback, else no calendar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GoogleOAuthCore,
  GOOGLE_SCOPES,
  buildGoogleRedirectUri,
  resolveGoogleOAuthConfig,
  setSharedGoogleOAuthCoreForTests,
} from '../../src/adapters/google/oauth-core.js';
import { createGoogleProxyMiddleware, GOOGLE_SESSION_COOKIE } from '../../src/adapters/google/server-proxy.js';
import { mapGoogleCalendarItems, buildGoogleEventsListUrl } from '../../src/adapters/google/calendar-events.js';
import { createCalendarProxyMiddleware } from '../../src/adapters/providers/server-proxy.js';
import { IcsCalendarAdapter } from '../../src/adapters/providers/ics-calendar-adapter.js';

const CLIENT_ID = 'test-client-d11.apps.example';
const CLIENT_SECRET = 'test-secret-d11-SHOULD-NEVER-LEAK';
const ACCESS = 'ya29.TEST-ACCESS-d11';
const REFRESH = '1//TEST-REFRESH-d11';
const T0 = Date.parse('2026-11-03T03:00:00.000Z');

let tmp: string;
let tokenPath: string;

function env(extra: Record<string, string> = {}) {
  return { GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET, GOOGLE_OAUTH_TOKEN_PATH: tokenPath, ...extra };
}

interface Recorded {
  calls: { url: string; body: string; auth?: string }[];
  fetchFn: typeof fetch;
}

/** Recorded Google: token endpoint, revoke endpoint, Calendar events.list. */
function recordedGoogle(opts: { token?: number[]; events?: number[]; items?: unknown[]; refreshStatus?: number } = {}): Recorded {
  const calls: Recorded['calls'] = [];
  const tokenStatuses = [...(opts.token ?? [200])];
  const eventStatuses = [...(opts.events ?? [200])];
  const fetchFn = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body, auth: init?.headers?.Authorization });
    const json = (status: number, b: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => b, text: async () => JSON.stringify(b) }) as any;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const grant = new URLSearchParams(body).get('grant_type');
      if (grant === 'refresh_token') {
        const st = opts.refreshStatus ?? 200;
        return st === 200 ? json(200, { access_token: `${ACCESS}-refreshed`, expires_in: 3600 }) : json(st, { error: 'invalid_grant' });
      }
      const st = tokenStatuses.shift() ?? 200;
      return st === 200
        ? json(200, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599, scope: GOOGLE_SCOPES.calendar, token_type: 'Bearer' })
        : json(st, { error: 'invalid_grant' });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return json(200, {});
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
      const st = eventStatuses.shift() ?? 200;
      return st === 200 ? json(200, { items: opts.items ?? GOOGLE_ITEMS }) : json(st, { error: { code: st } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

// The same three events as ICS_TEXT below, as Google returns them.
const GOOGLE_ITEMS = [
  { id: 'evt1', iCalUID: 'piano-1-uid', status: 'confirmed', summary: 'Piano lesson', location: '1 Music Ave', start: { dateTime: '2026-11-03T15:00:00+09:00', timeZone: 'Asia/Tokyo' }, end: { dateTime: '2026-11-03T16:00:00+09:00' } },
  { id: 'evt2', iCalUID: 'holiday-2-uid', status: 'confirmed', summary: 'Culture Day', start: { date: '2026-11-03' }, end: { date: '2026-11-04' } },
  { id: 'evt3', iCalUID: 'call-3-uid', status: 'confirmed', summary: '', start: { dateTime: '2026-11-03T06:30:00Z' }, end: { dateTime: '2026-11-03T07:00:00Z' } },
  { id: 'evt4', iCalUID: 'gone-4-uid', status: 'cancelled', summary: 'Cancelled sync', start: { dateTime: '2026-11-03T08:00:00Z' } },
];
const ICS_TEXT = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:piano-1-uid', 'SUMMARY:Piano lesson', 'LOCATION:1 Music Ave', 'DTSTART;TZID=Asia/Tokyo:20261103T150000', 'DTEND;TZID=Asia/Tokyo:20261103T160000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:holiday-2-uid', 'SUMMARY:Culture Day', 'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261104', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:call-3-uid', 'SUMMARY:', 'DTSTART:20261103T063000Z', 'DTEND:20261103T070000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gone-4-uid', 'SUMMARY:Cancelled sync', 'STATUS:CANCELLED', 'DTSTART:20261103T080000Z', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function reqRes(url: string, opts: { method?: string; host?: string; peer?: string | null; headers?: Record<string, string> } = {}) {
  const req: any = {
    url,
    method: opts.method ?? 'GET',
    headers: { host: opts.host ?? 'localhost:4173', ...(opts.headers ?? {}) },
    socket: opts.peer === null ? {} : { remoteAddress: opts.peer ?? '127.0.0.1' },
  };
  const out = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res: any = {
    writeHead: (s: number, h: Record<string, string> = {}) => { out.status = s; out.headers = { ...out.headers, ...h }; },
    end: (b?: string) => { if (b) out.body = b; },
  };
  return { req, res, next: vi.fn(), out };
}

/** Runs start -> (simulated Google consent) -> callback and returns the pieces. */
async function connect(core: GoogleOAuthCore) {
  const mw = createGoogleProxyMiddleware(core);
  const start = reqRes('/api/google/oauth/start', { method: 'POST' });
  await mw(start.req, start.res, start.next);
  const authUrl = new URL(JSON.parse(start.out.body).authUrl);
  const cookie = start.out.headers['Set-Cookie']!.split(';')[0]!;
  const state = authUrl.searchParams.get('state')!;
  const cb = reqRes(`/api/google/oauth/callback?code=4%2FTEST-CODE&state=${state}`, { headers: { cookie } });
  await mw(cb.req, cb.res, cb.next);
  return { mw, start, authUrl, cookie, state, cb };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-d11-'));
  tokenPath = path.join(tmp, 'google-oauth-tokens.json');
  delete process.env['CALENDAR_LIVE_ENABLED'];
});
afterEach(() => {
  setSharedGoogleOAuthCoreForTests(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('D11 Google OAuth core', () => {
  it('config: missing client id / owner off / non-loopback override -> disabled with a reason', () => {
    expect(resolveGoogleOAuthConfig({})).toMatchObject({ configured: false, disabledReason: 'no_client_id' });
    expect(resolveGoogleOAuthConfig(env({ GOOGLE_OAUTH_ENABLED: 'false' }))).toMatchObject({ configured: false, disabledReason: 'owner_off' });
    expect(resolveGoogleOAuthConfig(env({ GOOGLE_OAUTH_TOKEN_URL: 'https://evil.example/token' }))).toMatchObject({ configured: false, disabledReason: 'endpoint_override_rejected' });
    expect(resolveGoogleOAuthConfig(env({ GOOGLE_OAUTH_TOKEN_URL: 'http://127.0.0.1:4291/token' }))).toMatchObject({ configured: true, tokenUrl: 'http://127.0.0.1:4291/token' });
    expect(resolveGoogleOAuthConfig(env())).toMatchObject({ configured: true, tokenUrl: 'https://oauth2.googleapis.com/token' });
  });

  it('redirect URI only from http://localhost on an allowlisted port', () => {
    expect(buildGoogleRedirectUri('localhost:4173')).toBe('http://localhost:4173/api/google/oauth/callback');
    expect(buildGoogleRedirectUri('localhost:4174')).toBe('http://localhost:4174/api/google/oauth/callback');
    expect(buildGoogleRedirectUri('localhost:5173')).toBe('http://localhost:5173/api/google/oauth/callback');
    for (const bad of ['127.0.0.1:4173', 'localhost:4283', '192.168.31.45:4443', 'evil.example:4173', 'localhost', undefined]) {
      expect(buildGoogleRedirectUri(bad as any), String(bad)).toBeNull();
    }
  });

  it('auth URL: PKCE S256, exact read-only scope, incremental, offline; verifier matches the challenge at exchange', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    const { authUrl, state } = core.createAuthUrl({ sessionId: 'a'.repeat(32), redirectUri: 'http://localhost:4173/api/google/oauth/callback', services: ['calendar'] });
    const u = new URL(authUrl);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events.readonly');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('include_granted_scopes')).toBe('true');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(authUrl).not.toContain(CLIENT_SECRET);
    expect(await core.exchangeCode('4/TEST-CODE', state, 'a'.repeat(32))).toEqual({ ok: true });
    const body = new URLSearchParams(g.calls[0]!.body);
    const verifier = body.get('code_verifier')!;
    expect(crypto.createHash('sha256').update(verifier).digest('base64url')).toBe(u.searchParams.get('code_challenge'));
    expect(body.get('redirect_uri')).toBe('http://localhost:4173/api/google/oauth/callback');
    expect(body.get('client_secret')).toBe(CLIENT_SECRET); // server-to-Google only
  });

  it('state is single use, session bound and expires; no exchange on any failure', async () => {
    const g = recordedGoogle();
    let now = T0;
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => now);
    const sid = 'b'.repeat(32);
    const mk = () => core.createAuthUrl({ sessionId: sid, redirectUri: 'http://localhost:4173/api/google/oauth/callback', services: ['calendar'] }).state;
    expect(await core.exchangeCode('c', 'f'.repeat(32), sid)).toEqual({ ok: false, error: 'invalid_state' });
    const s1 = mk();
    expect(await core.exchangeCode('c', s1, 'c'.repeat(32))).toEqual({ ok: false, error: 'session_mismatch' });
    expect(await core.exchangeCode('c', s1, sid)).toEqual({ ok: false, error: 'invalid_state' }); // consumed
    const s2 = mk();
    now += 10 * 60_000 + 1;
    expect(await core.exchangeCode('c', s2, sid)).toEqual({ ok: false, error: 'expired_state' });
    expect(g.calls).toHaveLength(0);
    const s3 = mk();
    expect(await core.exchangeCode('c', s3, sid)).toEqual({ ok: true });
    expect(await core.exchangeCode('c', s3, sid)).toEqual({ ok: false, error: 'invalid_state' }); // replay
    expect(g.calls).toHaveLength(1);
  });

  it('tokens: 0600 file, status booleans only, refresh in proxy, refused refresh -> expired and file deleted', async () => {
    const g = recordedGoogle({ refreshStatus: 400 });
    let now = T0;
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => now);
    const sid = 'd'.repeat(32);
    const { state } = core.createAuthUrl({ sessionId: sid, redirectUri: 'http://localhost:4174/api/google/oauth/callback', services: ['calendar'] });
    await core.exchangeCode('c', state, sid);
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
    expect(core.status()).toEqual({ configured: true, calendar: 'connected' });
    expect(JSON.stringify(core.status())).not.toMatch(/ya29|1\/\/|@/);
    expect(await core.getAccessToken(GOOGLE_SCOPES.calendar)).toBe(ACCESS);
    // A restart reads the fallback file.
    const restarted = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => now);
    expect(restarted.status().calendar).toBe('connected');
    now += 3600_000;
    expect(await core.getAccessToken(GOOGLE_SCOPES.calendar)).toBeNull();
    expect(new URLSearchParams(g.calls.at(-1)!.body).get('grant_type')).toBe('refresh_token');
    expect(core.status()).toEqual({ configured: true, calendar: 'expired' });
    expect(fs.existsSync(tokenPath)).toBe(false);
  });

  it('refresh success keeps the grant; disconnect revokes at Google and deletes every copy', async () => {
    const g = recordedGoogle();
    let now = T0;
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => now);
    const sid = 'e'.repeat(32);
    const { state } = core.createAuthUrl({ sessionId: sid, redirectUri: 'http://localhost:4173/api/google/oauth/callback', services: ['calendar'] });
    await core.exchangeCode('c', state, sid);
    now += 3600_000;
    expect(await core.getAccessToken(GOOGLE_SCOPES.calendar)).toBe(`${ACCESS}-refreshed`);
    await core.disconnect();
    const revoke = g.calls.find(c => c.url.startsWith('https://oauth2.googleapis.com/revoke'))!;
    expect(new URLSearchParams(revoke.body).get('token')).toBe(REFRESH);
    expect(fs.existsSync(tokenPath)).toBe(false);
    expect(core.status()).toEqual({ configured: true, calendar: 'disconnected' });
  });
});

describe('D11 /api/google routes', () => {
  it('connect flow: start sets an HttpOnly session cookie; callback exchanges once and redirects', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    const { start, cb, cookie } = await connect(core);
    expect(start.out.status).toBe(200);
    expect(start.out.headers['Set-Cookie']).toMatch(new RegExp(`^${GOOGLE_SESSION_COOKIE}=[a-f0-9]{32}; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=600$`));
    expect(start.out.body).not.toContain(CLIENT_SECRET);
    expect(cb.out.status).toBe(302);
    expect(cb.out.headers['Location']).toBe('/?tab=connectors&google=connected');
    expect(g.calls.filter(c => c.url.includes('/token'))).toHaveLength(1);
    const st = reqRes('/api/google/status');
    await createGoogleProxyMiddleware(core)(st.req, st.res, st.next);
    expect(JSON.parse(st.out.body)).toEqual({ configured: true, calendar: 'connected' });
    expect(st.out.body).not.toMatch(/ya29|1\/\/|secret|@/i);
    expect(cookie).toMatch(new RegExp(`^${GOOGLE_SESSION_COOKIE}=`));
  });

  it('bad or replayed state -> 400 with no exchange; missing cookie -> 400 with no exchange', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    const { mw, state, cookie } = await connect(core);
    const tokenCalls = () => g.calls.filter(c => c.url.includes('/token')).length;
    expect(tokenCalls()).toBe(1);
    for (const url of [
      `/api/google/oauth/callback?code=x&state=${state}`, // replay
      `/api/google/oauth/callback?code=x&state=${'0'.repeat(32)}`, // unknown
      '/api/google/oauth/callback?code=x&state=not-hex',
      '/api/google/oauth/callback?state=' + '1'.repeat(32), // no code
    ]) {
      const r = reqRes(url, { headers: { cookie } });
      await mw(r.req, r.res, r.next);
      expect(r.out.status, url).toBe(400);
    }
    // A fresh state without the session cookie (another browser) is refused too.
    const s2 = reqRes('/api/google/oauth/start', { method: 'POST' });
    await mw(s2.req, s2.res, s2.next);
    const st2 = new URL(JSON.parse(s2.out.body).authUrl).searchParams.get('state');
    const noCookie = reqRes(`/api/google/oauth/callback?code=x&state=${st2}`);
    await mw(noCookie.req, noCookie.res, noCookie.next);
    expect(noCookie.out.status).toBe(400);
    expect(tokenCalls()).toBe(1);
  });

  it('LAN peer (even with a forged localhost Host) and non-allowlisted Host -> 403 on every route; no exchange', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    const mw = createGoogleProxyMiddleware(core);
    const routes: [string, string][] = [
      ['/api/google/status', 'GET'],
      ['/api/google/oauth/start', 'POST'],
      [`/api/google/oauth/callback?code=x&state=${'2'.repeat(32)}`, 'GET'],
      ['/api/google/disconnect', 'POST'],
    ];
    for (const [url, method] of routes) {
      for (const probe of [
        { peer: '192.168.31.45', host: 'localhost:4174' },
        { peer: '::ffff:192.168.31.45', host: 'localhost:4173' },
        { peer: null, host: 'localhost:4173' },
        { peer: '127.0.0.1', host: '192.168.31.45:4443' },
        { peer: '127.0.0.1', host: 'localhost:4283' },
        { peer: '127.0.0.1', host: 'evil.example:4173' },
      ]) {
        const r = reqRes(url, { method, ...probe });
        await mw(r.req, r.res, r.next);
        expect(r.out.status, `${url} ${JSON.stringify(probe)}`).toBe(403);
      }
    }
    expect(g.calls).toHaveLength(0);
  });

  it('start from a non-registrable loopback origin (127.0.0.1) or cross-origin -> 403; missing client id -> 409', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    const mw = createGoogleProxyMiddleware(core);
    const ip = reqRes('/api/google/oauth/start', { method: 'POST', host: '127.0.0.1:4173' });
    await mw(ip.req, ip.res, ip.next);
    expect(ip.out.status).toBe(403);
    const xo = reqRes('/api/google/oauth/start', { method: 'POST', headers: { origin: 'https://evil.example' } });
    await mw(xo.req, xo.res, xo.next);
    expect(xo.out.status).toBe(403);
    const off = createGoogleProxyMiddleware(new GoogleOAuthCore(resolveGoogleOAuthConfig({}), g.fetchFn, () => T0));
    const s = reqRes('/api/google/oauth/start', { method: 'POST' });
    await off(s.req, s.res, s.next);
    expect(s.out.status).toBe(409);
    expect(JSON.parse(s.out.body)).toMatchObject({ disabledReason: 'no_client_id' });
    const st = reqRes('/api/google/status');
    await off(st.req, st.res, st.next);
    expect(JSON.parse(st.out.body)).toEqual({ configured: false, disabledReason: 'no_client_id', calendar: 'disconnected' });
    expect(g.calls).toHaveLength(0);
  });
});

describe('D11 /api/calendar source selection', () => {
  const icsAdapter = () =>
    new IcsCalendarAdapter({
      defaultTimezone: 'Asia/Tokyo',
      fetchFn: (async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => ICS_TEXT })) as any,
    });
  const icsConfig = { enabled: true, configured: true, icsUrl: 'http://127.0.0.1:9/feed.ics', defaultTimezone: 'Asia/Tokyo' };

  async function call(mw: any, url: string) {
    const r = reqRes(url);
    await mw(r.req, r.res, r.next);
    return { status: r.out.status, body: r.out.body };
  }

  it('Google mapping has parity with the iCal mapping for the same events', async () => {
    const ics = await icsAdapter().fetchAndParse('x');
    const google = mapGoogleCalendarItems(GOOGLE_ITEMS);
    const pick = (e: any) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, location: e.location, allDay: e.allDay });
    expect(google.map(pick)).toEqual(ics.map(pick));
    expect(google.every(e => e.provenance === 'google_calendar')).toBe(true);
    const url = new URL(buildGoogleEventsListUrl('https://www.googleapis.com', T0));
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('timeMin')).toBe('2026-11-03T01:00:00.000Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-11-04T03:00:00.000Z');
    expect(url.searchParams.get('fields')).toBe('items(id,iCalUID,status,summary,location,start,end)');
  });

  it('no Google client configured: /api/calendar output is byte-identical to the iCal-only build', async () => {
    const off = new GoogleOAuthCore(resolveGoogleOAuthConfig({}), recordedGoogle().fetchFn);
    for (const cfg of [icsConfig, { enabled: false, configured: false, icsUrl: null }]) {
      setSharedGoogleOAuthCoreForTests(null);
      const baseline = createCalendarProxyMiddleware(cfg as any, icsAdapter()); // shared core: env has no client id
      const withOff = createCalendarProxyMiddleware(cfg as any, icsAdapter(), { core: off });
      for (const url of ['/api/calendar/status', '/api/calendar']) {
        expect(await call(withOff, url)).toEqual(await call(baseline, url));
      }
    }
  });

  it('connected: Google events (provenance google_calendar); 401 -> refresh -> retry; 401 again -> expired -> iCal, else none', async () => {
    const g = recordedGoogle({ events: [200, 401, 200, 401, 401] });
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    await connect(core);
    const withIcs = createCalendarProxyMiddleware(icsConfig as any, icsAdapter(), { core, fetchFn: g.fetchFn });
    const status = JSON.parse((await call(withIcs, '/api/calendar/status')).body);
    expect(status).toMatchObject({ enabled: true, configured: true, provider: 'google_calendar', attribution: 'Google Calendar (read-only)' });
    const first = JSON.parse((await call(withIcs, '/api/calendar')).body);
    expect(first.provider).toBe('google_calendar');
    expect(first.events.map((e: any) => e.provenance)).toEqual(['google_calendar', 'google_calendar', 'google_calendar']);
    expect(g.calls.find(c => c.url.includes('/calendar/v3/'))!.auth).toBe(`Bearer ${ACCESS}`);
    // 401 then success after one refresh.
    const second = JSON.parse((await call(withIcs, '/api/calendar')).body);
    expect(second.provider).toBe('google_calendar');
    expect(g.calls.some(c => new URLSearchParams(c.body).get('grant_type') === 'refresh_token')).toBe(true);
    // 401 twice: the grant is rejected; iCal underneath answers, labelled iCal, flagged expired.
    const third = JSON.parse((await call(withIcs, '/api/calendar')).body);
    expect(third).toMatchObject({ enabled: true, configured: true, attribution: 'iCalendar (RFC 5545)', google: { configured: true, calendar: 'expired' } });
    expect(third.events.every((e: any) => e.provenance === undefined)).toBe(true);
    expect(core.status().calendar).toBe('expired');
    // Without an iCal feed the honest state is "no calendar".
    const none = createCalendarProxyMiddleware({ enabled: false, configured: false, icsUrl: null } as any, icsAdapter(), { core, fetchFn: g.fetchFn });
    expect(JSON.parse((await call(none, '/api/calendar')).body)).toMatchObject({ enabled: false, configured: false, events: [], google: { calendar: 'expired' } });
    expect(JSON.parse((await call(none, '/api/calendar/status')).body)).toMatchObject({ enabled: false, configured: false, google: { calendar: 'expired' } });
  });

  it('owner switch CALENDAR_LIVE_ENABLED=false keeps Google unused even when connected', async () => {
    const g = recordedGoogle();
    const core = new GoogleOAuthCore(resolveGoogleOAuthConfig(env()), g.fetchFn, () => T0);
    await connect(core);
    process.env['CALENDAR_LIVE_ENABLED'] = 'false';
    const mw = createCalendarProxyMiddleware({ enabled: false, configured: false, icsUrl: null } as any, icsAdapter(), { core, fetchFn: g.fetchFn });
    expect(JSON.parse((await call(mw, '/api/calendar')).body)).toMatchObject({ enabled: false, events: [] });
    expect(g.calls.some(c => c.url.includes('/calendar/v3/'))).toBe(false);
  });
});
