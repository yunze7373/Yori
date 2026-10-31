import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import {
  RECORDED_ROUTE_COORDINATES,
} from '../fixtures/route-fixtures.js';

/**
 * L2-ROUTE-MAP: Real Route/Map Routing Pipeline E2E Test Suite
 * Governed by TID: INBOX-20261031-5B39CA and REV3_LIVE_ROADMAP.plan.json §Slice L2.
 *
 * Verifies:
 * 1. The no-route matrix in Live mode (no destination, location not shared,
 *    provider disabled, provider 500 error, stale), each showing 'No route available' plus its reason.
 * 2. With a stubbed /api/route returning the recorded geometry and a test destination,
 *    the strip draws the multi-point polyline, the ETA/distance comes from the stub,
 *    and the attribution "Route © OSRM · data © OpenStreetMap contributors" is visible.
 * 3. Demo mode map remains "Schematic · simulated" with data-provenance="fixture".
 * 4. Label audit from L1 passes in Live mode with recorded route.
 * 5. Axe WCAG AA passes, zero horizontal overflow, touch targets >= 44px.
 */

const EVIDENCE_DIR = getEvidenceDir('l2-route-map');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

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
  // 1. Zero fixture elements
  const fixtureCount = await page.locator('[data-provenance="fixture"]').count();
  expect(
    fixtureCount,
    `Label audit failed in ${contextName}: found ${fixtureCount} fixture elements in Live mode`
  ).toBe(0);

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

async function mockLocationGranted(page: Page) {
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
}

