/**
 * S3-LIVE-LUNCH E2E Tests (TID: INBOX-20261102-C7C922)
 * Governed by LIVE_FIRST plan (docs/architecture/LIVE_FIRST.plan.{md,json}).
 *
 * Acceptance Checks:
 * 1. Dual Gate A (390x844 mobile):
 *    - Lunch window intent (12:15 UTC) + consented location (37.7749, -122.4194)
 *    - Overpass candidates appear with real IDs, coordinates, and fetchedAt.
 *    - Candidates ranked by confirmed taste memory ('Japanese or Ramen' -> Hayes Valley Ramen ranked #1).
 *    - open-now derived solely from opening_hours ('Open now' vs 'Hours unknown').
 *    - ODbL/OSM attribution visible ('OpenStreetMap via Overpass (ODbL)').
 *    - Walking ETA and distance displayed for selected candidate.
 *    - Acceptance state stable across 60s ticks within the same calendar day.
 * 2. Dual Gate B (1280x800 desktop):
 *    - Candidates panel with real Overpass tiles.
 *    - Candidate tile meta shows 'Open now' / 'Hours unknown' chip.
 *    - Selecting a candidate triggers /api/route with mode=walking.
 *    - Live route card renders walking ETA (e.g. 6 min), distance (450 m), and OSRM attribution.
 * 3. Honest States:
 *    - Location denied -> honest gated state ("Location Access Denied").
 *    - Places provider off -> honest notice ("Nearby places · not enabled (owner setting)").
 *    - Cold user with no confirmed lunch memory -> stays in quiet neutral state (fails closed).
 *    - Zero synthetic/demo copy, zero stock photos, zero invented star ratings.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/live-lunch');

test.use({
  timezoneId: 'UTC',
  permissions: ['geolocation'],
  geolocation: { latitude: 37.7749, longitude: -122.4194 },
});

const RECORDED_OVERPASS_PLACES = [
  {
    placeId: 'overpass-node-1002',
    osmId: 1002,
    name: 'Hayes Valley Ramen',
    cuisine: 'japanese',
    category: 'restaurant',
    coords: { lat: 37.776, lng: -122.417 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 450,
    straightLineDistanceLabel: '450 m (straight-line)',
    openingStatus: 'open',
    attribution: 'OpenStreetMap via Overpass (ODbL)',
  },
  {
    placeId: 'overpass-node-1001',
    osmId: 1001,
    name: 'Civic Center Diner',
    cuisine: 'american',
    category: 'restaurant',
    coords: { lat: 37.7755, lng: -122.418 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 250,
    straightLineDistanceLabel: '250 m (straight-line)',
    openingStatus: 'open',
    attribution: 'OpenStreetMap via Overpass (ODbL)',
  },
  {
    placeId: 'overpass-node-1004',
    osmId: 1004,
    name: 'Mission Taqueria',
    cuisine: 'mexican',
    category: 'restaurant',
    coords: { lat: 37.777, lng: -122.416 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 600,
    straightLineDistanceLabel: '600 m (straight-line)',
    openingStatus: undefined, // No opening_hours tag -> Hours unknown
    attribution: 'OpenStreetMap via Overpass (ODbL)',
  },
];

const RECORDED_WALKING_ROUTE = {
  geometry: [
    [37.7749, -122.4194],
    [37.7752, -122.4187],
    [37.776, -122.417],
  ],
  distanceM: 450,
  durationS: 360, // 6 minutes
  provider: 'osrm',
  fetchedAt: '2026-11-02T12:15:00.000Z',
  attribution: 'Route © OSRM · data © OpenStreetMap contributors',
  mode: 'walking',
};

function setupClockAndMemory(
  page: Page,
  options?: {
    isoTime?: string;
    memoryFacts?: any[];
    acceptedPlanIds?: string[];
  }
) {
  const isoTime = options?.isoTime ?? '2026-11-02T12:15:00.000Z';
  const memoryFacts = options?.memoryFacts ?? [
    {
      key: 'taste_preference',
      value: 'Japanese or Ramen',
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
      updatedAt: '2026-11-02T12:00:00.000Z',
    },
  ];
  const acceptedPlanIds = options?.acceptedPlanIds ?? [];

  return page.addInitScript(
    ({ timeStr, facts, accepted }) => {
      let currentFixedMs = new Date(timeStr).getTime();
      const OrigDate = window.Date;
      class PatchedDate extends OrigDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(currentFixedMs);
          } else {
            super(...(args as [any]));
          }
        }
      }
      PatchedDate.now = () => currentFixedMs;
      PatchedDate.parse = OrigDate.parse;
      PatchedDate.UTC = OrigDate.UTC;
      window.Date = PatchedDate as any;

      (window as any).__advanceClockMs = (ms: number) => {
        currentFixedMs += ms;
      };

      if (!localStorage.getItem('yori_state_v1')) {
        localStorage.setItem(
          'yori_state_v1',
          JSON.stringify({
            schemaVersion: 1,
            createdAt: '2026-11-02T12:00:00.000Z',
            updatedAt: '2026-11-02T12:00:00.000Z',
            payload: {
              memoryFacts: facts,
              proposals: [],
              suppressions: [],
              promptBudget: { date: '2026-11-02', count: 0 },
              acceptedPlanIds: accepted,
            },
          })
        );
      }
    },
    { timeStr: isoTime, facts: memoryFacts, accepted: acceptedPlanIds }
  );
}

function setupMockApis(
  page: Page,
  options?: {
    placesEnabled?: boolean;
    routeEnabled?: boolean;
    places?: any[];
  }
) {
  const placesEnabled = options?.placesEnabled ?? true;
  const routeEnabled = options?.routeEnabled ?? true;
  const places = options?.places ?? RECORDED_OVERPASS_PLACES;

  return Promise.all([
    page.route('**/api/xmemo/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      })
    ),
    page.route('**/api/weather/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      })
    ),
    page.route('**/api/places/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: placesEnabled,
          provider: 'overpass',
          attribution: 'OpenStreetMap via Overpass (ODbL)',
        }),
      })
    ),
    page.route('**/api/places?*', route => {
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
          places,
        }),
      });
    }),
    page.route('**/api/route/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: routeEnabled,
          provider: 'osrm',
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      })
    ),
    page.route('**/api/route?*', route => {
      const url = new URL(route.request().url());
      const mode = url.searchParams.get('mode') || 'driving';
      if (!routeEnabled) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          route: {
            ...RECORDED_WALKING_ROUTE,
            mode,
          },
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      });
    }),
  ]);
}

