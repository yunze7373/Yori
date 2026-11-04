/**
 * D2-LUNCH-DEFAULT-ON device-shaped E2E (DEMO_RESCUE plan, TID INBOX-20261102-1E359B).
 *
 * Recorded provider data: /api/places answers with candidates in the exact shape the real
 * /api/places + OverpassPlacesAdapter produce for a recorded Overpass response
 * (tests/proxy-boundary/places-trio-proxy.test.ts proves that pipeline). No external calls.
 *
 * - Outside the meal window (timezone chosen at runtime so local time is ~18:00), a cold user
 *   (no confirmed taste) grants location: Home stays quiet with a "Nearby now" button. Tapping it
 *   shows real-shaped candidates (OSM id, coords, fetchedAt, straight-line distance, open status
 *   from opening_hours only) with a reason and the ODbL attribution, then detail and handoff.
 * - On-demand refresh after a provider error fires a new request; an Ask ("附近吃什么") during
 *   an in-flight search joins it (single-flight: one request).
 * - Deny and places-off flows: guided card / owner-setting line, zero venues, zero /api/places.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d2');
const FIX = { latitude: 35.689487, longitude: 139.691706 }; // Tokyo-Shinjuku fixture, 6 decimals

/** An Etc/GMT zone where the current local hour is 18 (outside the 11:00-14:30 meal window). */
function eveningTimezone(): string {
  const utcHour = new Date().getUTCHours();
  let offset = (18 - utcHour + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/GMT';
  // Etc/GMT signs are inverted: Etc/GMT-9 is UTC+9.
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}
const TZ = eveningTimezone();

function recordedCandidates() {
  const fetchedAt = new Date().toISOString();
  return [
    {
      placeId: 'overpass-node-4242001',
      osmId: 4242001,
      name: 'Shinjuku Soba Tei',
      cuisine: 'soba',
      category: 'restaurant',
      coords: { lat: 35.6899, lng: 139.6921 },
      source: 'live',
      fetchedAt,
      straightLineDistanceMeters: 56,
      straightLineDistanceLabel: '56 m (straight-line)',
      openingStatus: 'open',
    },
    {
      placeId: 'overpass-way-4242002',
      osmId: 4242002,
      name: 'Nishi Curry House',
      cuisine: 'curry',
      category: 'restaurant',
      coords: { lat: 35.6902, lng: 139.693 },
      source: 'live',
      fetchedAt,
      straightLineDistanceMeters: 136,
      straightLineDistanceLabel: '136 m (straight-line)',
    },
  ];
}

interface Traffic {
  places: string[];
}

interface Options {
  placesEnabled?: boolean;
  placesDelayMs?: number;
  failFirstPlaces?: boolean;
}

async function setup(page: Page, opts: Options = {}): Promise<Traffic> {
  const traffic: Traffic = { places: [] };
  const placesEnabled = opts.placesEnabled ?? true;
  let failNext = Boolean(opts.failFirstPlaces);
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route(
    u => u.pathname === '/api/places/status',
    r =>
      r.fulfill(
        json({
          enabled: placesEnabled,
          provider: 'overpass',
          attribution: 'OpenStreetMap via Overpass (ODbL)',
          outboundHosts: [{ purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' }],
        })
      )
  );
  await page.route(
    u => u.pathname === '/api/places',
    async r => {
      const u = new URL(r.request().url());
      traffic.places.push(u.search);
      if (opts.placesDelayMs) await new Promise(res => setTimeout(res, opts.placesDelayMs));
      if (!placesEnabled) return r.fulfill(json({ enabled: false, places: [] }));
      if (failNext) {
        failNext = false;
        return r.fulfill(json({ error: 'Failed to fetch places' }, 500));
      }
      return r.fulfill(
        json({ enabled: true, places: recordedCandidates(), attribution: 'OpenStreetMap via Overpass (ODbL)' })
      );
    }
  );
  return traffic;
}

async function device(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport,
    timezoneId: TZ,
    permissions: ['geolocation'],
    geolocation: FIX,
    isMobile: viewport.width < 768,
    hasTouch: viewport.width < 768,
  });
  return { context, page: await context.newPage() };
}

async function openLive(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await expect(page.locator('#btn-request-location')).toBeVisible();
}

function expectRoundedOnly(traffic: Traffic) {
  for (const q of traffic.places) {
    const p = new URLSearchParams(q);
    expect(p.get('lat')).toBe('35.689');
    expect(p.get('lng')).toBe('139.692');
    expect(q).not.toContain('35.689487');
  }
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D2-LUNCH-DEFAULT-ON: nearby restaurants visibly work once location is granted', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`Nearby now outside the meal window @${vp.name}: candidates, reason, attribution, detail, handoff`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const traffic = await setup(page);
      await openLive(page);

      // Consent copy names the exact host of the enabled provider (from /api/places/status).
      await expect(page.locator('#location-consent-hosts')).toContainText(
        'sent only to: overpass-api.de/api/interpreter (nearby places)'
      );
      expect(traffic.places).toEqual([]);

      await page.locator('#btn-request-location').click();

      // Outside the meal window a cold user gets no proactive lunch card, only the affordance.
      const nearby = page.locator('#btn-nearby-now');
      await expect(nearby).toBeVisible({ timeout: 10000 });
      await expect(nearby).toHaveText('Nearby now');
      await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
      expect(traffic.places.length).toBe(1);

      await nearby.click();

      const hero = page.locator('.v2-candidate-card').first();
      await expect(hero).toBeVisible({ timeout: 10000 });
      await expect(hero).toHaveAttribute('data-provenance', 'live');
      await expect(hero.locator('.v2-candidate-name')).toHaveText('Shinjuku Soba Tei');
      await expect(hero.locator('.v2-distance-chip')).toHaveText('56 m (straight-line)');
      await expect(hero.locator('.v2-open-chip')).toHaveText('Open now');
      // HABIT-LEARN addendum 2: the card states no reason line; open status shows as its chip.
      await expect(hero.locator('.v2-candidate-basis')).toHaveCount(0);
      await expect(page.locator('.v2-candidates-shelf .v2-open-chip.unknown')).toHaveText('Hours unknown');
      await expect(page.locator('.mock-places-notice').first()).toContainText('OpenStreetMap via Overpass (ODbL)');
      // Within the provider's 10 s interval the tap reused the results just fetched.
      expect(traffic.places.length).toBe(1);
      expectRoundedOnly(traffic);

      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/simulated|Demo profile|Based on taste|· walk\b/i);
      expect(await page.locator('[data-provenance="fixture"]').count()).toBe(0);

      // Home re-renders as async statuses land (weather, model reason) and replaces the card node;
      // retry the scroll on a fresh resolve instead of failing on a detached element (review 2ebf8df1 P3).
      await expect(async () => {
        await hero.scrollIntoViewIfNeeded({ timeout: 1000 });
      }).toPass({ timeout: 8000 });
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d2-lunch-card-${vp.name}.png`) });

      // Detail
      await page.locator('.v2-view-detail-link').first().click();
      await expect(page.locator('.v2-restaurant-detail')).toBeVisible();
      await expect(page.locator('#restaurant-detail-name')).toContainText('Shinjuku Soba Tei');
      await expect(page.locator('.v2-restaurant-detail')).toContainText('OpenStreetMap via Overpass (ODbL)');
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d2-detail-${vp.name}.png`) });
      await page.locator('#restaurant-detail-back-btn').click();

      // Handoff (verified navigate URL to the candidate's OSM coordinates)
      await page.locator('.v2-directions-btn').first().click();
      const modal = page.locator('#navigate-confirm-modal');
      await expect(modal).toBeVisible();
      await expect(page.locator('#navigate-verified-url')).toContainText('35.6899');
      await expect(page.locator('#navigate-verified-url')).toContainText('139.6921');
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d2-handoff-${vp.name}.png`) });

      await context.close();
    });
  }

  test('on-demand refresh after a provider error fires a new request (no 10 s reuse of an error)', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const traffic = await setup(page, { failFirstPlaces: true });
    await openLive(page);
    await page.locator('#btn-request-location').click();
    await expect(page.locator('#btn-nearby-now')).toBeVisible({ timeout: 10000 });
    expect(traffic.places.length).toBe(1);
    // D1b (seen on the real device when Overpass answered 502): the failure is said, not silent.
    await expect(page.locator('#nearby-now-note .nearby-state-title')).toHaveText("Nearby places didn't load."); // one failure line
    await expect(page.locator('#nearby-now-note .nearby-state-desc')).toHaveCount(0);
    // UI-QUIET-PRECISION increment 2: the one action is Retry, and nothing claims "all caught up".
    await expect(page.locator('#btn-nearby-now')).toHaveText('Retry');
    await expect(page.locator('.quiet-card')).not.toContainText(/all caught up|No proactive reminders/i);
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);

    await page.locator('#btn-nearby-now').click();
    await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
    expect(traffic.places.length).toBe(2);
    expectRoundedOnly(traffic);
    await context.close();
  });

  test('Ask "附近吃什么" during an in-flight search joins it (single-flight: one request) and shows candidates', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const traffic = await setup(page, { placesDelayMs: 4000 });
    await openLive(page);
    await page.locator('#btn-request-location').click();
    await expect.poll(() => traffic.places.length, { timeout: 5000 }).toBe(1);

    await page.locator('#ask-bar').click();
    await page.locator('#conversation-input').fill('附近吃什么');
    await page.locator('#conversation-send-btn').click();
    // Determinate success auto-collapses the overlay back to Home. Outside the meal window the
    // lunch card can only appear because the Ask registered the explicit nearby request.
    await expect(page.locator('#conversation-overlay')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('#btn-nearby-now')).toHaveText('Searching OpenStreetMap…');

    await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.v2-candidate-card .v2-candidate-name').first()).toHaveText('Shinjuku Soba Tei');
    expect(traffic.places.length).toBe(1);
    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`deny @${vp.name}: guided card, zero venues, zero /api/places`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const traffic = await setup(page);
      await openLive(page);
      await page.locator('#btn-deny-location').click();
      await expect(page.locator('.v2-location-notice-banner.denied')).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(500);
      await expect(page.locator('#btn-nearby-now')).toHaveCount(0);
      await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
      expect(traffic.places).toEqual([]);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d2-deny-${vp.name}.png`) });
      await context.close();
    });
  }

  test('places off (owner setting): honest line, zero venues, zero /api/places, consent says nothing is sent', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const traffic = await setup(page, { placesEnabled: false });
    await openLive(page);
    await expect(page.locator('#location-consent-hosts')).toContainText('not sent to any provider');
    await page.locator('#btn-request-location').click();
    await expect(page.locator('#nearby-now-off .nearby-state-title')).toHaveText('Nearby restaurants are off (owner setting)', { timeout: 10000 });
    await expect(page.locator('#btn-nearby-now')).toHaveCount(0);
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
    expect(traffic.places).toEqual([]);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd2-places-off-390x844.png') });
    await context.close();
  });
});
