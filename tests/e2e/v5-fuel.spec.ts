import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v5-fuel');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V5-FUEL: PlacesProvider Seam, Fuel Recommendations & Verified Navigate Handoff', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)', async ({
    page,
  }) => {
    const disallowedRequests: string[] = [];
    page.on('request', req => {
      const url = req.url().toLowerCase();
      if (
        url.includes('overpass') ||
        (url.includes('googleapis') && !url.includes('fonts.googleapis.com')) ||
        url.includes('google.com/maps') ||
        url.includes('maps.apple.com') ||
        url.includes('openstreetmap') ||
        url.includes('osrm') ||
        url.includes('open-meteo')
      ) {
        disallowedRequests.push(url);
      }
    });

    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    // 1. Navigate to V2 UI
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Select fuel scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('fuel');

    // 2. Initial Fuel Hero Card Verification
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Low Fuel Warning');
    await expect(nowCard).toContainText('SIMULATED');
    await expect(nowCard).toContainText('Nearby gas stations from simulated fixture · straight-line distances shown');

    // Candidate list exists
    const candidateList = page.locator('.v2-candidate-list');
    await expect(candidateList).toBeVisible();

    // Top candidate is Metro Gas & Go
    const topCard = page.locator('.v2-candidate-card').first();
    await expect(topCard).toContainText('Metro Gas & Go');
    await expect(topCard).toContainText('Gas Station');
    await expect(topCard).toContainText('(straight-line)');
    await expect(topCard).toContainText('Simulated fixture · Metro Gas');

    // Data honesty check: assert zero star ratings, prices or fabricated review counts
    const textContent = await nowCard.innerText();
    expect(textContent).not.toMatch(/[★☆]/);
    expect(textContent).not.toMatch(/\b\d+(\.\d+)?\s*(stars|reviews|ratings)\b/i);

    // Touch targets check: Directions button >= 44px
    const directionsBtn = topCard.locator('.v2-directions-btn');
    await expect(directionsBtn).toBeVisible();
    const box = await directionsBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Accessibility check
    await checkAxe(page);

    // Capture visual screenshot of fuel card
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v5-fuel-card-${vpSuffix}.png`),
      fullPage: false,
    });

    // 3. Navigate Handoff Verification
    // Enable test intercept to avoid navigating away
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });

    // Click Directions button
    await directionsBtn.click();

    // Navigate confirmation modal must appear
    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#nav-modal-title')).toContainText('Start Navigation');
    await expect(modal).toContainText('Verified handoff');
    await expect(modal).toContainText('Open driving directions to Metro Gas & Go in Google Maps?');

    // URL preview matches exact pinned coordinates and encoding
    const urlCode = page.locator('#navigate-verified-url');
    await expect(urlCode).toBeVisible();
    const expectedUrl =
      'https://www.google.com/maps/dir/?api=1&destination=37.7755%2C-122.418&travelmode=driving&destination_place_id=fuel-sf-1';
    await expect(urlCode).toHaveText(expectedUrl);

    // Accessibility of modal
    await checkAxe(page);

    // Capture visual screenshot of navigate confirmation modal
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v5-fuel-navigate-modal-${vpSuffix}.png`),
      fullPage: false,
    });

    // Click Open Maps button (intercepted)
    const confirmBtn = page.locator('#btn-confirm-navigate');
    await confirmBtn.click();

    // Verify modal closed and intercepted URL recorded
    await expect(modal).not.toBeVisible();
    const lastNavUrl = await page.evaluate(() => (window as any).__YORI_LAST_NAV_URL__);
    expect(lastNavUrl).toBe(expectedUrl);

    // 4. Invariant: ZERO disallowed external network requests throughout whole fuel flow
    expect(disallowedRequests).toHaveLength(0);
  });

  test('V5-FUEL: Location unavailable degrades prominently and fails closed (AC-212-2)', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Simulate location unavailable on LocationPort seam
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('unavailable');
      }
    });

    // Select fuel scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('fuel');

    // Degraded state rendered prominently on quiet state card
    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Location Unavailable');
    await expect(quietCard).toContainText('Cannot find nearby gas stations without location access');
    await expect(quietCard).toContainText('Location permission or fixture coordinates required · fails closed');

    // Invariant: zero merchant cards or fake distances
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards).toHaveCount(0);

    // Accessibility check
    await checkAxe(page);

    // Capture visual screenshot of unavailable state
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v5-fuel-unavailable-${vpSuffix}.png`),
      fullPage: false,
    });

    // Restore location port
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
      }
    });
  });

  test('V5-FUEL: chat "find gas" and Chinese "加油" disambiguation flow', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // 1. In away-lunch scene: Chinese "加油" is ambiguous without travel context
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('away-lunch');

    // Open ask drawer
    const askButton = page.locator('#ask-bar');
    await askButton.click();
    const askInput = page.locator('#conversation-input');
    await expect(askInput).toBeVisible();

    // Type "加油"
    await askInput.fill('加油');
    await page.keyboard.press('Enter');

    // Needs-confirmation disambiguation question
    const transcript = page.locator('.conversation-transcript');
    await expect(transcript).toContainText('Did you mean: find a gas station?');

    // Confirm with "yes"
    await askInput.fill('yes');
    await page.keyboard.press('Enter');

    // Disambiguation accepted -> searches gas stations and auto-collapses to home
    await expect(page.locator('.now-card')).toContainText('Metro Gas & Go');

    // 2. Click Undo to restore
    const undoBtn = page.locator('#btn-undo-accept');
    if (await undoBtn.isVisible()) {
      await undoBtn.click();
    }
  });
});