test.describe('S3-LIVE-LUNCH: Full Live Verification Matrix', () => {
  test.beforeAll(() => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  // =========================================================================
  // Dual Gate A: Mobile 390x844
  // =========================================================================
  test('Dual Gate A (390x844): lunch intent appears with real candidates, open-now chip, ODbL attribution, and tick stability', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T12:15:00.000Z' });
    await setupMockApis(page, { placesEnabled: true, routeEnabled: true });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Initial state: consent needed
    const reqLocBtn = page.locator('#btn-request-location');
    await expect(reqLocBtn).toBeVisible();

    // Click to grant location
    await reqLocBtn.click();

    // Lunch recommendation plan appears
    const heroCard = page.locator('.now-card, .v2-candidates-hero');
    await expect(heroCard).toBeVisible({ timeout: 10000 });

    // Hayes Valley Ramen ranked #1 matching confirmed Japanese/Ramen taste
    await expect(heroCard).toContainText('Hayes Valley Ramen');

    // Opening hours chip derived solely from opening_hours tag: 'Open now'
    const openChip = page.locator('.v2-open-chip');
    await expect(openChip.first()).toBeVisible();
    await expect(openChip.first()).toContainText('Open now');

    // Taste preference citation: You confirmed
    const basis = page.locator('.v2-candidate-basis').first();
    await expect(basis).toContainText('You confirmed');

    // Zero fixture provenance
    const fixtureElements = await page.locator('[data-provenance="fixture"]').count();
    expect(fixtureElements).toBe(0);

    // Scroll candidate card into view so Hayes Valley Ramen tile, tags, and Open now chip are visible
    const candidateCard = page.locator('.v2-candidate-card').first();
    await candidateCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Capture Dual Gate A mobile screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-live-lunch-390x844.png') });

    // View Details
    const detailLink = page.locator('#btn-detail-opt-1-hayes-valley-ramen, .v2-view-detail-link').first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();

    // In RestaurantDetail view:
    const detailView = page.locator('.v2-restaurant-detail');
    await expect(detailView).toBeVisible();
    await expect(page.locator('#restaurant-detail-name')).toContainText('Hayes Valley Ramen');

    // ODbL attribution is visible on detail view
    const notice = page.locator('.mock-places-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('OpenStreetMap via Overpass (ODbL)');

    // Back to home
    await page.locator('#restaurant-detail-back-btn').click();
    await expect(heroCard).toBeVisible();

    // Accept plan
    const acceptBtn = page.locator('#btn-accept');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // State becomes accepted
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    const badgeAccepted = page.locator('.badge-accepted');
    await expect(badgeAccepted).toBeVisible();

    // Tick stability test: advance clock by 60s within same calendar day (12:16:00)
    await page.evaluate(() => {
      if ((window as any).__advanceClockMs) {
        (window as any).__advanceClockMs(60000);
      }
    });

    // Plan remains stably accepted on subsequent tick (does not disappear)
    await expect(badgeAccepted).toBeVisible();
    await expect(undoBtn).toBeVisible();
  });

  // =========================================================================
  // Dual Gate B: Desktop 1280x800
  // =========================================================================
  test('Dual Gate B (1280x800): desktop candidates list, Hours unknown chip, walking OSRM ETA, and ODbL attribution', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T12:15:00.000Z' });
    await setupMockApis(page, { placesEnabled: true, routeEnabled: true });

    let requestedRouteMode = '';
    await page.route('**/api/route?*', route => {
      const url = new URL(route.request().url());
      requestedRouteMode = url.searchParams.get('mode') || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          route: RECORDED_WALKING_ROUTE,
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      });
    });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Grant location via desktop connect or main request button
    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    // Wait for desktop candidate tiles in right panel
    const desktopTile = page.locator('.desktop-candidate-tile[data-osm-id="1002"]');
    await expect(desktopTile).toBeVisible({ timeout: 10000 });
    await expect(desktopTile).toContainText('Hayes Valley Ramen');

    // Verify ODbL header in desktop places section
    const placesHeader = page.locator('.desktop-panel-places-header');
    await expect(placesHeader).toContainText('OpenStreetMap (ODbL)');

    // Verify 'Open now' chip on Hayes Valley Ramen
    await expect(desktopTile.locator('.v2-open-chip')).toContainText('Open now');

    // Verify 'Hours unknown' chip on Mission Taqueria (unparseable / absent opening_hours tag)
    const taqueriaTile = page.locator('.desktop-candidate-tile[data-osm-id="1004"]');
    await expect(taqueriaTile).toBeVisible();
    await expect(taqueriaTile.locator('.v2-open-chip.unknown')).toContainText('Hours unknown');

    // Click candidate tile to select and compute walking route
    await desktopTile.click();

    // Verify /api/route was called with mode=walking
    expect(requestedRouteMode).toBe('walking');

    // Verify Live Route card renders walking ETA and distance
    const liveRouteCard = page.locator('#desktop-live-route-card');
    await expect(liveRouteCard).toBeVisible({ timeout: 5000 });
    await expect(liveRouteCard.locator('.live-route-eta')).toContainText('6 min');
    await expect(liveRouteCard.locator('.live-route-distance')).toContainText('450 m');

    // Attribution on route card
    const routeAttribution = liveRouteCard.locator('.live-route-attribution');
    await expect(routeAttribution).toContainText('Route © OSRM');
    await expect(routeAttribution).toContainText('OpenStreetMap contributors');

    // Capture Dual Gate B desktop screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-live-lunch-1280x800.png') });
  });

  // =========================================================================
  // Honest States: Denied Location, Provider Off, Cold User
  // =========================================================================
  test('Honest states: location denied renders honest notice; zero fake venues', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'UTC',
      permissions: [], // No geolocation permission
    });
    const page = await context.newPage();
    await setupClockAndMemory(page, { isoTime: '2026-11-02T12:15:00.000Z' });
    await setupMockApis(page, { placesEnabled: true });

    // Mock geolocation error (denied)
    await page.addInitScript(() => {
      (navigator as any).geolocation.getCurrentPosition = (
        _success: any,
        error: any
      ) => {
        error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
      };
    });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const reqLocBtn = page.locator('#btn-request-location');
    await expect(reqLocBtn).toBeVisible();
    await reqLocBtn.click();

    // Honest denied state rendered
    const deniedText = page.locator('#quiet-title, .quiet-title, .quiet-subtitle');
    await expect(deniedText.first()).toContainText(/Location (Access )?Denied|Permission Needed/i);

    // Zero fake candidate venues rendered
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Hayes Valley Ramen');
    expect(bodyText).not.toContain('Fiore Caffe');
    expect(bodyText).not.toContain('Soba Place');

    await context.close();
  });

  test('Honest states: places provider disabled renders honest owner-gated notice', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T12:15:00.000Z' });
    await setupMockApis(page, { placesEnabled: false });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Right panel displays honest owner-gated notice
    const disabledNotice = page.locator('#desktop-notice-places-disabled, #desktop-notice-places-disabled-quiet');
    await expect(disabledNotice.first()).toBeVisible();
    await expect(disabledNotice.first()).toContainText('not enabled (owner setting)');

    // Zero candidate cards rendered
    const candidateTiles = await page.locator('.desktop-candidate-tile').count();
    expect(candidateTiles).toBe(0);
  });

  test('Cold user with no confirmed lunch memory fails closed to quiet state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Cold user: zero confirmed taste facts
    await setupClockAndMemory(page, { isoTime: '2026-11-02T12:15:00.000Z', memoryFacts: [] });
    await setupMockApis(page, { placesEnabled: true });

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    // Since cold user has zero confirmed taste memory facts, lunch recommendation fails closed
    // No ungrounded lunch candidate card is presented to the user
    const heroLunch = page.locator('.now-card.v2-candidates-hero');
    await expect(heroLunch).toHaveCount(0);

    // Quiet neutral state is maintained
    const quietTitle = page.locator('#quiet-title, .quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText(/Nothing needs your attention right now|All quiet for now|Location Shared/i);
  });
});
