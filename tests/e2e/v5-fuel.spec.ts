import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('v5-fuel');
const shouldRecord = Boolean(process.env.V5_RECORD);

async function maybeScreenshot(page: Page, filename: string) {
  if (shouldRecord) {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: false,
    });
  }
}

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
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    // Select fuel scene
    await selectDemoScene(page, 'fuel');

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
    await maybeScreenshot(page, `v5-fuel-card-${vpSuffix}.png`);

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
    const isIos = await page.evaluate(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
    const expectedApp = isIos ? 'Apple Maps' : 'Google Maps';
    await expect(modal).toContainText(`Open driving directions to Metro Gas & Go in ${expectedApp}?`);

    // URL preview matches exact pinned coordinates and encoding
    const urlCode = page.locator('#navigate-verified-url');
    await expect(urlCode).toBeVisible();
    const expectedUrl = isIos
      ? 'https://maps.apple.com/?daddr=37.7755,-122.418&dirflg=d&q=Metro%20Gas%20%26%20Go'
      : 'https://www.google.com/maps/dir/?api=1&destination=37.7755%2C-122.418&travelmode=driving&destination_place_id=fuel-sf-1';
    await expect(urlCode).toHaveText(expectedUrl);

    // Accessibility of modal
    await checkAxe(page);

    // Capture visual screenshot of navigate confirmation modal
    await maybeScreenshot(page, `v5-fuel-navigate-modal-${vpSuffix}.png`);

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

    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    // Simulate location unavailable on LocationPort seam
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('unavailable');
      }
    });

    // Select fuel scene
    await selectDemoScene(page, 'fuel');

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
    await maybeScreenshot(page, `v5-fuel-unavailable-${vpSuffix}.png`);

    // Restore location port
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
      }
    });
  });

  test('V5-FUEL: chat "find gas" and Chinese "加油" disambiguation flow', async ({ page }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    // 1. In away-lunch scene: Chinese "加油" is ambiguous without travel context
    await selectDemoScene(page, 'away-lunch');

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

  test('V5-FUEL: Location change to LA dynamically updates candidates, map label, and verified URL (AC-212-1, Finding 2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'fuel');

    // Switch location to Los Angeles: lat: 34.0522, lng: -118.2437
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 34.0522, lng: -118.2437 });
    });

    // Verify candidate cards show LA stations (not SF)
    const candidateList = page.locator('.v2-candidate-list');
    await expect(candidateList).toBeVisible();

    const topCard = page.locator('.v2-candidate-card').first();
    await expect(topCard).toBeVisible();
    await expect(topCard).toContainText('Fuel');
    await expect(topCard).toContainText('straight-line');

    // Verify map label derives from the top candidate (not literal SF 'Metro Gas & Go')
    const mapCard = page.locator('.v2-map-card');
    await expect(mapCard).toBeVisible();
    const topCardName = await topCard.locator('.v2-candidate-name').innerText();
    await expect(mapCard).toContainText(topCardName.trim());

    // Enable navigation intercept
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });

    // Click Directions on the LA card
    const directionsBtn = topCard.locator('.v2-directions-btn');
    await directionsBtn.click();

    // Verify navigate modal appears with LA coordinates in destination URL
    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    const urlCode = page.locator('#navigate-verified-url');
    const urlText = await urlCode.innerText();

    // Must pin LA coordinates
    const isIos = await page.evaluate(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
    if (isIos) {
      expect(urlText).toContain('daddr=34.05');
      expect(urlText).toContain('maps.apple.com');
    } else {
      expect(urlText).toMatch(/destination=34\.05/);
      expect(urlText).toContain('destination_place_id=fuel-la-');
    }

    // Confirm navigation
    const confirmBtn = page.locator('#btn-confirm-navigate');
    await confirmBtn.click();
    await expect(modal).not.toBeVisible();

    // Reset location back to SF default
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
    });
  });

  test('V5-FUEL: Out-of-session candidate yields no URL and logs failure (G2, Finding 2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'fuel');

    // Session is SF. A candidate from Seattle (fuel-sea-1) submitted against this session must fail closed
    const result = await page.evaluate(() => {
      const bundle = (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__();
      const buildNavUrl = (window as any).__YORI_BUILD_NAV_URL__;
      const logger = (window as any).__YORI_DECISION_LOGGER__;
      const initialLogCount = logger ? logger.getEntries().length : 0;

      const url = buildNavUrl(
        {
          id: 'fuel-sea-1',
          name: 'Emerald City Gas',
          coords: { lat: 47.607, lng: -122.331 },
          sourceRef: { recordId: 'fuel-sea-1', field: 'name' },
        },
        bundle,
        { platform: 'desktop' }
      );

      const latestEntry = logger ? logger.getLatest() : undefined;
      const newLogCount = logger ? logger.getEntries().length : 0;

      return {
        url,
        logged: newLogCount > initialLogCount,
        latestEntry,
      };
    });

    // Fail closed: No URL built (returns undefined/null)
    expect(result.url).toBeFalsy();
    // Decision log captures failure
    expect(result.logged).toBe(true);
    expect(result.latestEntry?.validationResult?.valid).toBe(false);
    expect(result.latestEntry?.validationResult?.reason).toBe('candidate_outside_bundle');
  });

  test('V5-FUEL: Provider error and empty results degrade prominently on quiet card (AC-212-2, Finding 1 & 2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'fuel');

    // 1. Simulate provider error
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(true);
    });

    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Fuel Station Lookup Failed');
    await expect(quietCard).toContainText('Unable to load nearby gas stations from places provider');
    await expect(quietCard).toContainText('Places provider error · fails closed');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
    await checkAxe(page);

    // 2. Simulate empty results (query location far from any station, e.g. North Pole / middle of ocean)
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(false);
      (window as any).__YORI_SET_LOCATION__('available', { lat: 0, lng: 0 });
    });

    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('No Gas Stations Nearby');
    await expect(quietCard).toContainText('No fuel stations found within search radius');
    await expect(quietCard).toContainText('Zero gas stations returned by provider · fails closed');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
    await checkAxe(page);

    // Restore location and provider to healthy SF state
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
    });
  });

  test('V5-FUEL: In Rain scene, chat "find gas" renders fuel candidates with working verified Directions (Rework 2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    // 1. Select Rain scene
    await selectDemoScene(page, 'rain');

    // Verify initial Rain scene hero card is present
    await expect(page.locator('.now-card')).toContainText('Piano');

    // 2. Open ask drawer and submit "find gas"
    const askButton = page.locator('#ask-bar');
    await askButton.click();
    const askInput = page.locator('#conversation-input');
    await expect(askInput).toBeVisible();

    await askInput.fill('find gas');
    await page.keyboard.press('Enter');

    // 3. Conversation collapses to home and 3 fuel candidate cards render
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards).toHaveCount(3);
    const topCard = candidateCards.first();
    await expect(topCard).toContainText('Metro Gas & Go');
    await expect(topCard).toContainText('Gas Station');
    await expect(topCard).toContainText('straight-line');

    // Enable navigation intercept
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });

    // 4. Click Directions on the top candidate card
    const directionsBtn = topCard.locator('.v2-directions-btn');
    await expect(directionsBtn).toBeVisible();
    await directionsBtn.click();

    // 5. Navigate modal appears with verified provider coordinates
    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#nav-modal-title')).toContainText('Start Navigation');

    const urlCode = page.locator('#navigate-verified-url');
    await expect(urlCode).toBeVisible();
    const urlText = await urlCode.innerText();
    const isIos = await page.evaluate(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
    if (isIos) {
      expect(urlText).toContain('daddr=37.7755,-122.418');
      expect(urlText).toContain('maps.apple.com');
    } else {
      expect(urlText).toContain('destination=37.7755%2C-122.418');
      expect(urlText).toContain('destination_place_id=fuel-sf-1');
    }

    // Close modal
    const cancelBtn = page.locator('#btn-cancel-navigate');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('V5-FUEL: When provider is in error, chat "find gas" fails closed with prominent error and zero fabricated merchants (Rework 2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');

    // 1. Select Rain scene
    await selectDemoScene(page, 'rain');

    // 2. Set places provider into error state
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(true);
    });

    // 3. Open ask drawer and submit "find gas"
    const askButton = page.locator('#ask-bar');
    await askButton.click();
    const askInput = page.locator('#conversation-input');
    await expect(askInput).toBeVisible();

    await askInput.fill('find gas');
    await page.keyboard.press('Enter');

    // 4. Conversation transcript shows prominent error message (fails closed)
    const transcript = page.locator('.conversation-transcript');
    await expect(transcript).toBeVisible();
    await expect(transcript).toContainText('Unable to search for gas stations: places provider failure. Fails closed.');

    // 5. Invariant: zero merchant cards are fabricated or displayed
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);

    // Restore provider error state
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(false);
    });
  });
});
