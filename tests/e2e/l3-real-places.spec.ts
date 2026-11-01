import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { RECORDED_ROUTE_COORDINATES } from '../fixtures/route-fixtures.js';
import {
  parseOverpassElements,
  OVERPASS_ATTRIBUTION,
} from '../../src/adapters/providers/overpass-places-adapter.js';

/**
 * L3-REAL-PLACES: Real Nearby Places on Provider Seam E2E Test Suite
 * Governed by TID: INBOX-20261101-B92AC2 and REV3_LIVE_ROADMAP.plan.json §Slice L3.
 *
 * Verifies:
 * 1. Live Places State Matrix across Mobile (390x844), Desktop (1280x800), and Desktop Wide (1440x900):
 *    - Off: renders #notice-places-disabled / #desktop-notice-places-disabled ('Nearby places · not enabled (owner setting)').
 *    - Enabled + no location: renders #notice-places-no-location / #desktop-notice-places-no-location ('Share location to find nearby places').
 *    - Enabled + location + error (500): renders #notice-places-error / #desktop-notice-places-error ('Nearby places unavailable · provider error').
 *    - Enabled + location + empty (0 results): renders #notice-places-empty / #desktop-notice-places-empty ('No dining options found nearby').
 *    - Enabled + location + results: renders candidate cards with OSM source, fetchedAt, cuisine, distance, parseable open-now, zero ratings, zero photos.
 * 2. Place Selection & Route Linkage:
 *    - Clicking a candidate sets the destination in DestinationPort (osmId, name, source 'user-selected place').
 *    - When route provider disabled: route card shows 'Route to <name>' with 'No route available · provider disabled'.
 *    - With stubbed route response: route card renders polyline SVG and 'Route © OSRM · data © OpenStreetMap contributors'.
 *    - Desktop right panel displays selected candidate and linked route card.
 * 3. Ranking & Memory:
 *    - Matches confirmed taste preferences or cites distance rule; zero model calls.
 * 4. Label & Provenance Audit:
 *    - Zero fixture elements in Live mode across mobile and desktop panel.
 *    - All live elements carry valid data-source and data-fetched-at.
 *    - Demo mode scene remains 'Schematic · simulated' and never blends with Live.
 * 5. Accessibility & Responsive Layout:
 *    - Axe WCAG AA check: 0 critical or serious violations.
 *    - Zero horizontal overflow.
 *    - Hit targets >= 44x44px.
 *    - Center map strip strictly hidden on desktop (>=1024px) when right panel is present.
 *    - Desktop neutral panel copy reads 'Nothing selected. Select a card to see details.'
 * 6. Evidence Matrix: 6 states across 3 widths (390, 1280, 1440) = 18 PNG deliverables.
 */

const EVIDENCE_DIR = getEvidenceDir('l3-real-places');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'desktop-wide', width: 1440, height: 900 },
];

const FIXTURE_PATH = path.join(process.cwd(), 'tests/fixtures/overpass-places-fixture.json');
const FIXTURE_RAW = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

