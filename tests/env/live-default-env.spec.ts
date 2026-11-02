import { test, expect } from '@playwright/test';
import * as path from 'path';

const SHIPPING_PREVIEW_URL = 'http://localhost:4174';
const TEST_BUILD_URL = 'http://localhost:4173';

const FORBIDDEN_FIXTURE_TEXTS = [
  'Piano lesson',
  'Fiore Caffe',
  'fuel station',
  'Demo timeline',
  'simulated time',
];

test.describe('S2-LIVE-DEFAULT: Production Live Default and Dev Mode Gating', () => {
  test('Prod build defaults to Live mode on first open without ?mode (honest consent gate, zero fixture provenance)', async ({
    page,
  }, testInfo) => {
    // Navigate to clean shipping preview root with no query parameters
    await page.goto(`${SHIPPING_PREVIEW_URL}/`);
    await page.waitForSelector('.app-layout');

    // 1. Context mode attribute must be strictly 'live'
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-context-mode', 'live');

    // 2. Living header shows 'live' chip
    const headerChip = page.locator('#living-header-chip');
    await expect(headerChip).toBeVisible();
    await expect(headerChip).toHaveText('live');

    // 3. Honest gated quiet state
    const quietTitle = page.locator('#quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Location Needed');

    const quietSubtitle = page.locator('#quiet-subtitle');
    await expect(quietSubtitle).toContainText('Location permission needed to find nearby lunch places');

    const requestLocationBtn = page.locator('#btn-request-location');
    await expect(requestLocationBtn).toBeVisible();
    await expect(requestLocationBtn).toHaveText('Use My Location');

    // 4. Zero fixture provenance anywhere in DOM
    const fixtureElements = page.locator('[data-provenance="fixture"]');
    await expect(fixtureElements).toHaveCount(0);

    // 5. Zero demo copy in rendered text
    const fullBodyText = await page.locator('body').innerText();
    for (const forbidden of FORBIDDEN_FIXTURE_TEXTS) {
      expect(fullBodyText).not.toContain(forbidden);
    }

    // 6. Capture visual evidence according to project viewport
    const isMobile = testInfo.project.name === 'mobile';
    const evidencePath = isMobile
      ? path.resolve(process.cwd(), 'docs/evidence/live-default/01-default-live-first-open-390.png')
      : path.resolve(process.cwd(), 'docs/evidence/live-default/02-default-live-first-open-1280.png');

    await page.screenshot({ path: evidencePath, fullPage: true });
  });

  test('Prod build strictly ignores mode overrides (?mode, ?default_mode, window.__YORI_DEFAULT_MODE__)', async ({
    page,
  }) => {
    // Inject window.__YORI_DEFAULT_MODE__ = 'demo' before page load
    await page.addInitScript(() => {
      (window as any).__YORI_DEFAULT_MODE__ = 'demo';
    });

    // Case A: ?mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Case B: ?default_mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?default_mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Case C: ?mode=demo&default_mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=demo&default_mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Check that window.__YORI_DEFAULT_MODE__ was present on window but ignored by app
    const defaultMode = await page.evaluate(() => {
      return (window as any).__YORI_DEFAULT_MODE__;
    });
    expect(defaultMode).toBe('demo');
    // In prod, window.__YORI_DEFAULT_MODE__ was ignored by app:
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
  });

  test('Prod build honours ?dev=1 and renders Demo mode with SIMULATED labels', async ({ page }) => {
    // Navigating with ?dev=1 in production preview unlocks demo mode
    await page.goto(`${SHIPPING_PREVIEW_URL}/?dev=1`);
    await page.waitForSelector('.app-layout');

    // Context mode is demo
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-context-mode', 'demo');

    // Living header chip displays 'simulated'
    const headerChip = page.locator('#living-header-chip');
    await expect(headerChip).toBeVisible();
    await expect(headerChip).toHaveText('simulated');

    // Demo timeline status pill displays simulated text
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText('Demo timeline · simulated time');

    // Label audit in demo mode: elements from fixtures carry SIMULATED badge or fixture provenance
    const fixtureCards = page.locator('[data-provenance="fixture"]');
    const count = await fixtureCards.count();
    expect(count).toBeGreaterThan(0);

    // Inspect Sources modal under ?dev=1
    await pill.click();
    await page.waitForSelector('.sources-modal-card');
    const derivationText = page.locator('#sources-derivation-text');
    await expect(derivationText).toContainText('Demo fixtures · simulated context');
    const simulatedBadges = page.locator('#sources-list .simulated-badge');
    expect(await simulatedBadges.count()).toBeGreaterThan(0);
  });

  test('Label audit: Live mode has exactly 0 unlabelled simulated renders and 0 fixture elements', async ({
    page,
  }) => {
    await page.goto(`${SHIPPING_PREVIEW_URL}/`);
    await page.waitForSelector('.app-layout');

    // Verify 0 elements have data-provenance="fixture"
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Verify 0 simulated badges exist anywhere
    await expect(page.locator('.simulated-badge')).toHaveCount(0);

    // Open Sources sheet in Live mode
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await pill.click();
    await page.waitForSelector('.sources-modal-card');

    // In Live mode, derivation text is truthful
    const derivationText = page.locator('#sources-derivation-text');
    await expect(derivationText).toContainText('What feeds Home right now in Live mode');

    // Sources list has live or none provenance, zero fixture provenance
    const fixtureSources = page.locator('#sources-list [data-provenance="fixture"]');
    await expect(fixtureSources).toHaveCount(0);

    const simulatedBadgesInModal = page.locator('.sources-modal-card .simulated-badge');
    await expect(simulatedBadgesInModal).toHaveCount(0);
  });

  test('Dev/test build on port 4173 honours mode overrides and supports ?mode=demo and ?mode=live', async ({
    page,
  }) => {
    // Port 4173 is the dev/test build
    // A: With ?mode=demo
    await page.goto(`${TEST_BUILD_URL}/?mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'demo');
    await expect(page.locator('#living-header-chip')).toHaveText('simulated');

    // B: With ?mode=live
    await page.goto(`${TEST_BUILD_URL}/?mode=live`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#living-header-chip')).toHaveText('live');
  });
});
