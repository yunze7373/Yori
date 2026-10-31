/**
 * NORTH-STAR-AUDIT: Context-Change Runtime Evidence Matrix
 * Governed by TID: INBOX-20261031-765B61 (Steering msg_fcda2f3c / Owner Original-Vision Audit)
 *
 * Captures context-change before/after evidence from the real runtime at '/' (no ?ui):
 * 1. Clear -> Rain (Departure recomputed, insight banner, route map, umbrella checklist) [Driver: SIMULATED]
 * 2. Away lunch dismiss -> For You proposal -> Confirm -> Me confirmed preference [Driver: REAL state engine / SIMULATED initial scene]
 * 3. Adjust timing -> Remember -> Confirmed -> Home timing recomputed [Driver: REAL state engine]
 * 4. Ask Yori open -> Conversational shift query -> Collapse to updated Home [Driver: SIMULATED fixture / REAL client update]
 *
 * Strict Invariants:
 * - Default root URL '/' (Living Context V2 by default).
 * - Dual viewports: mobile (390x844) and desktop (1280x800).
 * - All non-localhost requests blocked and asserted empty (0 external calls).
 * - Axe WCAG 2.1 AA accessibility checks on every captured state.
 * - Zero horizontal overflow.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('north-star-audit');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

async function checkAxe(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function navigateToHome(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.locator('#tab-home').click();
  } else {
    await page.locator('#desktop-nav-home').click();
  }
  await page.waitForTimeout(300);
}

async function navigateToForYou(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.locator('#tab-for-you').click();
  } else {
    await page.locator('#desktop-nav-for-you').click();
  }
  await page.waitForTimeout(300);
}

async function navigateToMe(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.locator('#tab-me').click();
  } else {
    await page.locator('#desktop-nav-me').click();
  }
  await page.waitForTimeout(300);
}

test.describe('NORTH-STAR-AUDIT: Context-Change Runtime Evidence Suite (Default UI)', () => {
  let externalRequests: string[] = [];

  test.beforeEach(async ({ page }) => {
    externalRequests = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (!isLocalhost) {
        externalRequests.push(route.request().url());
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
  });

  test.afterEach(async () => {
    expect(externalRequests).toHaveLength(0);
  });

  test('Context-Change 1: Clear -> Rain Scene Switch (Timing, Insight Banner, Route Map)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('clear');

    // -------------------------------------------------------------------------
    // Capture 01a: Clear Scene Baseline (Home)
    // -------------------------------------------------------------------------
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v2');
    await expect(page.locator('#badge-ui-version')).toContainText('V2 Preview');
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');

    const nowCardClear = page.locator('.now-card');
    await expect(nowCardClear).toBeVisible();
    await expect(nowCardClear.locator('.now-subject')).toContainText('Piano lesson at 3:00 PM');
    await expect(nowCardClear.locator('#now-title')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');
    await expect(page.locator('.v2-insight-banner')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01a-clear-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 01b: Rain Scene Updated Context (Home)
    // -------------------------------------------------------------------------
    await sceneSelect.selectOption('rain');

    const insightBanner = page.locator('.v2-insight-banner');
    await expect(insightBanner).toBeVisible();
    await expect(insightBanner.locator('.v2-insight-title')).toContainText('What changed: rain forecast');

    await expect(page.locator('.v2-map-canvas.prominent')).toBeVisible();

    const nowCardRain = page.locator('.now-card');
    await expect(nowCardRain).toBeVisible();
    await expect(nowCardRain.locator('.now-subject')).toContainText('Piano lesson');
    await expect(nowCardRain.locator('#now-title')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    const clearTiming = 'Get ready at 2:05 PM, leave by 2:25 PM';
    const rainTiming = await nowCardRain.locator('#now-title').innerText();
    expect(rainTiming).toContain('Get ready at 2:10 PM, leave by 2:30 PM');
    expect(rainTiming).not.toEqual(clearTiming);
    await expect(page.locator('.v2-timeline')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01b-rain-home-${viewName}.png`),
      fullPage: true,
    });
  });

  test('Context-Change 2: Away Lunch Dismiss -> For You Proposal -> Confirm -> Me Confirmed', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('away-lunch');

    // -------------------------------------------------------------------------
    // Capture 02a: Away Lunch Home (Candidates Hero)
    // -------------------------------------------------------------------------
    const nowCardLunch = page.locator('.now-card');
    await expect(nowCardLunch).toBeVisible();
    await expect(nowCardLunch.locator('.now-subject')).toContainText('Lunch options near you');
    await expect(nowCardLunch.locator('.mock-places-notice')).toHaveText(
      'Mock places for this demo; real listings come from a place provider.'
    );

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02a-lunch-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 02b: Dismiss with Reason -> For You Tab Proposal
    // -------------------------------------------------------------------------
    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    const dismissModal = page.locator('#dismiss-dialog-backdrop .modal-card');
    await expect(dismissModal).toBeVisible();
    await page.locator('input[value="dont_suggest_today"]').check();
    await page.locator('#btn-confirm-dismiss').click();
    await expect(dismissModal).not.toBeVisible();

    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toHaveText('Nothing needs your attention right now.');

    await navigateToForYou(page, isMobile);
    const lunchProposal = page.locator('.v2-proposal-item-card[data-proposal-key="suppress_lunch_recommendations"]');
    await expect(lunchProposal).toBeVisible();
    await expect(lunchProposal.locator('.v2-proposal-title')).toContainText('Skip lunch suggestions for today?');
    await expect(lunchProposal.locator('.v2-proposal-basis')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02b-lunch-foryou-proposal-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 02c: Proposal Confirmed -> Me Tab Confirmed Preference
    // -------------------------------------------------------------------------
    const confirmProposalBtn = lunchProposal.locator('.btn-confirm-proposal');
    await expect(confirmProposalBtn).toBeVisible();
    await confirmProposalBtn.click();
    await expect(lunchProposal).not.toBeVisible();

    await navigateToMe(page, isMobile);
    const confirmedSuppression = page.locator('#fact-suppress_lunch_recommendations');
    await expect(confirmedSuppression).toBeVisible();
    await expect(confirmedSuppression.locator('.badge-confirmed')).toHaveText('Confirmed');
    await expect(confirmedSuppression).toContainText('Source: you confirmed');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02c-lunch-me-confirmed-${viewName}.png`),
    });
  });

  test('Context-Change 3: Rain Adjust Timing -> Remember Preference -> Confirm -> Home Timing Recomputed', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    // -------------------------------------------------------------------------
    // Capture 03a: Rain Scene Pre-Adjust (Home)
    // -------------------------------------------------------------------------
    const nowCardPreAdjust = page.locator('.now-card');
    await expect(nowCardPreAdjust).toBeVisible();
    await expect(nowCardPreAdjust.locator('#now-title')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    const preAdjustTiming = 'Get ready at 2:10 PM, leave by 2:30 PM';
    await expect(page.locator('.v2-timeline')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03a-rain-home-pre-adjust-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Adjust timing: 25m prep, 10m buffer -> Remember Preference
    // -------------------------------------------------------------------------
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustModal = page.locator('.modal-card');
    await expect(adjustModal).toBeVisible();
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.locator('#btn-adjust-remember').click();
    await expect(adjustModal).not.toBeVisible();

    // -------------------------------------------------------------------------
    // Capture 03b: Confirm Proposal on Me Tab
    // -------------------------------------------------------------------------
    await navigateToMe(page, isMobile);
    const pendingInMe = page.locator('#proposal-prep_buffer_preference');
    await expect(pendingInMe).toBeVisible();
    await expect(pendingInMe).toContainText('Preparation buffer habit');

    const confirmBtn = pendingInMe.locator('.btn-confirm-proposal');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await expect(pendingInMe).not.toBeVisible();

    const confirmedFact = page.locator('#fact-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();
    await expect(confirmedFact.locator('.badge-confirmed')).toHaveText('Confirmed');
    await expect(confirmedFact).toContainText('Source: you confirmed');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03b-adjust-me-confirmed-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 03c: Return to Home -> Timing Recomputed
    // -------------------------------------------------------------------------
    await navigateToHome(page, isMobile);
    const nowCardRecomputed = page.locator('.now-card');
    await expect(nowCardRecomputed).toBeVisible();
    await expect(nowCardRecomputed.locator('#now-title')).toContainText('Get ready at 2:00 PM, leave by 2:25 PM');
    const postAdjustTiming = await nowCardRecomputed.locator('#now-title').innerText();
    expect(postAdjustTiming).toContain('Get ready at 2:00 PM, leave by 2:25 PM');
    expect(postAdjustTiming).not.toEqual(preAdjustTiming);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03c-adjust-home-recomputed-${viewName}.png`),
      fullPage: true,
    });
  });

  test('Context-Change 4: Ask Yori Conversational Shift Command -> Collapse to Updated Home', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    // Pre-command baseline on Home
    const nowCardRain = page.locator('.now-card');
    await expect(nowCardRain).toBeVisible();
    await expect(nowCardRain.locator('#now-title')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    const preCommandTiming = 'Get ready at 2:10 PM, leave by 2:30 PM';

    // -------------------------------------------------------------------------
    // Capture 04a: Open Ask Yori Conversation Overlay
    // -------------------------------------------------------------------------
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-title')).toHaveText('Ask Yori');
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText('Offline fallback · deterministic');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04a-ask-yori-open-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 04b: Send Command "Can I leave later?" -> Scripted Fixture Status
    // -------------------------------------------------------------------------
    await page.locator('#conversation-input').fill('Can I leave later?');
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('.chat-bubble-user .chat-text')).toHaveText('Can I leave later?');
    await expect(page.locator('#engine-status-chip')).toContainText(
      'Scripted model fixture · not a live model call'
    );

    // Verify comparison box appears with options and recommendation badge
    const compBox = page.locator('.chat-comparison-box');
    await expect(compBox).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#conversation-transcript')).toContainText('You can leave up to 5 minutes later');
    await expect(page.locator('.chat-comparison-recommendation')).toContainText('Recommended');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04b-ask-yori-command-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 04c: Select Recommended Option (+5m) -> Auto-Collapse Back to Updated Home
    // -------------------------------------------------------------------------
    const safeOptionBtn = page.locator('.btn-select-comparison[data-delta="5"]');
    await expect(safeOptionBtn).toBeVisible({ timeout: 5000 });
    await safeOptionBtn.click();

    // Auto-collapses back to updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });

    const nowCardUpdated = page.locator('.now-card');
    await expect(nowCardUpdated).toBeVisible();
    await expect(nowCardUpdated.locator('#now-title')).toContainText('2:35 PM');
    const postCommandTiming = await nowCardUpdated.locator('#now-title').innerText();
    expect(postCommandTiming).toContain('2:35 PM');
    expect(postCommandTiming).not.toEqual(preCommandTiming);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04c-ask-yori-home-updated-${viewName}.png`),
      fullPage: true,
    });
  });
});
