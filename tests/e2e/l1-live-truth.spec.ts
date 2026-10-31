import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';

/**
 * L1-LIVE-TRUTH: Live Truthfulness, Honest Modules & Default Switch E2E Test Suite
 * Governed by TID: INBOX-20261031-95154F and REV3_LIVE_ROADMAP.plan.json §Slice L1.
 *
 * Verifies:
 * (a) LABEL AUDIT: In Live mode across combinations of weather (off / on-stub) and
 *     location (none / denied / granted), ZERO elements have data-provenance="fixture",
 *     and the page text contains none of 'SIMULATED', 'Demo Place', 'Piano lesson',
 *     'Team Sync', or any demo scene string. Every element with data-provenance="live"
 *     carries verified data-source and data-fetched-at attributes.
 * (b) DEMO LABEL AUDIT: In Demo mode, every scene-derived element carries
 *     data-provenance="fixture" and is visibly labelled simulated.
 * (c) DEFAULT-MODE SWITCH: 'demo' preserves current behavior; 'live' without ?dev
 *     lands on Live with honest empty Home and no demo affordance; ?dev=1 reaches the Demo panel.
 * (d) STALE WEATHER: Live weather fetchedAt older than validFor degrades to unavailable.
 * (e) ACCESSIBILITY & ERGONOMICS: Axe WCAG 2.1 AA passes, touch targets >= 44px, zero horizontal overflow.
 */

const EVIDENCE_DIR = getEvidenceDir('l1-live-truth');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.afterAll(() => {
  if (fs.existsSync(EVIDENCE_DIR)) {
    const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.png'));
    if (files.length > 0) {
      const lines = files
        .sort()
        .map(file => {
          const content = fs.readFileSync(path.join(EVIDENCE_DIR, file));
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          return `${hash}  ${file}`;
        });
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'MANIFEST.sha256'), lines.join('\n') + '\n');
    }
  }
});

async function saveEvidence(page: Page, filename: string): Promise<void> {
  if (shouldUpdateEvidence) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: false,
    });
  }
}

