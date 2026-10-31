import { test, expect } from '@playwright/test';

const SHIPPING_PREVIEW_URL = 'http://localhost:4174';
const TEST_BUILD_URL = 'http://localhost:4173';

test.describe('PRE-S1-C: Production Gating of Dev/Test Hooks and URL Forcing', () => {
  test('Negative case: on SHIPPING production preview, ?test=1&scene=lunch&geo_consent=denied is completely INERT and zero hooks exist', async ({
    page,
  }) => {
    // Navigate against the SHIPPING production preview (port 4174) with test flag and forcing parameters
    await page.goto(`${SHIPPING_PREVIEW_URL}/?ui=v2&scene=lunch&geo_consent=denied&test=1`);
    await page.waitForSelector('.app-layout');

    // 1. Scene forcing is INERT:
    // Lunch options are NOT rendered; default clear morning commute scene remains active
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Piano lesson at 3:00 PM');
    await expect(nowCard).not.toContainText('Lunch options near you');
    await expect(page.locator('.v2-candidate-list')).toHaveCount(0);

    // 2. Observable geo_consent forcing is INERT:
    // When geo_consent=denied is active, the app renders .v2-location-notice-banner.denied.
    // In shipping preview, geo_consent forcing is stripped at compile-time, so NO denied banner exists.
    await expect(page.locator('.v2-location-notice-banner')).toHaveCount(0);
    await expect(page.locator('.v2-location-notice-banner.denied')).toHaveCount(0);
    await expect(page.locator('.quiet-card')).toHaveCount(0);

    // 3. Dev/test window hooks are 100% absent:
    const hooksState = await page.evaluate(() => {
      const w = window as any;
      return {
        hasPrefixHooks: Object.keys(w).some(k => k.startsWith('__YORI_')),
        allYoriKeys: Object.keys(w).filter(k => k.startsWith('__YORI_')),
        setLocation: typeof w.__YORI_SET_LOCATION__,
        setPlacesError: typeof w.__YORI_SET_PLACES_ERROR__,
        decisionLog: typeof w.__YORI_DECISION_LOG__,
        decisionLogger: typeof w.__YORI_DECISION_LOGGER__,
        buildNavUrl: typeof w.__YORI_BUILD_NAV_URL__,
        getCurrentEvidenceBundle: typeof w.__YORI_GET_CURRENT_EVIDENCE_BUNDLE__,
        actionStore: typeof w.__YORI_ACTION_STORE__,
        modelInterpreter: typeof w.__YORI_MODEL_INTERPRETER__,
        modelCommandInterpreterClass: typeof w.__YORI_MODEL_COMMAND_INTERPRETER_CLASS__,
        lastNavUrl: typeof w.__YORI_LAST_NAV_URL__,
        interceptNav: typeof w.__YORI_TEST_INTERCEPT_NAV__,
      };
    });

    expect(hooksState.hasPrefixHooks).toBe(false);
    expect(hooksState.allYoriKeys).toEqual([]);
    expect(hooksState.setLocation).toBe('undefined');
    expect(hooksState.setPlacesError).toBe('undefined');
    expect(hooksState.decisionLog).toBe('undefined');
    expect(hooksState.decisionLogger).toBe('undefined');
    expect(hooksState.buildNavUrl).toBe('undefined');
    expect(hooksState.getCurrentEvidenceBundle).toBe('undefined');
    expect(hooksState.actionStore).toBe('undefined');
    expect(hooksState.modelInterpreter).toBe('undefined');
    expect(hooksState.modelCommandInterpreterClass).toBe('undefined');
    expect(hooksState.lastNavUrl).toBe('undefined');
    expect(hooksState.interceptNav).toBe('undefined');

    // 4. Route test hooks are INERT in shipping production build:
    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=live&test_destination=1&test=1`);
    await page.waitForSelector('#notice-route-unavailable');
    const routeCard = page.locator('#notice-route-unavailable');
    await expect(routeCard).toHaveAttribute('data-no-route-reason', 'no_destination');
    await expect(routeCard).toContainText('no destination set');
    await expect(page.locator('#live-route-card')).toHaveCount(0);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Mission Dolores');

    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=live&test_no_route_reason=stale&test=1`);
    await page.waitForSelector('#notice-route-unavailable');
    const reasonCard = page.locator('#notice-route-unavailable');
    await expect(reasonCard).toHaveAttribute('data-no-route-reason', 'no_destination');
    await expect(reasonCard).not.toContainText('data is stale');
  });

  test('Positive case: on TEST build with ?test=1&scene=lunch&geo_consent=denied, forcing and hooks are active and observable', async ({
    page,
  }) => {
    // Navigate against the TEST build (port 4173) with ?test=1&scene=lunch&geo_consent=denied
    await page.goto(`${TEST_BUILD_URL}/?ui=v2&scene=lunch&geo_consent=denied&test=1`);
    await page.waitForSelector('.app-layout');

    // 1. Observable geo_consent forcing IS honoured:
    // Location notice banner in denied state is rendered
    const deniedBanner = page.locator('.v2-location-notice-banner.denied');
    await expect(deniedBanner).toBeVisible();
    await expect(deniedBanner).toContainText('Location access was denied');
    const noticeDesc = page.locator('.v2-location-notice-desc');
    await expect(noticeDesc).toContainText('Location access was denied. You can select a city or enter coordinates manually below.');

    // 2. Dev/test window hooks ARE exposed and functional:
    const hooksState = await page.evaluate(() => {
      const w = window as any;
      return {
        setLocation: typeof w.__YORI_SET_LOCATION__,
        decisionLog: typeof w.__YORI_DECISION_LOG__,
        decisionLogger: typeof w.__YORI_DECISION_LOGGER__,
        buildNavUrl: typeof w.__YORI_BUILD_NAV_URL__,
        getCurrentEvidenceBundle: typeof w.__YORI_GET_CURRENT_EVIDENCE_BUNDLE__,
        actionStore: typeof w.__YORI_ACTION_STORE__,
        modelInterpreter: typeof w.__YORI_MODEL_INTERPRETER__,
      };
    });

    expect(hooksState.setLocation).toBe('function');
    expect(hooksState.decisionLog).toBe('object');
    expect(hooksState.decisionLogger).toBe('object');
    expect(hooksState.buildNavUrl).toBe('function');
    expect(hooksState.getCurrentEvidenceBundle).toBe('function');
    expect(hooksState.actionStore).toBe('object');
    expect(hooksState.modelInterpreter).toBe('object');
  });

  test('Positive case: on TEST build with ?test=1&scene=lunch, scene forcing renders lunch cards', async ({ page }) => {
    // Navigate against the TEST build (port 4173) with ?scene=lunch&test=1
    await page.goto(`${TEST_BUILD_URL}/?ui=v2&scene=lunch&test=1`);
    await page.waitForSelector('.app-layout');

    // Scene forcing IS honoured:
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Lunch options near you');
    await expect(page.locator('.v2-candidate-list')).toBeVisible();

    // Bundle is available via test hook
    const bundleId = await page.evaluate(() => {
      const bundle = (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__();
      return bundle?.id;
    });
    expect(bundleId).toContain('bundle-lunch');
  });
});
