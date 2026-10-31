import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('v5-lunch');
const shouldRecord = Boolean(process.env.V5_LUNCH_RECORD || process.env.V5_RECORD);

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

test.describe('V5-LUNCH: PlacesProvider Seam, Dynamic Recommendations, Grounding & G4 Breaker (AC-213-1, AC-213-2)', () => {
  test.beforeAll(() => {
    if (shouldRecord && !fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    // Spy on geolocation to guarantee 0 real geolocation calls
    await page.addInitScript(() => {
      let geoCallCount = 0;
      let watchCallCount = 0;
      if (navigator.geolocation) {
        const origGetCurrent = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = (...args: any[]) => {
          geoCallCount++;
          (window as any).__YORI_GEO_CALL_COUNT__ = geoCallCount;
          return (origGetCurrent as any)(...args);
        };
        const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
        navigator.geolocation.watchPosition = (...args: any[]) => {
          watchCallCount++;
          (window as any).__YORI_WATCH_CALL_COUNT__ = watchCallCount;
          return (origWatch as any)(...args);
        };
      }
    });
  });

  test('V5-LUNCH flow: proactive card -> chat re-rank -> navigate modal -> why sheet -> accept -> undo (AC-213-1, AC-213-2, G1, G2)', async ({
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

    // 1. Navigate to V2 UI with test flag
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // 2. Initial Proactive Lunch Card Verification
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Lunch options near you');
    await expect(nowCard).toContainText('Nearby places (straight-line distances)');
    await expect(nowCard).toContainText('SIMULATED');

    // Location bar displays current simulated city
    const locBar = page.locator('.v2-active-location-bar');
    await expect(locBar).toBeVisible();
    await expect(locBar).toContainText('Location:');

    // Candidate list exists with restaurant recommendations
    const candidateList = page.locator('.v2-candidate-list');
    await expect(candidateList).toBeVisible();

    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards.first()).toBeVisible();
    const topCard = candidateCards.first();
    await expect(topCard).toContainText('Pacific Ramen Bar');
    await expect(topCard).toContainText('Japanese');

    // Dynamic lunch card shows straight-line distance, never invented walking ETAs or 'away'
    const topDistanceChip = topCard.locator('.v2-distance-chip');
    await expect(topDistanceChip).toBeVisible();
    await expect(topDistanceChip).toHaveText(/^[0-9]+(\.[0-9]+)?\s*(m|km)\s*\(straight-line\)$/);
    await expect(topDistanceChip).toContainText('(straight-line)');

    // Invariant: no 'Nm away' token appears on ANY dynamic lunch card
    const cardTexts = await candidateCards.allInnerTexts();
    for (const cardText of cardTexts) {
      expect(cardText).not.toMatch(/\b\d+m away\b/);
      expect(cardText).toContain('(straight-line)');
    }

    // Assert bundle provenance equals rendered label (sample persona yields 'sample' and 'Demo profile · sample')
    const bundleProbe = await page.evaluate(() => {
      const bundle = (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__();
      const habitRec =
        bundle?.getRecord('taste_preference') ||
        bundle?.getRecord('favorite_cuisine') ||
        bundle?.getRecord('taste_preference_lunch_cuisine');
      return {
        hasBundle: Boolean(bundle),
        habitProvenance: habitRec?.provenance,
        habitBasis: habitRec?.fields?.basis,
      };
    });
    expect(bundleProbe.hasBundle).toBe(true);
    expect(bundleProbe.habitProvenance).toBe('sample');
    expect(bundleProbe.habitBasis).toContain('Demo profile · sample');

    await expect(topCard).toContainText('Demo profile · sample');
    await expect(topCard).not.toContainText('You confirmed');

    // Touch targets check: Directions button >= 44px
    const directionsBtn = topCard.locator('.v2-directions-btn');
    await expect(directionsBtn).toBeVisible();
    const box = await directionsBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Accessibility check
    await checkAxe(page);

    // Capture visual screenshot of initial lunch card
    await maybeScreenshot(page, `lunch-card-${vpSuffix}.png`);

    // 3. Chat Re-ranking: filter for 'quieter' via closed grammar
    const askButton = page.locator('#ask-bar');
    await askButton.click();
    const askInput = page.locator('#conversation-input');
    await expect(askInput).toBeVisible();

    await askInput.fill('quieter');
    await page.keyboard.press('Enter');

    // The conversation updates and applies filter override
    await expect(candidateCards.first()).toBeVisible();
    await expect(candidateCards.first()).toContainText('Quiet');

    // Accessibility check on filter state
    await checkAxe(page);

    // Capture visual screenshot of filtered lunch cards
    await maybeScreenshot(page, `lunch-filter-${vpSuffix}.png`);

    // 4. Navigate Handoff Verification
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });

    const activeDirectionsBtn = candidateCards.first().locator('.v2-directions-btn');
    await activeDirectionsBtn.click();

    // Navigate confirmation modal appears
    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#nav-modal-title')).toContainText('Start Navigation');
    await expect(modal).toContainText('Verified handoff');

    const isIos = await page.evaluate(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
    const expectedApp = isIos ? 'Apple Maps' : 'Google Maps';
    await expect(modal).toContainText(`in ${expectedApp}?`);

    // URL preview matches exact pinned coordinates and encoding
    const urlCode = page.locator('#navigate-verified-url');
    await expect(urlCode).toBeVisible();
    const urlText = await urlCode.innerText();
    if (isIos) {
      expect(urlText).toContain('maps.apple.com');
      expect(urlText).toContain('37.77');
    } else {
      expect(urlText).toContain('google.com/maps');
      expect(urlText).toContain('37.77');
      expect(urlText).toContain('lunch-sf-');
    }

    // Accessibility of modal
    await checkAxe(page);

    // Capture visual screenshot of navigate confirmation modal
    await maybeScreenshot(page, `lunch-navigate-modal-${vpSuffix}.png`);

    // Close modal via Cancel
    const cancelNavBtn = page.locator('#btn-cancel-navigate');
    await cancelNavBtn.click();
    await expect(modal).not.toBeVisible();

    // 5. Why Sheet & Review Loop
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(whySheet).toContainText('Why');
    await expect(whySheet).toContainText('Demo profile · sample');
    await expect(whySheet).not.toContainText('You confirmed');

    // Close Why Sheet
    const closeWhyBtn = page.locator('#btn-close-why');
    await closeWhyBtn.click();
    await expect(whySheet).not.toBeVisible();

    // 6. Accept and Undo
    const acceptBtn = page.locator('#btn-accept');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Accepted badge and Undo button appear
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();

    // Click Undo to restore
    await undoBtn.click();
    await expect(page.locator('#btn-accept')).toBeVisible();

    // Invariants: 0 non-font requests, 0 real geolocation calls
    expect(disallowedRequests).toHaveLength(0);
    const geoCalls = await page.evaluate(() => (window as any).__YORI_GEO_CALL_COUNT__ || 0);
    expect(geoCalls).toBe(0);
  });

  test('V5-LUNCH: Location unavailable degrades prominently and fails closed (AC-213-1, AC-213-2)', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // Simulate location unavailable on LocationPort seam
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('unavailable');
      }
    });

    // Degraded state rendered prominently on quiet state card
    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Location Unavailable');
    await expect(quietCard).toContainText('Cannot find nearby lunch places without location access');

    // Invariant: zero merchant cards rendered
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);

    // Accessibility check
    await checkAxe(page);

    // Capture visual screenshot of unavailable state
    await maybeScreenshot(page, `lunch-unavailable-${vpSuffix}.png`);

    // Restore location port
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w.__YORI_SET_LOCATION__ === 'function') {
        w.__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
      }
    });
  });

  test('V5-LUNCH: Location change to LA dynamically updates candidates, map, and verified URL (AC-213-1, AC-213-2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // Switch location to Los Angeles: lat: 34.0522, lng: -118.2437
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 34.0522, lng: -118.2437 });
    });

    // Candidate cards update to LA restaurants
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards.first()).toBeVisible();
    const candidateTexts = await candidateCards.allInnerTexts();
    const allText = candidateTexts.join('\n');
    expect(allText).toContain('Sunset Organic Greens');
    expect(allText).toContain('Angel City Ramen');

    // Map card derives from LA restaurant
    const mapCard = page.locator('.v2-map-card');
    await expect(mapCard).toBeVisible();
    const topCardName = await candidateCards.first().locator('.v2-candidate-name').innerText();
    await expect(mapCard).toContainText(topCardName.trim());

    // Directions on LA card pins LA coordinates
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });

    const directionsBtn = candidateCards.first().locator('.v2-directions-btn');
    await directionsBtn.click();

    const modal = page.locator('#navigate-confirm-modal');
    await expect(modal).toBeVisible();
    const urlCode = page.locator('#navigate-verified-url');
    const urlText = await urlCode.innerText();

    const isIos = await page.evaluate(() => /iPhone|iPad|iPod/i.test(navigator.userAgent));
    if (isIos) {
      expect(urlText).toContain('daddr=34.05');
      expect(urlText).toContain('maps.apple.com');
    } else {
      expect(urlText).toMatch(/destination=34\.05/);
      expect(urlText).toContain('lunch-la-');
    }

    const cancelBtn = page.locator('#btn-cancel-navigate');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();

    // Reset location back to SF
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
    });
  });

  test('V5-LUNCH: Provider error and empty results degrade prominently and fail closed', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // 1. Simulate provider error
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(true);
    });

    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('Lunch Place Lookup Failed');
    await expect(quietCard).toContainText('Unable to load nearby lunch places from places provider');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
    await checkAxe(page);

    // 2. Simulate empty results (coords with no restaurants nearby, e.g. 0, 0)
    await page.evaluate(() => {
      (window as any).__YORI_SET_PLACES_ERROR__(false);
      (window as any).__YORI_SET_LOCATION__('available', { lat: 0, lng: 0 });
    });

    await expect(quietCard).toBeVisible();
    await expect(quietCard).toContainText('No Lunch Places Nearby');
    await expect(quietCard).toContainText('No restaurants found within search radius');
    await expect(page.locator('.v2-candidate-card')).toHaveCount(0);
    await checkAxe(page);

    // Restore provider and location to healthy SF state
    await page.evaluate(() => {
      (window as any).__YORI_SET_LOCATION__('available', { lat: 37.7749, lng: -122.4194 });
    });
  });

  test('V5-LUNCH: Out-of-session candidate yields no URL and logs candidate_outside_bundle (G2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    // Session is SF. A candidate from Seattle (lunch-sea-1) submitted against this session fails closed
    const result = await page.evaluate(() => {
      const bundle = (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__();
      const buildNavUrl = (window as any).__YORI_BUILD_NAV_URL__;
      const logger = (window as any).__YORI_DECISION_LOGGER__;
      const initialLogCount = logger ? logger.getEntries().length : 0;

      const url = buildNavUrl(
        {
          id: 'lunch-sea-1',
          name: 'Emerald Noodle Workshop',
          coords: { lat: 47.6062, lng: -122.3321 },
          sourceRef: { recordId: 'lunch-sea-1', field: 'name' },
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

    expect(result.url).toBeFalsy();
    expect(result.logged).toBe(true);
    expect(result.latestEntry?.validationResult?.valid).toBe(false);
    expect(result.latestEntry?.validationResult?.reason).toBe('candidate_outside_bundle');
  });

  test('V5-LUNCH: G4 Breaker fault injection pauses model and falls back to deterministic', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');

    const faultResult = await page.evaluate(() => {
      const logger = (window as any).__YORI_DECISION_LOGGER__;
      const InterpreterClass = (window as any).__YORI_MODEL_COMMAND_INTERPRETER_CLASS__;

      // Create an interpreter with faulty fixture
      let callCount = 0;
      const faultFixture = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['quieter'] },
        citedSignalIds: ['uncited_fake_signal_id'],
        citedFactKeys: [],
        reasonCodes: ['free_window_fit'],
        explanation: 'Faulty citation test.',
      };

      const fixturesProxy = new Proxy({ 'fault command': faultFixture } as any, {
        get(target, prop) {
          if (prop === 'fault command') callCount++;
          return target[prop];
        },
      });

      const testInterpreter = new InterpreterClass({
        mode: 'replay',
        fixtures: fixturesProxy,
        logger,
      });

      // 3 consecutive failures
      testInterpreter.interpret('fault command');
      testInterpreter.interpret('fault command');
      testInterpreter.interpret('fault command');

      const isPausedAt3 = testInterpreter.isModelPaused();
      const callsAt3 = callCount;

      // 4th call
      const res4 = testInterpreter.interpret('fault command');
      const callsAt4 = callCount;
      const latestEntry = logger.getLatest();

      return {
        isPausedAt3,
        callsAt3,
        callsAt4,
        res4EngineStatus: res4.engineStatus,
        latestEntry,
      };
    });

    expect(faultResult.isPausedAt3).toBe(true);
    expect(faultResult.callsAt3).toBe(3);
    expect(faultResult.callsAt4).toBe(3); // Call count stopped at 3!
    expect(faultResult.res4EngineStatus).toBe('offline_deterministic');
    expect(faultResult.latestEntry?.validationResult?.reason).toBe('model_paused');
  });

  test('V5-LUNCH: Recorded Away-Lunch scene remains completely stable and distinct (AC-213-2)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=away-lunch&test=1');
    await page.waitForSelector('.app-layout');

    // Away-Lunch scene from recorded D3 demo loads with Demo Place A
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Demo Place A · Ramen');

    // Switch to dynamic lunch scene
    await selectDemoScene(page, 'lunch');

    // Dynamic lunch scene loads with Pacific Ramen Bar
    await expect(nowCard).toContainText('Pacific Ramen Bar');

    // Switch back to away-lunch
    await selectDemoScene(page, 'away-lunch');
    await expect(nowCard).toContainText('Demo Place A · Ramen');
  });
});
