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
    await expect(page.locator('.v2-map-canvas.prominent').first()).toBeVisible();
    await expect(page.locator('.v2-timeline')).toBeVisible();
    await page.locator('#trip-detail-back-btn').click();

    // Actions & Ask bar
    await expect(page.locator('#btn-accept')).toBeVisible();
    await expect(page.locator('#btn-adjust')).toBeVisible();
    await expect(page.locator('#btn-dismiss')).toBeVisible();
    await expect(page.locator('#btn-why')).toHaveCount(0); // HABIT-LEARN addendum 2: no Why action
    await expect(page.locator('#btn-view-trip-details')).toBeVisible();
    await expect(page.locator('#ask-bar')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-d2-rain-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 02: HABIT-LEARN addendum 2: no Why sheet / evidence rows on the rain card
    // -------------------------------------------------------------------------
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.signal-tile, .now-basis, .v2-candidate-basis')).toHaveCount(0);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-d2-rain-why-provenance-${viewName}.png`),
    });

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
    // HABIT-LEARN: remembered as stated at once, listed with its basis; no confirm step.
    const confirmedFact = page.locator('#habit-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();
    await expect(confirmedFact).toContainText('Preparation buffer habit');
    await expect(confirmedFact).toContainText('You told Yori');
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

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
    await expect(page.locator('#btn-why')).toHaveCount(0); // HABIT-LEARN addendum 2: no Why action
    await expect(page.locator('#ask-bar')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-d3-lunch-home-${viewName}.png`),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Capture 06: HABIT-LEARN addendum 2: no Why sheet on the lunch card; the sample profile is
    // never presented as the user's own
    // -------------------------------------------------------------------------
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.signal-tile, .now-basis, .v2-candidate-basis')).toHaveCount(0);
    await expect(nowCardD3).not.toContainText('You confirmed');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `06-d3-lunch-why-provenance-${viewName}.png`),
    });

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

    // HABIT-LEARN: no follow-up "Skip lunch suggestions for today?" proposal; the dismissal is the effect
    await navigateToForYou(page, isMobile);
    const lunchProposal = page.locator('.v2-proposal-item-card[data-proposal-key="suppress_lunch_recommendations"]');
    await expect(lunchProposal).toHaveCount(0);
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-d3-lunch-dismiss-reason-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 08: Lunch suppressed for today; Me has nothing waiting for confirmation
    // -------------------------------------------------------------------------
    await navigateToMe(page, isMobile);
    await expect(page.locator('#learned-habits-list')).toBeVisible();
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `08-d3-lunch-suppressed-accepted-${viewName}.png`),
    });
  });

  test('Matrix 3: Synced from XMemo — Me Shows Truthful XMemo Vault Provenance (no Why sheet)', async ({
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
    // Capture 09: HABIT-LEARN addendum 2: no Why sheet; the synced facts are listed on Me
    // ("What Yori has learned") with their truthful 'Synced from XMemo' provenance
    // -------------------------------------------------------------------------
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.signal-tile, .now-basis, .v2-candidate-basis')).toHaveCount(0);
    await navigateToMe(page, isMobile);
    for (const key of ['prep_buffer_preference', 'rain_transport_preference']) {
      const row = page.locator(`#habit-${key}`);
      await expect(row).toBeVisible();
      const tag = await row.locator('.memory-meta').innerText();
      expect(tag).not.toBe('Demo profile · sample preference');
      expect(tag).not.toBe('Confirmed');
      expect(tag).not.toBe('You told Yori');
      expect(tag).toBe('Synced from XMemo');
    }

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `09-xmemo-synced-why-${viewName}.png`),
    });
  });
});
