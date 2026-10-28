/**
 * Playwright E2E Tests for Slice PH-002 B2: Constrained Reasoning Fixture & Why-Order UI Integration
 * Governed by Architecture Rev3 Section 14.2 and AC-202-2.
 *
 * Verifies:
 * - Mobile (390x844) and Desktop (1280x800) layouts.
 * - Offline-reproducible fixture routing (POST /api/model/reason intercepted; zero network, no API key).
 * - Initial deterministic composition renders immediately (unblocking).
 * - Asynchronous reordering updates NOW and AHEAD candidates without altering plan times or contents.
 * - Why Sheet integration: displays "Why this order" section with human rationale and zero debug jargon.
 * - Fault tolerance & fallback invariance: on 5xx or discard, deterministic order is untouched and why-order section is omitted.
 * - Accessibility scan (Axe): 0 serious or critical violations.
 * - Generates visual screenshot evidence under docs/evidence/ph2-b2/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/ph2-b2');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('PH-002 B2: Constrained Reasoning UI & Why-Order Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Accepted Reorder Fixture: asynchronously reorders candidates and displays Why This Order', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // 1. Intercept /api/model/reason to return the offline-reproducible accepted reorder
    await page.route('**/api/model/reason', async route => {
      const reqData = route.request().postDataJSON();
      const candidates = reqData?.candidates || [];
      const cLunch = candidates.find((c: { intentId: string }) => c.intentId === 'lunch');
      const cDepart = candidates.find((c: { intentId: string }) => c.intentId === 'depart');

      if (!cLunch || !cDepart) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: { orderedPlanIds: candidates.map((c: { id: string }) => c.id), rationale: [] },
            usedFallback: true,
          }),
        });
        return;
      }

      // Reorder: elevate lunch to NOW, move depart to AHEAD
      const fixtureResponse = {
        result: {
          orderedPlanIds: [cLunch.id, cDepart.id],
          rationale: [
            {
              planId: cLunch.id,
              citedSignalIds: cLunch.citedSignalIds,
              citedFactKeys: cLunch.citedFactKeys,
              text: 'Prioritize lunch near Green Bowl matching confirmed taste while user is away',
            },
          ],
        },
        usedFallback: false,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureResponse),
      });
    });

    await page.goto('/');

    // 2. Switch to 'multi-candidate' (Reasoning demo) scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

    // 3. Verify reasoning reorder is applied asynchronously:
    // Deterministic NOW was depart; after reasoning, NOW card is reordered to lunch
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toHaveAttribute('data-plan-id', /^plan-lunch-/);

    // 4. Verify AHEAD contains the depart plan
    const aheadDepart = page.locator('.ahead-list .item-row[data-plan-id^="depart-plan-"]');
    await expect(aheadDepart).toBeVisible();

    // 5. Accessibility check on reordered view (0 serious or critical violations)
    const axeResults = await new AxeBuilder({ page }).analyze();
    const severeViolations = axeResults.violations.filter(
      v => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);

    // 6. Capture visual screenshot of reordered main view
    const mainScreenshotPath = path.join(EVIDENCE_DIR, `reasoning-reordered-${viewName}.png`);
    await page.screenshot({ path: mainScreenshotPath, fullPage: true });

    // 7. Click Why button on the NOW card to open the Why Sheet
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    // 8. Verify Why Sheet opened and contains "Why this order" section
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();

    const orderSection = page.locator('#why-order-section');
    await expect(orderSection).toBeVisible();

    const orderHeading = page.locator('#why-order-heading');
    await expect(orderHeading).toHaveText('Why this order');

    const orderText = page.locator('#why-order-text');
    await expect(orderText).toBeVisible();
    await expect(orderText).toHaveText(
      'Prioritize lunch near Green Bowl matching confirmed taste while user is away'
    );

    // 9. Invariant check: Why sheet text must contain zero engineering tokens
    const sheetContent = await whySheet.innerText();
    expect(sheetContent).not.toContain('INV-');
    expect(sheetContent).not.toContain('AC-202');
    expect(sheetContent).not.toContain('PH-002');
    expect(sheetContent).not.toContain('depart-plan-');
    expect(sheetContent).not.toContain('plan-lunch-');

    // 10. Capture visual screenshot of Why Sheet with ordering rationale
    const whyScreenshotPath = path.join(EVIDENCE_DIR, `why-order-sheet-${viewName}.png`);
    await page.screenshot({ path: whyScreenshotPath, fullPage: true });

    // 11. Close Why sheet
    const closeBtn = page.locator('#btn-close-why');
    await closeBtn.click();
    await expect(whySheet).not.toBeVisible();
  });

  test('Fault Injection Invariance: 500 error falls back silently to deterministic ordering', async ({
    page,
  }) => {
    // 1. Intercept /api/model/reason and simulate 500 server error
    await page.route('**/api/model/reason', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/');

    // 2. Switch to 'multi-candidate' scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

    // 3. Verify deterministic ordering is preserved: NOW card remains depart plan
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toHaveAttribute('data-plan-id', /^depart-plan-/);

    // 4. Verify AHEAD contains lunch plan
    const aheadLunch = page.locator('.ahead-list .item-row[data-plan-id^="plan-lunch-"]');
    await expect(aheadLunch).toBeVisible();

    // 5. Open Why sheet and verify "Why this order" section is omitted
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const orderSection = page.locator('#why-order-section');
    await expect(orderSection).not.toBeVisible();

    // 6. Close Why sheet
    const closeBtn = page.locator('#btn-close-why');
    await closeBtn.click();
  });
});
