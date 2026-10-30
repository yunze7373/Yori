/**
 * UIFONT E2E Tests: Zero External Network Requests & Self-Hosted Typography Verification
 * Governed by BACKLOG-20261031-UIFONT.
 *
 * Verifies:
 * 1. Zero requests to external hosts (specifically zero to fonts.googleapis.com or fonts.gstatic.com).
 * 2. Self-hosted font assets (/fonts/inter-*.woff2, /fonts/newsreader-*.woff2) load with 200 OK.
 * 3. Typography renders accurately using self-hosted Inter & Newsreader font families.
 * 4. Captures visual evidence for Home (clear, rain), Why sheet, and For You on mobile & desktop.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ui-font');

test.describe('UIFONT: Self-Hosted Font Integrity & Network Isolation', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('zero external requests on page load: no calls to Google Fonts or non-localhost hosts', async ({
    page,
  }) => {
    const requestedUrls: string[] = [];
    const fontRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      requestedUrls.push(url);
      if (url.includes('/fonts/') && url.endsWith('.woff2')) {
        fontRequests.push(url);
      }
    });

    // Navigate to Home clear scene in test mode
    const response = await page.goto('/?ui=v2&scene=clear&test=1');
    expect(response?.status()).toBe(200);
    await page.waitForSelector('.app-layout');

    // Force-load all self-hosted font families and weights into the FontFaceSet
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('400 16px Inter'),
        document.fonts.load('500 16px Inter'),
        document.fonts.load('600 16px Inter'),
        document.fonts.load('700 16px Inter'),
        document.fonts.load('400 16px Newsreader'),
        document.fonts.load('500 16px Newsreader'),
        document.fonts.load('600 16px Newsreader'),
        document.fonts.load('italic 400 16px Newsreader'),
      ]);
      await document.fonts.ready;
    });

    // 1. Assert zero external hosts contacted
    for (const urlStr of requestedUrls) {
      const parsed = new URL(urlStr);
      expect(
        parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '::1',
        `Forbidden external host requested: ${urlStr}`
      ).toBe(true);

      expect(parsed.hostname).not.toContain('googleapis.com');
      expect(parsed.hostname).not.toContain('gstatic.com');
    }

    // 2. Assert self-hosted fonts loaded from local /fonts/
    expect(fontRequests.length).toBeGreaterThanOrEqual(8);
    for (const fontUrl of fontRequests) {
      const parsed = new URL(fontUrl);
      expect(parsed.pathname).toMatch(/^\/fonts\/(inter|newsreader)-\d+(-italic)?\.woff2$/);
    }

    // 3. Assert document.fonts contains active Inter and Newsreader
    const interReady = await page.evaluate(() => document.fonts.check('16px Inter'));
    const newsreaderReady = await page.evaluate(() => document.fonts.check('16px Newsreader'));
    expect(interReady).toBe(true);
    expect(newsreaderReady).toBe(true);
  });

  test('visual capture: Home (clear, rain), Why sheet, and For You', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = testInfo.project.name;
    const suffix = process.env.UIFONT_CAPTURE_MODE === 'before' ? 'before' : 'after';

    // Helper: Reset storage and navigate to scene
    async function loadScene(scene: string) {
      await page.goto(`/?ui=v2&scene=${scene}&test=1`);
      await page.waitForSelector('.app-layout');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto(`/?ui=v2&scene=${scene}&test=1`);
      await page.waitForSelector('.app-layout');
      await page.evaluate(() => document.fonts.ready);
    }

    // 1. Home (Clear)
    await loadScene('clear');
    await page.waitForSelector('.now-card');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `home-clear-${viewName}-${suffix}.png`),
      fullPage: false,
    });

    // 2. Home (Rain)
    await loadScene('rain');
    await page.waitForSelector('.now-card');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `home-rain-${viewName}-${suffix}.png`),
      fullPage: false,
    });

    // 3. Why Sheet (opened on rain)
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();
    const whyBackdrop = page.locator('#why-sheet-backdrop');
    await expect(whyBackdrop).toBeVisible();
    await page.waitForSelector('#why-sheet-backdrop .modal-card');
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `why-sheet-${viewName}-${suffix}.png`),
      fullPage: false,
    });

    // Close Why Sheet
    const closeBtn = page.locator('#btn-close-why');
    await closeBtn.click();
    await expect(whyBackdrop).toHaveCount(0);

    // 4. For You (multi-candidate scene with populated proposals)
    await loadScene('multi-candidate');
    const forYouTab = isMobile
      ? page.locator('#tab-for-you')
      : page.locator('#desktop-nav-for-you');
    await expect(forYouTab).toBeVisible();
    await forYouTab.click();
    const forYouView = page.locator('.v2-for-you-view');
    await expect(forYouView).toBeVisible();
    await page.waitForTimeout(100);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `for-you-${viewName}-${suffix}.png`),
      fullPage: false,
    });
  });
});
