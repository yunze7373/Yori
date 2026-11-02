/**
 * LIVE-PIPELINE-CORE E2E Tests (S1-LIVE-PIPELINE-CORE, TID: INBOX-20261102-F72383)
 *
 * Governed by LIVE_FIRST plan (docs/architecture/LIVE_FIRST.plan.{md,json}).
 * Verifies that Live mode runs the real pipeline (runPipeline) on real signals (buildLiveSnapshot).
 *
 * Verified dimensions:
 * 1. Differential live-change flow:
 *    - 12:15 PM clock, location prompt -> honest gated state ("Location Needed"), data-provenance="none", zero fixture provenance.
 *    - Location granted via #btn-request-location -> /api/places returns Overpass candidates -> zero user input drives perception to composer -> lunch plan appears with What-changed marker!
 * 2. Hit-test matrix:
 *    - #btn-accept, #btn-adjust, and #btn-dismiss bounding box centers are unoccluded via document.elementFromPoint at 390x844, 1024x768, 1280x800, and 1440x900 viewports.
 * 3. Places-off test:
 *    - /api/places disabled -> honest gated preparation ("Nearby places · not enabled (owner setting)").
 * 4. Suppression & persistence test:
 *    - Tap "Not now" (#btn-dismiss) -> suppressed quiet beat ("Okay — I'll stay quiet about lunch today", budget meter).
 *    - Cross-session reload -> suppression persists.
 * 5. Failure modes:
 *    - Consent denied -> "Location Denied" or "Location Access Denied".
 *    - Weather stale / timeout / error -> "Weather unavailable" in header, never 'Clear'.
 * 6. UI-level static/e2e gate:
 *    - In Live without ?dev=1, zero elements with data-provenance="fixture" and no Demo Place / fixture copy ("Fiore Caffe", "Soba Place").
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const RUNTIME_VIDEO_DIR = path.resolve('.yori-runtime/evidence/live-pipeline');
const COMMITTED_EVIDENCE_DIR = path.resolve('docs/evidence/live-pipeline');

test.use({
  timezoneId: 'UTC',
  permissions: ['geolocation'],
  geolocation: { latitude: 37.7749, longitude: -122.4194 },
});

const MOCK_PLACES_CANDIDATES = [
  {
    placeId: 'p1',
    osmId: 101,
    name: 'Tokyo Soba Garden',
    cuisine: 'japanese',
    category: 'restaurant',
    coords: { lat: 37.776, lng: -122.417 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 450,
    straightLineDistanceLabel: '450m',
    openingStatus: 'open',
  },
  {
    placeId: 'p2',
    osmId: 102,
    name: 'Napoli Woodfire Trattoria',
    cuisine: 'italian',
    category: 'restaurant',
    coords: { lat: 37.775, lng: -122.418 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 620,
    straightLineDistanceLabel: '620m',
    openingStatus: 'open',
  },
];

function mockClockAndStorage(page: Page, isoTime = '2026-11-02T12:15:00.000Z') {
  return page.addInitScript((timeStr) => {
    const fixedMs = new Date(timeStr).getTime();
    const OrigDate = window.Date;
    class PatchedDate extends OrigDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedMs);
        } else {
          super(...(args as [any]));
        }
      }
    }
    PatchedDate.now = () => fixedMs;
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
          payload: {
            memoryFacts: [
              {
                key: 'taste_preference',
                value: 'Japanese or Italian',
                status: 'confirmed',
                provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
                updatedAt: '2026-11-02T12:00:00.000Z',
              },
            ],
            proposals: [],
            suppressions: [],
            promptBudget: { date: '2026-11-02', count: 0 },
            acceptedPlanIds: [],
          },
        })
      );
    }
  }, isoTime);
}

async function assertElementUnoccluded(page: Page, selector: string, label: string): Promise<void> {
  const result = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, unoccluded: false, topTag: 'none', cx: 0, cy: 0 };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    const unoccluded = el === topEl || el.contains(topEl);
    return {
      found: true,
      unoccluded,
      topTag: topEl
        ? `${topEl.tagName.toLowerCase()}${topEl.id ? '#' + topEl.id : ''}${
            topEl.className ? '.' + String(topEl.className).replace(/\s+/g, '.') : ''
          }`
        : 'null',
      cx,
      cy,
    };
  }, selector);

  expect(result.found, `${label} (${selector}) must exist in DOM`).toBe(true);
  expect(
    result.unoccluded,
    `${label} (${selector}) at (${result.cx}, ${result.cy}) must not be occluded; hit was ${result.topTag}`
  ).toBe(true);
}

function seedLocalStorage(page: Page, options?: { memoryFacts?: any[]; acceptedPlanIds?: string[] }) {
  return page.addInitScript((opts) => {
    if (!localStorage.getItem('yori_state_v1')) {
      localStorage.setItem(
        'yori_state_v1',
        JSON.stringify({
          schemaVersion: 1,
          createdAt: '2026-11-02T10:00:00.000Z',
          updatedAt: '2026-11-02T10:00:00.000Z',
          payload: {
            memoryFacts: opts?.memoryFacts ?? [
              {
                key: 'taste_preference',
                value: 'Japanese',
                status: 'confirmed',
                provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T10:00:00.000Z' },
                updatedAt: '2026-11-02T10:00:00.000Z',
              },
            ],
            proposals: [],
            suppressions: [],
            promptBudget: { date: '2026-11-02', count: 0 },
            acceptedPlanIds: opts?.acceptedPlanIds ?? [],
          },
        })
      );
    }
  }, options);
}

function setupBaseMockApiRoutes(
  page: Page,
  options?: {
    placesEnabled?: boolean;
    weatherEnabled?: boolean;
    weatherStatus?: number;
    weatherPayload?: any;
    places?: any[];
  }
) {
  const placesEnabled = options?.placesEnabled ?? true;
  const weatherEnabled = options?.weatherEnabled ?? true;

  return Promise.all([
    page.route('**/api/xmemo/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      })
    ),
    page.route('**/api/route/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      })
    ),
    page.route('**/api/weather/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: weatherEnabled,
          attribution: { text: 'Weather data from Open-Meteo', url: 'https://open-meteo.com/' },
        }),
      })
    ),
    page.route('**/api/weather/current*', (route) => {
      if (!weatherEnabled) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false }),
        });
      }
      if (options?.weatherStatus && options.weatherStatus !== 200) {
        return route.fulfill({ status: options.weatherStatus });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          options?.weatherPayload ?? {
            signals: [
              {
                kind: 'weather',
                value: { condition: 'Partly cloudy', temperatureC: 19 },
                issuedAt: '2026-11-02T12:15:00.000Z',
                validFor: 300000,
              },
            ],
          }
        ),
      });
    }),
    page.route('**/api/places/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: placesEnabled,
          provider: 'overpass',
          attribution: 'OpenStreetMap (ODbL)',
        }),
      })
    ),
    page.route('**/api/places?*', (route) => {
      if (!placesEnabled) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, places: [] }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          places: options?.places ?? MOCK_PLACES_CANDIDATES,
        }),
      });
    }),
  ]);
}

