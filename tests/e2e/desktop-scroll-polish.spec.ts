import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('desktop-scroll-polish');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.afterAll(() => {
  if (fs.existsSync(EVIDENCE_DIR)) {
    const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.png'));
    if (files.length > 0) {
      const lines = files
        .sort()
        .map(file => {
          const content = fs.readFileSync(path.join(EVIDENCE_DIR, file));
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          return `${hash}  ${file}`;
        });
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'MANIFEST.sha256'), lines.join('\n') + '\n');
    }
  }
});

async function saveEvidence(page: Page, filename: string): Promise<void> {
  if (shouldUpdateEvidence) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: false,
    });
  }
}

async function checkAxe(page: Page, context = 'page'): Promise<void> {
  const rules = ['color-contrast', 'button-name', 'heading-order', 'label', 'region'];
  const axeResults = await new AxeBuilder({ page })
    .withRules(rules)
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('DESKTOP-SCROLL-POLISH: Acceptance (a) - Three-Zone Shell Pinning & Divider Containment', () => {
  const viewports = [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];

  const homeScenes = ['clear', 'rain', 'away-lunch', 'multi-candidate'];

  for (const vp of viewports) {
    for (const scene of homeScenes) {
      test(`Shell stays pinned at ${vp.width}x${vp.height} scene ${scene} after wheel-scrolling to bottom`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.goto('/?ui=v2');
        await page.waitForSelector('.app-layout[data-ui-version="v2"]');
        await selectDemoScene(page, scene);
        await page.waitForTimeout(150);

        // Verify initial state
        const leftNav = page.locator('.desktop-left-nav');
        const rightPanel = page.locator('#desktop-right-panel');
        const centerColumn = page.locator('.desktop-center-column');

        await expect(leftNav).toBeVisible();
        await expect(rightPanel).toBeVisible();
        await expect(centerColumn).toBeVisible();

        // Perform mouse wheel scroll over center column and scroll to bottom
        const centerBox = await centerColumn.boundingBox();
        expect(centerBox).not.toBeNull();
        await page.mouse.move(centerBox!.x + centerBox!.width / 2, centerBox!.y + centerBox!.height / 2);
        await page.mouse.wheel(0, 3000);
        await centerColumn.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(150);

        // Also test wheel scroll at (100, 100) inside left nav column
        await page.mouse.move(100, 100);
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(100);

        // (1) Window outer scroll MUST be strictly 0
        const windowScrollY = await page.evaluate(() => window.scrollY);
        expect(windowScrollY).toBe(0);

        // (2) All 6 left-nav items stay visible (each top >= 0, bottom <= viewportHeight)
        const navItems = [
          '#desktop-nav-home',
          '#desktop-nav-plans',
          '#desktop-nav-for-you',
          '#desktop-nav-connectors',
          '#desktop-nav-me',
          '#desktop-nav-settings',
        ];

        for (const selector of navItems) {
          const item = page.locator(selector);
          await expect(item).toBeVisible();
          const box = await item.boundingBox();
          expect(box, `Bounding box for ${selector}`).not.toBeNull();
          expect(box!.y, `Top of ${selector}`).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height, `Bottom of ${selector}`).toBeLessThanOrEqual(vp.height);
        }

        // (3) Left-nav divider and background span full viewport height
        const navBox = await leftNav.boundingBox();
        expect(navBox).not.toBeNull();
        expect(navBox!.x).toBe(0);
        expect(navBox!.width).toBe(240);
        expect(navBox!.y).toBe(0);
        expect(navBox!.height).toBe(vp.height);

        // (4) Right panel stays in view, spans full viewport height
        const panelBox = await rightPanel.boundingBox();
        expect(panelBox).not.toBeNull();
        expect(panelBox!.x).toBe(vp.width - 380);
        expect(panelBox!.width).toBe(380);
        expect(panelBox!.y).toBe(0);
        expect(panelBox!.height).toBe(vp.height);

        // (5) No center content crosses the dividers
        const centerCards = page.locator('.desktop-center-column .card, .desktop-center-column .main-container');
        const cardCount = await centerCards.count();
        expect(cardCount).toBeGreaterThan(0);

        for (let i = 0; i < cardCount; i++) {
          const card = centerCards.nth(i);
          if (await card.isVisible()) {
            const b = await card.boundingBox();
            if (b && b.width > 0 && b.height > 0) {
              expect(b.x, `Card ${i} left edge relative to left-nav divider`).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);
              expect(b.x + b.width, `Card ${i} right edge relative to right-panel divider`).toBeLessThanOrEqual(panelBox!.x + 1);
            }
          }
        }

        // (6) Axe accessibility check
        await checkAxe(page, `shell-${scene}-${vp.width}x${vp.height}`);

        // (7) Save evidence
        await saveEvidence(page, `after-demo-${scene}-${vp.width}x${vp.height}.png`);
      });
    }

    test(`Shell stays pinned at ${vp.width}x${vp.height} For You tab after wheel-scrolling`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/?ui=v2&tab=for-you');
      await page.waitForSelector('.app-layout[data-ui-version="v2"]');
      await page.waitForTimeout(150);

      const leftNav = page.locator('.desktop-left-nav');
      const rightPanel = page.locator('#desktop-right-panel');
      const centerColumn = page.locator('.desktop-center-column');

      await expect(leftNav).toBeVisible();
      await expect(rightPanel).toBeVisible();
      await expect(centerColumn).toBeVisible();

      // Wheel scroll over center column
      const centerBox = await centerColumn.boundingBox();
      expect(centerBox).not.toBeNull();
      await page.mouse.move(centerBox!.x + centerBox!.width / 2, centerBox!.y + centerBox!.height / 2);
      await page.mouse.wheel(0, 3000);
      await centerColumn.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
      await page.waitForTimeout(150);

      const windowScrollY = await page.evaluate(() => window.scrollY);
      expect(windowScrollY).toBe(0);

      const navItems = [
        '#desktop-nav-home',
        '#desktop-nav-plans',
        '#desktop-nav-for-you',
        '#desktop-nav-connectors',
        '#desktop-nav-me',
        '#desktop-nav-settings',
      ];

      for (const selector of navItems) {
        const item = page.locator(selector);
        await expect(item).toBeVisible();
        const box = await item.boundingBox();
        expect(box, `Bounding box for ${selector}`).not.toBeNull();
        expect(box!.y, `Top of ${selector}`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `Bottom of ${selector}`).toBeLessThanOrEqual(vp.height);
      }

      const navBox = await leftNav.boundingBox();
      const panelBox = await rightPanel.boundingBox();
      expect(navBox!.height).toBe(vp.height);
      expect(panelBox!.height).toBe(vp.height);

      const centerCards = page.locator('.desktop-center-column .card, .desktop-center-column .main-container');
      const cardCount = await centerCards.count();
      for (let i = 0; i < cardCount; i++) {
        const card = centerCards.nth(i);
        if (await card.isVisible()) {
          const b = await card.boundingBox();
          if (b && b.width > 0 && b.height > 0) {
            expect(b.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);
            expect(b.x + b.width).toBeLessThanOrEqual(panelBox!.x + 1);
          }
        }
      }

      await checkAxe(page, `shell-for-you-${vp.width}x${vp.height}`);
      await saveEvidence(page, `after-for-you-${vp.width}x${vp.height}.png`);
    });
  }
});

