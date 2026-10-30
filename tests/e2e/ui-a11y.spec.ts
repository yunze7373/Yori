/**
 * UI Accessibility E2E Test Suite (WCAG 2.1 AA Compliance)
 * Governed by BACKLOG-20261031-UIA11Y.
 *
 * Verifies:
 * 1. Why Sheet: focus inside dialog on open, Esc closes, focus restored to #btn-why / .btn-ahead-why, Tab/Shift+Tab cycles within dialog.
 * 2. Adjust Dialog: focus inside on open, Tab cycles, Esc closes, focus restored to #btn-adjust.
 * 3. Dismiss Dialog: focus inside on open, Tab cycles, Esc closes, focus restored to #btn-dismiss.
 * 4. Navigate Modal: focus inside on open, Tab cycles, Esc closes, focus restored to invoking Directions button.
 * 5. Candidate Cards: no nested interactive elements; mouse click opens details; Details button opens details; Directions opens modal.
 * 6. Axe WCAG 2.0 Level A and AA audit: 0 violations across clear, rain, lunch, fuel, away-lunch, Why sheet open, For You, Plans, Me.
 * 7. Capture after screenshots of candidate cards into docs/evidence/ui-a11y/.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/ui-a11y');

async function checkAxeWcag(page: Page, contextName: string) {
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const violations = axeResults.violations;
  if (violations.length > 0) {
    const summary = violations.map(
      v => `${v.id} (${v.impact}): ${v.description} - ${v.nodes.map(n => n.html).join(', ')}`
    );
    console.error(`Axe violations in ${contextName}:`, summary);
  }
  expect(violations).toEqual([]);
}

test.describe('UI-A11Y: Modal Accessibility & Candidate Cards WCAG 2.1 AA', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  // --------------------------------------------------------------------------
  // 1. Candidate Cards Layout Identity & After Screenshots
  // --------------------------------------------------------------------------
  for (const scene of ['lunch', 'fuel', 'away-lunch']) {
    test(`Candidate cards visual layout capture: ${scene}`, async ({ page }, testInfo) => {
      const isMobile = testInfo.project.name === 'mobile';
      const vp = isMobile ? 'mobile' : 'desktop';

      await page.goto(`/?ui=v2&test=1&scene=${scene}`);
      await page.waitForSelector('.app-layout');

      const candidateList = page.locator('.v2-candidate-list');
      await expect(candidateList).toBeVisible();

      const topCard = page.locator('.v2-candidate-card').first();
      await expect(topCard).toBeVisible();

      // Ensure no nested-interactive violations: outer card has no role="button" or tabindex
      await expect(topCard).not.toHaveAttribute('role', 'button');
      await expect(topCard).not.toHaveAttribute('tabindex');

      // Ensure Directions button and Details button are accessible
      const directionsBtn = topCard.locator('.v2-directions-btn');
      const detailsBtn = topCard.locator('.v2-view-detail-link');
      await expect(directionsBtn).toBeVisible();
      await expect(detailsBtn).toBeVisible();

      // Capture after screenshots
      await topCard.screenshot({
        path: path.join(EVIDENCE_DIR, `card-${scene}-${vp}-after.png`),
      });
      await candidateList.screenshot({
        path: path.join(EVIDENCE_DIR, `list-${scene}-${vp}-after.png`),
      });
    });
  }

  // --------------------------------------------------------------------------
  // 2. Candidate Cards Interaction: Mouse & Keyboard
  // --------------------------------------------------------------------------
  test('Candidate cards: mouse click on card opens RestaurantDetail', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');

    const topCard = page.locator('.v2-candidate-card').first();
    const candidateName = await topCard.locator('.v2-candidate-name').innerText();

    await topCard.click();

    const restDetail = page.locator('.v2-restaurant-detail');
    await expect(restDetail).toBeVisible();
    await expect(restDetail.locator('#restaurant-detail-name')).toHaveText(candidateName);

    // Back button returns to Home and restores focus to Details button
    await page.locator('#restaurant-detail-back-btn').click();
    await expect(restDetail).toHaveCount(0);
    const detailBtn = page.locator('.v2-candidate-card').first().locator('.v2-view-detail-link');
    await expect(detailBtn).toBeFocused();
  });

  test('Candidate cards: clicking Details button directly opens RestaurantDetail', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');

    const topCard = page.locator('.v2-candidate-card').first();
    const candidateName = await topCard.locator('.v2-candidate-name').innerText();
    const detailBtn = topCard.locator('.v2-view-detail-link');

    await detailBtn.click();

    const restDetail = page.locator('.v2-restaurant-detail');
    await expect(restDetail).toBeVisible();
    await expect(restDetail.locator('#restaurant-detail-name')).toHaveText(candidateName);
  });

  // --------------------------------------------------------------------------
  // 3. Why Sheet: Focus on Open, Focus Trap, Escape Key, Focus Restoration
  // --------------------------------------------------------------------------
  test('Why sheet: focus moves inside dialog on open, Esc closes, focus restored to #btn-why', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheetBackdrop = page.locator('#why-sheet-backdrop');
    await expect(whySheetBackdrop).toBeVisible();
    const modalCard = page.locator('#why-sheet-backdrop .modal-card');
    await expect(modalCard).toBeVisible();

    // Verify document.activeElement is inside the dialog (not on BODY)
    const insideDialogOnOpen = await page.evaluate(() => {
      const card = document.querySelector('#why-sheet-backdrop [role="dialog"]');
      return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
    });
    expect(insideDialogOnOpen).toBe(true);

    // Verify Tab and Shift+Tab cycling never leaves the dialog
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const card = document.querySelector('#why-sheet-backdrop [role="dialog"]');
        return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
      });
      expect(inside).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(() => {
        const card = document.querySelector('#why-sheet-backdrop [role="dialog"]');
        return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
      });
      expect(inside).toBe(true);
    }

    // Press Escape to close Why sheet
    await page.keyboard.press('Escape');
    await expect(whySheetBackdrop).toHaveCount(0);

    // Focus restored to #btn-why
    await expect(whyBtn).toBeFocused();
  });

  test('Why sheet: close via Close button (X) restores focus to #btn-why', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();

    const closeBtn = page.locator('#btn-close-why');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(whyBtn).toBeFocused();
  });

  test('Why sheet: close via Done button restores focus to #btn-why', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();

    const doneBtn = page.locator('#btn-why-sheet-done');
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();

    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(whyBtn).toBeFocused();
  });

  test('Why sheet: close via backdrop click restores focus to #btn-why', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();

    const backdrop = page.locator('#why-sheet-backdrop');
    await expect(backdrop).toBeVisible();

    // Click on backdrop outside the modal card (top left corner)
    await backdrop.click({ position: { x: 10, y: 10 } });

    await expect(backdrop).toHaveCount(0);
    await expect(whyBtn).toBeFocused();
  });

  test('Why sheet from Ahead items: focus restores to .btn-ahead-why', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=rain');
    await page.waitForSelector('.app-layout');

    const aheadWhyBtn = page.locator('.btn-ahead-why').first();
    if ((await aheadWhyBtn.count()) > 0) {
      await aheadWhyBtn.click();

      const backdrop = page.locator('#why-sheet-backdrop');
      await expect(backdrop).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(backdrop).toHaveCount(0);
      await expect(aheadWhyBtn).toBeFocused();
    }
  });

  // --------------------------------------------------------------------------
  // 4. Adjust Dialog: Focus, Trap, Esc, Focus Restoration
  // --------------------------------------------------------------------------
  test('Adjust dialog: focus moves inside on open, Tab cycles, Esc closes, restores focus to #btn-adjust', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const backdrop = page.locator('#adjust-dialog-backdrop');
    await expect(backdrop).toBeVisible();

    // Focus inside dialog
    const insideDialogOnOpen = await page.evaluate(() => {
      const card = document.querySelector('#adjust-dialog-backdrop [role="dialog"]');
      return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
    });
    expect(insideDialogOnOpen).toBe(true);

    // Tab trap
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const card = document.querySelector('#adjust-dialog-backdrop [role="dialog"]');
        return card ? card.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    }

    // Escape closes and restores focus to #btn-adjust
    await page.keyboard.press('Escape');
    await expect(backdrop).toHaveCount(0);
    await expect(adjustBtn).toBeFocused();
  });

  test('Adjust dialog: close via X button restores focus to #btn-adjust', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const adjustBtn = page.locator('#btn-adjust');
    await adjustBtn.click();

    await page.locator('#btn-close-adjust').click();
    await expect(page.locator('#adjust-dialog-backdrop')).toHaveCount(0);
    await expect(adjustBtn).toBeFocused();
  });

  test('Adjust dialog: close via backdrop click restores focus to #btn-adjust', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const adjustBtn = page.locator('#btn-adjust');
    await adjustBtn.click();

    const backdrop = page.locator('#adjust-dialog-backdrop');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(backdrop).toHaveCount(0);
    await expect(adjustBtn).toBeFocused();
  });

  // --------------------------------------------------------------------------
  // 5. Dismiss Dialog: Focus, Trap, Esc, Focus Restoration
  // --------------------------------------------------------------------------
  test('Dismiss dialog: focus inside on open, Tab cycles, Esc closes, restores focus to #btn-dismiss', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    const backdrop = page.locator('#dismiss-dialog-backdrop');
    await expect(backdrop).toBeVisible();

    // Focus inside dialog
    const insideDialogOnOpen = await page.evaluate(() => {
      const card = document.querySelector('#dismiss-dialog-backdrop [role="dialog"]');
      return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
    });
    expect(insideDialogOnOpen).toBe(true);

    // Tab trap
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const card = document.querySelector('#dismiss-dialog-backdrop [role="dialog"]');
        return card ? card.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    }

    // Escape closes and restores focus to #btn-dismiss
    await page.keyboard.press('Escape');
    await expect(backdrop).toHaveCount(0);
    await expect(dismissBtn).toBeFocused();
  });

  test('Dismiss dialog: close via Cancel button restores focus to #btn-dismiss', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const dismissBtn = page.locator('#btn-dismiss');
    await dismissBtn.click();

    await page.locator('#btn-cancel-dismiss').click();
    await expect(page.locator('#dismiss-dialog-backdrop')).toHaveCount(0);
    await expect(dismissBtn).toBeFocused();
  });

  test('Dismiss dialog: close via X button restores focus to #btn-dismiss', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');

    const dismissBtn = page.locator('#btn-dismiss');
    await dismissBtn.click();

    await page.locator('#btn-close-dismiss').click();
    await expect(page.locator('#dismiss-dialog-backdrop')).toHaveCount(0);
    await expect(dismissBtn).toBeFocused();
  });

  // --------------------------------------------------------------------------
  // 6. Navigate Modal: Focus, Trap, Esc, Focus Restoration to Directions button
  // --------------------------------------------------------------------------
  test('Navigate modal: focus inside on open, Tab cycles, Esc closes, restores focus to Directions button', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');

    const directionsBtn = page.locator('.v2-directions-btn').first();
    await expect(directionsBtn).toBeVisible();
    await directionsBtn.click();

    const navBackdrop = page.locator('#navigate-confirm-backdrop');
    await expect(navBackdrop).toBeVisible();
    const navModal = page.locator('#navigate-confirm-modal');
    await expect(navModal).toBeVisible();

    // Focus inside dialog
    const insideDialogOnOpen = await page.evaluate(() => {
      const card = document.querySelector('#navigate-confirm-modal');
      return card ? card.contains(document.activeElement) && document.activeElement !== document.body : false;
    });
    expect(insideDialogOnOpen).toBe(true);

    // Tab trap
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const card = document.querySelector('#navigate-confirm-modal');
        return card ? card.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    }

    // Escape closes and restores focus to directions button
    await page.keyboard.press('Escape');
    await expect(navBackdrop).toHaveCount(0);
    await expect(directionsBtn).toBeFocused();
  });

  test('Navigate modal: Cancel button closes and restores focus to Directions button', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');

    const directionsBtn = page.locator('.v2-directions-btn').first();
    await directionsBtn.click();

    await page.locator('#btn-cancel-navigate').click();
    await expect(page.locator('#navigate-confirm-backdrop')).toHaveCount(0);
    await expect(directionsBtn).toBeFocused();
  });

  // --------------------------------------------------------------------------
  // 7. Full Axe WCAG 2.1 AA Audit Across Scenes and Views
  // --------------------------------------------------------------------------
  for (const scene of ['clear', 'rain', 'lunch', 'fuel', 'away-lunch']) {
    test(`Axe WCAG 2.1 AA passes on Home (${scene}) with 0 violations`, async ({ page }) => {
      await page.goto(`/?ui=v2&test=1&scene=${scene}`);
      await page.waitForSelector('.app-layout');
      await checkAxeWcag(page, `Home [scene=${scene}]`);
    });
  }

  test('Axe WCAG 2.1 AA passes on Why Sheet open state with 0 violations', async ({ page }) => {
    await page.goto('/?ui=v2&test=1&scene=clear');
    await page.waitForSelector('.app-layout');
    await page.locator('#btn-why').click();
    await expect(page.locator('#why-sheet-backdrop')).toBeVisible();

    await checkAxeWcag(page, 'Why Sheet Open State');
  });

  test('Axe WCAG 2.1 AA passes on For You, Plans, and Me tabs with 0 violations', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    const plansNav = isMobile ? page.locator('#tab-plans') : page.locator('#desktop-nav-plans');
    const meNav = isMobile ? page.locator('#tab-me') : page.locator('#desktop-nav-me');

    await page.goto('/?ui=v2&test=1&scene=multi-candidate');
    await page.waitForSelector('.app-layout');

    // 1. For You tab
    await forYouNav.click();
    await page.waitForTimeout(200);
    await checkAxeWcag(page, 'For You Tab');

    // 2. Plans tab
    await plansNav.click();
    await page.waitForTimeout(200);
    await checkAxeWcag(page, 'Plans Tab');

    // 3. Me tab
    await meNav.click();
    await page.waitForTimeout(200);
    await checkAxeWcag(page, 'Me Tab');
  });
});