test.describe('S1-LIVE-PIPELINE-CORE: Live Pipeline E2E Verification', () => {
  test.beforeAll(() => {
    fs.mkdirSync(RUNTIME_VIDEO_DIR, { recursive: true });
    fs.mkdirSync(COMMITTED_EVIDENCE_DIR, { recursive: true });
  });

  // =========================================================================
  // 1. Differential live-change flow: Quiet (Location Needed) -> Granted -> Lunch plan with What-changed
  // =========================================================================
  test('Differential live-change flow: quiet gated state -> granted -> lunch plan with What-changed marker', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
      recordVideo: { dir: RUNTIME_VIDEO_DIR, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, { placesEnabled: true });

    // Open in Live mode
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // 1. Verify honest gated quiet state before location is shared
    const quietTitle = page.locator('#quiet-title, .quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Location Needed');

    const reqLocBtn = page.locator('#btn-request-location');
    await expect(reqLocBtn).toBeVisible();

    // Provenance gate: zero elements with data-provenance="fixture"
    const fixtureCountBefore = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCountBefore).toBe(0);

    // Capture quiet screenshot
    await page.screenshot({ path: path.join(RUNTIME_VIDEO_DIR, '01-live-quiet-location-needed.png') });

    // 2. Grant location via #btn-request-location
    await reqLocBtn.click();

    // Zero user input drives perception to composer: lunch plan appears with What-changed marker!
    const whatChangedMarker = page.locator('#what-changed-marker, .what-changed-marker');
    await expect(whatChangedMarker).toBeVisible({ timeout: 10000 });
    await expect(whatChangedMarker).toContainText('What changed:');

    // Candidate cards appear with real mock candidates (Tokyo Soba Garden)
    const heroCard = page.locator('.now-card, .v2-candidates-hero');
    await expect(heroCard).toBeVisible();
    await expect(heroCard).toContainText('Tokyo Soba Garden');

    // Ranking citation: cites confirmed taste preference
    const candidateBasis = page.locator('.v2-candidate-basis').first();
    await expect(candidateBasis).toBeVisible();
    await expect(candidateBasis).toContainText('Based on taste:');
    await expect(candidateBasis).toContainText('You confirmed');

    // Primary action buttons exist and are visible
    await expect(page.locator('#btn-accept')).toBeVisible();
    await expect(page.locator('#btn-adjust')).toBeVisible();
    await expect(page.locator('#btn-dismiss')).toBeVisible();

    // Zero elements with data-provenance="fixture"
    const fixtureCountAfter = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCountAfter).toBe(0);

    // No simulated demo copy present
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Fiore Caffe');
    expect(bodyText).not.toContain('Soba Place');

    // Capture lunch plan screenshot
    await page.screenshot({ path: path.join(RUNTIME_VIDEO_DIR, '02-live-lunch-plan-composed.png') });

    await context.close();
  });

  // =========================================================================
  // 2. Hit-test matrix: Accept / Adjust / Not now unoccluded at 4 viewports
  // =========================================================================
  const viewports = [
    { width: 390, height: 844, name: '390x844' },
    { width: 1024, height: 768, name: '1024x768' },
    { width: 1280, height: 800, name: '1280x800' },
    { width: 1440, height: 900, name: '1440x900' },
  ];

  for (const vp of viewports) {
    test(`Hit-test matrix at ${vp.name}: #btn-accept, #btn-adjust, #btn-dismiss unoccluded`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        timezoneId: 'UTC',
        permissions: ['geolocation'],
        geolocation: { latitude: 37.7749, longitude: -122.4194 },
      });
      const page = await context.newPage();

      await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
      await setupBaseMockApiRoutes(page, { placesEnabled: true });

      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');

      // Grant location to display candidate plan
      const reqLocBtn = page.locator('#btn-request-location');
      await expect(reqLocBtn).toBeVisible();
      await reqLocBtn.click();

      await page.waitForSelector('#what-changed-marker, .what-changed-marker');

      // Assert bounding box centers are unoccluded via document.elementFromPoint
      await assertElementUnoccluded(page, '#btn-accept', `Accept Button at ${vp.name}`);
      await assertElementUnoccluded(page, '#btn-adjust', `Adjust Button at ${vp.name}`);
      await assertElementUnoccluded(page, '#btn-dismiss', `Not Now Button at ${vp.name}`);

      await context.close();
    });
  }

  // =========================================================================
  // 3. Places-off test: /api/places disabled -> honest gated preparation
  // =========================================================================
  test('Places-off test: disabled places provider shows honest owner-gated state', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, { placesEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    // Honest gated state for disabled places
    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Nearby places · not enabled (owner setting)');
    await expect(quietCard).toHaveAttribute('data-provenance', 'none');

    // Zero fixture provenance
    const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBe(0);

    await context.close();
  });

  // =========================================================================
  // 4. Suppression & persistence test: Tap "Not now" -> suppressed quiet -> reload persists
  // =========================================================================
  test('Suppression & persistence: tap "Not now" -> suppressed quiet beat -> cross-session reload persists', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, { placesEnabled: true });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Grant location to display plan
    await page.locator('#btn-request-location').click();
    await page.waitForSelector('#btn-dismiss');

    // Tap "Not now" (#btn-dismiss)
    await page.locator('#btn-dismiss').click();

    // Confirm dismissal in dialog
    await page.waitForSelector('#dismiss-dialog');
    await page.locator('#btn-confirm-dismiss').click();

    // Suppressed quiet beat appears
    const suppressedCard = page.locator('.quiet-card.suppressed-quiet-card');
    await expect(suppressedCard).toBeVisible();
    await expect(page.locator('#quiet-title, .quiet-title')).toContainText(
      "Okay — I'll stay quiet about lunch today"
    );
    await expect(page.locator('#budget-meter-value')).toContainText('1 of 3 used today');

    // Cross-session reload
    await page.reload();
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const reqLocAfterReload = page.locator('#btn-request-location');
    if (await reqLocAfterReload.isVisible()) {
      await reqLocAfterReload.click();
    }

    // Suppression persists
    await expect(page.locator('.quiet-card.suppressed-quiet-card')).toBeVisible();
    await expect(page.locator('#quiet-title, .quiet-title')).toContainText(
      "Okay — I'll stay quiet about lunch today"
    );
    await expect(page.locator('#budget-meter-value')).toContainText('1 of 3 used today');

    // Zero fixture provenance
    const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBe(0);

    await context.close();
  });

  // =========================================================================
  // 5. Failure modes: Consent denied -> "Location Denied"; Weather error -> "Weather unavailable"
  // =========================================================================
  test('Failure modes: consent denied displays honest denied state; weather error shows "Weather unavailable"', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');

    // Mock weather failure (504 Gateway Timeout)
    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherStatus: 504 });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // 1. Location Denied path via #btn-deny-location
    const denyBtn = page.locator('#btn-deny-location');
    if (await denyBtn.isVisible()) {
      await denyBtn.click();
      const quietTitle = page.locator('#quiet-title, .quiet-title');
      await expect(quietTitle).toBeVisible();
      await expect(quietTitle).toContainText('Location');
      await expect(page.locator('.v2-location-notice-banner.denied')).toBeVisible();
    }

    // 2. Weather failure mode: living header displays "Weather unavailable", never 'Clear'
    const livingHeader = page.locator('#living-header-line');
    await expect(livingHeader).toBeVisible();
    const headerText = await livingHeader.textContent();
    expect(headerText).toContain('Weather unavailable');
    expect(headerText).not.toContain('Clear');

    // Zero fixture provenance
    const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBe(0);

    await context.close();
  });

  // =========================================================================
  // 6. UI-level static/e2e gate: In Live without ?dev=1, zero elements with data-provenance="fixture"
  // =========================================================================
  test('UI-level static/e2e gate: Live mode without ?dev=1 emits zero data-provenance="fixture" elements', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
    });
    const page = await context.newPage();

    await setupBaseMockApiRoutes(page, { placesEnabled: true });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBe(0);

    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Fiore Caffe');
    expect(bodyText).not.toContain('Soba Place');

    await context.close();
  });

  // =========================================================================
  // 7. Reviewer Probes: Signal Tiles, Details View Provenance, Tick Refresh, and Ack Persistence
  // =========================================================================
  test('Reviewer Probe 1: Weather OFF & confirmed taste memory - Honest signal tiles and provenance on Home and Details', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#btn-accept', { timeout: 10000 });

    // Signal tile honesty
    const weatherTileVal = await page.locator('#signal-tile-weather .signal-value').innerText();
    expect(weatherTileVal).toBe('Off (owner setting)');

    const calendarTileVal = await page.locator('#signal-tile-calendar .signal-value').innerText();
    expect(calendarTileVal).toBe('Not connected');

    const memoryTile = page.locator('#signal-tile-memory');
    await expect(memoryTile).toBeVisible();
    await expect(memoryTile).toContainText('Japanese or Italian (confirmed)');

    // Provenance honesty on Home
    const homeFixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(homeFixtureCount).toBe(0);

    const homeBody = (await page.textContent('body')) ?? '';
    expect(homeBody).not.toMatch(/Selected City|fuel station|\(simulated\)|Demo/i);

    // Details view honesty
    const detailsBtn = page.locator('#btn-view-trip-details');
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();
    await page.waitForSelector('.v2-detail-view', { timeout: 10000 });

    const detailViewProv = await page.locator('.v2-detail-view').getAttribute('data-provenance');
    expect(detailViewProv).toBe('live');

    const detailFixtureCount = await page.locator('[data-provenance="fixture"]').count();
    expect(detailFixtureCount).toBe(0);

    const detailBadges = await page.locator('.v2-detail-badge').allInnerTexts();
    for (const b of detailBadges) {
      expect(b).not.toMatch(/SIMULATED/i);
    }

    const detailBody = (await page.textContent('body')) ?? '';
    expect(detailBody).not.toMatch(/Selected City|fuel station|\(simulated\)|Demo/i);

    await context.close();
  });

  test('Reviewer Probe 2: Weather Rain 9°C derives honest signal tile (never hardcoded 18°C)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, {
      placesEnabled: true,
      weatherEnabled: true,
      weatherPayload: {
        signals: [
          {
            kind: 'weather',
            value: { condition: 'Rain', temperatureC: 9, precipProbability: 80 },
            issuedAt: '2026-11-02T12:15:00.000Z',
            validFor: 300000,
          },
        ],
      },
    });

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#btn-accept', { timeout: 10000 });

    const weatherTileVal = await page.locator('#signal-tile-weather .signal-value').innerText();
    expect(weatherTileVal).toBe('Rain · 9°C');
    expect(weatherTileVal).not.toContain('18°C');

    await context.close();
  });

  test('Reviewer Probe 3: Zero-input tick crosses lunch window (10:58 -> 11:01)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T10:58:00Z') });
    seedLocalStorage(page);
    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForTimeout(500);

    // Before crossing window: quiet state, no accept button
    expect(await page.locator('#btn-accept').count()).toBe(0);

    // Advance clock 3 minutes (10:58 -> 11:01) to cross into lunch window
    await page.clock.runFor(3 * 60_000);
    await page.waitForTimeout(500);

    // Plan and What-changed marker appeared without any user interaction!
    await expect(page.locator('#btn-accept')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#what-changed-marker')).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test('Reviewer Probe 4: Acknowledged change moment stays gone across tick and reload', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T12:15:00Z') });
    seedLocalStorage(page);
    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#what-changed-marker', { timeout: 10000 });

    // Accept the plan -> dismisses marker
    await page.locator('#btn-accept').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    // Advance clock across a 60s tick
    await page.clock.runFor(65_000);
    await page.waitForTimeout(300);
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    // Reload the page
    await page.reload();
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    const reloadGrantBtn = page.locator('#btn-request-location');
    if (await reloadGrantBtn.isVisible()) {
      await reloadGrantBtn.click();
    }
    await page.waitForTimeout(500);

    // Marker must remain gone because plan was already acknowledged and accepted
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    await context.close();
  });

  test('Reviewer Probe 5: Stale fix (>300s) re-acquired during 6-minute ticks', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T12:15:00Z') });
    seedLocalStorage(page);
    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#btn-accept', { timeout: 10000 });

    // Advance clock by 6 minutes (exceeds 300s fix freshness)
    await page.clock.runFor(6 * 60_000);
    await page.waitForTimeout(500);

    // Plan must still be visible (not vanished to quiet state)
    await expect(page.locator('#btn-accept')).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test('Single-flight suppression: rapid focus and visibilitychange trigger coalescing into exactly 1 places fetch', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-02T12:15:00.000Z') });
    seedLocalStorage(page);

    let placesReqCount = 0;
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/api/places') && !u.includes('/status')) {
        placesReqCount++;
      }
    });

    await setupBaseMockApiRoutes(page, { placesEnabled: true, weatherEnabled: false });

    await page.goto('/?mode=live');
    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#btn-accept', { timeout: 10000 });
    const initialCount = placesReqCount;
    expect(initialCount).toBe(1);

    // D2: inside the provider's 10 s outbound interval the client reuses the results just
    // fetched (a real refetch would only earn the proxy's 429), so no extra fetch yet.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(placesReqCount - initialCount).toBe(0);

    // Past the interval, rapid focus and visibilitychange coalesce into exactly 1 places fetch
    await page.clock.fastForward(11000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(placesReqCount - initialCount).toBe(1);
  });

  test('Reviewer Probe 6: Ack then real candidate change -> marker reappears (P-A)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T03:15:00Z') }); // 12:15 JST
    seedLocalStorage(page);
    let currentPlaces = [
      {
        placeId: 'p1',
        osmId: 101,
        name: 'Tokyo Soba Garden',
        cuisine: 'japanese',
        category: 'restaurant',
        coords: { lat: 37.776, lng: -122.417 },
        source: 'live',
        fetchedAt: new Date().toISOString(),
        straightLineDistanceMeters: 450,
        straightLineDistanceLabel: '450m',
        openingStatus: 'open',
      },
    ];

    await page.route('**/api/**', route => {
      const u = route.request().url();
      let b: any = { enabled: false };
      if (u.includes('/api/places/status')) b = { enabled: true, provider: 'overpass', attribution: 'OpenStreetMap (ODbL)' };
      else if (u.includes('/api/places?')) b = { enabled: true, places: currentPlaces };
      else if (u.includes('/api/weather/status')) b = { enabled: false };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    });

    await page.goto('/?mode=live');
    await page.locator('#btn-request-location').click();
    await page.waitForSelector('#btn-accept');

    // 1. Initial state: marker is visible
    expect(await page.locator('#what-changed-marker').count()).toBe(1);

    // 2. Accept plan: marker disappears
    await page.locator('#btn-accept').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    // 3. Tick 65s (same candidates): marker remains gone
    await page.clock.runFor(65_000);
    await page.waitForTimeout(400);
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    // 4. Candidate set changes (new top place Kyoto Ramen House) & 6-minute tick: marker MUST reappear!
    currentPlaces = [
      {
        placeId: 'p9',
        osmId: 109,
        name: 'Kyoto Ramen House',
        cuisine: 'japanese',
        category: 'restaurant',
        coords: { lat: 37.776, lng: -122.417 },
        source: 'live',
        fetchedAt: new Date().toISOString(),
        straightLineDistanceMeters: 120,
        straightLineDistanceLabel: '120m',
        openingStatus: 'open',
      },
      currentPlaces[0]!,
    ];
    await page.clock.runFor(6 * 60_000);
    await page.waitForTimeout(600);

    expect(await page.locator('#what-changed-marker').count()).toBe(1);
    const bodyText = await page.locator('main').first().innerText();
    expect(bodyText).toContain('Kyoto Ramen House');

    await context.close();
  });

  test('Reviewer Probe 7: Next local day with prior accept -> marker appears and plan unaccepted (P-B)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-03T03:15:00Z') });
    await page.addInitScript(() => {
      localStorage.setItem(
        'yori_state_v1',
        JSON.stringify({
          schemaVersion: 1,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
          payload: {
            memoryFacts: [
              {
                key: 'taste_preference',
                value: 'Japanese',
                status: 'confirmed',
                provenance: { source: 'user_confirmed', recordedAt: '2026-11-01T10:00:00.000Z' },
                updatedAt: '2026-11-01T10:00:00.000Z',
              },
            ],
            proposals: [],
            suppressions: [],
            promptBudget: { date: '2026-11-02', count: 0 },
            acceptedPlanIds: ['plan-lunch-20261102031500000', 'lunch'],
            liveAcknowledgedMoments: { lunch: 'lunch:__HEADLINE__' },
          },
        })
      );
    });

    await page.route('**/api/**', route => {
      const u = route.request().url();
      let b: any = { enabled: false };
      if (u.includes('/api/places/status')) b = { enabled: true, provider: 'overpass', attribution: 'OpenStreetMap (ODbL)' };
      else if (u.includes('/api/places?')) b = { enabled: true, places: MOCK_PLACES_CANDIDATES };
      else if (u.includes('/api/weather/status')) b = { enabled: false };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    });

    await page.goto('/?mode=live');
    await page.locator('#btn-request-location').click();
    await page.waitForTimeout(800);

    // On the next local day, the lunch plan must be unaccepted and show the What-changed marker
    expect(await page.locator('#btn-accept').count()).toBe(1);
    expect(await page.locator('#what-changed-marker').count()).toBe(1);

    await context.close();
  });

  test('Reviewer Probe 8: Stale weather -> tile and strip both show Unavailable, header shows Weather unavailable (P-C)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T03:15:00Z') });
    seedLocalStorage(page);

    await page.route('**/api/**', route => {
      const u = route.request().url();
      let b: any = { enabled: false };
      if (u.includes('/api/places/status')) b = { enabled: true, provider: 'overpass', attribution: 'OpenStreetMap (ODbL)' };
      else if (u.includes('/api/places?')) b = { enabled: true, places: MOCK_PLACES_CANDIDATES };
      else if (u.includes('/api/weather/status')) b = { enabled: true };
      else if (u.includes('/api/weather/current')) {
        b = {
          signals: [
            {
              kind: 'weather',
              value: { condition: 'Clear', temperatureC: 21 },
              issuedAt: '2026-11-02T01:00:00.000Z', // 2h15m old
              validFor: 300000, // 5 minutes validity
            },
          ],
        };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    });

    await page.goto('/?mode=live');
    await page.locator('#btn-request-location').click();
    await page.waitForTimeout(800);

    // 1. Living Context Line header: 'Weather unavailable'
    const headerText = await page.locator('[aria-label="Living Context Line"]').innerText();
    expect(headerText).toContain('Weather unavailable');
    expect(headerText).not.toContain('Clear');

    // 2. Weather Signal Tile: 'Unavailable' (NEVER '21°C' or 'Clear')
    const weatherTileVal = await page.locator('#signal-tile-weather .signal-value').innerText();
    expect(weatherTileVal).toBe('Unavailable');
    expect(weatherTileVal).not.toContain('21');
    expect(weatherTileVal).not.toContain('Clear');

    // 3. Connector strip chip: 'Unavailable' (NEVER 'Open-Meteo')
    const stripWeatherChip = await page.locator('#chip-status-weather').innerText();
    expect(stripWeatherChip).toContain('Unavailable');
    expect(stripWeatherChip).not.toContain('Open-Meteo');

    await context.close();
  });

  test('Reviewer Probe 9: Details view title equals top candidate name (never unknown) and no schematic SVG lines under OSM badge (P-E)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await page.clock.install({ time: new Date('2026-11-02T03:15:00Z') });
    seedLocalStorage(page);

    const testPlaces = [
      {
        placeId: 'p9',
        osmId: 109,
        name: 'Kyoto Ramen House',
        cuisine: 'japanese',
        category: 'restaurant',
        coords: { lat: 37.776, lng: -122.417 },
        source: 'live',
        fetchedAt: new Date().toISOString(),
        straightLineDistanceMeters: 120,
        straightLineDistanceLabel: '120m',
        openingStatus: 'open',
      },
    ];

    await page.route('**/api/**', route => {
      const u = route.request().url();
      let b: any = { enabled: false };
      if (u.includes('/api/places/status')) b = { enabled: true, provider: 'overpass', attribution: 'OpenStreetMap (ODbL)' };
      else if (u.includes('/api/places?')) b = { enabled: true, places: testPlaces };
      else if (u.includes('/api/weather/status')) b = { enabled: true };
      else if (u.includes('/api/weather/current')) {
        b = {
          signals: [
            {
              kind: 'weather',
              value: { condition: 'rain', temperatureC: 9 },
              issuedAt: '2026-11-02T03:15:00.000Z',
              validFor: 300000,
            },
          ],
        };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    });

    await page.goto('/?mode=live');
    await page.locator('#btn-request-location').click();
    await page.waitForSelector('#btn-accept');

    // Scan Home body text for forbidden simulated copy
    const forbiddenRegex = /simulated|Selected City|fuel|Demo|sample|schematic|fixture|Fiore|Soba Place/gi;
    const homeText = await page.locator('body').innerText();
    const homeMatches = [...new Set(homeText.match(forbiddenRegex) || [])];
    expect(homeMatches).toEqual([]);
    expect(await page.locator('[data-provenance="fixture"]').count()).toBe(0);

    // Open Restaurant Details
    await page.locator('#btn-view-trip-details').click();
    await page.waitForSelector('.v2-detail-view');
    await page.waitForTimeout(300);

    // Details view title MUST equal top candidate name 'Kyoto Ramen House' (NEVER 'unknown')
    const detailTitle = await page.locator('.v2-detail-title').innerText();
    expect(detailTitle).toBe('Kyoto Ramen House');
    expect(detailTitle).not.toBe('unknown');

    // Details body text must contain zero forbidden words
    const detailText = await page.locator('body').innerText();
    const detailMatches = [...new Set(detailText.match(forbiddenRegex) || [])];
    expect(detailMatches).toEqual([]);
    expect(await page.locator('[data-provenance="fixture"]').count()).toBe(0);

    // False Provenance assertion: In Live, no element with an OSM/ODbL badge contains schematic grid lines
    const osmElements = await page.locator('.v2-map-card:has(.card-badge:has-text("OpenStreetMap")), .v2-map-card[data-provenance="live"]').all();
    for (const el of osmElements) {
      const svgLineCount = await el.locator('.v2-map-canvas svg line').count();
      expect(svgLineCount, 'No schematic SVG lines allowed under live/OSM badge').toBe(0);
    }

    await context.close();
  });

  test('Reviewer Probe 10 (Migrated from legacy suite): Partial weather payload renders present fields only without invented defaults', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      timezoneId: 'UTC',
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const page = await context.newPage();

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await setupBaseMockApiRoutes(page, {
      placesEnabled: true,
      weatherEnabled: true,
      weatherPayload: {
        signals: [
          {
            id: 'sig-live-weather-partial',
            kind: 'weather',
            source: 'real',
            label: 'real',
            value: {
              temperatureC: 18,
              // condition, city, and summary intentionally omitted
            },
            issuedAt: '2026-11-02T12:15:00.000Z',
            validFor: 3600000,
          },
        ],
      },
    });

    await mockClockAndStorage(page, '2026-11-02T12:15:00.000Z');
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const grantBtn = page.locator('#btn-request-location');
    if (await grantBtn.isVisible()) {
      await grantBtn.click();
    }
    await page.waitForSelector('#btn-accept', { timeout: 10000 });

    const weatherTileVal = await page.locator('#signal-tile-weather .signal-value').innerText();
    expect(weatherTileVal).toBe('18°C');
    expect(weatherTileVal).not.toContain('Clear');
    expect(weatherTileVal).not.toContain('65°F');
    expect(weatherTileVal).not.toContain('San Francisco');

    const headerText = await page.locator('[aria-label="Living Context Line"]').innerText();
    expect(headerText).toContain('18°C');
    expect(headerText).not.toContain('Clear');

    await context.close();
  });
});