test.describe('L2-ROUTE-MAP: Real Route/Map Routing Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  for (const vp of VIEWPORTS) {
    test(`No-Route Matrix in Live mode at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // State 1: no_destination (default Live empty home with no destination set)
      await page.goto('/?mode=live');
      await page.waitForSelector('#notice-route-unavailable');
      const routeCardNoDest = page.locator('#notice-route-unavailable');
      await expect(routeCardNoDest).toBeVisible();
      await expect(routeCardNoDest).toHaveAttribute('data-provenance', 'none');
      await expect(routeCardNoDest).toHaveAttribute('data-no-route-reason', 'no_destination');
      await expect(routeCardNoDest).toContainText('No route available');
      await expect(routeCardNoDest).toContainText('no destination set');
      await saveEvidence(page, `live-no-destination-${vp.name}.png`);

      // State 2: location_not_shared (test destination injected, but location not granted/shared)
      await page.goto('/?mode=live&test_destination=1');
      await page.waitForSelector('#notice-route-unavailable');
      const routeCardLocNotShared = page.locator('#notice-route-unavailable');
      await expect(routeCardLocNotShared).toBeVisible();
      await expect(routeCardLocNotShared).toHaveAttribute('data-provenance', 'none');
      await expect(routeCardLocNotShared).toHaveAttribute('data-no-route-reason', 'location_not_shared');
      await expect(routeCardLocNotShared).toContainText('No route available');
      await expect(routeCardLocNotShared).toContainText('location not shared');
      await saveEvidence(page, `live-location-not-shared-${vp.name}.png`);

      // State 3: provider_disabled (destination set, location granted, but route provider disabled)
      await page.route(url => url.pathname.includes('/api/route'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, error: 'Live routing is disabled' }),
        });
      });
      await page.goto('/?mode=live&test_destination=1');
      await mockLocationGranted(page);
      const connectLocBtn = page.locator('#btn-connect-location');
      if (await connectLocBtn.isVisible()) {
        await connectLocBtn.click();
      }
      await page.waitForSelector('#notice-route-unavailable');
      const routeCardProvDisabled = page.locator('#notice-route-unavailable');
      await expect(routeCardProvDisabled).toBeVisible();
      await expect(routeCardProvDisabled).toHaveAttribute('data-provenance', 'none');
      await expect(routeCardProvDisabled).toHaveAttribute('data-no-route-reason', 'provider_disabled');
      await expect(routeCardProvDisabled).toContainText('No route available');
      await expect(routeCardProvDisabled).toContainText('provider disabled');
      await saveEvidence(page, `live-provider-disabled-${vp.name}.png`);

      // State 4: provider_error (destination set, location granted, route provider returns 500)
      await page.unrouteAll();
      await page.route(url => url.pathname.includes('/api/route/status'), async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, provider: 'osrm' }),
        });
      });
      await page.route(url => url.pathname.includes('/api/route') && !url.pathname.includes('/status'), async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal provider failure' }),
        });
      });
      await page.goto('/?mode=live&test_destination=1');
      await mockLocationGranted(page);
      const connectLocBtn2 = page.locator('#btn-connect-location');
      if (await connectLocBtn2.isVisible()) {
        await connectLocBtn2.click();
      }
      await page.waitForSelector('#notice-route-unavailable');
      const routeCardProvError = page.locator('#notice-route-unavailable');
      await expect(routeCardProvError).toBeVisible();
      await expect(routeCardProvError).toHaveAttribute('data-provenance', 'none');
      await expect(routeCardProvError).toHaveAttribute('data-no-route-reason', 'provider_error');
      await expect(routeCardProvError).toContainText('No route available');
      await expect(routeCardProvError).toContainText('provider error');
      await saveEvidence(page, `live-provider-error-${vp.name}.png`);

      // State 5: stale
      await page.goto('/?mode=live&test_no_route_reason=stale');
      await page.waitForSelector('#notice-route-unavailable');
      const routeCardStale = page.locator('#notice-route-unavailable');
      await expect(routeCardStale).toBeVisible();
      await expect(routeCardStale).toHaveAttribute('data-provenance', 'none');
      await expect(routeCardStale).toHaveAttribute('data-no-route-reason', 'stale');
      await expect(routeCardStale).toContainText('No route available');
      await expect(routeCardStale).toContainText('data is stale');

      await checkNoOverflow(page);
      await checkAxe(page, `no-route-matrix-${vp.name}`);
    });

    test(`Live Route with Recorded Geometry & Attribution at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

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

      await page.goto('/?mode=live&test_destination=1');
      await mockLocationGranted(page);
      const connectBtn = page.locator('#btn-connect-location');
      await expect(connectBtn).toBeVisible();
      await connectBtn.click();

      // Verify Live Route Card
      await page.waitForSelector('#live-route-card');
      const liveRouteCard = page.locator('#live-route-card');
      await expect(liveRouteCard).toBeVisible();
      await expect(liveRouteCard).toHaveAttribute('data-provenance', 'live');
      await expect(liveRouteCard).toHaveAttribute('data-source', 'osrm');
      await expect(liveRouteCard).toHaveAttribute('data-fetched-at', nowIso);

      // Verify ETA and Distance match fixture
      await expect(liveRouteCard.locator('.live-route-eta')).toContainText('6 min');
      await expect(liveRouteCard.locator('.live-route-distance')).toContainText('2.1 km');

      // Verify attribution is visible in every live route render
      const attributionEl = liveRouteCard.locator('.live-route-attribution');
      await expect(attributionEl).toBeVisible();
      await expect(attributionEl).toContainText('Route © OSRM · data © OpenStreetMap contributors');

      // Verify multi-point polyline from decoded geometry (6 points, not straight line)
      const polyline = liveRouteCard.locator('#live-route-polyline');
      await expect(polyline).toBeVisible();
      const pointsAttr = await polyline.getAttribute('points');
      expect(pointsAttr).toBeTruthy();
      const pointPairs = pointsAttr!.trim().split(/\s+/);
      expect(pointPairs).toHaveLength(6);

      // Verify external handoff link
      const handoffLink = liveRouteCard.locator('.live-external-maps-link');
      await expect(handoffLink).toBeVisible();
      await expect(handoffLink).toContainText('Open in Maps');
      const href = await handoffLink.getAttribute('href');
      expect(href).toContain('google.com/maps/dir');
      expect(href).toContain('37.7749,-122.4194');
      expect(href).toContain('37.7599,-122.4148');

      const handoffNote = liveRouteCard.locator('.live-external-maps-note');
      await expect(handoffNote).toBeVisible();
      await expect(handoffNote).toContainText('Opens your maps app · not an in-app route');

      // Check touch target >= 44x44
      const box = await handoffLink.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      // Run Label Audit in Live mode with live route
      await runLabelAudit(page, `live-recorded-route-${vp.name}`);

      await saveEvidence(page, `live-route-recorded-${vp.name}.png`);

      await checkNoOverflow(page);
      await checkAxe(page, `live-route-recorded-${vp.name}`);
    });

    test(`Demo Mode Map remains Schematic at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?mode=demo&dev=1');
      await page.waitForSelector('.v2-home-container');

      const mapCard = page.locator('.v2-map-card');
      await expect(mapCard).toBeVisible();
      await expect(mapCard).toHaveAttribute('data-provenance', 'fixture');
      await expect(mapCard).toContainText('Schematic · simulated');

      await saveEvidence(page, `demo-schematic-${vp.name}.png`);

      await checkNoOverflow(page);
      await checkAxe(page, `demo-schematic-${vp.name}`);
    });
  }
});
