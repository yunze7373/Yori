import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v5-geo');
const shouldRecord = Boolean(process.env.V5_GEO_RECORD || process.env.V5_RECORD);

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

test.describe('V5-GEO: Consent-Aware Geolocation & Explicit Degradation (AC-211-1, AC-211-2)', () => {
  test.beforeAll(() => {
    if (shouldRecord && !fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V5-GEO flow: prompt -> denied -> manual location entry -> fuel recommendations (AC-211-1, AC-211-2)', async ({
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

    // 1. Initial Load in Prompt State (explicit consent not yet granted)
    await page.goto('/?ui=v2&scene=fuel&geo_consent=prompt&test=1');
    await page.waitForSelector('.app-layout');

    // Quiet card indicates location needed
    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Location Needed');
    await expect(quietCard).toContainText('Location permission needed to find nearby gas stations');

    // Notice banner is visible with prompt styling
    const promptBanner = page.locator('.v2-location-notice-banner.prompt');
    await expect(promptBanner).toBeVisible();
    await expect(promptBanner).toContainText('Location Permission Needed');

    // Consent buttons are present
    const requestBtn = page.locator('#btn-request-location');
    await expect(requestBtn).toBeVisible();
    await expect(requestBtn).toContainText('Use My Location');

    const denyBtn = page.locator('#btn-deny-location');
    await expect(denyBtn).toBeVisible();
    await expect(denyBtn).toContainText('Deny');

    // Manual location container is present
    const manualToggleBtn = page.locator('#btn-manual-location-toggle');
    await expect(manualToggleBtn).toBeVisible();

    // Invariant: zero candidates rendered while consent is pending
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards).toHaveCount(0);

    // Touch targets check (>= 44px)
    const reqBox = await requestBtn.boundingBox();
    expect(reqBox).not.toBeNull();
    expect(reqBox!.width).toBeGreaterThanOrEqual(44);
    expect(reqBox!.height).toBeGreaterThanOrEqual(44);

    const denyBox = await denyBtn.boundingBox();
    expect(denyBox).not.toBeNull();
    expect(denyBox!.width).toBeGreaterThanOrEqual(44);
    expect(denyBox!.height).toBeGreaterThanOrEqual(44);

    // Honest copy check: assert no 'live' or 'real-time' claim while simulated
    const quietText = await quietCard.innerText();
    expect(quietText).not.toMatch(/\b(live|real-time)\b/i);

    // Accessibility check on consent prompt state
    await checkAxe(page);

    // Visual screenshot 1: Consent Prompt State
    await maybeScreenshot(page, `geo-consent-prompt-${vpSuffix}.png`);

    // 2. User Clicks 'Deny': Transitions to Denied Notice
    await denyBtn.click();
    await expect(quietCard).toContainText('Location Denied');
    await expect(quietCard).toContainText('Location access denied by user');

    const deniedBanner = page.locator('.v2-location-notice-banner.denied');
    await expect(deniedBanner).toBeVisible();
    await expect(deniedBanner).toContainText('Location Access Denied');

    // Invariant: still zero candidates rendered on denied
    await expect(candidateCards).toHaveCount(0);

    // No navigation modal or URL built
    const navModal = page.locator('#navigate-confirm-modal');
    await expect(navModal).toHaveCount(0);

    // Accessibility check on denied state
    await checkAxe(page);

    // Visual screenshot 2: Denied State
    await maybeScreenshot(page, `geo-denied-${vpSuffix}.png`);

    // 3. User Expands Manual Location Section
    const manualSection = page.locator('#v2-manual-location-section');
    await expect(manualSection).toBeVisible();

    const citySfBtn = page.locator('#btn-city-sf');
    await expect(citySfBtn).toBeVisible();
    const cityLaBtn = page.locator('#btn-city-la');
    await expect(cityLaBtn).toBeVisible();

    const latInput = page.locator('#input-manual-lat');
    await expect(latInput).toBeVisible();
    const lngInput = page.locator('#input-manual-lng');
    await expect(lngInput).toBeVisible();

    // Touch targets for city chips (>= 44px)
    const sfBox = await citySfBtn.boundingBox();
    expect(sfBox).not.toBeNull();
    expect(sfBox!.width).toBeGreaterThanOrEqual(44);
    expect(sfBox!.height).toBeGreaterThanOrEqual(44);

    // Accessibility check on manual location section
    await checkAxe(page);

    // Visual screenshot 3: Manual Location Section
    await maybeScreenshot(page, `geo-manual-location-${vpSuffix}.png`);

    // 4. User Selects San Francisco Preset: Fuel Recommendations Appear
    await citySfBtn.click();

    // Now-card appears with fuel recommendations
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Low Fuel Warning');
    await expect(nowCard).toContainText('SIMULATED');

    // Candidate cards now populated from provider
    await expect(candidateCards).toHaveCount(3);
    const topCard = candidateCards.first();
    await expect(topCard).toContainText('Metro Gas & Go');
    await expect(topCard).toContainText('(straight-line)');

    // Directions button is active and >= 44px
    const directionsBtn = topCard.locator('.v2-directions-btn');
    await expect(directionsBtn).toBeVisible();
    const dirBox = await directionsBtn.boundingBox();
    expect(dirBox).not.toBeNull();
    expect(dirBox!.width).toBeGreaterThanOrEqual(44);
    expect(dirBox!.height).toBeGreaterThanOrEqual(44);

    // Click Directions to verify handoff URL
    await directionsBtn.click();
    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#nav-modal-title')).toContainText('Start Navigation');

    const urlCode = page.locator('#navigate-verified-url');
    await expect(urlCode).toBeVisible();
    const urlText = await urlCode.innerText();
    expect(urlText).toMatch(/(maps\.apple\.com|google\.com\/maps)/);

    // Dismiss modal via cancel button
    const cancelBtn = page.locator('#btn-cancel-navigate');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();

    // Accessibility check on fuel recommendations layout
    await checkAxe(page);

    // Visual screenshot 4: Fuel Recommendations Layout With Manual Location Set
    await maybeScreenshot(page, `geo-fuel-with-location-${vpSuffix}.png`);

    // 5. Invariant: ZERO non-font external network requests across entire flow
    expect(disallowedRequests).toHaveLength(0);
  });

  test('V5-GEO: Manual coordinate input changes returned candidates between SF and LA (AC-211-1, AC-212-1)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=fuel&geo_consent=prompt&test=1');
    await page.waitForSelector('.app-layout');

    // 1. Enter LA coordinates manually
    const latInput = page.locator('#input-manual-lat');
    await latInput.fill('34.0522');
    const lngInput = page.locator('#input-manual-lng');
    await lngInput.fill('-118.2437');

    const applyBtn = page.locator('#btn-apply-manual-coords');
    await applyBtn.click();

    // Verify candidates are LA gas stations
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards.first()).toBeVisible();
    const topCardText = await candidateCards.first().innerText();
    expect(topCardText).toContain('Angel City Fuel');

    // 2. Select SF preset chip
    const changeLocBtn = page.locator('#btn-change-location');
    await changeLocBtn.click();

    const sfBtn = page.locator('#btn-city-sf');
    await sfBtn.click();

    // Verify candidates updated to SF gas stations
    await expect(candidateCards.first()).toContainText('Metro Gas & Go');
  });

  test('V5-GEO: __YORI_SET_LOCATION__ test hook handles all 4 states correctly', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=fuel&test=1');
    await page.waitForSelector('.app-layout');

    // Available -> shows candidates
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
    });
    await expect(page.locator('.v2-candidate-card')).toHaveCount(3);

    // Unavailable -> quiet state
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('unavailable');
    });
    await expect(page.locator('.quiet-card')).toContainText('Location Unavailable');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);

    // Denied -> denied quiet state
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('denied');
    });
    await expect(page.locator('.quiet-card')).toContainText('Location Denied');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);

    // Prompt -> prompt quiet state
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('prompt');
    });
    await expect(page.locator('.quiet-card')).toContainText('Location Needed');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
  });
});
