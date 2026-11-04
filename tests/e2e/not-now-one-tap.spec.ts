/**
 * Playwright E2E Spec: One-Tap "Not Now" Dismissal & Undo Lifecycle
 * Governed by Task: NOT-NOW-ONE-TAP (INBOX-20261104-10E3B2)
 *
 * Verifies that clicking "Not now" (#btn-dismiss) on any recommendation card:
 * 1. Dismisses the plan in one tap with "Don't suggest this today" semantics.
 * 2. Does NOT open the reason selection dialog.
 * 3. Immediately replaces the card with a quiet dismissed note banner containing an Undo button.
 * 4. Clicking Undo restores the card and cleans up the suppression.
 * 5. Runs across Mobile (390x844) and Desktop (1280x800) viewports on an isolated port (never 4173).
 * 6. Captures visual evidence in docs/evidence/not-now/*.png.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/not-now');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('NOT-NOW-ONE-TAP: One-Tap Dismissal & Undo Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure fresh storage state
    await page.goto('/?mode=demo&ui=v2&test=1&scene=lunch');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.app-layout');
  });

  test('Lunch Scene: One tap on Not now dismisses without reason dialog, shows quiet note, Undo restores card', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?mode=demo&ui=v2&test=1&scene=lunch');
    await page.waitForTimeout(300);

    // Initial state: lunch candidates hero card is visible
    const lunchCard = page.locator('.v2-candidates-hero, .now-card').first();
    await expect(lunchCard).toBeVisible();
    await expect(lunchCard).toContainText('Lunch options near you');
    await expect(lunchCard).toContainText('Pacific Ramen Bar');

    const dismissBtn = page.locator('#btn-dismiss').first();
    await expect(dismissBtn).toBeVisible();
    await expect(dismissBtn).toContainText('Not now');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-lunch-before-dismiss-${viewName}.png`),
    });

    // 1. One tap on "Not now"
    await dismissBtn.click();
    await page.waitForTimeout(200);

    // 2. Verified: Reason selection modal does NOT open
    await expect(page.locator('#dismiss-dialog-backdrop')).toHaveCount(0);
    await expect(page.locator('#dismiss-dialog')).toHaveCount(0);

    // 3. Verified: The lunch card is replaced by the quiet dismissed note banner
    await expect(page.locator('.v2-candidates-hero')).toHaveCount(0);
    const dismissedBanner = page.locator('#dismissed-note-banner');
    await expect(dismissedBanner).toBeVisible();
    await expect(dismissedBanner).toContainText('You dismissed lunch · Not today');

    const undoBtn = page.locator('#btn-undo-dismiss');
    await expect(undoBtn).toBeVisible();
    await expect(undoBtn).toHaveText('Undo');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-lunch-after-one-tap-dismiss-${viewName}.png`),
    });

    // 4. One tap on "Undo" restores the lunch card
    await undoBtn.click();
    await page.waitForTimeout(200);

    // Verified: Dismissed note is gone and original card is fully restored
    await expect(page.locator('#dismissed-note-banner')).toHaveCount(0);
    await expect(lunchCard).toBeVisible();
    await expect(lunchCard).toContainText('Lunch options near you');
    await expect(lunchCard).toContainText('Pacific Ramen Bar');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-lunch-restored-via-undo-${viewName}.png`),
    });
  });

  test('Departure Rain Scene: One tap on Not now dismisses depart plan, Undo restores', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?mode=demo&ui=v2&test=1&scene=rain');
    await page.waitForTimeout(300);

    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Piano lesson at 3:00 PM');

    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
    await page.waitForTimeout(200);

    // Dialog does not open
    await expect(page.locator('#dismiss-dialog-backdrop')).toHaveCount(0);

    // Quiet note banner shows departure dismissed
    const dismissedBanner = page.locator('#dismissed-note-banner');
    await expect(dismissedBanner).toBeVisible();
    await expect(dismissedBanner).toContainText('You dismissed departure · Not today');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-depart-after-one-tap-dismiss-${viewName}.png`),
    });

    // Undo restores the departure plan
    const undoBtn = page.locator('#btn-undo-dismiss');
    await undoBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('#dismissed-note-banner')).toHaveCount(0);
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-depart-restored-via-undo-${viewName}.png`),
    });
  });
});
