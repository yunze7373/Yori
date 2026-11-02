/**
 * D1-LOCATION-WEATHER device-shaped E2E (DEMO_RESCUE plan, TID INBOX-20261102-EC8E4D).
 *
 * A phone-shaped session in Tokyo (fix 35.689487,139.691706, Asia/Tokyo) on the Live default:
 * 1. Grant: the page sends /api/weather/current?coords=35.689,139.692 only after consent (3 decimals,
 *    never the raw fix), and the weather tile shows the conditions there with
 *    "Open-Meteo · near you · as of <time>". The fixed demo city never appears.
 * 2. Deny: the guided location card stays, zero weather requests are sent, zero weather is rendered.
 *
 * /api/weather/current is answered with a recorded response in the exact shape the D1 proxy emits
 * (tests/proxy-boundary/weather-fix-proxy.test.ts proves that shape against the real middleware);
 * no external provider is called. Evidence PNGs go to test-results/ unless UPDATE_EVIDENCE=1.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d1');
const FIX = { latitude: 35.689487, longitude: 139.691706 };
const ROUNDED_COORDS = '35.689,139.692';
// Real clock on purpose: a fake absolute clock makes the browser's geolocation timestamp look
// stale. The recorded observation is 15 minutes old at test time (Open-Meteo 15-min cadence).
const OBSERVED_ISO = new Date(Math.floor((Date.now() - 15 * 60000) / 900000) * 900000).toISOString();
const EXPECTED_AS_OF = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}).format(new Date(OBSERVED_ISO));

// Recorded D1 proxy response for the rounded Tokyo fix (Open-Meteo current, code 1).
const RECORDED_DEVICE_FIX_RESPONSE = {
  enabled: true,
  source: 'Open-Meteo',
  fetchedAt: new Date().toISOString(),
  coordinate: { kind: 'device_fix', latitude: 35.689, longitude: 139.692, decimals: 3 },
  attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
  signals: [
    {
      kind: 'weather',
      source: 'real',
      label: 'real',
      issuedAt: OBSERVED_ISO,
      validFor: 3600000,
      confidence: 1,
      consentScope: 'device_only',
      value: { condition: 'cloudy', precipProbability: 0.1, temperatureC: 14.2, weatherCode: 1, city: 'Near you' },
    },
  ],
};

interface WeatherTraffic {
  currentUrls: string[];
}

async function newDeviceContext(browser: import('@playwright/test').Browser, viewport: { width: number; height: number }) {
  return browser.newContext({
    viewport,
    timezoneId: 'Asia/Tokyo',
    permissions: ['geolocation'],
    geolocation: FIX,
    isMobile: viewport.width < 768,
    hasTouch: viewport.width < 768,
  });
}

async function setupDevice(page: Page): Promise<WeatherTraffic> {
  const traffic: WeatherTraffic = { currentUrls: [] };

  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', route => route.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/route/**', route => route.fulfill(json({ enabled: false })));
  await page.route('**/api/calendar/**', route => route.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/places/status', route => route.fulfill(json({ enabled: false, provider: 'overpass' })));
  await page.route('**/api/places?*', route => route.fulfill(json({ enabled: false, places: [] })));
  await page.route('**/api/weather/status', route =>
    route.fulfill(
      json({
        enabled: true,
        provider: 'open-meteo',
        // The status endpoint still describes the dev demo city; Live must never use it.
        demoCity: { name: 'San Francisco, CA', latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
        attribution: RECORDED_DEVICE_FIX_RESPONSE.attribution,
      })
    )
  );
  await page.route(
    url => url.pathname === '/api/weather/current',
    route => {
      const url = new URL(route.request().url());
      traffic.currentUrls.push(url.pathname + url.search);
      if (url.searchParams.get('coords') !== ROUNDED_COORDS) {
        // A coords-less (demo city) or unrounded request is a failure; answer with demo-city data
        // so any leak would also be visible on screen.
        return route.fulfill(
          json({
            enabled: true,
            coordinate: { kind: 'demo_city', name: 'San Francisco, CA' },
            signals: [
              {
                kind: 'weather',
                source: 'real',
                issuedAt: OBSERVED_ISO,
                validFor: 3600000,
                value: { condition: 'clear', temperatureC: 31, city: 'San Francisco, CA' },
              },
            ],
          })
        );
      }
      return route.fulfill(json(RECORDED_DEVICE_FIX_RESPONSE));
    }
  );
  return traffic;
}

async function openLive(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await expect(page.locator('#btn-request-location')).toBeVisible();
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D1-LOCATION-WEATHER: weather follows the consented device fix', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));

  for (const vp of VIEWPORTS) {
    test(`grant @${vp.name}: rounded fix only, weather near you with source and time`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
      const context: BrowserContext = await newDeviceContext(browser, vp);
      const page = await context.newPage();
      const traffic = await setupDevice(page);

      await openLive(page);
      expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

      // Before consent: Live sends no weather request at all (no demo-city fallback).
      expect(traffic.currentUrls).toEqual([]);
      await expect(page.locator('#live-weather-now, #signal-tile-weather-provenance')).toHaveCount(0);

      await page.locator('#btn-request-location').click();

      // Places are off here, so Live is quiet: weather shows on the quiet home, not in a plan tile.
      const provenance = page.locator('#live-weather-now-provenance');
      await expect(provenance).toBeVisible({ timeout: 10000 });
      await expect(provenance).toHaveText(`Open-Meteo · near you · as of ${EXPECTED_AS_OF}`);
      await expect(page.locator('#live-weather-now-value')).toHaveText('Cloudy · 14.2°C');
      await expect(page.locator('#live-weather-now')).toHaveAttribute('data-provenance', 'live');
      await expect(page.locator('#living-header-line')).toContainText('Cloudy');

      // On the wire: only the 3-decimal fix, never the raw one, never coords-less.
      expect(traffic.currentUrls.length).toBeGreaterThan(0);
      for (const u of traffic.currentUrls) {
        const params = new URL(u, 'http://x').searchParams;
        expect(params.get('coords')).toBe(ROUNDED_COORDS);
        expect(u).not.toContain('35.689487');
        expect(u).not.toContain('139.691706');
      }

      const body = await page.locator('body').innerText();
      expect(body).not.toContain('San Francisco');
      expect(body).not.toContain('31°C');
      expect(body).not.toMatch(/fixed demo city/i);

      await provenance.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d1-grant-${vp.name}.png`) });
      await context.close();
    });

    test(`deny @${vp.name}: guided card, zero weather requests, zero weather render`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
      const context = await newDeviceContext(browser, vp);
      const page = await context.newPage();
      const traffic = await setupDevice(page);

      await openLive(page);
      await page.locator('#btn-deny-location').click();

      await expect(page.locator('.v2-location-notice-banner.denied')).toBeVisible();
      await expect(page.locator('#btn-request-location')).toBeVisible();

      // Give any stray refresh a chance to fire, then prove nothing was requested or rendered.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(500);
      expect(traffic.currentUrls).toEqual([]);
      await expect(page.locator('#live-weather-now, #signal-tile-weather-provenance')).toHaveCount(0);
      await expect(page.locator('#living-header-line')).toContainText('Weather unavailable');
      const tile = page.locator('#signal-tile-weather .signal-value');
      if ((await tile.count()) > 0) {
        await expect(tile).not.toContainText('°C');
      }
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/\d+(\.\d+)?°C/);
      expect(body).not.toContain('San Francisco');
      await expect(page.locator('#weather-attribution')).toHaveCount(0);

      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d1-deny-${vp.name}.png`) });
      await context.close();
    });
  }
});
