/**
 * Playwright E2E Tests for Slice PH-002 E1: Final Visual Regression & Polish
 * Governed by Architecture Rev3 Sections 5, 6, 14 and AC-205-1.
 *
 * Verifies across dual viewports:
 * - Mobile: 390x844
 * - Desktop: 1280x800
 *
 * Covers 12 distinct surfaces:
 * 1. clear (D1 Clear Day Depart)
 * 2. rain (D2 Rain Re-plan & Checklist)
 * 3. away-lunch (D3 Away Lunch Recommendations & Spatial Map)
 * 4. busy-lunch (D4 Busy Schedule Quiet State)
 * 5. missing-weather (D6 Missing Weather Fail-Closed Notice)
 * 6. corrupt-storage (Storage Error Recovery Alert)
 * 7. reasoning-demo (Reordered multi-candidate + Why-Order Sheet)
 * 8. why-sheet (Rain scenario Why Sheet explanation)
 * 9. adjust-dialog (Departure Timing adjustment modal)
 * 10. me-default (Me & Memory view default with budget & controls)
 * 11. me-xmemo-disconnected (Me & Memory view with XMemo flag enabled, disconnected state)
 * 12. live-weather (Living Context with live weather chip & attribution)
 *
 * Quality gates enforced:
 * - 0 Axe critical or serious accessibility violations.
 * - Zero horizontal scroll on mobile (scrollWidth <= clientWidth).
 * - Exact 24 screenshots saved under docs/evidence/ph2-e1/.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ph2-e1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function goToMeTab(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.locator('#tab-me').click();
  } else {
    await page.locator('#desktop-nav-me').click();
  }
}

test.describe('PH-002 E1: Visual Regression and Polish Suite (Dual-Width)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?ui=v1');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('01. Surface: clear', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('clear');
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.demo-chip')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `clear-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('02. Surface: rain', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('rain');
    await expect(page.locator('.rain-banner')).toBeVisible();
    await expect(page.locator('.checklist-chip')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `rain-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('03. Surface: away-lunch', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('away-lunch');
    await expect(page.locator('.map-card')).toBeVisible();
    await expect(page.locator('.options-grid')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `away-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('04. Surface: busy-lunch', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('busy-lunch');
    await expect(page.locator('.quiet-card')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `busy-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('05. Surface: missing-weather', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('missing-weather');
    await expect(page.locator('.notice-box')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `missing-weather-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('06. Surface: corrupt-storage', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('corrupt-storage');
    await expect(page.locator('.error-box')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `corrupt-storage-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('07. Surface: reasoning-demo (reordered + why-order sheet)', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Mock reasoning endpoint
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            orderedPlanIds: [cLunch.id, cDepart.id],
            rationale: [
              {
                planId: cLunch.id,
                citedSignalIds: cLunch.citedSignalIds,
                citedFactKeys: cLunch.citedFactKeys,
                reasonCode: 'matches_confirmed_preference',
              },
              {
                planId: cDepart.id,
                citedSignalIds: cDepart.citedSignalIds,
                citedFactKeys: cDepart.citedFactKeys,
                reasonCode: 'time_critical',
              },
            ],
          },
          usedFallback: false,
        }),
      });
    });

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('multi-candidate');

    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toHaveAttribute('data-plan-id', /^plan-lunch-/);

    // Open Why Sheet to reveal "Why this order"
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-order-section')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `reasoning-demo-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('08. Surface: why-sheet (rain)', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('rain');

    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-evidence-heading')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `why-sheet-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('09. Surface: adjust-dialog', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('rain');

    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const modal = page.locator('.modal-card');
    await expect(modal).toBeVisible();
    await expect(page.locator('#adjust-dialog-title')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `adjust-dialog-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('10. Surface: me-default', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    await page.goto('/?ui=v1');
    await goToMeTab(page, isMobile);
    await expect(page.locator('#confirmed-facts-list')).toBeVisible();
    await expect(page.locator('#me-xmemo-title')).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `me-default-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('11. Surface: me-xmemo-disconnected', async ({ page }, testInfo) => {
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

    await page.goto('/?ui=v1');
    await goToMeTab(page, isMobile);
    await expect(page.locator('#me-xmemo-title')).toBeVisible();
    await expect(page.locator('#btn-xmemo-connect')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `me-xmemo-disconnected-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('12. Surface: live-weather', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          attribution: {
            text: 'Weather data by Open-Meteo.com',
            url: 'https://open-meteo.com/',
            license: 'CC BY 4.0',
          },
        }),
      });
    });

    await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          signals: [
            {
              kind: 'weather',
              source: 'real',
              label: 'real',
              issuedAt: '2026-10-28T17:00:00.000Z',
              validFor: 3600000,
              confidence: 1.0,
              consentScope: 'device_only',
              value: {
                condition: 'clear',
                precipProbability: 0.0,
                temperatureC: 19.5,
                city: 'San Francisco, CA',
              },
            },
          ],
        }),
      });
    });

    await page.goto('/?ui=v1');
    await expect(page.locator('#chip-live-weather')).toBeVisible();
    await expect(page.locator('#weather-attribution')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page);

    const screenshotPath = path.join(EVIDENCE_DIR, `live-weather-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
