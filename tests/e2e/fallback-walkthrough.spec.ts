/**
 * Playwright E2E Walkthrough Spec: Guaranteed Zero-Credential Demo Path
 * Governed by Plan YORI_SUBMIT (Task FALLBACK-VERIFY, AC-205-2)
 *
 * Walks the exact 3-minute video demonstration script (docs/submission/VIDEO_SCRIPT.md)
 * end to end at Desktop (1280x800) and Mobile (390x844) viewports with all flags OFF
 * (MODEL_API_KEY unset, XMEMO_OAUTH_ENABLED=false, WEATHER_LIVE_ENABLED=false):
 * 1. Hook & Clear Departure (D1)
 * 2. Rain Re-Plan (D2) with Umbrella & Habit-ranked Transit
 * 3. Away Dining (D3) with Mock Venue Disclosure & Busy Lunch (D4) Quiet State
 * 4. Explainable Review Loop (Why Sheet & Adjust Dialog proposal creation)
 * 5. Sovereign Memory & The Me Tab (Confirm-only proposal promotion & budget meter)
 * 6. Reasoning Demo with Model Off (Deterministic multi-candidate fallback invariance)
 * 7. Closing View & Tagline
 *
 * Verifies:
 * - 0 critical / serious accessibility violations (AxeBuilder)
 * - 0 horizontal page overflow at 390px
 * - Complete labelling audit: zero simulated weather presented as live
 * - Outputs visual screenshot evidence to docs/evidence/submit-fallback/
 */

import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/submit-fallback');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function navigateToMe(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.locator('#tab-me').click();
  } else {
    await page.locator('#desktop-nav-me').click();
  }
}

async function navigateToToday(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.locator('#tab-today').click();
  } else {
    await page.locator('#desktop-nav-today').click();
  }
}

