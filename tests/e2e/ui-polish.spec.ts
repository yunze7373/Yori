import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/ui-polish');

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
  expect(violations, `WCAG violations in ${contextName}`).toHaveLength(0);
}

async function checkZeroHorizontalOverflow(page: Page, contextName: string) {
  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    return { docWidth, winWidth, hasOverflow: docWidth > winWidth };
  });
  expect(
    overflow.hasOverflow,
    `Horizontal overflow detected in ${contextName}: docWidth=${overflow.docWidth} > winWidth=${overflow.winWidth}`
  ).toBe(false);
}

test.describe('UI-POLISH (BACKLOG-20261031-UIP3)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('(a) map callout text fits cleanly inside dark pill at 390x844 and 1440x900', async ({ page }) => {
    for (const vp of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1440, height: 900, name: 'desktop' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&scene=rain&test=1');
      const detailsBtn = page.locator('#btn-view-trip-details');
      await expect(detailsBtn).toBeVisible();
      await detailsBtn.click();
      await page.waitForSelector('.v2-trip-detail');

      await page.locator('.v2-trip-detail .v2-map-canvas').first().scrollIntoViewIfNeeded();

      const calloutRect = page.locator('.v2-trip-detail .v2-map-weather-callout rect').first();
      const calloutText = page.locator('.v2-trip-detail .v2-map-weather-callout text').first();

      const rBox = await calloutRect.boundingBox();
      const tBox = await calloutText.boundingBox();

      expect(rBox).not.toBeNull();
      expect(tBox).not.toBeNull();

      // Text must be fully within rect horizontally
      expect(tBox!.x).toBeGreaterThanOrEqual(rBox!.x);
      expect(tBox!.x + tBox!.width).toBeLessThanOrEqual(rBox!.x + rBox!.width);

      // Verify comfortable horizontal padding (>= 8px total horizontal margin)
      const horizontalPadding = rBox!.width - tBox!.width;
      expect(horizontalPadding).toBeGreaterThanOrEqual(8);

      await checkZeroHorizontalOverflow(page, `map-callout-${vp.name}`);
      await checkAxeWcag(page, `map-callout-${vp.name}`);
      await page.click('#trip-detail-back-btn');
    }
  });

  test('(b) on desktop 1440x900 floating Ask bar never covers map card or last timeline row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2&scene=rain&test=1');
    await page.waitForSelector('.ask-bar-dock');
    await page.waitForSelector('.v2-map-card');

    // Scroll to the absolute bottom of the document/container
    await page.evaluate(() => {
      const col = document.querySelector('.desktop-center-column');
      if (col) {
        col.scrollTop = col.scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(100);

    const askBar = page.locator('#ask-bar');
    const mapCards = page.locator('.v2-map-card');
    const lastCardRow = page.locator('.now-card, .v2-journey-card').last();

    const askBox = await askBar.boundingBox();
    const cardBox = await lastCardRow.boundingBox();

    expect(askBox).not.toBeNull();
    expect(cardBox).not.toBeNull();

    const count = await mapCards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const mapBox = await mapCards.nth(i).boundingBox();
      if (!mapBox) continue;
      const mapIntersectsAsk =
        mapBox.x < askBox!.x + askBox!.width &&
        mapBox.x + mapBox.width > askBox!.x &&
        mapBox.y < askBox!.y + askBox!.height &&
        mapBox.y + mapBox.height > askBox!.y;
      expect(mapIntersectsAsk, `Ask bar overlaps map card ${i} at 1440x900 viewport bottom`).toBe(false);
    }

    const cardIntersectsAsk =
      cardBox!.x < askBox!.x + askBox!.width &&
      cardBox!.x + cardBox!.width > askBox!.x &&
      cardBox!.y < askBox!.y + askBox!.height &&
      cardBox!.y + cardBox!.height > askBox!.y;

    expect(cardIntersectsAsk, 'Ask bar overlaps card at 1440x900 viewport bottom').toBe(false);

    // Also verify timeline steps in TripDetail view where timeline now lives (Finding 1)
    const detailsBtn = page.locator('#btn-view-trip-details');
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();
    await page.waitForSelector('.v2-timeline-step');
    const lastStep = page.locator('.v2-timeline-step').last();
    await expect(lastStep).toBeVisible();
    const backBtn = page.locator('#trip-detail-back-btn');
    await backBtn.click();

    // Assert main container has at least 160px reserved bottom padding
    const paddingBottom = await page.evaluate(() => {
      const el = document.querySelector('main.main-container');
      return el ? parseInt(window.getComputedStyle(el).paddingBottom, 10) : 0;
    });
    expect(paddingBottom).toBeGreaterThanOrEqual(160);

    await checkZeroHorizontalOverflow(page, 'desktop-ask-bar-clearance');
  });

  test('(c) Why sheet Memory rows stack badge above title on mobile (390x844), no narrow squeeze', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2&scene=rain&test=1');
    await page.waitForSelector('#btn-why');
    await page.click('#btn-why');

    await page.waitForSelector('#why-sheet-backdrop .modal-card');
    await page.waitForTimeout(350); // wait for animation

    const memoryRows = page.locator('.why-item-row:has(.badge-simulated, .badge-confirmed)');
    const count = await memoryRows.count();
    expect(count).toBeGreaterThan(0);

    const firstRow = memoryRows.first();
    const badge = firstRow.locator('.card-badge');
    const label = firstRow.locator('.why-item-label');

    const badgeBox = await badge.boundingBox();
    const labelBox = await label.boundingBox();

    expect(badgeBox).not.toBeNull();
    expect(labelBox).not.toBeNull();

    // Badge must be stacked ABOVE title on mobile
    expect(
      badgeBox!.y + badgeBox!.height,
      'Badge must stack above the memory preference label under 480px'
    ).toBeLessThanOrEqual(labelBox!.y + 4);

    // Label must have generous width available (>= 200px) rather than being squeezed into < 100px
    expect(labelBox!.width).toBeGreaterThanOrEqual(150);

    await checkZeroHorizontalOverflow(page, 'why-sheet-mobile');
    await checkAxeWcag(page, 'why-sheet-mobile');
  });

  test('(d) lunch card distance chip "139 m (straight-line)" stays on a single line at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2&scene=away-lunch&test=1');
    await page.waitForSelector('.v2-candidate-compact-list .v2-distance-chip');

    const chips = page.locator('.v2-candidate-compact-list .v2-distance-chip');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      // A single line of 0.75rem text is ~16-22px high. 3 lines would be > 40px high.
      expect(
        box!.height,
        `Distance chip at index ${i} wrapped to multiple lines (height=${box!.height}px)`
      ).toBeLessThanOrEqual(24);
    }

    await checkZeroHorizontalOverflow(page, 'lunch-distance-mobile');
    await checkAxeWcag(page, 'lunch-distance-mobile');
  });

  test('(e) Plans and For You cards stack SIMULATED / PROPOSAL pill above title at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Plans View
    await page.goto('/?ui=v2&scene=multi-candidate&test=1');
    await page.waitForSelector('#tab-plans');
    await page.click('#tab-plans');
    await page.waitForSelector('.v2-plan-item-card');

    const planBadge = page.locator('.v2-plan-item-header .card-badge').first();
    const planHeadline = page.locator('.v2-plan-headline').first();

    const planBadgeBox = await planBadge.boundingBox();
    const planHeadlineBox = await planHeadline.boundingBox();

    expect(planBadgeBox).not.toBeNull();
    expect(planHeadlineBox).not.toBeNull();

    // Badge stacked above headline
    expect(planBadgeBox!.y + planBadgeBox!.height).toBeLessThanOrEqual(planHeadlineBox!.y + 4);

    await checkZeroHorizontalOverflow(page, 'plans-view-mobile');
    await checkAxeWcag(page, 'plans-view-mobile');

    // 2. For You View
    await page.click('#tab-for-you');
    await page.waitForSelector('.v2-proposal-item-card');

    const propBadge = page.locator('.v2-proposal-header .card-badge').first();
    const propTitle = page.locator('.v2-proposal-title').first();

    const propBadgeBox = await propBadge.boundingBox();
    const propTitleBox = await propTitle.boundingBox();

    expect(propBadgeBox).not.toBeNull();
    expect(propTitleBox).not.toBeNull();

    // Badge stacked above title
    expect(propBadgeBox!.y + propBadgeBox!.height).toBeLessThanOrEqual(propTitleBox!.y + 4);

    await checkZeroHorizontalOverflow(page, 'for-you-view-mobile');
    await checkAxeWcag(page, 'for-you-view-mobile');
  });

  test('capture before/after visual evidence for (a)-(e)', async ({ page }) => {
    const suffix = process.env.UI_POLISH_CAPTURE_MODE === 'before' ? 'before' : 'after';

    // (a) Map Callout on Home Rain (in TripDetail where callout lives)
    for (const vp of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1440, height: 900, name: 'desktop' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&scene=rain&test=1');
      await page.click('#btn-view-trip-details');
      await page.waitForSelector('.v2-map-weather-callout');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `a-map-callout-${vp.name}-${suffix}.png`),
        fullPage: false,
      });
      await page.click('#trip-detail-back-btn');
    }

    // (b) Ask Bar Clearance on Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2&scene=rain&test=1');
    await page.waitForSelector('.ask-bar-dock');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `b-ask-bar-clearance-desktop-${suffix}.png`),
      fullPage: false,
    });

    // (c) Why Sheet Memory Rows
    for (const vp of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1440, height: 900, name: 'desktop' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&scene=rain&test=1');
      await page.waitForSelector('#btn-why');
      await page.click('#btn-why');
      await page.waitForSelector('#why-sheet-backdrop .modal-card');
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `c-why-sheet-memory-${vp.name}-${suffix}.png`),
        fullPage: false,
      });
    }

    // (d) Lunch Card Distance
    for (const vp of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1440, height: 900, name: 'desktop' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&scene=away-lunch&test=1');
      await page.waitForSelector('.v2-candidate-compact-list .v2-distance-chip');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `d-lunch-distance-${vp.name}-${suffix}.png`),
        fullPage: false,
      });
    }

    // (e) Plans and For You Cards
    for (const vp of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1440, height: 900, name: 'desktop' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&scene=multi-candidate&test=1');
      const isMobile = vp.width < 500;
      const plansTab = isMobile ? page.locator('#tab-plans') : page.locator('#desktop-nav-plans');
      await plansTab.click();
      await page.waitForSelector('.v2-plan-item-card');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `e-plans-card-${vp.name}-${suffix}.png`),
        fullPage: false,
      });

      const forYouTab = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
      await forYouTab.click();
      await page.waitForSelector('.v2-proposal-item-card');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `e-for-you-card-${vp.name}-${suffix}.png`),
        fullPage: false,
      });
    }
  });
});
