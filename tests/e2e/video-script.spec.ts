/**
 * Playwright E2E Spec: Executable 3-Minute Video Demonstration Walkthrough
 * Governed by Task: VIDEO-SCRIPT-SYNC (INBOX-20261030-4021C3)
 * Document Reference: docs/submission/VIDEO_SCRIPT.md
 *
 * Verifies that the exact 7 core segments of the video script execute in order
 * on a fresh storage state across both Desktop (1280x800) and Mobile (390x844) viewports:
 * 1. Hook & The Calm Philosophy (Scene D1: Clear Departure) [25s budget]
 * 2. Thinking Ahead & Environmental Adaptation (Scene D2: Rain Re-Plan) [25s budget]
 * 3. Away Dining & Honest Quiet State (Scene D3: Away Lunch & D4: Busy Lunch) [25s budget]
 * 4. Yori Learns You (Nearby Now & Adjust Dialog) [30s budget]
 * 5. User Sovereignty & The Me Tab (For You Proposal, Me Confirmation & Recomputed Timing) [33s budget]
 * 6. Conversational Shell & Reasoning Demo (Ask Yori & Multi-Candidate Ordering) [28s budget]
 * 7. Honest Disclosure & Closing (Scene D1: Clean Return) [14s budget]
 * Total Core Base Duration: exactly 180s (3m 00s).
 *
 * Optional Appendix:
 * - V5 Extension: Dynamic Fuel & Manual Geolocation [20s max extension]
 *
 * Requirements:
 * - Asserts every quoted on-screen backticked string in the script verbatim.
 * - Measures and reports elapsed time budget per segment (informational).
 * - Routes screenshots to test-results/evidence/video by default (or docs/evidence/video if UPDATE_EVIDENCE=1).
 * - Zero live model calls; 100% deterministic offline fallback.
 */

