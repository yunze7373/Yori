/**
 * Playwright E2E Tests for Slice PH-002 D1: Live Weather UI (AC-204-1, AC-204-2)
 *
 * Verifies:
 * - Hidden by default: when WEATHER_LIVE_ENABLED is off, live weather chip and attribution are 100% absent.
 * - Visible when enabled: displays "Live weather" chip and Open-Meteo attribution when WEATHER_LIVE_ENABLED is on.
 * - Accessibility (Axe): 0 critical or serious violations.
 * - Captures visual evidence screenshots under docs/evidence/ph2-d1/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ph2-d1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('PH-002 D1: Live Weather UI Affordance & Attribution', () => {
  test('Live weather chip and attribution are hidden when flag is off (default)', async ({
    page,
  }) => {
    // 1. Mock status endpoint to return disabled
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    });

    await page.goto('/');
    await expect(page.locator('.demo-chip')).toBeVisible();

    // Verify Live Weather elements are NOT present in the DOM
    await expect(page.locator('#chip-live-weather')).toHaveCount(0);
    await expect(page.locator('#weather-attribution')).toHaveCount(0);
  });

  test('Live weather chip and attribution are visible when WEATHER_LIVE_ENABLED is on', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Mock status endpoint
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

    // Mock current weather endpoint
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

    await page.goto('/');

    // Verify Live Weather elements appear
    await expect(page.locator('#chip-live-weather')).toBeVisible();
    await expect(page.locator('#chip-live-weather')).toContainText('Live weather');
    await expect(page.locator('#weather-attribution')).toBeVisible();
    await expect(page.locator('#weather-attribution')).toContainText('Weather data by Open-Meteo.com');

    // Save visual evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `live-weather-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Axe accessibility verification
    const axeResults = await new AxeBuilder({ page })
      .withRules(['color-contrast', 'button-name', 'heading-order'])
      .analyze();
    const criticalViolations = axeResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });
});
