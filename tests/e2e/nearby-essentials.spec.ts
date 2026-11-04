/**
 * Playwright E2E Spec: Nearby Essentials Discovery & Result Card
 * Governed by Task: NEARBY-ESSENTIALS (TID: INBOX-20261104-EC92E9)
 *
 * Verifies:
 * 1. Live opener includes 'Supermarket nearby' suggestion chip.
 * 2. Real places search returns top recommendation card with name, distance, open status, attribution.
 * 3. Compact activity trace reflects real search ('Searched 2 places · ranked by ...').
 * 4. Trace expands on tap to show detailed steps.
 * 5. Demo / offline mode answers honestly that live places search is needed.
 * 6. Visual evidence captured in docs/evidence/nearby-essentials/*.png for both mobile (390x844) and desktop (1280x800).
 * 7. Mocked environment only (no paid / live API calls). Port 4289 isolated.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:4289';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/nearby-essentials');
const FIX = { latitude: 35.689487, longitude: 139.691706 };

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

function mockSupermarkets() {
  const fetchedAt = new Date().toISOString();
  return [
    {
      placeId: 'osm-way-201',
      osmId: 201,
      coords: { lat: 35.69, lng: 139.693 },
      name: 'Seijo Ishii Shinjuku',
      category: 'supermarket',
      source: 'live',
      provenance: 'osm',
      fetchedAt,
      straightLineDistanceMeters: 145,
      straightLineDistanceLabel: '145 m (straight-line)',
      openingStatus: 'open',
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    },
    {
      placeId: 'osm-way-202',
      osmId: 202,
      coords: { lat: 35.692, lng: 139.695 },
      name: 'Maruetsu Petit',
      category: 'supermarket',
      source: 'live',
      provenance: 'osm',
      fetchedAt,
      straightLineDistanceMeters: 420,
      straightLineDistanceLabel: '420 m (straight-line)',
      openingStatus: 'closed',
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    },
  ];
}

async function setupMockRoutes(page: Page) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));

  await page.route(u => u.pathname === '/api/model/diagnostics', r =>
    r.fulfill(json({
      status: 'enabled',
      modelName: 'muse-spark-1.3',
      keySource: 'MODEL_API_KEY',
    }))
  );

  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({
      enabled: true,
      provider: 'osm',
      discovery: 'osm',
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    }))
  );

  await page.route('**/api/places*', r => {
    const url = new URL(r.request().url());
    const amenity = url.searchParams.get('amenity') || 'restaurant';
    if (amenity === 'supermarket' || amenity === 'convenience' || amenity === 'shopping_mall' || amenity === 'pharmacy') {
      return r.fulfill(json({
        enabled: true,
        discovery: 'osm',
        places: mockSupermarkets(),
        attribution: 'OpenStreetMap via Overpass (ODbL)',
      }));
    }
    return r.fulfill(json({
      enabled: true,
      discovery: 'osm',
      places: mockSupermarkets(),
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    }));
  });

  await page.route(u => u.pathname === '/api/model/command', async route => {
    const postData = route.request().postDataJSON();
    const utterance = (postData?.utterance || '').toLowerCase();

    if (utterance.includes('supermarket') || utterance.includes('grocery') || utterance.includes('essentials')) {
      await route.fulfill(json({
        result: {
          intent: 'FIND_ESSENTIALS',
          slots: { category: 'supermarket', amenity: 'supermarket' },
          reply: 'Found nearby supermarkets.',
          citedSignalIds: [],
          citedFactKeys: [],
          reasonCodes: [],
        },
        usedFallback: false,
        engineStatus: 'meta_model_live',
      }));
      return;
    }

    await route.fulfill(json({
      result: null,
      usedFallback: true,
      fallbackReason: 'schema_invalid',
      engineStatus: 'offline_deterministic',
    }));
  });
}

test.describe('NEARBY-ESSENTIALS: Live Places Essentials & Offline Fallback', () => {
  test('Live Mode: Opener chip, search top recommendation card, compact trace, and For You card', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';
    const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport: vp,
      permissions: ['geolocation'],
      geolocation: FIX,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // 1. Open app in Live mode
    await page.goto(`${APP}/?mode=live`);
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Grant location
    const reqLoc = page.locator('#btn-request-location');
    if (await reqLoc.isVisible()) {
      await reqLoc.click();
    }

    // 2. Open Ask Sheet
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // 3. Verify 'Supermarket nearby' chip is in idle opener
    const chip = page.locator('.chat-suggestion-chip', { hasText: 'Supermarket nearby' });
    await expect(chip).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-live-opener-chips-${viewName}.png`),
    });

    // 4. Click 'Supermarket nearby' chip
    await chip.click();

    // 5. Verify top recommendation card renders with name, distance, open status, attribution
    const resultCard = page.locator('.chat-result-card').first();
    await expect(resultCard).toBeVisible({ timeout: 10000 });
    await expect(resultCard.locator('.chat-result-name')).toContainText('Seijo Ishii Shinjuku');
    await expect(resultCard.locator('.chat-result-dist')).toContainText('145 m (straight-line)');
    await expect(resultCard.locator('.chat-result-open')).toContainText('Open now');
    await expect(resultCard.locator('.chat-result-attribution')).toContainText('OpenStreetMap via Overpass (ODbL)');

    // 6. Verify compact trace row
    const traceToggle = page.locator('.trace-summary-toggle').first();
    await expect(traceToggle).toBeVisible();
    await expect(traceToggle).toContainText(/Searched 2 places/i);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-supermarket-result-card-${viewName}.png`),
    });

    // 7. Expand trace
    await traceToggle.click();
    const traceDetail = page.locator('.trace-details').first();
    await expect(traceDetail).toBeVisible();
    await expect(traceDetail).toContainText('Found 2 places via OpenStreetMap');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-trace-expanded-${viewName}.png`),
    });

    // 8. Close conversation and check Home For You section
    const closeBtn = page.locator('#conversation-close-btn');
    await closeBtn.click();
    await expect(overlay).toBeHidden();

    // Home For You section
    const forYouSection = page.locator('#feed-section-foryou');
    if ((await forYouSection.count()) > 0) {
      await forYouSection.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `04-home-for-you-essentials-${viewName}.png`),
      });
    }

    await context.close();
  });

  test('Demo Mode: Honest capability answer that live places search is needed', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';
    const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport: vp,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // Open app in Demo mode (clear scene)
    await page.goto(`${APP}/?scene=clear`);
    await page.waitForSelector('.app-layout');

    // Open Ask sheet
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Type 'supermarket nearby' in demo mode
    const input = page.locator('#conversation-input');
    await input.fill('supermarket nearby');
    await input.press('Enter');

    // Assistant answers honestly
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('Live places search is needed to find nearby supermarkets');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-demo-offline-honest-answer-${viewName}.png`),
    });

    await context.close();
  });
});
