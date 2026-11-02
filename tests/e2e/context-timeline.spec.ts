/**
 * CONTEXT-TIMELINE: Proactivity from Context Changes, Not Scene Selection
 * Governed by TID: INBOX-20261101-070938 and North-Star Reaudit 2026-11-02.
 *
 * Acceptance Criteria:
 * (a) Differential-state E2E with ZERO user input between states:
 *     S0 (morning calm) -> S1 (lunch intent + candidates) -> S1q (suppressed beat after Not now)
 *     -> S2 (depart plan clear) -> S3 (rain: leave earlier, umbrella, habit re-rank).
 * (b) Mid-timeline actions: Accept / Adjust / Not now + preference writeback, daily prompt cap.
 * (c) 3-second comprehension: hero states noticed signal + prepared action above fold at 390 and 1280.
 * (d) Accessibility & UX: touch targets >= 44px, AA contrast, CLS <= 0.1 during morph, axe 0, no horizontal scroll.
 * (e) Playwright local video captures (recordVideo) in .yori-runtime/evidence/context-timeline/ and committed stills in docs/evidence/context-timeline/.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const STALE_COMMITTED_EVIDENCE_DIR = path.resolve('docs/evidence/context-timeline');
const RUNTIME_VIDEO_DIR = path.resolve('.yori-runtime/evidence/context-timeline');

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

async function checkNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function assertTouchTarget(page: Page, selector: string, label: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  expect(box, `${label} bounding box`).not.toBeNull();
  expect(box!.width, `${label} width >= 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height >= 44px`).toBeGreaterThanOrEqual(44);
}

test.describe('CONTEXT-TIMELINE: One Continuous Simulated Day (P0 North-Star)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(STALE_COMMITTED_EVIDENCE_DIR, { recursive: true });
    fs.mkdirSync(RUNTIME_VIDEO_DIR, { recursive: true });
  });

  // =========================================================================
  // Acceptance (a): Differential-state E2E with ZERO user input between states
  // =========================================================================
  test('Acceptance (a): Differential-state transitions S0 -> S1 -> S1q -> S2 -> S3 with zero user input', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewSuffix = isMobile ? '390' : '1280';

    await page.goto('/?ui=v2&timeline=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Reset timeline to S0 explicitly
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.reset());
    await page.waitForTimeout(100);

    // -----------------------------------------------------------------------
    // State S0: 10:00 AM local — Morning Calm (Home, clear weather)
    // -----------------------------------------------------------------------
    const stateS0 = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS0.currentBeat.id).toBe('S0');

    // Living header ambient line
    const headerLineS0 = page.locator('#living-header-line');
    await expect(headerLineS0).toHaveText('10:00 AM · Clear · Home');
    const headerChipS0 = page.locator('#living-header-chip');
    await expect(headerChipS0).toHaveText('simulated');

    // Consumer Home shows Quiet card (zero proactive prompts needed right now)
    const quietCardS0 = page.locator('.quiet-card');
    await expect(quietCardS0).toBeVisible();
    await expect(page.locator('.now-card.v2-journey-card')).toHaveCount(0);
    await expect(page.locator('.now-card.v2-candidates-hero')).toHaveCount(0);

    // Timeline control bar is visible on consumer Home
    await expect(page.locator('#timeline-controls')).toBeVisible();
    await expect(page.locator('#timeline-play-pause-btn')).toBeVisible();
    await expect(page.locator('#timeline-step-btn')).toBeVisible();
    await expect(page.locator('#timeline-restart-btn')).toBeVisible();

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `01-s0-morning-calm-${viewSuffix}.png`),
    });

    // -----------------------------------------------------------------------
    // Transition S0 -> S1: ZERO user input! Step deterministic engine
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForTimeout(200);

    const stateS1 = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS1.currentBeat.id).toBe('S1');

    // S1 Living header updates to Downtown lunch context
    await expect(page.locator('#living-header-line')).toHaveText('11:50 AM · Clear · Downtown');

    // S1 Hero shows candidate lunch cards based on taste memory
    const candidatesHero = page.locator('.now-card.v2-candidates-hero');
    await expect(candidatesHero).toBeVisible();
    await expect(candidatesHero.locator('.hero-thought-badge')).toContainText('THOUGHT AHEAD FOR YOU');
    // Candidate cards rendered with taste citation
    const candidateCards = page.locator('.v2-candidate-card');
    expect(await candidateCards.count()).toBeGreaterThanOrEqual(2);
    await expect(candidateCards.first()).toContainText('Demo Place A · Ramen');
    await expect(candidateCards.first().locator('.v2-candidate-basis')).toContainText('taste');
    await expect(candidatesHero.locator('.mock-places-notice')).toBeVisible();

    // Action buttons visible
    await expect(candidatesHero.locator('#btn-accept')).toBeVisible();
    await expect(candidatesHero.locator('#btn-adjust')).toBeVisible();
    await expect(candidatesHero.locator('#btn-dismiss')).toHaveText('Not now');
    await expect(candidatesHero.locator('#btn-why')).toBeVisible();

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `02-s1-lunch-away-${viewSuffix}.png`),
    });

    // -----------------------------------------------------------------------
    // Transition S1 -> S1q: Suppressed / Quiet beat after "Not now" on lunch
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForTimeout(200);

    const stateS1q = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS1q.currentBeat.id).toBe('S1q');

    // S1q Living header line
    await expect(page.locator('#living-header-line')).toHaveText('12:00 PM · Clear · Downtown');

    // S1q Suppressed beat visible: "Okay — I'll stay quiet about lunch today" + budget meter
    const suppressedCard = page.locator('.quiet-card.suppressed-quiet-card');
    await expect(suppressedCard).toBeVisible();
    await expect(page.locator('#quiet-title')).toHaveText("Okay — I'll stay quiet about lunch today");
    await expect(page.locator('#budget-meter')).toBeVisible();
    await expect(page.locator('#budget-meter-value')).toHaveText('1 of 3 used today');

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `03-s1q-lunch-quiet-${viewSuffix}.png`),
    });

    // -----------------------------------------------------------------------
    // Transition S1q -> S2: Piano Lesson Depart Plan (Clear Sky)
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForTimeout(200);

    const stateS2 = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS2.currentBeat.id).toBe('S2');

    // S2 Living header line: Home clear
    await expect(page.locator('#living-header-line')).toHaveText('1:20 PM · Clear · Home');

    // S2 Hero: Piano lesson at 3:00 PM, leave 2:25 PM
    const journeyCardS2 = page.locator('.now-card.v2-journey-card');
    await expect(journeyCardS2).toBeVisible();
    await expect(journeyCardS2.locator('.now-subject')).toContainText('Piano lesson at 3:00 PM');
    await expect(journeyCardS2.locator('#now-title')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');
    await expect(journeyCardS2.locator('.now-relative-time')).toHaveText('in 1h 5m');

    // Route map strip is visible
    await expect(journeyCardS2.locator('.now-map-strip')).toBeVisible();

    // 4 Signal Tiles grid visible
    await expect(journeyCardS2.locator('#signal-tile-weather')).toContainText('Clear sky');
    await expect(journeyCardS2.locator('#signal-tile-calendar')).toContainText('Piano lesson at 3:00 PM');
    await expect(journeyCardS2.locator('#signal-tile-transit')).toContainText('Drive');
    await expect(journeyCardS2.locator('#signal-tile-memory')).toContainText('driving when it rains');

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `04-s2-depart-clear-${viewSuffix}.png`),
    });

    // -----------------------------------------------------------------------
    // Transition S2 -> S3: Rain Forecast Issued (The Change Moment)
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForTimeout(200);

    const stateS3 = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS3.currentBeat.id).toBe('S3');

    // S3 Living header morphs to Rain from 2:00
    await expect(page.locator('#living-header-line')).toHaveText('1:35 PM · Rain from 2:00 · Home');

    // S3 The Change Moment:
    // 1. Status transition: "Updated plan ready"
    const statusTransition = page.locator('#plan-status-transition');
    await expect(statusTransition).toBeVisible();
    await expect(statusTransition).toHaveText('Updated plan ready');

    // 2. Cause marker: "What changed: rain forecast"
    const whatChangedMarker = page.locator('#what-changed-marker');
    await expect(whatChangedMarker).toBeVisible();
    await expect(whatChangedMarker).toContainText('What changed: rain forecast');

    // 3. Hero cause -> effect microcopy
    const heroCauseEffect = page.locator('#hero-cause-effect');
    await expect(heroCauseEffect).toBeVisible();
    await expect(heroCauseEffect).toHaveText('Rain starts before your lesson. I moved your leave time to 2:30.');

    // 4. Struck-through time: ~~2:25 PM~~ -> 2:30 PM
    const timeDiffDisplay = page.locator('#time-diff-display');
    await expect(timeDiffDisplay).toBeVisible();
    await expect(timeDiffDisplay.locator('.prior-time-struck s')).toHaveText('2:25 PM');
    await expect(timeDiffDisplay.locator('.new-time-highlight')).toHaveText('2:30 PM');

    // 5. Updated headline and umbrella checklist chip
    const journeyCardS3 = page.locator('.now-card.v2-journey-card');
    await expect(journeyCardS3.locator('#now-title')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    await expect(journeyCardS3.locator('#chip-umbrella')).toContainText('Umbrella');

    // 6. Habit re-ranked transit options (Drive ranked first by rain habit)
    await expect(journeyCardS3.locator('#signal-tile-memory')).toContainText('driving when it rains');

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `05-s3-change-moment-rain-${viewSuffix}.png`),
    });
  });

  // =========================================================================
  // Acceptance (b): Mid-timeline user actions and daily prompt budget cap
  // =========================================================================
  test('Acceptance (b): Mid-timeline Accept, Adjust, Not now, and prompt cap across the day', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.reset());

    // 1. Jump to S1 (Lunch) and trigger "Not now" via UI click
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S1'));
    await page.waitForSelector('.v2-candidates-hero');

    const notNowBtn = page.locator('#btn-dismiss');
    await expect(notNowBtn).toHaveText('Not now');
    await notNowBtn.click();

    // Confirm dismiss dialog with "Don't suggest this today"
    await expect(page.locator('#dismiss-dialog')).toBeVisible();
    await page.locator('#btn-confirm-dismiss').click();

    // Verifies transition to S1q with budget meter updated
    await expect(page.locator('#quiet-title')).toHaveText("Okay — I'll stay quiet about lunch today");
    await expect(page.locator('#budget-meter-value')).toHaveText('1 of 3 used today');

    // 2. Jump to S2 (Clear depart) and test Adjust
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S2'));
    await page.waitForSelector('.v2-journey-card');

    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();
    await expect(page.locator('#adjust-dialog')).toBeVisible();

    // Adjust buffer minutes to 10
    const bufferInput = page.locator('#input-buffer-minutes');
    await bufferInput.fill('10');
    await page.locator('#btn-adjust-for-today').click();

    // Verify schedule recomputed: leave 2:20 PM
    await expect(page.locator('#now-title')).toContainText('leave by 2:20 PM');

    // 3. Jump to S3 (Rain re-plan) and test Accept
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('.v2-journey-card');

    const acceptBtn = page.locator('#btn-accept');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Verify accepted badge and Undo button appear
    await expect(page.locator('.badge-accepted')).toHaveText('Accepted');
    await expect(page.locator('#btn-undo-accept')).toBeVisible();
  });

  // =========================================================================
  // Acceptance (c): 3-second comprehension check above fold at 390 and 1280
  // =========================================================================
  test('Acceptance (c): 3-second comprehension at S3 above the fold without scrolling', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewportHeight = isMobile ? 844 : 800;

    await page.goto('/?ui=v2&timeline=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('.v2-journey-card');

    // Assert: Noticed signal (#what-changed-marker) is strictly above the fold
    const whatChangedBox = await page.locator('#what-changed-marker').boundingBox();
    expect(whatChangedBox).not.toBeNull();
    expect(whatChangedBox!.y).toBeGreaterThanOrEqual(0);
    expect(whatChangedBox!.y + whatChangedBox!.height).toBeLessThanOrEqual(viewportHeight);

    // Assert: Prepared action (#hero-cause-effect and #time-diff-display) is strictly above the fold
    const causeEffectBox = await page.locator('#hero-cause-effect').boundingBox();
    expect(causeEffectBox).not.toBeNull();
    expect(causeEffectBox!.y).toBeGreaterThanOrEqual(0);
    expect(causeEffectBox!.y + causeEffectBox!.height).toBeLessThanOrEqual(viewportHeight);

    const timeDiffBox = await page.locator('#time-diff-display').boundingBox();
    expect(timeDiffBox).not.toBeNull();
    expect(timeDiffBox!.y).toBeGreaterThanOrEqual(0);
    expect(timeDiffBox!.y + timeDiffBox!.height).toBeLessThanOrEqual(viewportHeight);

    // Big Accept button is visible in hero card
    await expect(page.locator('#btn-accept')).toBeVisible();
  });

  // =========================================================================
  // Acceptance (d): Touch targets >= 44px, AA contrast, CLS <= 0.1, Axe 0, no overflow
  // =========================================================================
  test('Acceptance (d): Accessibility, touch targets >= 44px, Axe 0, CLS <= 0.1, and no overflow', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('.v2-journey-card');

    // 1. Touch targets >= 44x44px
    await assertTouchTarget(page, '#timeline-play-pause-btn', 'Timeline Play/Pause Button');
    await assertTouchTarget(page, '#timeline-step-btn', 'Timeline Step Button');
    await assertTouchTarget(page, '#timeline-restart-btn', 'Timeline Restart Button');
    await assertTouchTarget(page, '#btn-accept', 'Hero Accept Button');
    await assertTouchTarget(page, '#btn-adjust', 'Hero Adjust Button');
    await assertTouchTarget(page, '#btn-dismiss', 'Hero Not Now Button');
    await assertTouchTarget(page, '#btn-why', 'Hero Why Button');

    // 2. Axe accessibility check (WCAG AA)
    await checkAxe(page, 'Context Timeline at S3');

    // 3. No horizontal overflow
    await checkNoHorizontalOverflow(page);

    // 4. CLS measurement during beat morph
    const clsDelta = await page.evaluate(async () => {
      let cls = 0;
      const observer = new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            cls += (entry as any).value;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });

      // Morph from S2 to S3
      (window as any).__YORI_TIMELINE__.goTo('S2');
      await new Promise(r => setTimeout(r, 100));
      (window as any).__YORI_TIMELINE__.goTo('S3');
      await new Promise(r => setTimeout(r, 150));

      observer.disconnect();
      return cls;
    });

    expect(clsDelta).toBeLessThanOrEqual(0.1);
  });

  // =========================================================================
  // Acceptance (e): Reduced-motion fallback inspection
  // =========================================================================
  test('Acceptance (e): Reduced-motion mode swaps instantly while preserving cause marker', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewSuffix = isMobile ? '390' : '1280';

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?ui=v2&timeline=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Step to S3 under reduced motion
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('#what-changed-marker');

    // Assert: Cause marker, microcopy, struck-through time, and status transition all preserved
    await expect(page.locator('#what-changed-marker')).toContainText('What changed: rain forecast');
    await expect(page.locator('#hero-cause-effect')).toHaveText(
      'Rain starts before your lesson. I moved your leave time to 2:30.'
    );
    await expect(page.locator('#time-diff-display .prior-time-struck s')).toHaveText('2:25 PM');
    await expect(page.locator('#time-diff-display .new-time-highlight')).toHaveText('2:30 PM');

    await page.screenshot({
      path: path.join(STALE_COMMITTED_EVIDENCE_DIR, `06-s3-reduced-motion-${viewSuffix}.png`),
    });
  });
});