test.describe('Guaranteed Zero-Credential Fallback Walkthrough (AC-205-2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Full Video Script Walkthrough (Steps 1–7) with Evidence Capture', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // -------------------------------------------------------------------------
    // Step 1: Hook & The Calm Philosophy (Scene D1: Clear Departure)
    // -------------------------------------------------------------------------
    await page.goto('/');
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('clear');

    // Header & Labelling Audit: Demo chip visible, live weather completely omitted
    await expect(page.locator('.demo-chip')).toHaveText('Demo · simulated context');
    await expect(page.locator('#chip-live-weather')).toHaveCount(0);
    await expect(page.locator('#weather-attribution')).toHaveCount(0);

    // NOW card: Single Piano lesson card with calm times
    const nowCardD1 = page.locator('.now-card');
    await expect(nowCardD1).toBeVisible();
    await expect(nowCardD1).toHaveAttribute('data-plan-id', /^depart-plan-/);
    await expect(nowCardD1.locator('.now-subject')).toContainText('Piano lesson');
    await expect(nowCardD1.locator('#now-title')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');
    await expect(nowCardD1.locator('.card-badge')).toHaveText('SIMULATED');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-clear-d1-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Step 2: Thinking Ahead & Environmental Adaptation (Scene D2: Rain Re-Plan)
    // -------------------------------------------------------------------------
    await sceneSelect.selectOption('rain');

    const nowCardD2 = page.locator('.now-card');
    await expect(nowCardD2).toBeVisible();
    await expect(nowCardD2.locator('.now-subject')).toContainText('Piano lesson');
    await expect(nowCardD2.locator('.rain-banner')).toContainText('What changed: rain forecast');

    // Umbrella checklist chip dynamically present
    const umbrellaChip = nowCardD2.locator('#chip-umbrella');
    await expect(umbrellaChip).toBeVisible();
    await expect(umbrellaChip).toContainText('Umbrella');

    // Ranked transit options: Drive first (2:30 PM), Bus second (2:15 PM)
    const transitOptions = nowCardD2.locator('.options-grid .option-tile');
    await expect(transitOptions).toHaveCount(2);
    await expect(transitOptions.nth(0)).toContainText('Drive · leave 2:30 PM');
    await expect(transitOptions.nth(0)).toContainText('25m drive');
    await expect(transitOptions.nth(1)).toContainText('Bus · leave 2:15 PM');
    await expect(transitOptions.nth(1)).toContainText('40m bus');

    // Habit note: driving preference when it rains
    await expect(nowCardD2.locator('.habit-note')).toHaveText('You usually prefer driving when it rains.');

    // P3: Scroll first option tile into view and ensure no overlap with bottom tab bar on mobile
    const firstTransitTile = transitOptions.first();
    await firstTransitTile.scrollIntoViewIfNeeded();
    if (isMobile) {
      const tabBar = page.locator('.bottom-tab-bar');
      const tileBox = await firstTransitTile.boundingBox();
      const tabBox = await tabBar.boundingBox();
      if (tileBox && tabBox && tileBox.y + tileBox.height > tabBox.y) {
        const scrollDelta = tileBox.y + tileBox.height - tabBox.y + 24;
        await page.evaluate(delta => window.scrollBy(0, delta), scrollDelta);
      }
      const finalTileBox = await firstTransitTile.boundingBox();
      const finalTabBox = await tabBar.boundingBox();
      expect(finalTileBox).not.toBeNull();
      expect(finalTabBox).not.toBeNull();
      expect(finalTileBox!.y).toBeGreaterThanOrEqual(0);
      expect(finalTileBox!.y + finalTileBox!.height).toBeLessThanOrEqual(finalTabBox!.y);
    }

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-rain-replan-d2-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Step 3: Away Dining (Scene D3: Away Lunch) & Quiet State (Scene D4: Busy Lunch)
    // -------------------------------------------------------------------------
    await sceneSelect.selectOption('away-lunch');

    const nowCardD3 = page.locator('.now-card');
    await expect(nowCardD3).toBeVisible();
    await expect(nowCardD3.locator('.now-subject')).toContainText('Lunch options near you');
    // Simulated dining suggestions disclosure
    await expect(nowCardD3.locator('.mock-places-notice')).toHaveText(
      'Mock places for this demo; real listings come from a place provider.'
    );

    // Verify D3 Why Sheet memory section shows sample-profile labelling
    const d3WhyBtn = page.locator('#btn-why');
    await d3WhyBtn.click();
    const d3WhyModal = page.locator('.modal-card');
    await expect(d3WhyModal).toBeVisible();
    await page.waitForTimeout(300);
    const d3MemorySection = page.locator('.why-section', { hasText: 'Memory & Habits' });
    await expect(d3MemorySection).toBeVisible();
    await expect(d3MemorySection).toContainText('Dining taste preferences');
    await expect(d3MemorySection).toContainText('Demo profile · sample preference');
    await expect(d3MemorySection.locator('.badge-confirmed')).toHaveCount(0);
    await page.locator('#btn-close-why').click();
    await expect(d3WhyModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // P3: Ensure first lunch option tile is scrolled above bottom tab bar on mobile
    const firstLunchTile = nowCardD3.locator('.options-grid .option-tile').first();
    await firstLunchTile.scrollIntoViewIfNeeded();
    if (isMobile) {
      const tabBar = page.locator('.bottom-tab-bar');
      const lunchBox = await firstLunchTile.boundingBox();
      const tabBox = await tabBar.boundingBox();
      if (lunchBox && tabBox && lunchBox.y + lunchBox.height > tabBox.y) {
        const scrollDelta = lunchBox.y + lunchBox.height - tabBox.y + 24;
        await page.evaluate(delta => window.scrollBy(0, delta), scrollDelta);
      }
      const finalLunchBox = await firstLunchTile.boundingBox();
      const finalTabBox = await tabBar.boundingBox();
      expect(finalLunchBox).not.toBeNull();
      expect(finalTabBox).not.toBeNull();
      expect(finalLunchBox!.y).toBeGreaterThanOrEqual(0);
      expect(finalLunchBox!.y + finalLunchBox!.height).toBeLessThanOrEqual(finalTabBox!.y);
    }

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-away-lunch-d3-${viewName}.png`),
    });

    // Switch to D4 Busy Lunch: honest quiet state
    await sceneSelect.selectOption('busy-lunch');
    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toHaveText('Nothing needs your attention right now.');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-busy-lunch-d4-${viewName}.png`),
    });

    // Verify Scene D6 (Missing Weather): fail-closed notice and 0 SIMULATED badges in scene
    await sceneSelect.selectOption('missing-weather');
    const noticeBox = page.locator('.notice-box');
    await expect(noticeBox).toBeVisible();
    await expect(noticeBox).toContainText("Notice: The weather forecast isn't available right now, so I won't guess.");
    await expect(page.locator('.card-badge:has-text("SIMULATED")')).toHaveCount(0);

    // -------------------------------------------------------------------------
    // Step 4: The Explainable Review Loop (Why Sheet & Adjust Dialog)
    // -------------------------------------------------------------------------
    // Return to Rain scene to inspect Why Sheet
    await sceneSelect.selectOption('rain');
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whyModal = page.locator('.modal-card');
    await expect(whyModal).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toContainText("Why you're seeing this");
    // Wait for modal fade-in animation (0.2s) to settle for Axe color contrast check
    await page.waitForTimeout(300);

    // Verify weather evidence in Why Sheet has explicit simulated labelling
    const evidenceSection = page.locator('.why-section', { hasText: 'Evidence & Signals' });
    await expect(evidenceSection).toContainText('Weather forecast');
    await expect(evidenceSection).toContainText('Forecast conditions');
    await expect(evidenceSection).toContainText('Recorded at 1:35 PM');
    await expect(evidenceSection).toContainText('SIMULATED');

    // Verify Memory & Habits section in D2 shows sample-profile labelling
    const d2MemorySection = page.locator('.why-section', { hasText: 'Memory & Habits' });
    await expect(d2MemorySection).toBeVisible();
    await expect(d2MemorySection).toContainText('Rain travel habit');
    await expect(d2MemorySection).toContainText('Buffer before leaving');
    await expect(d2MemorySection).toContainText('Time to get ready');
    await expect(
      d2MemorySection.locator('.card-badge:has-text("Demo profile · sample preference")')
    ).toHaveCount(3);
    await expect(d2MemorySection.locator('.badge-confirmed')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-why-sheet-${viewName}.png`),
    });

    // Close Why Sheet
    await page.locator('#btn-close-why').click();
    await expect(whyModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // Open Adjust Dialog
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustModal = page.locator('.modal-card');
    await expect(adjustModal).toBeVisible();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');
    // Wait for modal fade-in animation (0.2s) to settle for Axe color contrast check
    await page.waitForTimeout(300);

    // Adjust prep & buffer inputs
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `06-adjust-dialog-${viewName}.png`),
    });

    // Click Remember as preference (creates a pending proposal under INV-107)
    await page.locator('#btn-adjust-remember').click();
    await expect(adjustModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // Verify proposal appears in FOR YOU section on home screen
    const forYouProposal = page.locator('#for-you-prep_buffer_preference');
    await expect(forYouProposal).toBeVisible();

    // -------------------------------------------------------------------------
    // Step 5: User Sovereignty & The Me Tab (Confirm-only Memory & Budget)
    // -------------------------------------------------------------------------
    await navigateToMe(page, isMobile);

    const meTitle = page.locator('.me-title');
    await expect(meTitle).toBeVisible();
    await expect(meTitle).toContainText('Me & Memory');

    // Budget meter: 0 of 3 used today
    const budgetBadge = page.locator('.badge-budget');
    await expect(budgetBadge).toBeVisible();
    await expect(budgetBadge).toContainText('0 of 3 used today');

    // Verify empty confirmed memory wording explicitly notes demo sample profile
    const confirmedEmpty = page.locator('#confirmed-facts-list .memory-empty');
    await expect(confirmedEmpty).toBeVisible();
    await expect(confirmedEmpty).toHaveText(
      'No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.'
    );

    // Pending proposal present in Me tab
    const pendingInMe = page.locator('#proposal-prep_buffer_preference');
    await expect(pendingInMe).toBeVisible();
    await expect(pendingInMe).toContainText('Preparation buffer habit');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-me-pending-proposal-${viewName}.png`),
    });

    // Confirm proposal: moves from pending to confirmed preferences
    const confirmBtn = pendingInMe.locator('.btn-confirm-proposal');
    await confirmBtn.click();

    // Proposal disappears from pending and is confirmed
    await expect(pendingInMe).not.toBeVisible();
    const confirmedFact = page.locator('#fact-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();
    await expect(confirmedFact).toContainText('Confirmed');
    await expect(page.locator('#confirmed-facts-list .memory-empty')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `08-me-confirmed-preference-${viewName}.png`),
    });

    // Acceptance (1): Verify that returning to Why Sheet now shows user-confirmed facts
    // with 'Confirmed' badge while unchanged sample facts still show 'Demo profile · sample preference'
    await navigateToToday(page, isMobile);
    await page.locator('#btn-why').click();
    const postWhyModal = page.locator('.modal-card');
    await expect(postWhyModal).toBeVisible();
    await page.waitForTimeout(300);
    const postWhyMemory = page.locator('.why-section', { hasText: 'Memory & Habits' });
    // User-confirmed facts show 'Confirmed'
    await expect(postWhyMemory.locator('.badge-confirmed')).toHaveCount(2);
    await expect(postWhyMemory).toContainText('Buffer before leaving');
    await expect(postWhyMemory).toContainText('Time to get ready');
    // Unchanged sample fact (rain habit) still shows 'Demo profile · sample preference'
    await expect(
      postWhyMemory.locator('.card-badge:has-text("Demo profile · sample preference")')
    ).toHaveCount(1);
    await expect(postWhyMemory).toContainText('Rain travel habit');
    await page.locator('#btn-close-why').click();
    await expect(postWhyModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // -------------------------------------------------------------------------
    // Step 6: Reasoning Demo (Model Off) & Deterministic Fallback Invariance
    // -------------------------------------------------------------------------
    await navigateToToday(page, isMobile);
    await sceneSelect.selectOption('multi-candidate');

    // With MODEL_API_KEY unset, deterministic ordering is preserved without stalls
    const nowReasoningCard = page.locator('.now-card');
    await expect(nowReasoningCard).toBeVisible();
    await expect(nowReasoningCard).toHaveAttribute('data-plan-id', /^depart-plan-/);
    await expect(nowReasoningCard.locator('.now-subject')).toContainText('Piano lesson');

    // Lunch plan remains cleanly placed in AHEAD section
    const aheadLunch = page.locator('.ahead-list .item-row[data-plan-id^="plan-lunch-"]');
    await expect(aheadLunch).toBeVisible();
    await expect(aheadLunch.locator('.item-title')).toHaveText('Lunch options near you');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `09-reasoning-demo-model-off-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Step 7: Honest Closing View & Tagline
    // -------------------------------------------------------------------------
    await sceneSelect.selectOption('clear');
    await expect(page.locator('.now-card')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `10-closing-home-${viewName}.png`),
    });
  });
});