test.describe('DESKTOP-SCROLL-POLISH: Acceptance (b) - Rain NOW Card Chip Row', () => {
  const rainViewports = [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ];

  for (const vp of rainViewports) {
    test(`Rain chip row copy, separator, and wrapping at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/?ui=v2');
      await page.waitForSelector('.app-layout[data-ui-version="v2"]');
      await selectDemoScene(page, 'rain');
      await page.waitForTimeout(150);

      const rationaleLine = page.locator('.now-rationale-line');
      await expect(rationaleLine).toBeVisible();

      // (1) Umbrella chip is visible and contains verbatim 'Umbrella'
      const umbrellaChip = rationaleLine.locator('#chip-umbrella');
      await expect(umbrellaChip).toBeVisible();
      await expect(umbrellaChip).toContainText('Umbrella');

      // (2) No duplicated "Umbrella needed" in rationale line
      const rationaleText = await rationaleLine.innerText();
      const occurrences = (rationaleText.match(/Umbrella needed/gi) || []).length;
      expect(occurrences, 'Occurrences of "Umbrella needed"').toBe(0);

      // (3) Mode badge contains separator and mode together on one line (no orphan separator)
      const modeBadge = rationaleLine.locator('.v2-active-mode-badge');
      await expect(modeBadge).toBeVisible();
      const badgeText = await modeBadge.innerText();
      expect(badgeText).toMatch(/·\s*(Drive|Bus)/);

      const badgeBox = await modeBadge.boundingBox();
      expect(badgeBox).not.toBeNull();
      expect(badgeBox!.height, 'Mode badge line height').toBeLessThan(32);

      // (4) At 390x844: no item wraps to >=3 lines (line height must be < 55px, typically ~20-40px)
      if (vp.width === 390) {
        const lineBox = await rationaleLine.boundingBox();
        expect(lineBox).not.toBeNull();
        expect(lineBox!.height, 'Rationale line height at 390px').toBeLessThan(55);

        // No horizontal scroll
        await checkNoOverflow(page);
      }

      await checkAxe(page, `rain-chip-row-${vp.width}x${vp.height}`);
      await saveEvidence(page, `after-demo-rain-${vp.width}x${vp.height}.png`);
    });
  }
});

test.describe('DESKTOP-SCROLL-POLISH: Acceptance (c) - Desktop Right Panel Thumbnails & Heading', () => {
  test('Places section heading is not ellipsized and thumbnails have no clipped text at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await selectDemoScene(page, 'away-lunch');
    await page.waitForTimeout(150);

    const rightPanel = page.locator('#desktop-right-panel');
    await expect(rightPanel).toBeVisible();

    // (1) Places heading is not ellipsized (scrollWidth <= clientWidth + 1)
    const sectionHeader = rightPanel.locator('.desktop-panel-places-header .section-label');
    await expect(sectionHeader).toBeVisible();
    const headingMeasures = await sectionHeader.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      headingMeasures.scrollWidth,
      `Places heading scrollWidth (${headingMeasures.scrollWidth}) <= clientWidth (${headingMeasures.clientWidth}) + 1`
    ).toBeLessThanOrEqual(headingMeasures.clientWidth + 1);

    // (2) Right-panel thumbnails show no clipped badge text
    const thumbnails = rightPanel.locator('.desktop-candidate-art');
    const thumbCount = await thumbnails.count();
    expect(thumbCount).toBeGreaterThan(0);

    for (let i = 0; i < thumbCount; i++) {
      const thumb = thumbnails.nth(i);
      const illustrationBadge = thumb.locator('.desktop-illustration-badge');
      await expect(illustrationBadge).toBeHidden();

      // Thumb innerText should not contain partial words like "stration" or "ulated"
      const text = await thumb.innerText();
      expect(text.trim()).toBe('');
    }

    await checkAxe(page, 'desktop-right-panel-away-lunch-1280x800');
    await saveEvidence(page, 'after-demo-away-lunch-1280x800.png');
  });

  test('Away-lunch mobile view at 390x844 has no horizontal overflow and passes axe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await selectDemoScene(page, 'away-lunch');
    await page.waitForTimeout(150);

    await checkNoOverflow(page);
    await checkAxe(page, 'away-lunch-390x844');
    await saveEvidence(page, 'after-demo-away-lunch-390x844.png');
  });
});
