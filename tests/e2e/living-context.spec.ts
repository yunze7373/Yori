/**
 * Playwright E2E Tests for Slice 3 S3-1 Living Context UI
 * Governed by Architecture Rev3 Section 5 and AC-105-1.
 *
 * Verifies:
 * - Mobile (390x844) and Desktop (1280x800) responsive layouts.
 * - Golden outcomes for Clear (D1), Rain (D2), Away Lunch (D3), and Busy (D4) scenes.
 * - Always-visible 'Demo · simulated context' chip (INV-102).
 * - No horizontal scroll on mobile viewport.
 * - Axe accessibility check: 0 serious or critical violations.
 * - Generates visual screenshot evidence under docs/evidence/s3-1/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/s3-1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('Living Context UI E2E & Visual Verification (AC-105-1)', () => {
  test('Clear Scene (D1): Piano lesson prepare 2:05 PM, leave 2:25 PM', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');

    // 1. Verify Demo status label is present (INV-102)
    const demoChip = page.locator('.demo-chip');
    await expect(demoChip).toBeVisible();
    await expect(demoChip).toContainText('Demo · simulated context');

    // 2. Select Clear (D1) scene
    const select = page.locator('#scene-select');
    await select.selectOption('clear');

    // 3. Verify NOW card headline matches Golden D1 outcome
    const nowTitle = page.locator('#now-title');
    await expect(nowTitle).toBeVisible();
    await expect(nowTitle).toContainText('2:05 PM');
    await expect(nowTitle).toContainText('2:25 PM');

    // 4. Verify Map is rendered (spatial evidence exists)
    const mapCard = page.locator('.map-card');
    await expect(mapCard).toBeVisible();
    await expect(mapCard).toContainText('Piano Studio');

    // 5. Verify no horizontal scrollbar on mobile
    if (isMobile) {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    }

    // 6. Accessibility scan (0 serious or critical violations)
    const axeResults = await new AxeBuilder({ page }).analyze();
    const severeViolations = axeResults.violations.filter(
      v => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);

    // 7. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `clear-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Rain Scene (D2): Umbrella checklist + Drive 2:30 / Bus 2:15 ranked options', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    const select = page.locator('#scene-select');
    await select.selectOption('rain');

    // 1. Verify Rain re-plan banner and umbrella chip
    const rainBanner = page.locator('.rain-banner');
    await expect(rainBanner).toBeVisible();
    await expect(rainBanner).toContainText('What changed: rain forecast');

    const umbrellaChip = page.locator('#chip-umbrella');
    await expect(umbrellaChip).toBeVisible();
    await expect(umbrellaChip).toContainText('Umbrella');

    // 2. Verify Multi-modal options: drive leave 2:30 first, bus leave 2:15 second
    const options = page.locator('.option-tile');
    await expect(options.nth(0)).toContainText('drive leave 2:30');
    await expect(options.nth(1)).toContainText('bus leave 2:15');

    // 3. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `rain-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Away-Lunch Scene (D3): <=3 lunch options matching confirmed tastes', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    const select = page.locator('#scene-select');
    await select.selectOption('away-lunch');

    // 1. Verify lunch card in NOW with options matching confirmed tastes
    const nowTitle = page.locator('#now-title');
    await expect(nowTitle).toBeVisible();
    await expect(nowTitle).toContainText('Lunch options');

    const optionTiles = page.locator('.option-tile');
    const count = await optionTiles.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);

    // Assert Ramen, Salad, or Japanese places from confirmed tastes
    const firstOption = await optionTiles.nth(0).innerText();
    expect(firstOption).toMatch(/Ramen|Salad|Sushi/);

    // 2. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `away-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Busy-Lunch Scene (D4): Honest quiet state with 0 lunch prompts', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    const select = page.locator('#scene-select');
    await select.selectOption('busy-lunch');

    // 1. Verify quiet state is rendered (no lunch card)
    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Nothing needs your attention right now');

    // 2. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `busy-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Missing-Weather Scene (D6): Visible fail-closed degraded notice', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');
    const select = page.locator('#scene-select');
    await select.selectOption('missing-weather');

    // 1. Verify fail-closed degraded notice is rendered
    const noticeBox = page.locator('.notice-box');
    await expect(noticeBox).toBeVisible();
    await expect(noticeBox).toContainText('weather');

    // 2. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `missing-weather-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
