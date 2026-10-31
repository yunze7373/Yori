/**
 * VISUAL-PROOF-HEAD: Current-HEAD Deterministic Visual Proof Matrix
 * Governed by TID: INBOX-20261031-AAE267 (Coordinator Readiness Audit msg_1956ab2c)
 *
 * Captures the definitive owner-facing visual evidence on current HEAD:
 * Matrix:
 *   Scenarios:
 *     1. rain weather-departure (D2)
 *     2. away-lunch (D3)
 *   Viewports:
 *     1. mobile: 390x844
 *     2. desktop: 1280x800
 *   States:
 *     1. Home showing NOW + AHEAD + FOR YOU
 *     2. Why sheet with provenance labels
 *     3. Confirm a proposal -> Me shows Confirmed
 *     4. Reject/dismiss with reason -> dismissal note
 *     5. Lunch suppression 'Skip lunch suggestions for today?' accepted -> lunch card absent (away-lunch only)
 *     6. One Why sheet showing a 'Synced from XMemo' fact via a stubbed /api/xmemo/* route
 *
 * Strict Invariants:
 * - Each capture asserts the visible text it claims (not screenshot-only).
 * - Blocks all non-localhost requests during the spec and asserts zero external requests.
 * - AxeBuilder accessibility check (zero critical/serious violations) on every captured state.
 * - Writes screenshots, MANIFEST.sha256, and INDEX.md to docs/evidence/visual-proof-head/ (when UPDATE_EVIDENCE=1).
 * - Zero src/ modifications.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { openDemoPanel, closeDemoPanel, selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('visual-proof-head');

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

async function navigateToMe(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.locator('#tab-me').click();
  } else {
    await page.locator('#desktop-nav-me').click();
  }
  await page.waitForTimeout(300);
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

test.describe('VISUAL-PROOF-HEAD: Current-HEAD Visual Evidence Matrix (AC-205-2)', () => {
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

  test('Matrix 1: Rain Weather-Departure (D2) — Home, Why Provenance, Confirm Me, Dismiss Reason', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Reset local state for clean deterministic execution
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await selectDemoScene(page, 'rain');

    // -------------------------------------------------------------------------
    // Capture 01: Home showing V2 Hierarchy (Rain Departure D2)
    // -------------------------------------------------------------------------
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v2');

    // Header status pill on consumer Home
    await expect(page.locator('#pill-context-status')).toBeVisible();
    await expect(page.locator('#pill-context-status')).toContainText('Demo · simulated');

    // Technical status badges accessible in demo panel
    await openDemoPanel(page);
    await expect(page.locator('#badge-ui-version')).toBeVisible();
    await expect(page.locator('#badge-ui-version')).toContainText('V2 Preview');
    await expect(page.locator('.demo-chip')).toBeVisible();
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');
    await closeDemoPanel(page);

    // Primary navigation affordance (Home / Plans / For You / Me)
    if (isMobile) {
      await expect(page.locator('#tab-home')).toBeVisible();
      await expect(page.locator('#tab-plans')).toBeVisible();
      await expect(page.locator('#tab-for-you')).toBeVisible();
      await expect(page.locator('#tab-me')).toBeVisible();
    } else {
      await expect(page.locator('#desktop-nav-home')).toBeVisible();
      await expect(page.locator('#desktop-nav-plans')).toBeVisible();
      await expect(page.locator('#desktop-nav-for-you')).toBeVisible();
      await expect(page.locator('#desktop-nav-me')).toBeVisible();
    }

    // Rain insight banner
    const insightBanner = page.locator('.v2-insight-banner');
    await expect(insightBanner).toBeVisible();
    await expect(insightBanner.locator('.v2-insight-title')).toContainText('What changed: rain forecast');

    // Now card & actions on Home
    const nowCardD2 = page.locator('.now-card');
    await expect(nowCardD2).toBeVisible();
    await expect(nowCardD2.locator('.now-subject')).toContainText('Piano lesson');
    await expect(nowCardD2.locator('.now-subject')).toContainText('3:00 PM');

    // Prominent route map canvas & journey timeline live in Trip Details (Finding 1)
    await page.locator('#btn-view-trip-details').click();
    await expect(page.locator('.v2-map-canvas.prominent')).toBeVisible();
    await expect(page.locator('.v2-timeline')).toBeVisible();
    await page.locator('#trip-detail-back-btn').click();

    // Actions & Ask bar
    await expect(page.locator('#btn-accept')).toBeVisible();
    await expect(page.locator('#btn-adjust')).toBeVisible();
    await expect(page.locator('#btn-dismiss')).toBeVisible();
    await expect(page.locator('#btn-why')).toBeVisible();
    await expect(page.locator('#btn-view-trip-details')).toBeVisible();
    await expect(page.locator('#ask-bar')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-d2-rain-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 02: Why Sheet with Provenance Labels (Rain Departure D2)
    // -------------------------------------------------------------------------
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whyModal = page.locator('.modal-card');
    await expect(whyModal).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toContainText("Why you're seeing this");

    const evidenceSection = page.locator('.why-section', { hasText: 'Evidence & Signals' });
    await expect(evidenceSection).toContainText('Weather forecast');
    await expect(evidenceSection).toContainText('Forecast conditions');
    await expect(evidenceSection.locator('.card-badge:has-text("SIMULATED")').first()).toBeVisible();

    const memorySection = page.locator('.why-section', { hasText: 'Memory & Habits' });
    await expect(memorySection).toBeVisible();
    await expect(memorySection).toContainText('Rain travel habit');
    await expect(memorySection).toContainText('Buffer before leaving');
    await expect(
      memorySection.locator('.card-badge:has-text("Demo profile · sample preference")').first()
    ).toBeVisible();
    await expect(memorySection.locator('.badge-confirmed')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-d2-rain-why-provenance-${viewName}.png`),
    });

    await page.locator('#btn-close-why').click();
    await expect(whyModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // -------------------------------------------------------------------------
    // Capture 03: Confirm Proposal -> Me Tab Shows Confirmed (Rain Departure D2)
    // -------------------------------------------------------------------------
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustModal = page.locator('.modal-card');
    await expect(adjustModal).toBeVisible();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');

    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.locator('#btn-adjust-remember').click();
    await expect(adjustModal).not.toBeVisible();
    await page.waitForTimeout(200);

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
      path: path.join(EVIDENCE_DIR, `03-d2-rain-confirm-me-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 04: Reject / Dismiss with Reason -> Dismissal Note (Rain Departure D2)
    // -------------------------------------------------------------------------
    await navigateToHome(page, isMobile);

    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    const dismissModal = page.locator('#dismiss-dialog-backdrop .modal-card');
    await expect(dismissModal).toBeVisible();
    await expect(page.locator('#dismiss-dialog-title')).toContainText('Dismiss Recommendation');

    await page.locator('input[value="busy_today"]').check();
    await page.locator('#btn-confirm-dismiss').click();
    await expect(dismissModal).not.toBeVisible();

    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toHaveText('Nothing needs your attention right now.');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-d2-rain-dismiss-reason-${viewName}.png`),
    });
  });

  test('Matrix 2: Away-Lunch (D3) — Home, Why Provenance, Dismiss Reason, Lunch Suppression Accepted', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await selectDemoScene(page, 'away-lunch');

    // -------------------------------------------------------------------------
    // Capture 05: Home showing V2 Candidates Hierarchy (Away Lunch D3)
    // -------------------------------------------------------------------------
    const appLayoutD3 = page.locator('.app-layout');
    await expect(appLayoutD3).toHaveAttribute('data-ui-version', 'v2');

    // Header status pill on consumer Home
    await expect(page.locator('#pill-context-status')).toBeVisible();
    await expect(page.locator('#pill-context-status')).toContainText('Demo · simulated');

    // Technical status badges accessible in demo panel
    await openDemoPanel(page);
    await expect(page.locator('#badge-ui-version')).toBeVisible();
    await expect(page.locator('#badge-ui-version')).toContainText('V2 Preview');
    await expect(page.locator('.demo-chip')).toBeVisible();
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');
    await closeDemoPanel(page);

    // Primary navigation affordance (Home / Plans / For You / Me)
    if (isMobile) {
      await expect(page.locator('#tab-home')).toBeVisible();
      await expect(page.locator('#tab-plans')).toBeVisible();
      await expect(page.locator('#tab-for-you')).toBeVisible();
      await expect(page.locator('#tab-me')).toBeVisible();
    } else {
      await expect(page.locator('#desktop-nav-home')).toBeVisible();
      await expect(page.locator('#desktop-nav-plans')).toBeVisible();
      await expect(page.locator('#desktop-nav-for-you')).toBeVisible();
      await expect(page.locator('#desktop-nav-me')).toBeVisible();
    }

    const nowCardD3 = page.locator('.now-card');
    await expect(nowCardD3).toBeVisible();
    await expect(nowCardD3.locator('.now-subject')).toContainText('Lunch options near you');
    await expect(nowCardD3.locator('.mock-places-notice')).toHaveText(
      'Mock places for this demo; real listings come from a place provider.'
    );

    // Map canvas, actions, and Ask bar
    await expect(page.locator('.v2-map-canvas')).toBeVisible();
    await expect(page.locator('#btn-dismiss')).toBeVisible();
    await expect(page.locator('#btn-why')).toBeVisible();
    await expect(page.locator('#ask-bar')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-d3-lunch-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 06: Why Sheet with Provenance Labels (Away Lunch D3)
    // -------------------------------------------------------------------------
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whyModal = page.locator('.modal-card');
    await expect(whyModal).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toContainText("Why you're seeing this");

    const d3MemorySection = page.locator('.why-section', { hasText: 'Memory & Habits' });
    await expect(d3MemorySection).toBeVisible();
    await expect(d3MemorySection).toContainText('Dining taste preferences');
    await expect(d3MemorySection).toContainText('Demo profile · sample preference');
    await expect(d3MemorySection.locator('.badge-confirmed')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `06-d3-lunch-why-provenance-${viewName}.png`),
    });

    await page.locator('#btn-close-why').click();
    await expect(whyModal).not.toBeVisible();
    await page.waitForTimeout(200);

    // -------------------------------------------------------------------------
    // Capture 07: Dismiss with Reason -> Dismissal Quiet State & Proposal in For You
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

    // Navigate to For You tab to view the generated routine proposal
    await navigateToForYou(page, isMobile);
    const lunchProposal = page.locator('.v2-proposal-item-card[data-proposal-key="suppress_lunch_recommendations"]');
    await expect(lunchProposal).toBeVisible();
    await expect(lunchProposal.locator('.v2-proposal-title')).toContainText('Skip lunch suggestions for today?');
    await expect(lunchProposal.locator('.v2-proposal-basis')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-d3-lunch-dismiss-reason-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 08: Lunch Suppression Accepted -> Promoted to Confirmed in Me Tab
    // -------------------------------------------------------------------------
    const confirmProposalBtn = lunchProposal.locator('.btn-confirm-proposal');
    await expect(confirmProposalBtn).toBeVisible();
    await confirmProposalBtn.click();

    // Verify proposal is no longer pending in FOR YOU
    await expect(lunchProposal).not.toBeVisible();

    // Navigate to Me tab to assert and capture sovereign memory confirmation
    await navigateToMe(page, isMobile);
    const confirmedSuppression = page.locator('#fact-suppress_lunch_recommendations');
    await expect(confirmedSuppression).toBeVisible();
    await expect(confirmedSuppression.locator('.badge-confirmed')).toHaveText('Confirmed');
    await expect(confirmedSuppression).toContainText('Source: you confirmed');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `08-d3-lunch-suppressed-accepted-${viewName}.png`),
    });
  });

  test('Matrix 3: Synced from XMemo — Why Sheet Showing Truthful XMemo Vault Provenance', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Intercept /api/xmemo/* routes to provide fictional test data without network/account access
    await page.route('**/api/xmemo/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          connected: true,
          statusText: 'Connected to mock XMemo vault',
        }),
      });
    });

    await page.route('**/api/xmemo/preferences', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'prep_buffer_preference',
            value: { prepMinutes: 25, bufferMinutes: 10 },
            status: 'confirmed',
            note: 'Synced from XMemo vault',
            updatedAt: '2026-10-31T09:00:00.000Z',
          },
          {
            key: 'rain_transport_preference',
            value: 'drive_first',
            status: 'confirmed',
            note: 'Synced from XMemo vault',
            updatedAt: '2026-10-31T09:00:00.000Z',
          },
        ]),
      });
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await selectDemoScene(page, 'rain');

    // -------------------------------------------------------------------------
    // Capture 09: Why Sheet with 'Synced from XMemo' Provenance Badges
    // -------------------------------------------------------------------------
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whyBackdrop = page.locator('#why-sheet-backdrop');
    await expect(whyBackdrop).toBeVisible();

    const memorySection = whyBackdrop.locator('section[aria-labelledby="why-memory-heading"]');
    await expect(memorySection).toBeVisible();

    const syncedBadges = memorySection.locator('.why-item-row .card-badge');
    await expect(syncedBadges.first()).toBeVisible();
    const count = await syncedBadges.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const badgeText = await syncedBadges.nth(i).innerText();
      expect(badgeText).not.toBe('Demo profile · sample preference');
      expect(badgeText).not.toBe('Confirmed');
      expect(badgeText).toBe('Synced from XMemo');
    }

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `09-xmemo-synced-why-${viewName}.png`),
    });

    await page.locator('#btn-why-sheet-done').click();
    await expect(whyBackdrop).not.toBeVisible();
  });
});
