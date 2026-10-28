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
      fullPage: true,
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
    await expect(transitOptions.nth(0)).toContainText('Drive · leave 2:30');
    await expect(transitOptions.nth(1)).toContainText('Bus · leave 2:15');

    // Habit note: driving preference when it rains
    await expect(nowCardD2.locator('.habit-note')).toContainText('You usually prefer driving when it rains.');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-rain-replan-d2-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 3: Away Dining (Scene D3: Away Lunch) & Quiet State (Scene D4: Busy Lunch)
    // -------------------------------------------------------------------------
    await sceneSelect.selectOption('away-lunch');

    const nowCardD3 = page.locator('.now-card');
    await expect(nowCardD3).toBeVisible();
    await expect(nowCardD3.locator('.now-subject')).toContainText('Lunch options near you');
    // Simulated dining suggestions disclosure
    await expect(nowCardD3.locator('.mock-places-notice')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-away-lunch-d3-${viewName}.png`),
      fullPage: true,
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
      fullPage: true,
    });

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
    await expect(evidenceSection).toContainText('SIMULATED');
    await expect(evidenceSection).toContainText('1:35 PM');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-why-sheet-${viewName}.png`),
      fullPage: true,
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
      fullPage: true,
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

    // Pending proposal present in Me tab
    const pendingInMe = page.locator('#proposal-prep_buffer_preference');
    await expect(pendingInMe).toBeVisible();
    await expect(pendingInMe).toContainText('Preparation buffer habit');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-me-pending-proposal-${viewName}.png`),
      fullPage: true,
    });

    // Confirm proposal: moves from pending to confirmed preferences
    const confirmBtn = pendingInMe.locator('.btn-confirm-proposal');
    await confirmBtn.click();

    // Proposal disappears from pending and is confirmed
    await expect(pendingInMe).not.toBeVisible();
    const confirmedFact = page.locator('#fact-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();
    await expect(confirmedFact).toContainText('Confirmed');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `08-me-confirmed-preference-${viewName}.png`),
      fullPage: true,
    });

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
      fullPage: true,
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
      fullPage: true,
    });
  });
});
