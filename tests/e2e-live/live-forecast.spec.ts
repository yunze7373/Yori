/**
 * D5-LIVE-FORECAST recorded e2e (DEMO_RESCUE rev12, TID INBOX-20261103-16B58D).
 * /api/weather/forecast answers with recorded hourly-bin results in the exact shape the D5 proxy
 * emits (tests/proxy-boundary/weather-forecast-proxy.test.ts proves it against the real
 * middleware); zero live calls. Scenario: 3:00 PM event, 15 min drive, 10 min buffer -> leave 2:35.
 * - Rain expected in the trip window, no rain buffer: umbrella + forward rationale, leave-by
 *   UNCHANGED (2:35), and one status line saying so, with the Open-Meteo source.
 * - With a user-confirmed 10 min rain buffer: leave-by moves by exactly 10 min (2:25).
 * - Forecast bins missing: current conditions are used and the status line says so.
 * - A forecast past validFor: dropped, current conditions labelled 'expired', one bounded re-request.
 * - D3 floor: Accept and Not now are hit-tested at scroll top (true first paint) in every state.
 * - Live without location consent: no forecast request at all.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d5');
const CLOCK = '2026-11-02T14:15:00.000Z';
const at = '2026-11-02T12:00:00.000Z';
const fact = (key: string, value: unknown) => ({
  key,
  value,
  status: 'confirmed',
  provenance: { source: 'user_confirmed', recordedAt: at },
  updatedAt: at,
});
const BASE_FACTS = [fact('prep_buffer_minutes', 10), fact('prep_duration_minutes', 20)];

test.use({ timezoneId: 'UTC', permissions: ['geolocation'], geolocation: { latitude: 37.7749, longitude: -122.4194 } });

function setupClock(page: Page, facts: unknown[]) {
  return page.addInitScript(
    ({ timeStr, facts }) => {
      let fixed = new Date(timeStr).getTime();
      const OrigDate = window.Date;
      class PatchedDate extends OrigDate {
        constructor(...args: any[]) {
          if (args.length === 0) super(fixed);
          else super(...(args as [any]));
        }
      }
      PatchedDate.now = () => fixed;
      (window as any).__advanceClockMs = (ms: number) => {
        fixed += ms;
      };
      PatchedDate.parse = OrigDate.parse;
      PatchedDate.UTC = OrigDate.UTC;
      window.Date = PatchedDate as any;
      if (!localStorage.getItem('yori_state_v1')) {
        localStorage.setItem(
          'yori_state_v1',
          JSON.stringify({
            schemaVersion: 1,
            createdAt: '2026-11-02T12:00:00.000Z',
            updatedAt: '2026-11-02T12:00:00.000Z',
            payload: { memoryFacts: facts, proposals: [], suppressions: [], promptBudget: { date: '2026-11-02', count: 0 }, acceptedPlanIds: [] },
          })
        );
      }
    },
    { timeStr: CLOCK, facts }
  );
}

type ForecastMode = 'rain' | 'dry' | 'missing';

function recordedForecast(mode: ForecastMode) {
  if (mode === 'missing') {
    return { enabled: true, forecast: null, unavailableReason: 'bins_missing', attribution: { text: 'Weather data by Open-Meteo.com' }, source: 'Open-Meteo', fetchedAt: CLOCK, coordinate: { kind: 'device_fix', decimals: 3 } };
  }
  const dry = mode === 'dry';
  return {
    enabled: true,
    forecast: {
      kind: 'weather_forecast',
      provenance: 'open_meteo_forecast',
      issuedAt: CLOCK,
      validFor: 3600000,
      validAt: { from: '2026-11-02T14:35:00.000Z', to: '2026-11-02T15:00:00.000Z' },
      confidence: 0.8,
      bins: [{ time: '2026-11-02T14:00:00.000Z', precipProbability: dry ? 0.1 : 0.7, precipitationMm: dry ? 0 : 1.1, condition: dry ? 'cloudy' : 'rain', rain: !dry }],
      rainExpected: !dry,
      rainFrom: dry ? undefined : '2026-11-02T14:00:00.000Z',
      rainTo: dry ? undefined : '2026-11-02T15:00:00.000Z',
      maxPrecipProbability: dry ? 0.1 : 0.7,
    },
    attribution: { text: 'Weather data by Open-Meteo.com' },
    source: 'Open-Meteo',
    fetchedAt: CLOCK,
    coordinate: { kind: 'device_fix', decimals: 3 },
  };
}

async function setup(page: Page, opts: { forecast: ForecastMode; currentRain?: boolean; eventStart?: string }) {
  const forecastUrls: string[] & { currentIssuedAt?: string } = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/places**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/calendar/status', r => r.fulfill(json({ enabled: true, configured: true, provider: 'ics', attribution: 'iCalendar' })));
  await page.route('**/api/calendar', r =>
    r.fulfill(json({ enabled: true, configured: true, attribution: 'iCalendar', events: [{ id: 'evt-review', title: 'Product Review', startTime: opts.eventStart ?? '2026-11-02T15:00:00.000Z', location: '100 Van Ness Ave, San Francisco' }] }))
  );
  await page.route('**/api/geocode?*', r => r.fulfill(json({ enabled: true, success: true, result: { coordinate: [37.776, -122.418] }, attribution: 'Nominatim' })));
  await page.route('**/api/route?*', r =>
    r.fulfill(json({ enabled: true, attribution: 'OSRM', route: { geometry: [[37.7749, -122.4194], [37.776, -122.418]], distanceM: 3000, durationS: 900, provider: 'osrm', mode: 'driving', fetchedAt: CLOCK } }))
  );
  await page.route('**/api/weather/status', r => r.fulfill(json({ enabled: true, provider: 'open-meteo', attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/' } })));
  await page.route('**/api/weather/current*', r =>
    r.fulfill(
      json({
        enabled: true,
        attribution: 'Open-Meteo',
        source: 'Open-Meteo',
        fetchedAt: CLOCK,
        coordinate: { kind: 'device_fix', latitude: 37.775, longitude: -122.419, decimals: 3 },
        signals: [
          {
            kind: 'weather',
            value: opts.currentRain ? { condition: 'rain', temperatureC: 16, precipProbability: 0.8 } : { condition: 'cloudy', temperatureC: 18, precipProbability: 0.1 },
            provider: 'open-meteo',
            asOf: forecastUrls.currentIssuedAt ?? CLOCK,
            issuedAt: forecastUrls.currentIssuedAt ?? CLOCK,
            validFor: 3600000,
            confidence: 1,
            provenance: 'live',
            consentScope: 'device_only',
            status: 'available',
          },
        ],
      })
    )
  );
  await page.route(u => u.pathname === '/api/weather/forecast', r => {
    forecastUrls.push(r.request().url());
    return r.fulfill(json(recordedForecast(opts.forecast)));
  });
  return forecastUrls;
}

async function openLive(page: Page, grant = true) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  if (grant) {
    const btn = page.locator('#btn-request-location');
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) await btn.click();
  }
  await expect(page.locator('.now-card, #now-card').first()).toContainText('Product Review', { timeout: 10000 });
}

/** D3 floor: the plan's Accept and Not now stay clear of the docked ask bar on first paint. */
async function expectActionsUnoccluded(page: Page) {
  // First paint: scroll to the top and let layout settle before hit-testing (Reviewer 48aae24c).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const hits = await page.evaluate(() => {
    const hit = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return 'none';
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === t || el.contains(t!) ? 'ok' : 'occluded';
    };
    return { accept: hit('#btn-accept'), dismiss: hit('#btn-dismiss') };
  });
  expect(hits).toEqual({ accept: 'ok', dismiss: 'ok' });
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D5-LIVE-FORECAST: target-time forecast for the trip window (recorded)', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`rain expected, no rain buffer: umbrella + forward rationale, leave-by unchanged @${vp.name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupClock(page, BASE_FACTS);
      const forecastUrls = await setup(page, { forecast: 'rain' });
      await openLive(page);
      await expect(page.locator('#forecast-status')).toHaveText('Forecast · leave-by unchanged, no rain buffer set', { timeout: 10000 });
      await expect(page.locator('#chip-umbrella')).toBeVisible();
      await expect(page.locator('.now-rationale-forecast')).toHaveText('Rain expected 2:00–3:00 PM');
      await expect(page.locator('#hero-cause-effect')).toHaveText('Rain expected 2:00–3:00 PM · take an umbrella; leave time unchanged (2:35).');
      const card = (await page.locator('.now-card, #now-card').first().textContent()) ?? '';
      expect(card).toMatch(/leave by 2:35\s*pm/i);
      expect(card).not.toContain('Rain now');
      expect(card).not.toContain('I moved your leave time');
      // One request for this event, with the rounded fix and the [leave-by, appointment] window.
      expect(forecastUrls).toHaveLength(1);
      const u = new URL(forecastUrls[0]!);
      expect(u.searchParams.get('coords')).toBe('37.775,-122.419');
      expect(u.searchParams.get('from')).toBe('2026-11-02T14:35:00.000Z');
      expect(u.searchParams.get('to')).toBe('2026-11-02T15:00:00.000Z');
      await expect(page.locator('#weather-attribution').first()).toBeAttached();
      await expectActionsUnoccluded(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d5-rain-no-buffer-${vp.name}.png`) });
    });

    test(`rain expected + your confirmed 10 min rain buffer: leave-by moves exactly 10 min earlier @${vp.name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupClock(page, [...BASE_FACTS, fact('rain_buffer_minutes', 10)]);
      await setup(page, { forecast: 'rain' });
      await openLive(page);
      await expect(page.locator('#forecast-status')).toHaveText('Forecast · leaving 10 min earlier (your rain buffer)', { timeout: 10000 });
      await expect(page.locator('#hero-cause-effect')).toHaveText('Rain expected 2:00–3:00 PM · take an umbrella; leaving 10 min earlier (2:35 → 2:25).');
      await expect(page.locator('#time-diff-display')).toHaveCount(0);
      const card = (await page.locator('.now-card, #now-card').first().textContent()) ?? '';
      expect(card).toMatch(/leave by 2:25\s*pm/i);
      await expect(page.locator('#chip-umbrella')).toBeVisible();
      await expectActionsUnoccluded(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d5-rain-with-buffer-${vp.name}.png`) });
      // UI-QUIET-PRECISION review pack: the Live rain re-plan in the 04 hero, after motion settles.
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
      await page.screenshot({ path: path.join(getEvidenceDir('ui-quiet-precision'), `rain-replan-live-${vp.name}.png`) });
    });
  }

  for (const vp of VIEWPORTS) {
    test(`forecast bins missing: current conditions are used, and the status line says so @${vp.name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupClock(page, [...BASE_FACTS, fact('rain_buffer_minutes', 10)]);
      await setup(page, { forecast: 'missing', currentRain: true });
      await openLive(page);
      await expect(page.locator('#forecast-status')).toHaveText('Forecast unavailable · using current conditions', { timeout: 10000 });
      await expect(page.locator('.now-rationale-forecast')).toHaveText('Rain now');
      const card = (await page.locator('.now-card, #now-card').first().textContent()) ?? '';
      // Current-conditions rain never applies the rain buffer (forecast-only rule): leave-by unchanged.
      expect(card).toMatch(/leave by 2:35\s*pm/i);
      await expectActionsUnoccluded(page);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d5-forecast-unavailable-${vp.name}.png`) });
    });
  }

  test('a forecast past validFor is never used: current conditions take over, labelled, with ONE bounded re-request', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClock(page, [...BASE_FACTS, fact('rain_buffer_minutes', 10)]);
    // 4:30 PM event: the trip window is still ahead after the clock moves 61 min.
    const forecastUrls = await setup(page, { forecast: 'dry', currentRain: true, eventStart: '2026-11-02T16:30:00.000Z' });
    await openLive(page);
    // Fresh dry forecast for the trip window (it takes precedence over the current shower).
    await expect(page.locator('#forecast-status')).toHaveText('Forecast · dry for your trip', { timeout: 10000 });
    await expect(page.locator('#chip-umbrella')).toHaveCount(0);
    expect(forecastUrls).toHaveLength(1);
    // 61 min later the forecast (issued 2:15 PM, valid 1 h) is stale: dropped, current rain used.
    await page.evaluate(() => (window as any).__advanceClockMs(61 * 60_000));
    // Current conditions are re-fetched on the Live refresh (observation time follows the clock).
    forecastUrls.currentIssuedAt = '2026-11-02T15:16:00.000Z';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#forecast-status')).toHaveText('Forecast expired · using current conditions', { timeout: 10000 });
    await expect(page.locator('#chip-umbrella')).toBeVisible();
    await expect(page.locator('.now-rationale-forecast')).toHaveText('Rain now');
    // Exactly one re-request for this event in this validFor window, however often it re-renders.
    await expect.poll(() => forecastUrls.length).toBe(2);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(150);
    }
    expect(forecastUrls).toHaveLength(2);
    await expect(page.locator('#forecast-status')).toHaveText('Forecast expired · using current conditions');
    const card = (await page.locator('.now-card, #now-card').first().textContent()) ?? '';
    expect(card).toMatch(/leave by 4:05\s*pm/i); // 4:30 - 15 drive - 10 buffer; no rain buffer without a fresh forecast
    await expectActionsUnoccluded(page);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd5-forecast-expired-390x844.png') });
  });

  test('Live without location consent: zero forecast requests', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' });
    const page = await context.newPage();
    await setupClock(page, BASE_FACTS);
    const forecastUrls = await setup(page, { forecast: 'rain' });
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await page.waitForTimeout(2500);
    expect(forecastUrls).toHaveLength(0);
    await expect(page.locator('#forecast-status')).toHaveCount(0);
    await context.close();
  });
});
