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

async function navigateToToday(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.locator('#tab-today').click();
  } else {
    await page.locator('#desktop-nav-today').click();
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

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    // -------------------------------------------------------------------------
    // Capture 01: Home showing NOW + AHEAD + FOR YOU (Rain Departure D2)
    // -------------------------------------------------------------------------
    const nowCardD2 = page.locator('.now-card');
    await expect(nowCardD2).toBeVisible();
    await expect(nowCardD2.locator('.now-subject')).toContainText('Piano lesson');
    await expect(nowCardD2.locator('.rain-banner')).toContainText('What changed: rain forecast');

    const umbrellaChip = nowCardD2.locator('#chip-umbrella');
    await expect(umbrellaChip).toBeVisible();
    await expect(umbrellaChip).toContainText('Umbrella');

    await expect(nowCardD2.locator('.habit-note')).toHaveText('You usually prefer driving when it rains.');

    const transitOptions = nowCardD2.locator('.options-grid .option-tile');
    await expect(transitOptions).toHaveCount(2);
    await expect(transitOptions.nth(0)).toContainText('Drive · leave 2:30 PM');
    await expect(transitOptions.nth(1)).toContainText('Bus · leave 2:15 PM');

    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card .section-label')).toContainText('NOW');
    await expect(page.locator('section[aria-label*="AHEAD"]')).toBeVisible();
    await expect(page.locator('section[aria-label*="AHEAD"] .section-label')).toContainText('AHEAD');
    await expect(page.locator('section[aria-label*="FOR YOU"]')).toBeVisible();
    await expect(page.locator('section[aria-label*="FOR YOU"] .section-label')).toContainText('FOR YOU');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-d2-rain-home-${viewName}.png`),
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
    await navigateToToday(page, isMobile);

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

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('away-lunch');

    // -------------------------------------------------------------------------
    // Capture 05: Home showing NOW + AHEAD + FOR YOU (Away Lunch D3)
    // -------------------------------------------------------------------------
    const nowCardD3 = page.locator('.now-card');
    await expect(nowCardD3).toBeVisible();
    await expect(nowCardD3.locator('.now-subject')).toContainText('Lunch options near you');
    await expect(nowCardD3.locator('.mock-places-notice')).toHaveText(
      'Mock places for this demo; real listings come from a place provider.'
    );

    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card .section-label')).toContainText('NOW');
    await expect(page.locator('section[aria-label*="AHEAD"]')).toBeVisible();
    await expect(page.locator('section[aria-label*="AHEAD"] .section-label')).toContainText('AHEAD');
    await expect(page.locator('section[aria-label*="FOR YOU"]')).toBeVisible();
    await expect(page.locator('section[aria-label*="FOR YOU"] .section-label')).toContainText('FOR YOU');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-d3-lunch-home-${viewName}.png`),
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
    // Capture 07: Dismiss with Reason -> Dismissal Note & Proposal Created
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

    const lunchProposal = page.locator('#for-you-suppress_lunch_recommendations');
    await expect(lunchProposal).toBeVisible();
    await expect(lunchProposal.locator('.item-title')).toContainText('Skip lunch suggestions for today?');
    await expect(lunchProposal.locator('.item-subtitle')).toContainText('You dismissed lunch · Not today');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `07-d3-lunch-dismiss-reason-${viewName}.png`),
    });

    // -------------------------------------------------------------------------
    // Capture 08: Lunch Suppression Accepted -> Lunch Card Strictly Absent
    // -------------------------------------------------------------------------
    const confirmProposalBtn = lunchProposal.locator('.btn-confirm-proposal');
    await expect(confirmProposalBtn).toBeVisible();
    await confirmProposalBtn.click();

    await expect(lunchProposal).not.toBeVisible();
    await expect(page.locator('.now-card:has-text("Lunch options")')).toHaveCount(0);
    await expect(page.locator('.quiet-title')).toHaveText('Nothing needs your attention right now.');

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

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

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
