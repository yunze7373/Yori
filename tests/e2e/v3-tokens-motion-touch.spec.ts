import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v3');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V3: Style Tokens, Component Polish, Touch Targets & Micro-Motion Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V3 Token System verification: off-white surfaces, deep green brand, serif display, radii, and tabular numeric font', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // 1. Verify CSS variables on document root match FINAL tokens
    const rootTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        colorGround: style.getPropertyValue('--color-ground').trim(),
        colorCardBg: style.getPropertyValue('--color-card-bg').trim(),
        colorCardBorder: style.getPropertyValue('--color-card-border').trim(),
        colorInk: style.getPropertyValue('--color-ink').trim(),
        colorPrimaryBtn: style.getPropertyValue('--color-primary-btn').trim(),
        colorAccent: style.getPropertyValue('--color-accent').trim(),
        colorMapBg: style.getPropertyValue('--color-map-bg').trim(),
        colorWeatherBg: style.getPropertyValue('--color-weather-banner-bg').trim(),
        radiusCard: style.getPropertyValue('--radius-card').trim(),
        radiusSheet: style.getPropertyValue('--radius-sheet').trim(),
        durationMicro: style.getPropertyValue('--duration-micro').trim(),
        durationMedium: style.getPropertyValue('--duration-medium').trim(),
        durationPage: style.getPropertyValue('--duration-page').trim(),
      };
    });

    function parseDurationMs(val: string): number {
      if (val.endsWith('ms')) return parseFloat(val);
      if (val.endsWith('s')) return parseFloat(val) * 1000;
      return parseFloat(val);
    }

    expect(rootTokens.colorGround.toUpperCase()).toBe('#F8F8F5');
    expect(rootTokens.colorCardBg.toUpperCase()).toBe('#FFFFFF');
    expect(rootTokens.colorCardBorder.toUpperCase()).toBe('#E1E6E0');
    expect(rootTokens.colorInk.toUpperCase()).toBe('#162824');
    expect(rootTokens.colorPrimaryBtn.toUpperCase()).toBe('#16382F');
    expect(rootTokens.colorAccent.toUpperCase()).toBe('#2F6F64');
    expect(rootTokens.colorMapBg.toUpperCase()).toBe('#E9F1E8');
    expect(rootTokens.colorWeatherBg.toUpperCase()).toBe('#E3EFFD');
    expect(rootTokens.radiusCard).toBe('18px');
    expect(rootTokens.radiusSheet).toBe('24px');
    expect(parseDurationMs(rootTokens.durationMicro)).toBeCloseTo(120, 0);
    expect(parseDurationMs(rootTokens.durationMedium)).toBeCloseTo(200, 0);
    expect(parseDurationMs(rootTokens.durationPage)).toBeCloseTo(320, 0);

    // 2. Verify serif font applied on greeting title
    const greetingFont = await page.locator('.greeting-title').evaluate(el => {
      return window.getComputedStyle(el).fontFamily;
    });
    expect(greetingFont.toLowerCase()).toContain('newsreader');

    // 3. Verify tabular numbers applied on time displays
    await page.selectOption('#scene-select', 'rain');
    const timeEl = page.locator('#trip-leave-time, .now-time, .v2-time-value').first();
    if (await timeEl.count() > 0) {
      const numericStyle = await timeEl.evaluate(el => {
        return window.getComputedStyle(el).fontVariantNumeric;
      });
      expect(numericStyle).toContain('tabular-nums');
    }

    // 4. Verify data honesty: no fake ratings or person avatar
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/[★☆]/);
    expect(bodyText).not.toMatch(/\b\d+(\.\d+)?\s*(stars|reviews|ratings)\b/i);
    await expect(page.locator('.conversation-avatar-mark img')).toHaveCount(0); // SVG emblem only
  });

  test('V3 Touch-Target Audit (≥44px at 390x844): verifies all interactive elements meet touch target requirements', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const isMobile = (vp?.width ?? 0) <= 600;

    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Helper to assert touch target size
    async function assertTouchTarget(selector: string, name: string) {
      const locator = page.locator(selector);
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const item = locator.nth(i);
        if (await item.isVisible()) {
          const box = await item.boundingBox();
          expect(box, `${name} (${selector}) [${i}] must have bounding box`).not.toBeNull();
          if (box) {
            expect(
              box.height,
              `${name} (${selector}) [${i}] height (${box.height}px) must be >= 44px`
            ).toBeGreaterThanOrEqual(44);
            expect(
              box.width,
              `${name} (${selector}) [${i}] width (${box.width}px) must be >= 44px`
            ).toBeGreaterThanOrEqual(44);
          }
        }
      }
    }

    // --- Screen 1: Home View ---
    await assertTouchTarget('#ask-bar', 'Ask Bar');
    if (isMobile) {
      await assertTouchTarget('#tab-home', 'Home Tab');
      await assertTouchTarget('#tab-plans', 'Plans Tab');
      await assertTouchTarget('#tab-for-you', 'For You Tab');
      await assertTouchTarget('#tab-me', 'Me Tab');
    }
    await assertTouchTarget('#scene-select', 'Scene Select Dropdown');

    // Switch to Rain scene
    await page.selectOption('#scene-select', 'rain');
    await page.waitForTimeout(200);

    // Detail button / link
    const detailLink = page.locator('#btn-view-trip-details, .v2-view-detail-link').first();
    if (await detailLink.isVisible()) {
      const box = await detailLink.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    // --- Screen 2: Trip Detail View ---
    if (await page.locator('#btn-view-trip-details').isVisible()) {
      await page.locator('#btn-view-trip-details').click();
      await page.waitForSelector('.v2-trip-detail');

      await assertTouchTarget('#trip-detail-back-btn', 'Trip Detail Back Button');
      await assertTouchTarget('#mode-tab-drive', 'Mode Tab Drive');
      await assertTouchTarget('#mode-tab-bus', 'Mode Tab Bus');
      if (await page.locator('#btn-accept').isVisible()) {
        await assertTouchTarget('#btn-accept', 'Accept Plan Button');
      }
      if (await page.locator('#btn-adjust').isVisible()) {
        await assertTouchTarget('#btn-adjust', 'Adjust Plan Button');
      }

      // Return to home
      await page.locator('#trip-detail-back-btn').click();
      await page.waitForSelector('.v2-home-container');
    }

    // --- Screen 3: Away Lunch Restaurant Detail View ---
    await page.selectOption('#scene-select', 'away-lunch');
    await page.waitForTimeout(200);

    const firstCandidate = page.locator('.v2-candidate-card').first();
    await expect(firstCandidate).toBeVisible();
    await firstCandidate.click();
    await page.waitForSelector('.v2-restaurant-detail');

    await assertTouchTarget('#restaurant-detail-back-btn', 'Restaurant Detail Back Button');
    await assertTouchTarget('#btn-restaurant-save', 'Save Restaurant Button');
    await assertTouchTarget('#btn-restaurant-directions', 'Directions Button');

    // Return to home
    await page.locator('#restaurant-detail-back-btn').click();
    await page.waitForSelector('.v2-home-container');

    // --- Screen 4: Conversation Overlay ---
    await page.locator('#ask-bar').click();
    await page.waitForSelector('#conversation-overlay');

    await assertTouchTarget('#conversation-close-btn', 'Conversation Close Button');
    await assertTouchTarget('#conversation-pin-btn', 'Conversation Pin Button');
    await assertTouchTarget('#conversation-input', 'Conversation Input');
    await assertTouchTarget('#conversation-send-btn', 'Conversation Send Button');
    await assertTouchTarget('#btn-toggle-decision-log', 'Decision Log Toggle Button');
    await assertTouchTarget('#btn-export-decision-log', 'Export Decision Log Button');

    // Close conversation
    await page.locator('#conversation-close-btn').click();
    await expect(page.locator('#conversation-overlay')).toHaveCount(0);

    // --- Screen 5: Why Sheet ---
    const whyBtn = page.locator('#btn-why').first();
    if (await whyBtn.isVisible()) {
      await whyBtn.click();
      await page.waitForSelector('#why-sheet-backdrop');
      await page.waitForTimeout(300); // wait for entrance animation to settle to scale(1)

      await assertTouchTarget('#btn-close-why', 'Why Sheet Top Close Button');
      await assertTouchTarget('#btn-why-sheet-done', 'Why Sheet Done Button');

      await page.locator('#btn-close-why').click();
      await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    }
  });

  test('V3 Prefers-Reduced-Motion: transitions collapse to instant swaps, no layout jitter, all content accessible', async ({
    page,
  }) => {
    // Emulate prefers-reduced-motion: reduce
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // 1. Verify durations in CSS collapse to 0.001ms
    const reducedDurations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        micro: style.getPropertyValue('--duration-micro').trim(),
        medium: style.getPropertyValue('--duration-medium').trim(),
        page: style.getPropertyValue('--duration-page').trim(),
      };
    });
    function parseDurationMs(val: string): number {
      if (val.endsWith('ms')) return parseFloat(val);
      if (val.endsWith('s')) return parseFloat(val) * 1000;
      return parseFloat(val);
    }
    expect(parseDurationMs(reducedDurations.micro)).toBeLessThanOrEqual(0.01);
    expect(parseDurationMs(reducedDurations.medium)).toBeLessThanOrEqual(0.01);
    expect(parseDurationMs(reducedDurations.page)).toBeLessThanOrEqual(0.01);

    // 2. Open conversation overlay - opens instantly
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Verify all header and body contents are rendered and accessible
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#conversation-input')).toBeVisible();

    // Close conversation overlay - closes instantly
    await page.locator('#conversation-close-btn').click();
    await expect(overlay).toHaveCount(0);

    // 3. Switch scene and open Why sheet under reduced motion
    await page.selectOption('#scene-select', 'rain');
    const whyBtn = page.locator('#btn-why').first();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toContainText("Why you're seeing this");

    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);

    // Verify axe accessibility under reduced motion
    await checkAxe(page);
  });

  test('V3 Evidence Generation: Rain scenario (Home -> Detail -> Conversation -> Updated Home)', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    // 1. Home View
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'rain');
    await page.waitForTimeout(300);

    await expect(page.locator('.now-card')).toContainText('Piano lesson');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-rain-home-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // 2. Detail View
    const detailLink = page.locator('#btn-view-trip-details');
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await page.waitForSelector('.v2-trip-detail');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-rain-detail-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // Return to Home
    await page.locator('#trip-detail-back-btn').click();
    await page.waitForSelector('.v2-home-container');

    // 3. Conversation View
    await page.locator('#ask-bar').click();
    await page.waitForSelector('#conversation-overlay');
    await page.locator('#conversation-input').fill('Can I leave 15 minutes later?');
    await page.locator('#conversation-send-btn').click();

    // Wait for comparison / confirmation
    await expect(page.locator('.chat-confirm-box, .chat-comparison-box')).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-rain-conversation-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // Confirm the change
    const confirmBtn = page.locator('#btn-chat-confirm, .btn-select-comparison').first();
    await confirmBtn.click();

    // 4. Updated Home View
    await expect(page.locator('#conversation-overlay')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.now-card')).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-rain-updated-home-${vpSuffix}.png`),
    });
    await checkAxe(page);
  });

  test('V3 Evidence Generation: Away Lunch scenario (Home -> Detail -> Conversation -> Updated Home)', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    // 1. Home View
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'away-lunch');
    await page.waitForTimeout(300);

    await expect(page.locator('.now-card')).toContainText('Lunch options near you');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-lunch-home-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // 2. Detail View
    const candidateCard = page.locator('.v2-candidate-card').first();
    await candidateCard.click();
    await page.waitForSelector('.v2-restaurant-detail');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-lunch-detail-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // Return to Home
    await page.locator('#restaurant-detail-back-btn').click();
    await page.waitForSelector('.v2-home-container');

    // 3. Conversation View
    await page.locator('#ask-bar').click();
    await page.waitForSelector('#conversation-overlay');
    await page.locator('#conversation-input').fill('Find a quieter place with vegetarian options');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-lunch-conversation-${vpSuffix}.png`),
    });
    await checkAxe(page);

    // Send query -> auto-collapses back to updated Home with re-ranked lunch
    await page.locator('#conversation-send-btn').click();

    // 4. Updated Home View
    await expect(page.locator('#conversation-overlay')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.v2-candidate-card').first()).toContainText('Demo Place B · Salad');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v3-lunch-updated-home-${vpSuffix}.png`),
    });
    await checkAxe(page);
  });
});
