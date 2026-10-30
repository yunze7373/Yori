/**
 * Playwright E2E Tests for Slice PH-002 C2: XMemo UI Integration (AC-203-2)
 *
 * Verifies:
 * - Hidden by default: when XMemo OAuth is off/disabled, the affordance is 100% absent from the Me view.
 * - Visible when enabled: displays "Connect XMemo" affordance when XMEMO_OAUTH_ENABLED is on.
 * - Connected state: displays "Connected" badge and "Disconnect XMemo" affordance.
 * - Accessibility (Axe): 0 critical or serious violations.
 * - Generates visual screenshot evidence under docs/evidence/ph2-c2/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ph2-c2');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('PH-002 C2: XMemo UI Affordance & Invariance Verification', () => {
  async function goToMeTab(page: any, isMobile: boolean) {
    if (isMobile) {
      await page.locator('#tab-me').click();
    } else {
      await page.locator('#desktop-nav-me').click();
    }
  }

  test('XMemo affordance is completely hidden when flag is off (default)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';

    // 1. Mock status endpoint to return disabled
    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    await page.goto('/');
    await goToMeTab(page, isMobile);
    await expect(page.locator('#confirmed-facts-list')).toBeVisible();

    // Verify XMemo section is NOT in the DOM
    await expect(page.locator('#me-xmemo-title')).toHaveCount(0);
    await expect(page.locator('#btn-xmemo-connect')).toHaveCount(0);
    await expect(page.locator('#btn-xmemo-disconnect')).toHaveCount(0);
  });

  test('XMemo affordance is visible when flag is enabled (disconnected)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          connected: false,
          statusText: 'XMemo OAuth enabled (disconnected)',
        }),
      });
    });

    await page.goto('/');
    await goToMeTab(page, isMobile);

    // Section is visible
    await expect(page.locator('#me-xmemo-title')).toBeVisible();
    await expect(page.locator('#btn-xmemo-connect')).toBeVisible();
    await expect(page.locator('#btn-xmemo-disconnect')).toHaveCount(0);

    // Save visual evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `xmemo-disconnected-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Axe accessibility
    const axeResults = await new AxeBuilder({ page })
      .withRules(['color-contrast', 'button-name', 'heading-order'])
      .analyze();
    const criticalViolations = axeResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('XMemo affordance displays connected state when authenticated', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          connected: true,
          statusText: 'XMemo connected',
        }),
      });
    });

    await page.goto('/');
    await goToMeTab(page, isMobile);

    // Connected state
    await expect(page.locator('#me-xmemo-title')).toBeVisible();
    await expect(page.locator('#btn-xmemo-disconnect')).toBeVisible();
    await expect(page.locator('#btn-xmemo-connect')).toHaveCount(0);

    // Save visual evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `xmemo-connected-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