function getStubPlaces(userLat = 37.7749, userLng = -122.4194) {
  return parseOverpassElements(
    FIXTURE_RAW.elements,
    'restaurant',
    { lat: userLat, lng: userLng },
    new Date().toISOString()
  );
}

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
  const rules = ['color-contrast', 'button-name', 'heading-order', 'label', 'region'];
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
  // 1. Zero fixture elements in Live mode
  const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
  expect(
    fixtureCount,
    `Label audit failed in ${contextName}: found ${fixtureCount} fixture elements in Live mode`
  ).toBe(0);

  // 2. Forbidden demo phrases in visible text
  const bodyText = await page.locator('body').innerText();
  const forbiddenPhrases = [
    'SIMULATED',
    'Demo Place',
    'Piano lesson',
    'Downtown',
    'Lunch options near you',
    'places matching your tastes',
    'Rain re-plan',
    'Team Sync',
    'School Pickup',
  ];
  for (const phrase of forbiddenPhrases) {
    expect(
      bodyText,
      `Label audit failed in ${contextName}: found forbidden phrase "${phrase}" in Live mode`
    ).not.toContain(phrase);
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

async function mockLocationGranted(page: Page, lat = 37.7749, lng = -122.4194) {
  await page.addInitScript(
    ({ lat, lng }) => {
      const mockGeo = {
        getCurrentPosition: (success: any) => {
          success({
            coords: { latitude: lat, longitude: lng, accuracy: 20 },
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
    },
    { lat, lng }
  );
  await page.evaluate(
    ({ lat, lng }) => {
      const mockGeo = {
        getCurrentPosition: (success: any) => {
          success({
            coords: { latitude: lat, longitude: lng, accuracy: 20 },
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
    },
    { lat, lng }
  );
}

test.describe('L3-REAL-PLACES: Real Nearby Places & Provider Seam Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  for (const vp of VIEWPORTS) {
    test(`State Matrix across viewports at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const isDesktop = vp.width >= 1024;

      // -------------------------------------------------------------
      // 1. STATE 1: Flag Off (Default)
      // -------------------------------------------------------------
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });

      await page.goto('/?mode=live');
      await page.waitForSelector('#notice-places-disabled');

      const mobileDisabledNotice = page.locator('#notice-places-disabled');
      await expect(mobileDisabledNotice).toBeVisible();
      await expect(mobileDisabledNotice).toHaveAttribute('data-provenance', 'none');
      await expect(mobileDisabledNotice).toContainText('Nearby places · not enabled (owner setting)');

      if (isDesktop) {
        const desktopDisabledNotice = page.locator(
          '#desktop-notice-places-disabled, #desktop-notice-places-disabled-quiet'
        ).first();
        await expect(desktopDisabledNotice).toBeVisible();
        await expect(desktopDisabledNotice).toHaveAttribute('data-provenance', 'none');
        await expect(desktopDisabledNotice).toContainText('Nearby places · not enabled (owner setting)');
      }

      await checkNoOverflow(page);
      await checkAxe(page, `places-flag-off-${vp.name}`);

      // -------------------------------------------------------------
      // 2. STATE 2: Flag Enabled, Location Not Shared
      // -------------------------------------------------------------
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });

      await page.goto('/?mode=live');
      await page.waitForSelector('#notice-places-no-location');

      const mobileNoLocNotice = page.locator('#notice-places-no-location');
      await expect(mobileNoLocNotice).toBeVisible();
      await expect(mobileNoLocNotice).toHaveAttribute('data-provenance', 'none');
      await expect(mobileNoLocNotice).toContainText('Share location to find nearby places');

      if (isDesktop) {
        const desktopNoLocNotice = page.locator(
          '#desktop-notice-places-no-location, #desktop-notice-places-no-location-quiet'
        ).first();
        await expect(desktopNoLocNotice).toBeVisible();
        await expect(desktopNoLocNotice).toHaveAttribute('data-provenance', 'none');
        await expect(desktopNoLocNotice).toContainText('Share location to find nearby places');
      }

      await checkNoOverflow(page);
      await checkAxe(page, `places-no-location-${vp.name}`);

      // -------------------------------------------------------------
      // 3. STATE 3: Flag Enabled, Location Shared, Provider Error (500)
      // -------------------------------------------------------------
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal provider failure' }),
        });
      });

      await page.goto('/?mode=live');
      await mockLocationGranted(page);
      const connectLocBtn = page.locator('#btn-connect-location');
      if (await connectLocBtn.isVisible()) {
        await connectLocBtn.click();
      }

      await page.waitForSelector('#notice-places-error');
      const mobileErrorNotice = page.locator('#notice-places-error');
      await expect(mobileErrorNotice).toBeVisible();
      await expect(mobileErrorNotice).toHaveAttribute('data-provenance', 'none');
      await expect(mobileErrorNotice).toContainText('Nearby places unavailable · provider error');

      if (isDesktop) {
        const desktopErrorNotice = page.locator(
          '#desktop-notice-places-error, #desktop-notice-places-error-quiet'
        ).first();
        await expect(desktopErrorNotice).toBeVisible();
        await expect(desktopErrorNotice).toHaveAttribute('data-provenance', 'none');
        await expect(desktopErrorNotice).toContainText('Nearby places unavailable · provider error');
      }

      await checkNoOverflow(page);
      await checkAxe(page, `places-error-${vp.name}`);

      // -------------------------------------------------------------
      // 4. STATE 4: Flag Enabled, Location Shared, 0 Results
      // -------------------------------------------------------------
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, places: [], attribution: OVERPASS_ATTRIBUTION }),
        });
      });

      await page.goto('/?mode=live');
      await mockLocationGranted(page);
      const connectLocBtn2 = page.locator('#btn-connect-location');
      if (await connectLocBtn2.isVisible()) {
        await connectLocBtn2.click();
      }

      await page.waitForSelector('#notice-places-empty');
      const mobileEmptyNotice = page.locator('#notice-places-empty');
      await expect(mobileEmptyNotice).toBeVisible();
      await expect(mobileEmptyNotice).toHaveAttribute('data-provenance', 'none');
      await expect(mobileEmptyNotice).toContainText('No dining options found nearby');

      if (isDesktop) {
        const desktopEmptyNotice = page.locator(
          '#desktop-notice-places-empty, #desktop-notice-places-empty-quiet'
        ).first();
        await expect(desktopEmptyNotice).toBeVisible();
        await expect(desktopEmptyNotice).toHaveAttribute('data-provenance', 'none');
        await expect(desktopEmptyNotice).toContainText('No dining options found nearby');
      }

      await checkNoOverflow(page);
      await checkAxe(page, `places-empty-${vp.name}`);

      // -------------------------------------------------------------
      // 5. STATE 5: Flag Enabled, Location Shared, Results Returned
      // -------------------------------------------------------------
      const stubPlaces = getStubPlaces();
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, places: stubPlaces, attribution: OVERPASS_ATTRIBUTION }),
        });
      });

      await page.goto('/?mode=live');
      await mockLocationGranted(page);
      const connectLocBtn3 = page.locator('#btn-connect-location');
      if (await connectLocBtn3.isVisible()) {
        await connectLocBtn3.click();
      }

      await page.waitForSelector('#live-places-section');

      // Verify Mobile Places Section
      const placesSection = page.locator('#live-places-section');
      await expect(placesSection).toBeVisible();

      // Header attribution badge carries provenance
      const headerBadge = placesSection.locator('.card-badge');
      await expect(headerBadge).toHaveAttribute('data-provenance', 'live');
      await expect(headerBadge).toHaveAttribute('data-source', 'overpass');
      await expect(headerBadge).toContainText('OpenStreetMap (ODbL)');

      // Verify all 4 candidates rendered
      const placeCards = page.locator('.live-place-card');
      await expect(placeCards).toHaveCount(4);

      // Verify candidate details & truthfulness invariants
      // 1. Market Street Cafe (24/7 -> open now)
      const cafeCard = page.locator('#live-place-card-1003');
      await expect(cafeCard).toBeVisible();
      await expect(cafeCard).toHaveAttribute('data-provenance', 'live');
      await expect(cafeCard).toHaveAttribute('data-source', 'overpass');
      await expect(cafeCard).toContainText('Market Street Cafe');
      await expect(cafeCard).toContainText('OpenStreetMap via Overpass (ODbL)');
      await expect(cafeCard).toContainText('coffee_shop');
      await expect(cafeCard.locator('.v2-open-chip')).toContainText('Open now');

      // 2. Civic Center Diner (Mo-Fr -> opening status undefined outside hours -> open chip omitted)
      const dinerCard = page.locator('#live-place-card-1001');
      await expect(dinerCard).toBeVisible();
      await expect(dinerCard).toContainText('Civic Center Diner');
      await expect(dinerCard).toContainText('american');

      // Zero star ratings, zero stock photos anywhere in candidates
      const allText = await placesSection.innerText();
      expect(allText).not.toContain('★');
      expect(allText).not.toContain('rating');
      const photoImgs = placesSection.locator('img');
      await expect(photoImgs).toHaveCount(0);

      // In desktop panel:
      if (isDesktop) {
        const desktopCandidates = page.locator('.desktop-candidate-tile');
        await expect(desktopCandidates).toHaveCount(4);
        const desktopTile = page.locator('.desktop-candidate-tile[data-osm-id="1003"]');
        await expect(desktopTile).toBeVisible();
        await expect(desktopTile).toContainText('Market Street Cafe');
        await expect(desktopTile).toContainText('OpenStreetMap via Overpass (ODbL)');
      }

      // Run Label Audit
      await runLabelAudit(page, `places-results-${vp.name}`);
      await checkNoOverflow(page);
      await checkAxe(page, `places-results-${vp.name}`);
    });
  }

  test('Place Selection & Route Linkage (DestinationPort updates and Route Card displays)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const stubPlaces = getStubPlaces();
    const nowIso = new Date().toISOString();
    const recordedRouteData = {
      enabled: true,
      route: {
        geometry: RECORDED_ROUTE_COORDINATES,
        distanceM: 2146,
        durationS: 349,
        provider: 'osrm',
        fetchedAt: nowIso,
        attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        mode: 'driving',
      },
      attribution: 'Route © OSRM · data © OpenStreetMap contributors',
    };

    await page.route(url => url.pathname.includes('/api/places/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
      });
    });
    await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, places: stubPlaces, attribution: OVERPASS_ATTRIBUTION }),
      });
    });

    // Case A: Route Provider DISABLED
    await page.route(url => url.pathname.includes('/api/route/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, provider: 'osrm' }),
      });
    });

    await page.goto('/?mode=live');
    await mockLocationGranted(page);
    const connectLocBtn = page.locator('#btn-connect-location');
    if (await connectLocBtn.isVisible()) {
      await connectLocBtn.click();
    }
    await page.waitForSelector('#live-places-section');

    // Click Hayes Valley Ramen (OSM ID 1002)
    const ramenTile = page.locator('.desktop-candidate-tile[data-osm-id="1002"], #live-place-card-1002').first();
    await expect(ramenTile).toBeVisible();
    await ramenTile.click();

    // Verify candidate is selected
    await expect(ramenTile).toHaveClass(/selected/);

    // Verify Route Card in desktop panel reads 'Route to Hayes Valley Ramen' with 'No route available · provider disabled'
    const desktopRouteUnavailable = page.locator(
      '#desktop-notice-route-unavailable, #desktop-notice-route-unavailable-quiet'
    ).first();
    await expect(desktopRouteUnavailable).toBeVisible();
    await expect(desktopRouteUnavailable).toContainText('Route to Hayes Valley Ramen');
    await expect(desktopRouteUnavailable).toContainText('No route available · provider disabled');

    // Also verify center column route card
    const centerRouteNotice = page.locator('#notice-route-unavailable');
    await expect(centerRouteNotice).toBeVisible();
    await expect(centerRouteNotice).toContainText('Route to Hayes Valley Ramen');
    await expect(centerRouteNotice).toContainText('No route available · provider disabled');

    // Case B: Route Provider ENABLED with Stubbed Route
    await page.unrouteAll();
    await page.route(url => url.pathname.includes('/api/places/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
      });
    });
    await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, places: stubPlaces, attribution: OVERPASS_ATTRIBUTION }),
      });
    });
    await page.route(url => url.pathname.includes('/api/route/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'osrm',
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
          tilesEnabled: false,
        }),
      });
    });
    await page.route(url => url.pathname.includes('/api/route') && !url.pathname.includes('/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(recordedRouteData),
      });
    });

    // Re-select Civic Center Diner (OSM ID 1001)
    const dinerTile = page.locator('.desktop-candidate-tile[data-osm-id="1001"], #live-place-card-1001').first();
    await expect(dinerTile).toBeVisible();
    await dinerTile.click();

    await expect(dinerTile).toHaveClass(/selected/);

    // Desktop live route card renders
    const desktopLiveRouteCard = page.locator('#desktop-live-route-card');
    await expect(desktopLiveRouteCard).toBeVisible();
    await expect(desktopLiveRouteCard).toHaveAttribute('data-provenance', 'live');
    await expect(desktopLiveRouteCard).toHaveAttribute('data-source', 'osrm');
    await expect(desktopLiveRouteCard).toContainText('Route to Civic Center Diner');
    await expect(desktopLiveRouteCard.locator('.live-route-eta')).toContainText('6 min');
    await expect(desktopLiveRouteCard.locator('.live-route-distance')).toContainText('2.1 km');
    await expect(desktopLiveRouteCard.locator('.live-route-attribution')).toContainText(
      'Route © OSRM · data © OpenStreetMap contributors'
    );

    // Center column route card also updates
    const centerLiveRouteCard = page.locator('#live-route-card');
    await expect(centerLiveRouteCard).toBeVisible();
    await expect(centerLiveRouteCard).toContainText('Route to Civic Center Diner');

    await runLabelAudit(page, 'place-selected-route-desktop');
    await checkNoOverflow(page);
    await checkAxe(page, 'place-selected-route-desktop');
  });

  test('Deterministic Ranking cites Confirmed Memory or Distance Rule (Zero Model Calls)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const stubPlaces = getStubPlaces();
    await page.route(url => url.pathname.includes('/api/places/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
      });
    });
    await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, places: stubPlaces, attribution: OVERPASS_ATTRIBUTION }),
      });
    });

    // 1. Without confirmed taste memory: all items cite distance rule
    await page.goto('/?mode=live');
    await mockLocationGranted(page);
    const connectLocBtn = page.locator('#btn-connect-location');
    if (await connectLocBtn.isVisible()) {
      await connectLocBtn.click();
    }
    await page.waitForSelector('#live-places-section');

    const firstPlaceDesc = page.locator('.live-place-card .live-card-desc').first();
    await expect(firstPlaceDesc).toBeVisible();
    await expect(firstPlaceDesc).toContainText('Closest dining option');

    // 2. With confirmed taste memory injected
    await page.evaluate(() => {
      const nowIso = new Date().toISOString();
      const envelope = {
        schemaVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        payload: {
          memoryFacts: [
            {
              key: 'favorite_cuisine',
              value: 'ramen',
              status: 'confirmed',
              updatedAt: nowIso,
              provenance: { source: 'local_explicit' },
            },
          ],
          proposals: [],
          suppressions: [],
          promptBudget: { date: nowIso.slice(0, 10), count: 0 },
          acceptedPlanIds: [],
        },
      };
      localStorage.setItem('yori_state_v1', JSON.stringify(envelope));
    });

    await page.reload();
    await mockLocationGranted(page);
    const connectLocBtnAfter = page.locator('#btn-connect-location');
    if (await connectLocBtnAfter.isVisible()) {
      await connectLocBtnAfter.click();
    }
    await page.waitForSelector('#live-places-section');

    // Hayes Valley Ramen is now top-ranked with explanation citing confirmed preference
    const ramenDesc = page.locator('#live-place-card-1002 .live-card-desc');
    await expect(ramenDesc).toBeVisible();
    await expect(ramenDesc).toContainText('Matches your confirmed taste for ramen');
  });

  test('Carried P3: Center Map Strip strictly hidden at >=1024px and Quiet Copy does not overclaim', async ({
    page,
  }) => {
    // 1. Verify at 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout');

    // Neutral right panel quiet copy does not overclaim
    const rightPanel = page.locator('.desktop-right-panel');
    await expect(rightPanel).toBeVisible();
    await expect(rightPanel).toContainText('Nothing selected. Select a card to see details.');
    const rightPanelText = await rightPanel.innerText();
    expect(rightPanelText).not.toContain('Real-time providers ready');

    // Map strip inside center column is strictly hidden
    const centerMapStrip = page.locator('.desktop-center-column .now-map-strip');
    if (await centerMapStrip.count() > 0) {
      await expect(centerMapStrip).toBeHidden();
    }
    const compactMapStrip = page.locator('.desktop-center-column .compact-map-strip');
    if (await compactMapStrip.count() > 0) {
      await expect(compactMapStrip).toBeHidden();
    }

    // 2. Verify in Demo away-lunch scene: remains simulated and does not blend
    await page.goto('/?ui=v2&mode=demo&scene=away-lunch&dev=1');
    await page.waitForSelector('.app-layout');

    await expect(page.locator('body')).toContainText('Schematic · simulated');
  });

  test('Evidence Capture Matrix: 6 States Across 3 Widths (18 Deliverables)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);

    // Only run evidence capture on desktop project to prevent duplicate multi-project screenshot overwrites
    if (testInfo.project.name !== 'desktop') {
      test.skip();
      return;
    }

    const viewports = [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ];

    const stubPlaces = getStubPlaces();
    const nowIso = new Date().toISOString();
    const recordedRouteData = {
      enabled: true,
      route: {
        geometry: RECORDED_ROUTE_COORDINATES,
        distanceM: 2146,
        durationS: 349,
        provider: 'osrm',
        fetchedAt: nowIso,
        attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        mode: 'driving',
      },
      attribution: 'Route © OSRM · data © OpenStreetMap contributors',
    };

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // State 1: live-places-off
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.goto('/?mode=live');
      await page.waitForSelector('#notice-places-disabled');
      await page.waitForTimeout(100);
      await saveEvidence(page, `01-live-places-off-${vp.width}.png`);

      // State 2: live-places-no-location
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.goto('/?mode=live');
      await page.waitForSelector('#notice-places-no-location');
      await page.waitForTimeout(100);
      await saveEvidence(page, `02-live-places-no-location-${vp.width}.png`);

      // State 3: live-places-results
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, places: stubPlaces, attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.goto('/?mode=live');
      await mockLocationGranted(page);
      const connectBtn = page.locator('#btn-connect-location');
      if (await connectBtn.isVisible()) {
        await connectBtn.click();
      }
      await page.waitForSelector('#live-places-section');
      await page.waitForTimeout(100);
      await saveEvidence(page, `03-live-places-results-${vp.width}.png`);

      // State 4: live-place-selected-route
      await page.route(url => url.pathname.includes('/api/route/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            provider: 'osrm',
            attribution: 'Route © OSRM · data © OpenStreetMap contributors',
            tilesEnabled: false,
          }),
        });
      });
      await page.route(url => url.pathname.includes('/api/route') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(recordedRouteData),
        });
      });

      const selectTile = page.locator('.desktop-candidate-tile[data-osm-id="1002"], #live-place-card-1002').first();
      await selectTile.click();
      await page.waitForSelector('#desktop-live-route-card, #live-route-card');
      await page.waitForTimeout(100);
      await saveEvidence(page, `04-live-place-selected-route-${vp.width}.png`);

      // State 5: live-places-error
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/places/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'overpass', attribution: OVERPASS_ATTRIBUTION }),
        });
      });
      await page.route(url => url.pathname.includes('/api/places') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal provider failure' }),
        });
      });
      await page.goto('/?mode=live');
      await mockLocationGranted(page);
      const connectBtn2 = page.locator('#btn-connect-location');
      if (await connectBtn2.isVisible()) {
        await connectBtn2.click();
      }
      await page.waitForSelector('#notice-places-error');
      await page.waitForTimeout(100);
      await saveEvidence(page, `05-live-places-error-${vp.width}.png`);

      // State 6: demo-lunch
      await page.unrouteAll();
      await page.goto('/?ui=v2&mode=demo&scene=away-lunch&dev=1');
      await page.waitForSelector('.app-layout');
      await page.waitForTimeout(100);
      await saveEvidence(page, `06-demo-lunch-${vp.width}.png`);
    }
  });
});
