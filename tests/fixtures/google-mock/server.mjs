// D11-GCAL-OAUTH recorded Google mock for e2e (loopback only, never reaches Google).
// Serves: consent redirect, token (code + refresh), revoke, Calendar events.list, and an iCal feed
// carrying the SAME events, so the e2e can compare the Google path with the iCal path.
// It verifies PKCE S256, the redirect URI and the client credentials like the real endpoint would.
// Control: POST /__mock/mode {"revoked":true} makes the API 401 and refresh 400; GET /__mock/log.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.GOOGLE_MOCK_PORT || 4291);
const CLIENT_ID = 'test-client-d11.apps.example';
const CLIENT_SECRET = 'test-secret-d11-SHOULD-NEVER-LEAK';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

const codes = new Map();
const log = { authorize: 0, exchange: 0, refresh: 0, revoke: 0, events: 0, pkceFailures: 0 };
let revoked = false;
let accessSeq = 0;

// Events anchored to "now" so they fall inside the app's planning window.
function eventsNow() {
  const base = Date.now();
  const hourStart = base - (base % 3600_000);
  const a = new Date(hourStart + 2 * 3600_000);
  const aEnd = new Date(hourStart + 3 * 3600_000);
  const b = new Date(hourStart + 5 * 3600_000);
  const bEnd = new Date(hourStart + 5 * 3600_000 + 30 * 60_000);
  const day = new Date(base).toISOString().slice(0, 10);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  return [
    { uid: 'd11-piano-uid', title: 'Piano lesson', location: '1 Music Ave', start: a, end: aEnd },
    { uid: 'd11-call-uid', title: 'Team call', start: b, end: bEnd },
    { uid: 'd11-day-uid', title: 'Culture Day', allDay: true, day, next },
  ];
}

const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function icsFeed() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yori d11 mock//EN'];
  for (const e of eventsNow()) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `SUMMARY:${e.title}`);
    if (e.location) lines.push(`LOCATION:${e.location}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${e.day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${e.next.replace(/-/g, '')}`);
    else lines.push(`DTSTART:${icsStamp(e.start)}`, `DTEND:${icsStamp(e.end)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function googleItems() {
  return eventsNow().map((e, i) => ({
    id: `evt${i}`,
    iCalUID: e.uid,
    status: 'confirmed',
    summary: e.title,
    ...(e.location ? { location: e.location } : {}),
    start: e.allDay ? { date: e.day } : { dateTime: e.start.toISOString().replace('Z', '+00:00') },
    end: e.allDay ? { date: e.next } : { dateTime: e.end.toISOString().replace('Z', '+00:00') },
  }));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => resolve(b));
  });
}
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/o/oauth2/v2/auth' && req.method === 'GET') {
      log.authorize += 1;
      const q = url.searchParams;
      const redirect = q.get('redirect_uri') || '';
      const okRedirect = /^http:\/\/localhost:(4173|4174|5173)\/api\/google\/oauth\/callback$/.test(redirect);
      if (q.get('client_id') !== CLIENT_ID || !okRedirect || q.get('code_challenge_method') !== 'S256' || q.get('scope') !== SCOPE || !q.get('code_challenge')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('mock: bad authorization request');
        return;
      }
      const code = `4/MOCK-${crypto.randomBytes(6).toString('hex')}`;
      codes.set(code, { challenge: q.get('code_challenge'), redirect });
      // Simulated consent: straight back to the app with code + state.
      res.writeHead(302, { Location: `${redirect}?code=${encodeURIComponent(code)}&state=${q.get('state')}&scope=${encodeURIComponent(SCOPE)}` });
      res.end();
      return;
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const p = new URLSearchParams(await readBody(req));
      if (p.get('client_id') !== CLIENT_ID || p.get('client_secret') !== CLIENT_SECRET) return json(res, 401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') {
        log.exchange += 1;
        const entry = codes.get(p.get('code') || '');
        codes.delete(p.get('code') || '');
        const verifier = p.get('code_verifier') || '';
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        if (!entry || entry.challenge !== challenge || entry.redirect !== p.get('redirect_uri')) {
          log.pkceFailures += 1;
          return json(res, 400, { error: 'invalid_grant' });
        }
        revoked = false;
        accessSeq += 1;
        return json(res, 200, { access_token: `ya29.MOCK-${accessSeq}`, refresh_token: '1//MOCK-REFRESH', expires_in: 3599, scope: SCOPE, token_type: 'Bearer' });
      }
      if (p.get('grant_type') === 'refresh_token') {
        log.refresh += 1;
        if (revoked) return json(res, 400, { error: 'invalid_grant' });
        accessSeq += 1;
        return json(res, 200, { access_token: `ya29.MOCK-${accessSeq}`, expires_in: 3599, scope: SCOPE, token_type: 'Bearer' });
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    if (url.pathname === '/revoke' && req.method === 'POST') {
      log.revoke += 1;
      revoked = true;
      return json(res, 200, {});
    }
    if (url.pathname === '/calendar/v3/calendars/primary/events' && req.method === 'GET') {
      log.events += 1;
      if (revoked || !/^Bearer ya29\.MOCK-\d+$/.test(req.headers['authorization'] || '')) return json(res, 401, { error: { code: 401 } });
      return json(res, 200, { items: googleItems() });
    }
    if (url.pathname === '/feed.ics' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/calendar' });
      res.end(icsFeed());
      return;
    }
    if (url.pathname === '/__mock/mode' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (typeof body.revoked === 'boolean') revoked = body.revoked;
      return json(res, 200, { revoked });
    }
    if (url.pathname === '/__mock/log') return json(res, 200, { ...log, revoked });
    if (url.pathname === '/') return json(res, 200, { ok: true });
    json(res, 404, { error: 'not found' });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`google mock on 127.0.0.1:${PORT}`));