import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { openDemoPanel, closeDemoPanel, selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('video');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

/**
 * Fixture list of verbatim quoted strings from docs/submission/VIDEO_SCRIPT.md.
 * Kept strictly synchronized with the script and assertion map.
 */
export const VIDEO_SCRIPT_FIXTURES = {
  segment1: {
    title: '1. Hook & The Calm Philosophy',
    budgetSeconds: 25,
    quotedStrings: [
      'Demo · simulated context',
      'V2 Preview',
      'Piano lesson at 3:00 PM',
      'Get ready at 2:05 PM, leave by 2:25 PM',
      'SIMULATED',
      'Spatial Context Map', // desktop heading
      'Route Map', // mobile heading
      'Ask Yori anything…', // placeholder (UI-QUIET-PRECISION copy, reference 04)
      'Tap to chat',
    ],
  },
  segment2: {
    title: '2. Thinking Ahead & Environmental Adaptation',
    budgetSeconds: 25,
    quotedStrings: [
      'What changed: rain forecast',
      'Umbrella',
      'Rain forecast · simulated',
      'Issued 1:35 PM',
      'Drive · leave 2:30 PM',
      'Recommended',
      '25 min drive + 5m margin',
      'Ranked by habit: Rain travel habit (Demo profile · sample)',
      'Bus · leave 2:15 PM',
      'Alternative',
      '40 min bus + 5m margin',
    ],
  },
  segment3: {
    title: '3. Away Dining & Honest Quiet State',
    budgetSeconds: 25,
    quotedStrings: [
      'Lunch options near you',
      'Places matching what you like, within walking distance',
      'Details →',
      'Demo Place A · Ramen',
      'Demo Place B · Salad',
      'Demo Place C · Sushi',
      'Mock places for this demo; real listings come from a place provider.',
      'Nothing needs your attention right now.',
      "You're all caught up. We'll let you know when something comes up.",
    ],
  },
  segment4: {
    title: '4. Yori Learns You',
    budgetSeconds: 30,
    quotedStrings: [
      'Adjust Departure Timing',
      'For this time only',
      'Remember as preference',
      'Get ready 25 min · Leave a 10 min buffer',
    ],
  },
  segment5: {
    title: '5. User Sovereignty & The Me Tab',
    budgetSeconds: 33,
    quotedStrings: [
      'What Yori has learned',
      'Me & Memory',
      '0 of 3 used today',
      'Reset Storage',
      'Preparation buffer habit',
      'You told Yori',
      'Get ready at 2:00 PM, leave by 2:25 PM',
    ],
  },
  segment6: {
    title: '6. Conversational Shell & Reasoning Demo',
    budgetSeconds: 28,
    quotedStrings: [
      'Ask Yori',
      'Offline demo · simulated',
      'Offline fallback · deterministic',
      'Can I leave later?',
      'Scripted model fixture · not a live model call',
    ],
  },
  segment7: {
    title: '7. Honest Disclosure & Closing',
    budgetSeconds: 14,
    quotedStrings: [],
  },
  optionalV5: {
    title: 'Optional V5 Extension: Dynamic Fuel & Manual Geolocation',
    budgetSeconds: 20,
    quotedStrings: [
      'Fuel (Low Fuel Warning)',
      'Low Fuel Warning',
      'Nearby gas stations from simulated fixture · straight-line distances shown',
      'Metro Gas & Go',
      'Gas Station',
      '(straight-line)',
    ],
  },
};

const clickNav = async (page: Page, tabName: string, isMobile: boolean) => {
  if (isMobile) {
    await page.locator(`#tab-${tabName}`).click();
  } else {
    await page.locator(`#desktop-nav-${tabName}`).click();
  }
};

test.describe('Video Script Verbatim Walkthrough (VIDEO-SCRIPT-SYNC)', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh storage state for every run
    await page.goto('/?ui=v2');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.app-layout');
  });

  test('Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    const timingSummary: { segment: string; elapsedMs: number; budgetSec: number }[] = [];

    // =========================================================================
    // Segment 1: Hook & The Calm Philosophy (0:00 – 0:25 · 25s)
    // =========================================================================
    const seg1Start = Date.now();
    await openDemoPanel(page);
    await page.selectOption('#scene-select', 'clear');
    await page.waitForTimeout(200);

    // Assert verbatim quoted strings
    await expect(page.locator('#scene-select option[value="fuel"]')).toHaveText(
      'Fuel (Low Fuel Warning)'
    );
    await expect(page.locator('.demo-chip')).toHaveText('Demo · simulated context');
    await expect(page.locator('#badge-ui-version')).toHaveText('V2 Preview');
    await closeDemoPanel(page);
    await expect(page.locator('.now-card .now-subject')).toHaveText('Piano lesson at 3:00 PM');
    await expect(page.locator('.now-card #now-title')).toHaveText(
      'Get ready at 2:05 PM, leave by 2:25 PM'
    );
    await expect(page.locator('.now-card .card-badge').first()).toHaveText('SIMULATED');

    if (isMobile) {
      await expect(page.locator('.map-header .v2-heading-mobile')).toHaveText('Route Map');
      await expect(page.locator('#ask-bar .v2-ask-mobile')).toHaveText('Ask Yori anything…'); // UI-QUIET-PRECISION copy (reference 04)
    } else {
      await expect(page.locator('.map-header .v2-heading-desktop')).toHaveText('Spatial Context Map');
      await expect(page.locator('#ask-bar .v2-ask-desktop')).toHaveText('Ask Yori anything…'); // UI-QUIET-PRECISION copy (reference 04)
    }
    await expect(page.locator('#ask-bar .ask-bar-hint')).toHaveText('Tap to chat');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-hook-calm-d1-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment1.title,
      elapsedMs: Date.now() - seg1Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment1.budgetSeconds,
    });

    // =========================================================================
    // Segment 2: Thinking Ahead & Environmental Adaptation (0:25 – 0:50 · 25s)
    // =========================================================================
    const seg2Start = Date.now();
    await selectDemoScene(page, 'rain');
    await page.waitForTimeout(200);

    // Alert banner & Umbrella chip
    await expect(page.locator('.v2-insight-title, .rain-banner, #what-changed-marker').first()).toContainText(
      'What changed: rain forecast'
    );
    await expect(page.locator('#chip-umbrella').first()).toContainText('Umbrella');

    // Route map weather callout in Trip Details where prominent map lives (Finding 1)
    await page.locator('#btn-view-trip-details').click();
    await expect(page.locator('.v2-map-weather-callout').first()).toContainText(
      'Rain forecast · simulated'
    );
    await expect(page.locator('.v2-map-weather-callout').first()).toContainText('Issued 1:35 PM');

    // Ranked transit options in Trip Details
    const optionCards = page.locator('.v2-options-grid .v2-option-card');
    await expect(optionCards).toHaveCount(2);

    const driveCard = optionCards.first();
    await expect(driveCard.locator('.v2-option-label')).toHaveText('Drive · leave 2:30 PM');
    await expect(driveCard.locator('.v2-option-badge')).toHaveText('Recommended');
    await expect(driveCard.locator('.v2-option-meta')).toHaveText('25 min drive + 5m margin');
    await expect(driveCard.locator('.v2-option-basis')).toHaveText(
      'Ranked by habit: Rain travel habit (Demo profile · sample)'
    );

    const busCard = optionCards.nth(1);
    await expect(busCard.locator('.v2-option-label')).toHaveText('Bus · leave 2:15 PM');
    await expect(busCard.locator('.v2-option-badge')).toHaveText('Alternative');
    await expect(busCard.locator('.v2-option-meta')).toHaveText('40 min bus + 5m margin');

    // HABIT-LEARN addendum 2: no habit-note citation in trip detail
    await expect(page.locator('.habit-note')).toHaveCount(0);

    // Return to Home for screenshot
    await page.locator('#trip-detail-back-btn').click();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-rain-replan-d2-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment2.title,
      elapsedMs: Date.now() - seg2Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment2.budgetSeconds,
    });

    // =========================================================================
    // Segment 3: Away Dining & Honest Quiet State (0:50 – 1:15 · 25s)
    // =========================================================================
    const seg3Start = Date.now();
    await selectDemoScene(page, 'away-lunch');
    await page.waitForTimeout(200);

    // Candidates Hero & Details
    await expect(page.locator('.v2-candidates-hero .now-subject')).toHaveText('Lunch options near you');
    await expect(page.locator('.v2-candidates-hero #now-title')).toHaveText(
      'Places matching what you like, within walking distance'
    );
    await expect(page.locator('.v2-view-detail-link').first()).toContainText('Details →');

    // Truthful rendered venue names
    const venueCards = page.locator('.v2-candidate-card');
    await expect(venueCards.nth(0)).toContainText('Demo Place A · Ramen');
    await expect(venueCards.nth(1)).toContainText('Demo Place B · Salad');
    await expect(venueCards.nth(2)).toContainText('Demo Place C · Sushi');

    // Mock places disclosure
    await expect(page.locator('.mock-places-notice')).toContainText(
      'Mock places for this demo; real listings come from a place provider.'
    );

    // No Why sheet or button per owner steering (Addendum 2)
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet')).toHaveCount(0);

    // Switch to D4 Busy Lunch: quiet state
    await selectDemoScene(page, 'busy-lunch');
    await page.waitForTimeout(200);
    await expect(page.locator('.quiet-title')).toHaveText('Nothing needs your attention right now.');
    await expect(page.locator('.quiet-subtitle')).toHaveText(
      "You're all caught up. We'll let you know when something comes up."
    );

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-away-and-quiet-d3-d4-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment3.title,
      elapsedMs: Date.now() - seg3Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment3.budgetSeconds,
    });

    // =========================================================================
    // Segment 4: Yori Learns You (1:15 – 1:45 · 30s)
    // =========================================================================
    const seg4Start = Date.now();
    await selectDemoScene(page, 'rain');
    await page.waitForTimeout(200);

    // No Why action is present per owner steering (Addendum 2)
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet')).toHaveCount(0);

    // Open Adjust dialog and save buffer preference
    await page.locator('#btn-adjust').click();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');
    await expect(page.locator('#btn-adjust-for-today')).toHaveText('For this time only');
    await expect(page.locator('#btn-adjust-remember')).toHaveText('Remember as preference');
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.locator('#btn-adjust-remember').click();
    await expect(page.locator('#adjust-dialog-backdrop')).toHaveCount(0);

    // Remembered straight away (HABIT-LEARN): For You shows the routine; nothing to confirm
    await clickNav(page, 'for-you', isMobile);
    await expect(page.locator('.v2-for-you-view .v2-proposal-title').first()).toContainText(
      'Get ready 25 min · Leave a 10 min buffer'
    );
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-yori-learns-you-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment4.title,
      elapsedMs: Date.now() - seg4Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment4.budgetSeconds,
    });

    // =========================================================================
    // Segment 5: User Sovereignty & The Me Tab (1:45 – 2:18 · 33s)
    // =========================================================================
    const seg5Start = Date.now();
    // Inspect Me tab
    await clickNav(page, 'me', isMobile);
    await expect(page.locator('.me-title')).toHaveText('Me & Memory');
    await expect(page.locator('.badge-budget')).toContainText('0 of 3 used today');
    await expect(page.locator('#me-learned-title')).toHaveText('What Yori has learned');
    await expect(page.locator('#btn-me-reset')).toHaveText('Reset Storage');

    // "Preparation buffer habit" is listed with its basis and a quiet Forget (no confirm step)
    const confirmedRow = page.locator('#habit-prep_buffer_preference');
    await expect(confirmedRow).toBeVisible();
    await expect(confirmedRow.locator('.memory-key')).toHaveText('Preparation buffer habit');
    await expect(confirmedRow).toContainText('You told Yori');
    await expect(confirmedRow.locator('.btn-forget-habit')).toBeVisible();
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    // Return to Home tab: schedule immediately recomputed to 2:00 PM / 2:25 PM
    await clickNav(page, 'home', isMobile);
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('#now-title')).toContainText('Get ready at 2:00 PM, leave by 2:25 PM');

    // No Why action is present per owner steering (Addendum 2)
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet')).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-user-sovereignty-me-tab-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment5.title,
      elapsedMs: Date.now() - seg5Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment5.budgetSeconds,
    });

    // =========================================================================
    // Segment 6: Conversational Shell & Reasoning Demo (2:18 – 2:46 · 28s)
    // =========================================================================
    const seg6Start = Date.now();
    // Open conversational shell
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-title')).toHaveText('Ask Yori');
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText(
      'Offline fallback · deterministic'
    );

    // Send query "Can I leave later?"
    await page.locator('#conversation-input').fill('Can I leave later?');
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('.chat-bubble-user .chat-text')).toHaveText('Can I leave later?');
    await expect(page.locator('#engine-status-chip')).toContainText(
      'Scripted model fixture · not a live model call'
    );

    await page.locator('#conversation-close-btn').click();
    await expect(overlay).toHaveCount(0);

    // Multi-candidate reasoning demo scene
    await selectDemoScene(page, 'multi-candidate');
    await page.waitForTimeout(200);

    // Piano lesson prioritized as NOW
    const nowReasoningCard = page.locator('.now-card');
    await expect(nowReasoningCard).toBeVisible();
    await expect(nowReasoningCard.locator('.now-subject')).toContainText('Piano lesson');

    // Lunch placed in Ahead (Plans tab)
    await clickNav(page, 'plans', isMobile);
    const plansView = page.locator('.v2-plans-view');
    await expect(plansView).toBeVisible();
    const planCards = page.locator('.v2-plans-list .v2-plan-item-card');
    await expect(planCards).toHaveCount(1);
    await expect(planCards.first().locator('.v2-plan-headline')).toContainText(
      'Lunch options near you'
    );

    // Return to Home tab
    await clickNav(page, 'home', isMobile);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `06-conversational-and-reasoning-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment6.title,
      elapsedMs: Date.now() - seg6Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment6.budgetSeconds,
    });

    // =========================================================================
    // Segment 7: Honest Disclosure & Closing (2:46 – 3:00 · 14s)
    // =========================================================================
    const seg7Start = Date.now();
    // Return to clean Home view
    await selectDemoScene(page, 'clear');
    await page.waitForTimeout(200);

    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card .now-subject')).toHaveText('Piano lesson at 3:00 PM');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-honest-closing-${viewName}.png`),
    });
    timingSummary.push({
      segment: VIDEO_SCRIPT_FIXTURES.segment7.title,
      elapsedMs: Date.now() - seg7Start,
      budgetSec: VIDEO_SCRIPT_FIXTURES.segment7.budgetSeconds,
    });

    // =========================================================================
    // Timing Summary Logging (Informational Budget Tracking)
    // =========================================================================
    const totalElapsedMs = timingSummary.reduce((acc, s) => acc + s.elapsedMs, 0);
    const totalBudgetSec = timingSummary.reduce((acc, s) => acc + s.budgetSec, 0);

    console.log('\n======================================================================');
    console.log(`⏱️ VIDEO SCRIPT ELAPSED TIME PER SEGMENT (${viewName.toUpperCase()})`);
    console.log('======================================================================');
    for (const s of timingSummary) {
      console.log(
        `  ${s.segment.padEnd(46)} : ${String(s.elapsedMs).padStart(5)}ms (Budget: ${s.budgetSec}s)`
      );
    }
    console.log('----------------------------------------------------------------------');
    console.log(
      `  Total Scripted Spoken Duration               : ${totalBudgetSec}s (exact 3m 00s)`
    );
    console.log(
      `  Total E2E Interaction Duration               : ${totalElapsedMs}ms`
    );
    console.log('======================================================================\n');

    expect(totalBudgetSec).toBe(180);
  });

  test('Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v2&scene=fuel&test=1');
    await page.waitForTimeout(300);

    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await openDemoPanel(page);
    await expect(page.locator('#scene-select option[value="fuel"]')).toHaveText(
      'Fuel (Low Fuel Warning)'
    );
    await closeDemoPanel(page);
    await expect(nowCard.locator('.now-subject')).toHaveText('Low Fuel Warning');
    await expect(nowCard.locator('.card-badge').first()).toHaveText('SIMULATED');
    await expect(nowCard.locator('.mock-places-notice')).toHaveText(
      'Nearby gas stations from simulated fixture · straight-line distances shown'
    );

    const topCard = page.locator('.v2-candidate-card').first();
    await expect(topCard.locator('.v2-candidate-name')).toHaveText('Metro Gas & Go');
    await expect(topCard.locator('.v2-cuisine-chip')).toHaveText('Gas Station');
    await expect(topCard.locator('.v2-distance-chip')).toContainText('(straight-line)');
    await expect(topCard.locator('.v2-candidate-basis')).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `08-optional-v5-fuel-${viewName}.png`),
    });
  });
});