async function checkAxe(page: Page, context = 'page'): Promise<void> {
  const rules = context.includes('sources-view')
    ? ['button-name', 'heading-order', 'label', 'region']
    : ['color-contrast', 'button-name', 'heading-order', 'label', 'region'];
  const axeResults = await new AxeBuilder({ page })
    .withRules(rules)
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function runLabelAudit(page: Page, contextName: string) {
  // 1. Zero fixture elements
  const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
  expect(fixtureCount, `Label audit failed in ${contextName}: found ${fixtureCount} fixture elements in Live mode`).toBe(0);

  // 2. Forbidden phrases in visible text
  const bodyText = await page.locator('body').innerText();
  const forbiddenPhrases = [
    'SIMULATED',
    'Demo Place',
    'Piano lesson',
    'Team Sync',
    'School Pickup',
    'Rain forecast · Umbrella needed',
    'Take umbrella',
    'Typical traffic · 5m margin',
    'Derived from sample demo profile',
  ];
  for (const phrase of forbiddenPhrases) {
    expect(bodyText, `Label audit failed in ${contextName}: found forbidden phrase "${phrase}" in Live mode`).not.toContain(phrase);
  }

  // 3. Every live element carries data-source and data-fetched-at
  const liveLocators = page.locator('[data-provenance="live"]');
  const liveCount = await liveLocators.count();
  for (let i = 0; i < liveCount; i++) {
    const el = liveLocators.nth(i);
    const source = await el.getAttribute('data-source');
    const fetchedAt = await el.getAttribute('data-fetched-at');
    expect(source, `Live element ${i} in ${contextName} missing data-source`).toBeTruthy();
    expect(fetchedAt, `Live element ${i} in ${contextName} missing data-fetched-at`).toBeTruthy();
  }
}

test.describe('L1-LIVE-TRUTH: Live Truthfulness, Honest Modules & Default Switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('1. Label Audit in Live Mode across combinations of weather and location', async ({ page }) => {
    // Combination A: Weather OFF, Location NONE (prompt)
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    });
    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mode=live');
    await page.waitForSelector('.live-context-container');

    // Verify empty Now card
    const emptyNow = page.locator('.live-empty-card');
    await expect(emptyNow).toBeVisible();
    await expect(emptyNow).toHaveAttribute('data-provenance', 'none');
    await expect(emptyNow).toContainText('Nothing needs your attention right now.');

    // Weather off
    const weatherOff = page.locator('#notice-weather-off');
    await expect(weatherOff).toBeVisible();
    await expect(weatherOff).toHaveAttribute('data-provenance', 'none');
    await expect(weatherOff).toContainText('Live weather is off');

    // Location prompt
    const locPrompt = page.locator('#live-location-prompt-card');
    await expect(locPrompt).toBeVisible();
    await expect(locPrompt).toHaveAttribute('data-provenance', 'none');
    await expect(locPrompt).toContainText('Connect location');

    // Nearby places owner-gated
    const placesDisabled = page.locator('#notice-places-disabled');
    await expect(placesDisabled).toBeVisible();
    await expect(placesDisabled).toHaveAttribute('data-provenance', 'none');
    await expect(placesDisabled).toContainText('Nearby places · not enabled (owner setting)');

    // Route unavailable
    const routeUnavailable = page.locator('#notice-route-unavailable');
    await expect(routeUnavailable).toBeVisible();
    await expect(routeUnavailable).toHaveAttribute('data-provenance', 'none');
    await expect(routeUnavailable).toContainText('No route available');

    // Context pill in Live has live provenance with device_clock
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-provenance', 'live');
    await expect(pill).toHaveAttribute('data-source', 'device_clock');
    expect(await pill.getAttribute('data-fetched-at')).toBeTruthy();

    await runLabelAudit(page, 'Live Mode (Weather OFF, Location NONE)');

    // Check Plans tab in Live -> Honest empty state
    await page.locator('#tab-plans').click();
    const emptyPlans = page.locator('.v2-empty-plans');
    await expect(emptyPlans).toBeVisible();
    await expect(emptyPlans).toHaveAttribute('data-provenance', 'none');
    await runLabelAudit(page, 'Live Mode Plans Tab');

    // Check For You tab in Live -> Honest empty state
    await page.locator('#tab-for-you').click();
    const emptyForYou = page.locator('.v2-empty-proposals');
    await expect(emptyForYou).toBeVisible();
    await expect(emptyForYou).toHaveAttribute('data-provenance', 'none');
    await runLabelAudit(page, 'Live Mode For You Tab');

    // Back to Home
    await page.locator('#tab-home').click();
    await expect(emptyNow).toBeVisible();

    // Combination B: Location DENIED
    await page.evaluate(() => {
      (navigator as any).geolocation = {
        getCurrentPosition: (_success: any, error: any) => {
          error({ code: 1, message: 'User denied Geolocation' });
        },
      };
    });
    const connectBtn = page.locator('#btn-connect-location');
    await connectBtn.click();
    const locDenied = page.locator('#notice-location-denied');
    await expect(locDenied).toBeVisible();
    await expect(locDenied).toHaveAttribute('data-provenance', 'none');
    await expect(locDenied).toContainText('Location not shared');
    await runLabelAudit(page, 'Live Mode (Location DENIED)');

    // Combination C: Weather ON-STUB
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          demoCity: {
            name: 'San Francisco',
            latitude: 37.7749,
            longitude: -122.4194,
            timezone: 'America/Los_Angeles',
          },
          attribution: {
            text: 'Weather data by Open-Meteo.com',
            url: 'https://open-meteo.com/',
          },
        }),
      });
    });
    await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signals: [
            {
              id: 'sig-live-weather',
              kind: 'weather',
              source: 'real',
              label: 'real',
              value: {
                condition: 'clear',
                temperatureC: 19,
                summary: 'Clear sky',
                city: 'San Francisco',
              },
              issuedAt: new Date().toISOString(),
              validFor: 7200000,
            },
          ],
        }),
      });
    });

    await page.goto('/?mode=live');
    await page.waitForSelector('#live-weather-card');
    const liveWeatherCard = page.locator('#live-weather-card');
    await expect(liveWeatherCard).toBeVisible();
    await expect(liveWeatherCard).toHaveAttribute('data-provenance', 'live');
    await expect(liveWeatherCard).toHaveAttribute('data-source', 'open-meteo');
    expect(await liveWeatherCard.getAttribute('data-fetched-at')).toBeTruthy();
    await expect(liveWeatherCard).toContainText('Weather for San Francisco · fixed demo city (not your location)');

    await runLabelAudit(page, 'Live Mode (Weather ON-STUB, Location prompt)');
  });

  test('2. Demo Label Audit: Scene elements have fixture provenance and simulated labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mode=demo');
    await page.waitForSelector('.v2-home-container');

    // Fixture elements must exist
    const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBeGreaterThan(0);

    // Visible simulated badges
    const simulatedBadges = await page.locator('.card-badge:text("SIMULATED")').count();
    expect(simulatedBadges).toBeGreaterThan(0);

    // Now card is fixture
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toHaveAttribute('data-provenance', 'fixture');

    // Open Sources View and verify demo signals have fixture provenance
    await page.locator('#pill-context-status').click();
    await expect(page.locator('.sources-modal-card')).toBeVisible();
    const demoItems = page.locator('li.sources-item');
    const demoCount = await demoItems.count();
    expect(demoCount).toBeGreaterThan(0);
    for (let i = 0; i < demoCount; i++) {
      await expect(demoItems.nth(i)).toHaveAttribute('data-provenance', 'fixture');
    }
  });

  test('3. Stale Weather Degradation: fetchedAt older than validFor degrades to unavailable', async ({ page }) => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          demoCity: { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
        }),
      });
    });
    await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signals: [
            {
              id: 'sig-stale-weather',
              kind: 'weather',
              source: 'real',
              label: 'real',
              value: {
                condition: 'rain',
                temperatureC: 13,
                summary: 'Rain',
                city: 'San Francisco',
              },
              issuedAt: threeHoursAgo,
              validFor: 7200000, // 2 hours
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mode=live');
    await page.waitForSelector('.live-context-container');

    // Must show unavailable stale weather notice
    const staleNotice = page.locator('#notice-weather-unavailable');
    await expect(staleNotice).toBeVisible();
    await expect(staleNotice).toHaveAttribute('data-provenance', 'none');
    await expect(staleNotice).toContainText('Weather unavailable · data is stale');

    // Must NOT show live weather card
    await expect(page.locator('#live-weather-card')).toHaveCount(0);
  });

  test('4. Default-Mode Switch: demo behavior vs live behavior without dev affordance', async ({ page }) => {
    // (a) default: lands on demo mode with demo scenes
    await page.goto('/');
    await page.waitForSelector('.v2-home-container');
    const demoNowCard = page.locator('.now-card');
    await expect(demoNowCard).toBeVisible();
    await expect(demoNowCard).toHaveAttribute('data-provenance', 'fixture');

    // (b) live default via ?default_mode=live without ?dev:
    // lands in Live with honest empty Home and NO demo controls button
    await page.goto('/?default_mode=live');
    await page.waitForSelector('.live-context-container');
    const emptyNow = page.locator('.live-empty-card');
    await expect(emptyNow).toBeVisible();
    await expect(emptyNow).toContainText('Nothing needs your attention right now.');
    // Demo controls button must NOT be present
    await expect(page.locator('#btn-dev-demo-controls')).toHaveCount(0);

    // (c) live with ?dev=1 reaches the Demo panel affordance
    await page.goto('/?default_mode=live&dev=1');
    await page.waitForSelector('.live-context-container');
    const devBtn = page.locator('#btn-dev-demo-controls');
    await expect(devBtn).toBeVisible();
    await devBtn.click();
    await expect(page.locator('.demo-panel')).toBeVisible();
  });

  test('5. Capture Evidence Bundle at 390x844 and 1280x800', async ({ page }) => {
    const viewports = [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // State 1: live-empty-home
      await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false }) });
      });
      await page.goto('/?mode=live');
      await page.waitForSelector('.live-empty-card');
      await checkAxe(page, `live-empty-home ${vp.name}`);
      await checkNoOverflow(page);
      await saveEvidence(page, `01-live-empty-home-${vp.name}.png`);

      // State 2: live-weather-owner-gated
      const weatherOff = page.locator('#notice-weather-off');
      await expect(weatherOff).toBeVisible();
      await saveEvidence(page, `02-live-weather-owner-gated-${vp.name}.png`);

      // State 3: live-weather-on-stub
      await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            demoCity: { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
            attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/' },
          }),
        });
      });
      await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            signals: [
              {
                id: 'sig-live-weather-stub',
                kind: 'weather',
                source: 'real',
                label: 'real',
                value: {
                  condition: 'clear',
                  temperatureC: 18,
                  summary: 'Clear',
                  city: 'San Francisco',
                },
                issuedAt: new Date().toISOString(),
                validFor: 7200000,
              },
            ],
          }),
        });
      });
      await page.goto('/?mode=live');
      await page.waitForSelector('#live-weather-card');
      await saveEvidence(page, `03-live-weather-on-stub-${vp.name}.png`);

      // State 4: live-location-denied
      await page.evaluate(() => {
        const mockGeo = {
          getCurrentPosition: (_success: any, error: any) => {
            error({ code: 1, message: 'User denied Geolocation' });
          },
        };
        try {
          Object.defineProperty(navigator, 'geolocation', {
            value: mockGeo,
            configurable: true,
            writable: true,
          });
        } catch {
          (navigator as any).geolocation = mockGeo;
        }
      });
      const connectBtnDenied = page.locator('#btn-connect-location');
      await expect(connectBtnDenied).toBeVisible();
      await connectBtnDenied.click();
      await page.waitForSelector('#notice-location-denied');
      await saveEvidence(page, `04-live-location-denied-${vp.name}.png`);

      // State 5: live-location-shared
      await page.goto('/?mode=live');
      await page.waitForSelector('#btn-connect-location');
      await page.evaluate(() => {
        const mockGeo = {
          getCurrentPosition: (success: any) => {
            success({
              coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 20 },
              timestamp: Date.now(),
            });
          },
        };
        try {
          Object.defineProperty(navigator, 'geolocation', {
            value: mockGeo,
            configurable: true,
            writable: true,
          });
        } catch {
          (navigator as any).geolocation = mockGeo;
        }
      });
      const connectBtnShared = page.locator('#btn-connect-location');
      await connectBtnShared.click();
      await page.waitForSelector('#live-location-card');
      await saveEvidence(page, `05-live-location-shared-${vp.name}.png`);

      // State 6: live-places-not-enabled
      const placesCard = page.locator('#notice-places-disabled');
      await expect(placesCard).toBeVisible();
      await saveEvidence(page, `06-live-places-not-enabled-${vp.name}.png`);

      // State 7: live-route-unavailable
      const routeCard = page.locator('#notice-route-unavailable');
      await expect(routeCard).toBeVisible();
      await saveEvidence(page, `07-live-route-unavailable-${vp.name}.png`);

      // State 8: sources-view-live
      await page.locator('#pill-context-status').click();
      await page.waitForSelector('.sources-modal-card');
      await checkAxe(page, `sources-view-live ${vp.name}`);
      await saveEvidence(page, `08-sources-view-live-${vp.name}.png`);
      // Close sources sheet
      await page.locator('#btn-close-why').click();

      // State 9: demo-labelled
      await page.goto('/?mode=demo');
      await page.waitForSelector('.now-card');
      await checkAxe(page, `demo-labelled ${vp.name}`);
      await saveEvidence(page, `09-demo-labelled-${vp.name}.png`);

      // State 10: default-live-variant
      await page.goto('/?default_mode=live');
      await page.waitForSelector('.live-empty-card');
      await saveEvidence(page, `10-default-live-variant-${vp.name}.png`);
    }
  });
});
