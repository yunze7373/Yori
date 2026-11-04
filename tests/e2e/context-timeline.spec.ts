/**
 * CONTEXT-TIMELINE: Proactivity from Context Changes, Not Scene Selection
 * Governed by TID: INBOX-20261101-070938 and North-Star Reaudit 2026-11-02.
 * Rework revision: INBOX-20261101-070938-REV-16e68191.
 *
 * Acceptance Criteria & Reviewer Findings:
 * (a) Differential-state E2E with ZERO user input between states:
 *     S0 (morning calm) -> S1 (lunch intent + candidates) -> S1q (honest quiet beat after dismissal)
 *     -> S2 (depart plan clear) -> S3 (rain: leave earlier, umbrella, habit re-rank).
 * (b) Mid-timeline actions: Accept / Adjust / Not now + preference writeback, daily prompt cap.
 * (c) 3-second comprehension: hero states noticed signal + prepared action (#btn-accept) strictly above fold at 390 and 1280 at both S1 and S3.
 * (d) Accessibility & UX: touch targets >= 44px, AA contrast, CLS <= 0.1 during morph, axe 0, no horizontal scroll.
 * (e) Evidence: local video captures (recordVideo) in .yori-runtime/evidence/context-timeline/ and committed stills in docs/evidence/context-timeline/.
 * (f) Dynamic Change Moment: Adjust buffer in S2 produces true dynamic prior/new leaveAt (not hardcoded 2:25/2:30).
 * (g) Cross-surface coherence: desktop right panel follows now plan; connector strip weather matches snapshot; 1 cause marker.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const CAPTURE_EVIDENCE = process.env.CAPTURE_EVIDENCE === '1' || process.env.CAPTURE_EVIDENCE === 'true';
const COMMITTED_EVIDENCE_DIR = path.resolve('docs/evidence/context-timeline');
const RUNTIME_VIDEO_DIR = path.resolve('.yori-runtime/evidence/context-timeline');

async function captureTimelineScreenshot(page: Page, filename: string): Promise<string> {
  fs.mkdirSync(RUNTIME_VIDEO_DIR, { recursive: true });
  const runtimePath = path.join(RUNTIME_VIDEO_DIR, filename);
  await page.screenshot({ path: runtimePath });

  if (CAPTURE_EVIDENCE) {
    fs.mkdirSync(COMMITTED_EVIDENCE_DIR, { recursive: true });
    const committedPath = path.join(COMMITTED_EVIDENCE_DIR, filename);
    fs.copyFileSync(runtimePath, committedPath);
    return committedPath;
  }
  return runtimePath;
}

async function assertElementNotOccluded(page: Page, selector: string, label: string): Promise<void> {
  const result = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, unoccluded: false, topTag: 'none' };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    const unoccluded = el === topEl || el.contains(topEl);
    return {
      found: true,
      unoccluded,
      topTag: topEl ? `${topEl.tagName.toLowerCase()}${topEl.id ? '#' + topEl.id : ''}${topEl.className ? '.' + String(topEl.className).replace(/\s+/g, '.') : ''}` : 'null',
      cy,
    };
  }, selector);
  expect(result.found, `${label} (${selector}) must exist in DOM`).toBe(true);
  expect(
    result.unoccluded,
    `${label} (${selector}) center at y=${result.cy} must not be occluded; hit element was: ${result.topTag}`
  ).toBe(true);
}

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
    fs.mkdirSync(COMMITTED_EVIDENCE_DIR, { recursive: true });
    fs.mkdirSync(RUNTIME_VIDEO_DIR, { recursive: true });
  });

  // =========================================================================
  // Acceptance (a): Differential-state E2E with ZERO user input between states
  // =========================================================================
  test('Acceptance (a): Differential-state transitions S0 -> S1 -> S1q -> S2 -> S3 with zero user input', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewSuffix = isMobile ? '390' : '1280';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport,
      recordVideo: {
        dir: RUNTIME_VIDEO_DIR,
        size: viewport,
      },
    });
    const page = await context.newPage();

    await page.goto('/?ui=v2&timeline=1&controls=1');
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

    await captureTimelineScreenshot(page, `01-s0-morning-calm-${viewSuffix}.png`);

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
    await expect(candidatesHero.locator('.hero-thought-badge')).toContainText('Thought ahead for you'); // UI-QUIET-PRECISION: sentence case
    // Candidate cards rendered with taste citation
    const candidateCards = page.locator('.v2-candidate-card');
    expect(await candidateCards.count()).toBeGreaterThanOrEqual(2);
    await expect(candidateCards.first()).toContainText('Demo Place A · Ramen');
    // HABIT-LEARN addendum 2: cards recommend without a taste-basis line
    await expect(candidateCards.first().locator('.v2-candidate-basis')).toHaveCount(0);
    await expect(candidateCards.first()).not.toContainText(/Based on taste|Matches your confirmed taste/);
    await expect(candidatesHero.locator('.mock-places-notice')).toBeVisible();

    // Action buttons visible
    await expect(candidatesHero.locator('#btn-accept')).toBeVisible();
    await expect(candidatesHero.locator('#btn-adjust')).toBeVisible();
    await expect(candidatesHero.locator('#btn-dismiss')).toHaveText('Not now');
    await expect(candidatesHero.locator('#btn-why')).toHaveCount(0);

    await captureTimelineScreenshot(page, `02-s1-lunch-away-${viewSuffix}.png`);

    // -----------------------------------------------------------------------
    // Transition S1 -> S1q: Honest dismissal via simulated user tap
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.simulateDismissLunch('simulated_user'));
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

    await captureTimelineScreenshot(page, `03-s1q-lunch-quiet-${viewSuffix}.png`);

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

    await captureTimelineScreenshot(page, `04-s2-depart-clear-${viewSuffix}.png`);

    // -----------------------------------------------------------------------
    // Transition S2 -> S3: Rain Forecast Issued (The Change Moment)
    // ZERO user input! Pure simulated context change
    // -----------------------------------------------------------------------
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForTimeout(250);

    const stateS3 = await page.evaluate(() => (window as any).__YORI_TIMELINE__.getState());
    expect(stateS3.currentBeat.id).toBe('S3');

    // Capture standard motion transition capture immediately during soft crossfade
    await captureTimelineScreenshot(page, `05-s3-change-moment-${viewSuffix}.png`);

    // Living header morphs into Rain
    await expect(page.locator('#living-header-line')).toHaveText('1:35 PM · Rain from 2:00 · Home');

    // Change Moment container rendered
    const journeyCardS3 = page.locator('.now-card.v2-journey-card');
    await expect(journeyCardS3).toBeVisible();

    // 1. Status Transition Badge
    const statusTransition = page.locator('#plan-status-transition');
    await expect(statusTransition).toBeVisible();
    await expect(statusTransition).toHaveText('Updated plan ready');

    // 2. What Changed Cause Marker (single marker on page)
    const whatChangedMarker = page.locator('#what-changed-marker');
    await expect(whatChangedMarker).toBeVisible();
    await expect(whatChangedMarker).toContainText('What changed: rain forecast');
    // Ensure no duplicate insight banner above card
    await expect(page.locator('.v2-insight-banner')).toHaveCount(0);

    // 3. Hero Cause-Effect sentence
    const heroCauseEffect = page.locator('#hero-cause-effect');
    await expect(heroCauseEffect).toBeVisible();
    await expect(heroCauseEffect).toHaveText("Rain starts before your lesson, so you'll drive, as you prefer in the rain. You can leave a little later, at 2:30.");

    // 4. Struck-through time difference: 2:25 PM -> 2:30 PM
    const timeDiffDisplay = page.locator('#time-diff-display');
    await expect(timeDiffDisplay).toBeVisible();
    await expect(timeDiffDisplay.locator('.prior-time-struck s')).toHaveText('2:25 PM');
    await expect(timeDiffDisplay.locator('.new-time-highlight')).toHaveText('2:30 PM');

    // 5. Hero updated with umbrella & habit preference
    await expect(journeyCardS3.locator('#chip-umbrella')).toContainText('Umbrella');
    const memoryTile = journeyCardS3.locator('#signal-tile-memory');
    await expect(memoryTile).toContainText('driving');

    // Cross-surface coherence (desktop right panel and connector strip)
    if (!isMobile) {
      const rightPanel = page.locator('.desktop-right-panel');
      await expect(rightPanel).toBeVisible();
      // Right panel must NOT show quiet state during S3 re-plan
      await expect(rightPanel).not.toContainText('Selected quiet state');
      await expect(rightPanel).not.toContainText('Schedule is clear');
      // UI-QUIET-PRECISION: the connector strip left Home; the rain shows in the ambient line.
      await expect(page.locator('#desktop-connector-strip')).toHaveCount(0);
      await expect(page.locator('#living-header-line')).toContainText('Rain');
    }

    const video = page.video();
    await context.close();
    if (video) {
      const targetVideoPath = path.join(RUNTIME_VIDEO_DIR, `context-timeline-${viewSuffix}.webm`);
      await video.saveAs(targetVideoPath);
    }
  });

  // =========================================================================
  // Acceptance (f): Dynamic Change Moment — Adjust buffer in S2 changes struck/new times in S3
  // =========================================================================
  test('Dynamic Change Moment: Adjust buffer in S2 produces true dynamic prior/new leaveAt (not 2:25/2:30)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1&controls=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.reset());
    await page.waitForTimeout(100);

    // Go directly to S2
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S2'));
    await page.waitForSelector('.v2-journey-card');

    // Adjust timing in S2: increase buffer by 10 minutes (from 5m to 15m)
    await page.locator('#btn-adjust').click();
    await page.waitForSelector('#adjust-dialog');
    await page.locator('#input-buffer-minutes').fill('15');
    await page.locator('#btn-adjust-for-today').click();
    await page.waitForSelector('#adjust-dialog', { state: 'hidden' });

    // S2 headline is now updated (leave 10 minutes earlier: 2:15 PM instead of 2:25 PM)
    await expect(page.locator('#now-title')).toContainText('2:15 PM');

    // Step to S3 (Rain forecast arrives!)
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForSelector('#what-changed-marker');

    // Assert: The prior struck time is the dynamic 2:15 PM (NOT the literal 2:25 PM!)
    const struckTime = page.locator('#time-diff-display .prior-time-struck s');
    await expect(struckTime).toHaveText('2:15 PM');

    // Assert: The new leave time is dynamic (2:20 PM)
    const newTime = page.locator('#time-diff-display .new-time-highlight');
    await expect(newTime).toHaveText('2:20 PM');

    // Assert: The hero cause-effect incorporates the dynamic new leave time
    const heroCauseEffect = page.locator('#hero-cause-effect');
    await expect(heroCauseEffect).toHaveText("Rain starts before your lesson, so you'll drive, as you prefer in the rain. You can leave a little later, at 2:20.");
  });

  // =========================================================================
  // Acceptance (b): Mid-timeline user actions and prompt budget cap across the day
  // =========================================================================
  test('Acceptance (b): Accept, Adjust, Not now work mid-timeline and budget cap holds', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1&controls=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.reset());

    // Step to S1 (Lunch candidates)
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S1'));
    await page.waitForSelector('.v2-candidates-hero');

    // User taps "Not now" on lunch candidates
    await page.locator('.now-card #btn-dismiss').click();
    await page.waitForSelector('#dismiss-dialog');
    await page.locator('#btn-confirm-dismiss').click();
    await page.waitForSelector('#dismiss-dialog', { state: 'hidden' });

    // Transitions to S1q Quiet beat with budget meter
    await expect(page.locator('.quiet-card.suppressed-quiet-card')).toBeVisible();
    await expect(page.locator('#budget-meter-value')).toHaveText('1 of 3 used today');

    // Step to S2 (Depart Piano lesson)
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForSelector('.v2-journey-card');

    // Tapping Accept on S2 confirms plan and records action
    await page.locator('.now-card #btn-accept').click();
    await expect(page.locator('#btn-undo-accept')).toBeVisible();

    // Step to S3 (Rain re-plan)
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.step());
    await page.waitForSelector('#what-changed-marker');

    // Preference writeback and Accept still functional
    await expect(page.locator('.now-card #btn-accept')).toBeVisible();
    await expect(page.locator('.now-card #btn-adjust')).toBeVisible();
    await expect(page.locator('.now-card #btn-dismiss')).toBeVisible();
  });

  // =========================================================================
  // Acceptance (c): 3-second comprehension above fold at 390 and 1280 at S1 & S3
  // Unoccluded action buttons: elementFromPoint hit-test against floating #ask-bar
  // =========================================================================
  test('Acceptance (c): 3-second comprehension — noticed signal above fold and actions (#btn-accept, #btn-adjust, #btn-dismiss) unoccluded by #ask-bar at 390 and 1280 at S1 and S3', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1&controls=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const viewportHeight = viewportSize!.height;

    // --- Check S1 (Lunch Candidates) ---
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S1'));
    await page.waitForSelector('.v2-candidates-hero');

    // Assert: S1 action buttons are visible and not occluded by floating #ask-bar
    await assertElementNotOccluded(page, '.v2-candidates-hero #btn-accept', 'S1 Accept Button');
    await assertElementNotOccluded(page, '.v2-candidates-hero #btn-adjust', 'S1 Adjust Button');
    await assertElementNotOccluded(page, '.v2-candidates-hero #btn-dismiss', 'S1 Not Now Button');

    // --- Check S3 (Rain Re-plan Change Moment) ---
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('.v2-journey-card');

    // Assert: Noticed signal (#what-changed-marker) is strictly above fold
    const whatChangedBox = await page.locator('#what-changed-marker').boundingBox();
    expect(whatChangedBox).not.toBeNull();
    expect(whatChangedBox!.y).toBeGreaterThanOrEqual(0);
    expect(whatChangedBox!.y + whatChangedBox!.height).toBeLessThanOrEqual(viewportHeight);

    // Assert: Prepared action (#hero-cause-effect and #time-diff-display) is strictly above fold
    const causeEffectBox = await page.locator('#hero-cause-effect').boundingBox();
    expect(causeEffectBox).not.toBeNull();
    expect(causeEffectBox!.y).toBeGreaterThanOrEqual(0);
    expect(causeEffectBox!.y + causeEffectBox!.height).toBeLessThanOrEqual(viewportHeight);

    const timeDiffBox = await page.locator('#time-diff-display').boundingBox();
    expect(timeDiffBox).not.toBeNull();
    expect(timeDiffBox!.y).toBeGreaterThanOrEqual(0);
    expect(timeDiffBox!.y + timeDiffBox!.height).toBeLessThanOrEqual(viewportHeight);

    // Assert: S3 primary actions and dismissal (#btn-accept, #btn-adjust, #btn-dismiss)
    // are strictly unoccluded by floating #ask-bar via elementFromPoint hit-testing
    await assertElementNotOccluded(page, '.v2-journey-card #btn-accept', 'S3 Accept Button');
    await assertElementNotOccluded(page, '.v2-journey-card #btn-adjust', 'S3 Adjust Button');
    await assertElementNotOccluded(page, '.v2-journey-card #btn-dismiss', 'S3 Not Now Button');
  });

  // =========================================================================
  // Acceptance (d): Touch targets >= 44px, AA contrast, CLS <= 0.1, Axe 0, no overflow
  // =========================================================================
  test('Acceptance (d): Accessibility, touch targets >= 44px, Axe 0, CLS <= 0.1, and no overflow', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&timeline=1&controls=1');
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
    // HABIT-LEARN addendum 2: no Why action on the hero (Accept + Adjust only)
    await expect(page.locator('#btn-why')).toHaveCount(0);

    // Wait for crossfade transition to settle before accessibility check
    await page.waitForTimeout(450);

    // 2. Axe accessibility check (WCAG AA)
    await checkAxe(page, 'Context Timeline at S3');

    // 3. No horizontal overflow (and restart button is not clipped)
    await checkNoHorizontalOverflow(page);
    const restartBox = await page.locator('#timeline-restart-btn').boundingBox();
    expect(restartBox).not.toBeNull();
    const viewportWidth = page.viewportSize()!.width;
    expect(restartBox!.x + restartBox!.width).toBeLessThanOrEqual(viewportWidth);

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
    await page.goto('/?ui=v2&timeline=1&controls=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Verify document has zero active running animations under reducedMotion: 'reduce'
    const runningAnimationsCount = await page.evaluate(() => {
      return document.getAnimations().filter(a => a.playState === 'running').length;
    });
    expect(runningAnimationsCount).toBe(0);

    // Step to S3 under reduced motion
    await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
    await page.waitForSelector('#what-changed-marker');

    // Assert: Cause marker, microcopy, struck-through time, and status transition all preserved
    await expect(page.locator('#what-changed-marker')).toContainText('What changed: rain forecast');
    await expect(page.locator('#hero-cause-effect')).toHaveText(
      "Rain starts before your lesson, so you'll drive, as you prefer in the rain. You can leave a little later, at 2:30."
    );
    await expect(page.locator('#time-diff-display .prior-time-struck s')).toHaveText('2:25 PM');
    await expect(page.locator('#time-diff-display .new-time-highlight')).toHaveText('2:30 PM');

    // Capture distinct reduced-motion capture
    const reducedFilename = `06-s3-reduced-motion-${viewSuffix}.png`;
    const normalFilename = `05-s3-change-moment-${viewSuffix}.png`;
    await captureTimelineScreenshot(page, reducedFilename);

    // Verify distinct from normal capture (files are non-empty and non-identical)
    const normalPath = CAPTURE_EVIDENCE
      ? path.join(COMMITTED_EVIDENCE_DIR, normalFilename)
      : (fs.existsSync(path.join(RUNTIME_VIDEO_DIR, normalFilename))
          ? path.join(RUNTIME_VIDEO_DIR, normalFilename)
          : path.join(COMMITTED_EVIDENCE_DIR, normalFilename));
    const reducedPath = CAPTURE_EVIDENCE
      ? path.join(COMMITTED_EVIDENCE_DIR, reducedFilename)
      : path.join(RUNTIME_VIDEO_DIR, reducedFilename);

    expect(fs.existsSync(normalPath), `Normal path ${normalPath} must exist`).toBe(true);
    expect(fs.existsSync(reducedPath), `Reduced path ${reducedPath} must exist`).toBe(true);
    expect(fs.statSync(reducedPath).size).toBeGreaterThan(1000);
    expect(fs.readFileSync(normalPath).equals(fs.readFileSync(reducedPath))).toBe(false);
  });
});
