import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v2');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V-ANCHOR: V1 Fallback and V2 Shell Smoke Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V1 approved home renders by default and passes axe accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v1
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');

    // V2 badge is NOT rendered
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);

    // Standard demo chip is present
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');

    // Verify D1 clear departure scene
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');

    // Axe audit
    await checkAxe(page);

    // Capture screenshot evidence
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile ? 'v1-home-mobile-390x844.png' : 'v1-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('V2 shell renders with V2 badge and maintains full scenario functionality', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v2
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v2');

    // V2 badge IS rendered
    const v2Badge = page.locator('#badge-ui-version');
    await expect(v2Badge).toBeVisible();
    await expect(v2Badge).toHaveText('V2 Preview');

    // Scene switcher operates: test Clear D1
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');

    // Switch to Rain D2
    await page.selectOption('#scene-select', 'rain');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    await expect(page.locator('.now-card')).toContainText('Umbrella');
    await expect(page.locator('.now-card')).toContainText('Drive · leave 2:30 PM');

    // Switch to Away Lunch D3
    await page.selectOption('#scene-select', 'away-lunch');
    await expect(page.locator('.now-card')).toContainText('Lunch options near you');

    // Axe audit
    await checkAxe(page);

    // Capture screenshot evidence for V2
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile ? 'v2-home-mobile-390x844.png' : 'v2-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('Invalid UI version tokens fail closed to v1 without crash', async ({ page }) => {
    await page.goto('/?ui=unknown-version-xyz');
    await page.waitForSelector('.app-layout');

    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);
  });
});
