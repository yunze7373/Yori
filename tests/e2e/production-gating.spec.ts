import { test, expect } from '@playwright/test';

test.describe('PRE-S1-C: Production Gating of Dev/Test Hooks and URL Forcing', () => {
  test('Negative case: in production preview without ?test=1, ?scene= forcing is inert', async ({ page }) => {
    // Navigate with ?scene=lunch but WITHOUT ?test=1
    await page.goto('/?ui=v2&scene=lunch');
    await page.waitForSelector('.app-layout');

    // The scene forcing MUST be inert: the scene must NOT be lunch
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).not.toContainText('Lunch options near you');
    // Default clear scene remains active
    await expect(nowCard).toContainText('Piano lesson at 3:00 PM');
    // Candidate list from lunch scene must not be rendered
    await expect(page.locator('.v2-candidate-list')).toHaveCount(0);
  });

  test('Negative case: in production preview without ?test=1, window.__YORI_* hooks are completely absent', async ({ page }) => {
    // Navigate with ?ui=v2 and ?scene=lunch (no ?test=1)
    await page.goto('/?ui=v2&scene=lunch');
    await page.waitForSelector('.app-layout');

    // Verify all known __YORI_* hooks on window are strictly undefined
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
  });

  test('Negative case: in production preview without ?test=1, ?geo_consent= forcing is inert', async ({ page }) => {
    // Navigate with ?geo_consent=denied but WITHOUT ?test=1
    await page.goto('/?ui=v2&geo_consent=denied');
    await page.waitForSelector('.app-layout');

    // Without ?test=1, location consent is not forced to denied
    // The now card renders default clear scene
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Piano lesson at 3:00 PM');
  });

  test('Positive case: in production preview WITH ?test=1, ?scene= forcing and __YORI_* hooks are active', async ({ page }) => {
    // Navigate with ?scene=lunch AND ?test=1
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // Scene forcing IS honoured
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Lunch options near you');
    await expect(page.locator('.v2-candidate-list')).toBeVisible();

    // Hooks ARE exposed on window
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

    // Verify calling get current evidence bundle returns valid bundle
    const bundleId = await page.evaluate(() => {
      const bundle = (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__();
      return bundle?.id;
    });
    expect(bundleId).toContain('bundle-lunch');
  });
});
