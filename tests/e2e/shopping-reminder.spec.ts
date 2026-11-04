/**
 * Playwright E2E Spec: Shopping Reminder & On-Device Memory
 * Governed by Task: SHOPPING-REMINDER (TID: INBOX-20261104-9C01AA)
 *
 * Verifies:
 * 1. Ask: 'remind me to buy milk, eggs' stores items in on-device shopping list.
 * 2. Me: 'Shopping list: milk, eggs' is visible under 'What Yori has learned' with Forget.
 * 3. Proactive card: Home For You and Now card show:
 *    'Pick up milk, eggs at <real store name> · <straight-line distance> · <open status if known>'
 *    with Directions (link), Got it (marks items done), and Not now.
 * 4. Dedicated "Nearby now" section displays nearby items separate from learned preferences.
 * 5. Demo mode: Scene 'shopping' with simulated store fixture and SIMULATED pill.
 * 6. Visual evidence captured in docs/evidence/shopping-reminder/*.png for both mobile (390x844) and desktop (1280x800).
 * 7. Isolated port 4289 only. Zero live/paid network calls.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:4289';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/shopping-reminder');
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
      straightLineDistanceLabel: '145m',
      openingStatus: 'open',
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

  await page.route(u => u.pathname === '/api/places', r =>
    r.fulfill(json({
      enabled: true,
      discovery: 'osm',
      places: mockSupermarkets(),
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    }))
  );

  await page.route(u => u.pathname === '/api/model/command', async route => {
    await route.fulfill(json({
      result: null,
      usedFallback: true,
      fallbackReason: 'schema_invalid',
      engineStatus: 'offline_deterministic',
    }));
  });
}

test.describe('SHOPPING-REMINDER: Demo Mode & Live Context', () => {
  test('Demo scene "shopping": displays simulated store fixture, SIMULATED pill, Nearby now section, Me tab, and Forget', async ({ page }, testInfo) => {
    await setupMockRoutes(page);
    const projectName = testInfo.project.name;
    const viewLabel = `${projectName}-${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`;

    // 1. Visit demo scene 'shopping' with test=1
    await page.goto(`${APP}/?scene=shopping&test=1`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.app-layout');

    // 2. Verify Now card shopping reminder
    const shoppingCard = page.locator('#card-shopping-now, .shopping-reminder-card').first();
    await expect(shoppingCard).toBeVisible();
    await expect(shoppingCard).toContainText('Pick up milk, eggs at Whole Foods Market');
    await expect(shoppingCard).toContainText('SIMULATED');
    await expect(shoppingCard.locator('.btn-shopping-directions')).toBeVisible();
    await expect(shoppingCard.locator('.btn-shopping-got-it')).toBeVisible();
    await expect(shoppingCard.locator('.btn-shopping-not-now')).toBeVisible();

    // Verify dedicated "Nearby now" section exists
    const nearbyNowSection = page.locator('#feed-section-nearbynow');
    await expect(nearbyNowSection).toBeVisible();
    await expect(nearbyNowSection).toContainText('Nearby now');

    // Capture screenshot: 01-demo-shopping-scene
    const shot01 = path.join(EVIDENCE_DIR, `01-demo-shopping-scene-${viewLabel}.png`);
    await page.screenshot({ path: shot01, fullPage: true });

    // 3. Switch to Me tab
    const meTabBtn = page.locator('#desktop-nav-me:visible, #tab-me:visible').first();
    await meTabBtn.click();
    await page.waitForTimeout(300);

    // Verify "Shopping list" under "What Yori has learned"
    const habitRow = page.locator('#habit-shopping_list, [data-habit-key="shopping_list"]').first();
    await expect(habitRow).toBeVisible();
    await expect(habitRow).toContainText('Shopping list');
    await expect(habitRow).toContainText('milk, eggs');
    await expect(habitRow.locator('.btn-forget-habit')).toBeVisible();

    // Capture screenshot: 02-me-tab-shopping-list
    const shot02 = path.join(EVIDENCE_DIR, `02-me-tab-shopping-list-${viewLabel}.png`);
    await page.screenshot({ path: shot02, fullPage: true });

    // 4. Click Forget on Me tab
    await habitRow.locator('.btn-forget-habit').click();
    await page.waitForTimeout(300);

    // Capture screenshot: 03-me-tab-after-forget
    const shot03 = path.join(EVIDENCE_DIR, `03-me-tab-after-forget-${viewLabel}.png`);
    await page.screenshot({ path: shot03, fullPage: true });

    // 5. Switch back to Today/Home tab (desktop nav or mobile tab)
    const homeTabBtn = page.locator('#desktop-nav-today:visible, #desktop-nav-home:visible, #tab-home:visible, #tab-today:visible').first();
    await homeTabBtn.click();
    await page.waitForTimeout(300);

    // Card and Nearby now section should now be gone because list was forgotten
    await expect(page.locator('#card-shopping-now')).toHaveCount(0);
    await expect(page.locator('.shopping-reminder-card')).toHaveCount(0);

    // Capture screenshot: 04-home-after-forget
    const shot04 = path.join(EVIDENCE_DIR, `04-home-after-forget-${viewLabel}.png`);
    await page.screenshot({ path: shot04, fullPage: true });
  });

  test('Live context: Ask flow, proactive card with real store, Nearby now section, Directions link, and Got it action', async ({ page, context }, testInfo) => {
    await setupMockRoutes(page);
    const projectName = testInfo.project.name;
    const viewLabel = `${projectName}-${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`;

    // Grant location permission
    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:4289' });
    await context.setGeolocation(FIX);

    // 1. Visit Live mode
    await page.goto(`${APP}/?mode=live`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Connect location if prompt banner appears
    const reqLoc = page.locator('#btn-request-location');
    if (await reqLoc.isVisible()) {
      await reqLoc.click();
      await page.waitForTimeout(500);
    }

    // 2. Open Ask Sheet
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // 3. Send message: 'remind me to buy milk, eggs'
    const input = page.locator('#conversation-input');
    await expect(input).toBeVisible();
    await input.fill('remind me to buy milk, eggs');
    await input.press('Enter');

    // Verify response from Yori in transcript
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('added milk, eggs to your shopping list', { timeout: 10000 });

    // Capture screenshot: 05-ask-add-shopping-items
    const shot05 = path.join(EVIDENCE_DIR, `05-ask-add-shopping-items-${viewLabel}.png`);
    await page.screenshot({ path: shot05, fullPage: true });

    // 4. Close conversation overlay
    const closeBtn = page.locator('#conversation-close-btn');
    await closeBtn.click();
    await expect(overlay).toBeHidden();

    // 5. Verify proactive shopping card with real store 'Seijo Ishii Shinjuku'
    const liveCard = page.locator('#card-shopping-now, .shopping-reminder-card').first();
    await expect(liveCard).toBeVisible({ timeout: 10000 });
    await expect(liveCard).toContainText('Pick up milk, eggs at Seijo Ishii Shinjuku · 145m · Open now');
    await expect(liveCard.locator('.btn-shopping-directions')).toBeVisible();
    await expect(liveCard.locator('.btn-shopping-got-it')).toBeVisible();
    await expect(liveCard.locator('.btn-shopping-not-now')).toBeVisible();

    // Verify dedicated "Nearby now" section
    const nearbyNowSection = page.locator('#feed-section-nearbynow');
    await expect(nearbyNowSection).toBeVisible();
    await expect(nearbyNowSection).toContainText('Nearby now');

    // Verify Directions link URL
    const directionsHref = await liveCard.locator('.btn-shopping-directions').getAttribute('href');
    expect(directionsHref).toContain('google.com/maps/dir');

    // Capture screenshot: 06-live-proactive-card
    const shot06 = path.join(EVIDENCE_DIR, `06-live-proactive-card-${viewLabel}.png`);
    await page.screenshot({ path: shot06, fullPage: true });

    // 6. Click 'Got it' to complete items
    await liveCard.locator('.btn-shopping-got-it').click();
    await page.waitForTimeout(500);

    // Verify shopping card is removed from view
    await expect(page.locator('#card-shopping-now')).toHaveCount(0);
    await expect(page.locator('.shopping-reminder-card')).toHaveCount(0);

    // Capture screenshot: 07-after-got-it-cleared
    const shot07 = path.join(EVIDENCE_DIR, `07-after-got-it-cleared-${viewLabel}.png`);
    await page.screenshot({ path: shot07, fullPage: true });
  });
});
