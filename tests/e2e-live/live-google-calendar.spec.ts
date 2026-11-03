/**
 * D11-GCAL-OAUTH recorded e2e (DEMO_RESCUE rev12, TID INBOX-20261103-593C70).
 * Runs against the 5173 preview server whose Google endpoints all point at the loopback mock
 * (tests/fixtures/google-mock/server.mjs): consent, token exchange (PKCE S256 verified by the mock),
 * refresh, revoke and events.list are recorded responses; zero live Google calls. The mock also
 * serves an iCal feed with the SAME events, so the Google path is compared with the iCal path.
 * Lifecycle in one ordered test (the server keeps tokens in memory): connect -> parity -> replayed
 * callback refused -> revoked/expired -> iCal fallback -> reconnect -> disconnect -> leak scan.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const APP = 'http://localhost:5173';
const MOCK = 'http://127.0.0.1:4291';
const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d11');
const SECRETS = ['test-secret-d11-SHOULD-NEVER-LEAK', 'ya29.MOCK', '1//MOCK-REFRESH', 'code_verifier', '4/MOCK-'];
const HOSTS = ['oauth2.googleapis.com', 'accounts.google.com', 'www.googleapis.com/calendar'];

const pick = (e: any) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, location: e.location, allDay: e.allDay });

async function mockLog(page: Page) {
  return (await page.request.get(`${MOCK}/__mock/log`)).json();
}

async function openConnectors(page: Page, query = '') {
  await page.goto(`${APP}/?tab=connectors${query}`);
  await expect(page.locator('#connector-row-calendar')).toBeVisible({ timeout: 15000 });
}

test.describe('D11-GCAL-OAUTH: Google Calendar connector (recorded)', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'one ordered lifecycle against one server; run once');
  });

  test('connect -> parity with iCal -> replay refused -> expired falls back to iCal -> reconnect -> disconnect; nothing leaks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pageRequests: string[] = [];
    page.on('request', r => pageRequests.push(r.url()));
    const callbackUrls: string[] = [];
    page.on('request', r => {
      if (r.url().startsWith(`${APP}/api/google/oauth/callback`)) callbackUrls.push(r.url());
    });
    expect(await mockLog(page)).toMatchObject({ exchange: 0, revoke: 0 });

    // 1. Before connecting: the iCal feed is the calendar; Google offers Connect with the disclosure.
    await openConnectors(page);
    const row = page.locator('#connector-google-calendar');
    await expect(row).toHaveAttribute('data-google-state', 'disconnected');
    await expect(page.locator('#google-calendar-detail')).toHaveText('Not connected');
    await expect(page.locator('#google-calendar-disclosure')).toHaveText('Calendar events are read from Google, read-only. Yori never changes your calendar.');
    await expect(page.locator('#connector-detail-calendar')).toHaveText('iCalendar feed connected (read-only)');
    const icsPayload = await (await page.request.get(`${APP}/api/calendar`)).json();
    expect(icsPayload.attribution).toBe('iCalendar (RFC 5545)');
    expect(icsPayload.events).toHaveLength(3);

    // 2. Connect: server-side PKCE -> (recorded) consent -> callback -> back on Connectors.
    await page.locator('#btn-connect-google-calendar').click();
    await page.waitForURL(`${APP}/?tab=connectors&google=connected`, { timeout: 15000 });
    await expect(row).toHaveAttribute('data-google-state', 'connected', { timeout: 10000 });
    await expect(page.locator('#google-calendar-detail')).toHaveText('Connected · read-only');
    await expect(page.locator('#connector-detail-calendar')).toHaveText('Google Calendar connected (read-only)');
    await expect(page.locator('#btn-disconnect-google-calendar')).toBeVisible();
    expect(await mockLog(page)).toMatchObject({ authorize: 1, exchange: 1, pkceFailures: 0 });
    await page.locator('#connector-row-calendar').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd11-connected-390x844.png') });

    // 3. CalendarEvent parity: the Google path yields the same events the iCal path did.
    const g = await (await page.request.get(`${APP}/api/calendar`)).json();
    expect(g).toMatchObject({ enabled: true, configured: true, provider: 'google_calendar', attribution: 'Google Calendar (read-only)' });
    expect(g.events.map(pick)).toEqual(icsPayload.events.map(pick));
    expect(g.events.every((e: any) => e.provenance === 'google_calendar')).toBe(true);
    const status = await (await page.request.get(`${APP}/api/google/status`)).json();
    expect(status).toEqual({ configured: true, calendar: 'connected' });

    // 4. Replaying the callback (same code + state) is refused with no second exchange.
    expect(callbackUrls).toHaveLength(1);
    const replay = await page.request.get(callbackUrls[0]!, { maxRedirects: 0 });
    expect(replay.status()).toBe(400);
    expect(await mockLog(page)).toMatchObject({ exchange: 1 });

    // 5. Revoked at Google (or the Testing-mode 7-day refresh expiry): API 401 + refresh refused
    //    -> the grant is dropped and the iCal feed answers again, labelled iCal.
    await page.request.post(`${MOCK}/__mock/mode`, { data: { revoked: true } });
    const afterRevoke = await (await page.request.get(`${APP}/api/calendar`)).json();
    expect(afterRevoke).toMatchObject({ attribution: 'iCalendar (RFC 5545)', google: { configured: true, calendar: 'expired' } });
    expect(afterRevoke.events.map(pick)).toEqual(icsPayload.events.map(pick));
    expect(afterRevoke.events.some((e: any) => e.provenance === 'google_calendar')).toBe(false);
    await openConnectors(page);
    await expect(row).toHaveAttribute('data-google-state', 'expired');
    await expect(page.locator('#google-calendar-detail')).toHaveText('Access expired · using your iCalendar feed instead');
    await expect(page.locator('#connector-detail-calendar')).toHaveText('iCalendar feed connected (read-only)');
    await page.locator('#connector-row-calendar').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd11-expired-ical-fallback-390x844.png') });

    // 6. Reconnect, then Disconnect: revoked at Google, tokens deleted, iCal again.
    await page.locator('#btn-connect-google-calendar').click();
    await page.waitForURL(`${APP}/?tab=connectors&google=connected`, { timeout: 15000 });
    await expect(row).toHaveAttribute('data-google-state', 'connected', { timeout: 10000 });
    await page.locator('#btn-disconnect-google-calendar').click();
    await expect(row).toHaveAttribute('data-google-state', 'disconnected', { timeout: 10000 });
    await expect(page.locator('#google-calendar-detail')).toHaveText('Not connected');
    expect(await mockLog(page)).toMatchObject({ exchange: 2, revoke: 1 });
    const afterDisconnect = await (await page.request.get(`${APP}/api/calendar`)).json();
    expect(afterDisconnect.attribution).toBe('iCalendar (RFC 5545)');
    expect(fs.existsSync('test-results/d11-google-oauth-tokens.json')).toBe(false);

    // 7. Leak scan: page HTML, every same-origin script, and every page request URL.
    const html = await page.content();
    const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src));
    const bundles = await Promise.all(scripts.filter(u => u.startsWith('http://localhost:5173/')).map(async u => (await page.request.get(u)).text()));
    for (const text of [html, ...bundles]) {
      for (const s of [...SECRETS, ...HOSTS]) expect(text, s).not.toContain(s);
    }
    for (const u of pageRequests) {
      for (const s of SECRETS) expect(u, s).not.toContain(s);
      expect(u).not.toContain('client_secret');
    }
    // The page itself never calls Google: only the consent redirect goes to the (mock) authorize URL.
    expect(pageRequests.filter(u => u.startsWith(MOCK)).every(u => u.startsWith(`${MOCK}/o/oauth2/v2/auth`))).toBe(true);
  });
});
