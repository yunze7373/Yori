/**
 * D7-LICENSED-PLACES device-shaped E2E (DEMO_RESCUE rev12, TID INBOX-20261102-0C471B).
 *
 * Recorded provider data in the exact shape the D7 /api/places proxy emits
 * (tests/proxy-boundary/google-places-proxy.test.ts proves it against the real middleware):
 * - Google path: photo (keyless googleusercontent URI, served locally here), rating, price,
 *   'Powered by Google' + photo author credit; no Leaflet on the view (rev7 screen rule);
 *   no request URL and no DOM attribute carries 'key=' or the key.
 * - Failover path: Google failed -> OSM answer, labelled honestly; no Google strings, photo URIs
 *   or credits anywhere on that view.
 * Screenshots -> <evidence>/demo-rescue-d7 (test-results/ unless UPDATE_EVIDENCE=1).
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d7');
const FAKE_KEY = 'AIzaFAKE_TEST_KEY_d7_0123456789';
const FIX = { latitude: 35.689487, longitude: 139.691706 };
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88vdbPQAIQgM0qXxg1wAAAABJRU5ErkJggg==',
  'base64'
);

function eveningTimezone(): string {
  const utcHour = new Date().getUTCHours();
  let offset = (18 - utcHour + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/GMT';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

function googlePlaces() {
  const fetchedAt = new Date().toISOString();
  return [
    {
      placeId: 'google-ChIJnearCafe', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', category: 'restaurant',
      source: 'live', provenance: 'google', fetchedAt, address: '2 Near St', cuisine: 'cafe',
      straightLineDistanceMeters: 45, straightLineDistanceLabel: '45 m (straight-line)', openingStatus: 'open',
      rating: 4.6, userRatingCount: 1204, priceLevel: 2, attribution: 'Powered by Google',
      photo: { uri: 'https://lh3.googleusercontent.com/places/P1=s400', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Ann', uri: 'https://maps.google.com/maps/contrib/1' }] },
    },
    {
      placeId: 'google-ChIJmid1', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', category: 'restaurant',
      source: 'live', provenance: 'google', fetchedAt, cuisine: 'ramen', straightLineDistanceMeters: 125,
      straightLineDistanceLabel: '125 m (straight-line)', rating: 4.2, userRatingCount: 310, attribution: 'Powered by Google',
    },
  ];
}

function osmPlaces() {
  const fetchedAt = new Date().toISOString();
  return [
    {
      placeId: 'overpass-node-99', osmId: 99, coords: { lat: 35.6899, lng: 139.6921 }, name: 'OSM Soba', category: 'restaurant',
      source: 'live', provenance: 'osm', fetchedAt, straightLineDistanceMeters: 56, straightLineDistanceLabel: '56 m (straight-line)',
      openingStatus: 'open', attribution: 'OpenStreetMap via Overpass (ODbL)',
    },
  ];
}

async function setup(page: Page, mode: 'google' | 'failover') {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(
      json({
        enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google',
        outboundHosts: [
          { purpose: 'nearby places and photos', host: 'places.googleapis.com' },
          { purpose: 'nearby places, fallback', host: 'overpass-api.de/api/interpreter' },
          { purpose: 'nearby places, fallback', host: 'maps.mail.ru/osm/tools/overpass/api/interpreter' },
        ],
      })
    )
  );
  await page.route(u => u.pathname === '/api/places', r =>
    r.fulfill(
      json(
        mode === 'google'
          ? { enabled: true, discovery: 'google', places: googlePlaces(), attribution: 'Powered by Google' }
          : { enabled: true, discovery: 'osm', osmHost: 'maps.mail.ru/osm/tools/overpass/api/interpreter', failover: { from: 'google', reason: 'unavailable' }, places: osmPlaces(), attribution: 'OpenStreetMap via Overpass (ODbL)' }
      )
    )
  );
  // Keyless photo URIs are hotlinked by the page; served locally so the test stays offline.
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  return requests;
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: eveningTimezone(), permissions: ['geolocation'], geolocation: FIX,
    isMobile: vp.width < 768, hasTouch: vp.width < 768,
  });
  return { context, page: await context.newPage() };
}

async function openNearby(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await page.locator('#btn-nearby-now').click();
  await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
}

/** Key-leak scan: every request URL and every attribute value in the DOM. */
async function expectNoKeyLeak(page: Page, requests: string[]) {
  for (const u of requests) {
    expect(u, 'request URL carries no key').not.toMatch(/[?&]key=/i);
    expect(u).not.toContain(FAKE_KEY);
  }
  const leaks = await page.evaluate(fake => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach(el => {
      for (const a of Array.from(el.attributes)) {
        if (/[?&]key=/i.test(a.value) || a.value.includes(fake)) out.push(`${el.tagName}[${a.name}]`);
      }
    });
    if (document.documentElement.outerHTML.includes(fake)) out.push('html');
    return out;
  }, FAKE_KEY);
  expect(leaks).toEqual([]);
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D7-LICENSED-PLACES: Google-primary nearby restaurants', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`Google path @${vp.name}: photo, rating, price, credits; no Leaflet; no key leak`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const requests = await setup(page, 'google');
      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await expect(page.locator('#location-consent-hosts')).toContainText('places.googleapis.com (nearby places and photos)');
      await page.locator('#btn-request-location').click();
      await page.locator('#btn-nearby-now').click();
      const hero = page.locator('.v2-candidate-card').first();
      await expect(hero).toBeVisible({ timeout: 10000 });

      await expect(hero).toHaveAttribute('data-source', 'google');
      await expect(hero.locator('.v2-candidate-name')).toHaveText('Near Cafe');
      const img = hero.locator('img.v2-candidate-photo');
      await expect(img).toHaveAttribute('src', 'https://lh3.googleusercontent.com/places/P1=s400');
      await expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(hero.locator('.v2-rating-chip')).toHaveText('★ 4.6 (1,204)');
      await expect(hero.locator('.v2-price-chip')).toHaveText('$$');
      await expect(hero.locator('.v2-open-chip')).toHaveText('Open now');
      // HABIT-LEARN addendum 2: the card states no reason line; open status shows as its chip.
      await expect(hero.locator('.v2-candidate-basis')).toHaveCount(0);
      await expect(hero.locator('.v2-open-chip')).toHaveText('Open now');
      expect(await page.locator('body').innerText()).not.toContain('OpenStreetMap opening hours');
      await expect(hero.locator('.powered-by-google')).toHaveText('Powered by Google');
      await expect(hero.locator('.photo-credit a')).toHaveText('Ann');
      await expect(hero.locator('.photo-credit a')).toHaveAttribute('href', 'https://maps.google.com/maps/contrib/1');
      await expect(page.locator('.mock-places-notice').first()).toHaveText('Powered by Google · nearby places');

      // rev7 screen rule: a view with Google fields has no Leaflet map.
      await expect(page.locator('.leaflet-container')).toHaveCount(0);
      await expectNoKeyLeak(page, requests);
      expect(requests.some(u => u.startsWith('https://lh3.googleusercontent.com/'))).toBe(true);
      expect(requests.some(u => u.includes('places.googleapis.com'))).toBe(false);

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d7-google-lunch-${vp.name}.png`) });

      await page.locator('.v2-view-detail-link').first().click();
      await expect(page.locator('.v2-restaurant-detail')).toBeVisible();
      await expect(page.locator('.v2-restaurant-detail')).toContainText('★ 4.6 (1,204)');
      await expect(page.locator('.v2-restaurant-detail')).toContainText('Powered by Google');
      await expect(page.locator('.leaflet-container')).toHaveCount(0);
      await expectNoKeyLeak(page, requests);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d7-google-detail-${vp.name}.png`) });
      await context.close();
    });

    test(`failover @${vp.name}: Google failed -> OSM, labelled; no Google strings, photos or credits`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const requests = await setup(page, 'failover');
      await openNearby(page);
      await expect(page.locator('.mock-places-notice').first()).toHaveText(
        'Google did not answer · showing OpenStreetMap via Overpass (ODbL)'
      );
      const hero = page.locator('.v2-candidate-card').first();
      await expect(hero).toHaveAttribute('data-source', 'overpass');
      await expect(hero.locator('.v2-candidate-name')).toHaveText('OSM Soba');
      await expect(page.locator('.v2-google-credits, .v2-rating-chip, .v2-price-chip, img.v2-candidate-photo')).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toContain('googleusercontent');
      expect(html).not.toContain('Powered by Google');
      expect(requests.some(u => u.includes('googleusercontent'))).toBe(false);
      await expectNoKeyLeak(page, requests);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d7-failover-osm-${vp.name}.png`) });
      await context.close();
    });
  }
});
