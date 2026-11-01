import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';
import { derivePlanCountdown } from '../../src/ui/view-models/home-vm.js';

const EVIDENCE_DIR = getEvidenceDir('desktop-parity-1');

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

test.describe('DESKTOP-PARITY-1: Desktop Parity with Owner Reference Dashboard', () => {
  test('Greeting Row (>=1024px) renders truthful connector states and eliminates top whitespace', async ({
    page,
  }) => {
    // Exact reference viewport: 1586 x 992
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // 1. Greeting Row visible
    const greetingRow = page.locator('.desktop-greeting-row');
    await expect(greetingRow).toBeVisible();

    // 2. Greeting Title and Subtitle
    await expect(page.locator('#desktop-greeting-title')).toHaveText(/Good (morning|afternoon|evening)\.?/);
    await expect(page.locator('.desktop-greeting-sub')).toContainText("I've already looked ahead for you.");

    // 3. Status strip with 5 chips
    const strip = page.locator('#desktop-connector-strip');
    await expect(strip).toBeVisible();

    const locationChip = page.locator('#chip-status-location');
    await expect(locationChip).toBeVisible();
    await expect(locationChip).toContainText('Location');

    const calendarChip = page.locator('#chip-status-calendar');
    await expect(calendarChip).toBeVisible();
    await expect(calendarChip).toContainText('Calendar');
    await expect(calendarChip).toContainText('N/A'); // Truthful: no calendar provider configured

    const weatherChip = page.locator('#chip-status-weather');
    await expect(weatherChip).toBeVisible();
    await expect(weatherChip).toContainText('Weather');

    const xmemoChip = page.locator('#chip-status-xmemo');
    await expect(xmemoChip).toBeVisible();
    await expect(xmemoChip).toContainText('XMemo');

    const alertsChip = page.locator('#chip-status-alerts');
    await expect(alertsChip).toBeVisible();
    await expect(alertsChip).toContainText('Alerts');

    // 4. Header controls: Pill status, dev demo controls, header avatar
    await expect(page.locator('#pill-context-status')).toBeVisible();
    await expect(page.locator('#btn-dev-demo-controls')).toBeVisible();
    await expect(page.locator('#btn-header-avatar')).toBeVisible();

    await checkNoOverflow(page);
    await checkAxe(page, 'Desktop Greeting Row at 1586x992');
  });

  test('Hero Card renders THOUGHT AHEAD FOR YOU badge, transit mode icon, 4 signal tiles, and actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Hero Card presence
    const heroCard = page.locator('.now-card');
    await expect(heroCard).toBeVisible();

    // Top Badge
    const thoughtBadge = heroCard.locator('.hero-thought-badge');
    await expect(thoughtBadge).toBeVisible();
    await expect(thoughtBadge).toContainText('THOUGHT AHEAD FOR YOU');

    // Headline
    const headline = heroCard.locator('#now-title');
    await expect(headline).toBeVisible();

    // One-sentence rationale
    const rationale = heroCard.locator('.now-rationale-line');
    await expect(rationale).toBeVisible();

    // 4 Signal Tiles Grid
    const signalsGrid = heroCard.locator('#hero-signals-grid');
    await expect(signalsGrid).toBeVisible();

    const weatherTile = heroCard.locator('#signal-tile-weather');
    await expect(weatherTile).toBeVisible();
    await expect(weatherTile).toContainText('WEATHER', { ignoreCase: true });

    const calTile = heroCard.locator('#signal-tile-calendar');
    await expect(calTile).toBeVisible();
    await expect(calTile).toContainText('CALENDAR', { ignoreCase: true });

    const transitTile = heroCard.locator('#signal-tile-transit');
    await expect(transitTile).toBeVisible();
    await expect(transitTile).toContainText('TRANSIT', { ignoreCase: true });

    const memoryTile = heroCard.locator('#signal-tile-memory');
    await expect(memoryTile).toBeVisible();
    await expect(memoryTile).toContainText('MEMORY', { ignoreCase: true });

    // Action buttons
    await expect(heroCard.locator('#btn-accept')).toBeVisible();
    await expect(heroCard.locator('#btn-adjust')).toBeVisible();
    await expect(heroCard.locator('#btn-dismiss')).toBeVisible();
    await expect(heroCard.locator('#btn-view-trip-details')).toBeVisible();
    await expect(heroCard.locator('#btn-why')).toBeVisible();

    await checkAxe(page, 'Hero Card at 1586x992');
  });

  test('Sectioned Feed below Hero: Now countdown, Ahead 2-col grid, and For You proposal card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const feed = page.locator('#v2-sectioned-feed');
    await expect(feed).toBeVisible();

    // Section 1: Now
    const nowSection = feed.locator('#feed-section-now');
    await expect(nowSection).toBeVisible();
    await expect(nowSection.locator('.feed-section-title')).toContainText('Now');
    await expect(nowSection.locator('.feed-countdown-pill')).toBeVisible();
    await expect(nowSection.locator('.feed-now-card')).toBeVisible();

    // Section 2: Ahead
    const aheadSection = feed.locator('#feed-section-ahead');
    await expect(aheadSection).toBeVisible();
    await expect(aheadSection.locator('.feed-section-title')).toContainText('Ahead', { ignoreCase: true });
    await expect(aheadSection.locator('#link-ahead-see-all')).toBeVisible();
    await expect(aheadSection.locator('.feed-ahead-grid')).toBeVisible();
    const aheadCards = aheadSection.locator('.ahead-card');
    await expect(aheadCards.first()).toBeVisible();

    // Section 3: For You
    const forYouSection = feed.locator('#feed-section-foryou');
    await expect(forYouSection).toBeVisible();
    await expect(forYouSection.locator('.feed-section-title')).toContainText('For You', { ignoreCase: true });
    await expect(forYouSection.locator('#link-foryou-see-all')).toBeVisible();
    const proposalCard = forYouSection.locator('.proposal-card');
    await expect(proposalCard).toBeVisible();
    if (await proposalCard.locator('.btn-confirm-proposal').count() > 0) {
      await expect(proposalCard.locator('.btn-confirm-proposal')).toBeVisible();
      await expect(proposalCard.locator('.btn-reject-proposal')).toBeVisible();
    }

    await checkAxe(page, 'Sectioned Feed at 1586x992');
  });

  test('Desktop Right Panel: Trip Details, Destination Weather, and Lunch Recommendations in reference style', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const rightPanel = page.locator('#desktop-right-panel');
    await expect(rightPanel).toBeVisible();

    // Trip Details Header & Map
    await expect(rightPanel.locator('.desktop-section-title').first()).toContainText('Trip Details');
    await expect(rightPanel.locator('.desktop-status-pill').first()).toContainText('On time');
    await expect(rightPanel.locator('.desktop-map-card')).toBeVisible();

    // Stat Cells Grid (LEAVE BY and ARRIVE BY derived truthfully)
    const statsGrid = rightPanel.locator('.trip-stats-grid');
    await expect(statsGrid).toBeVisible();
    await expect(statsGrid).toContainText('LEAVE BY');
    await expect(statsGrid).toContainText('ARRIVE BY');

    // Destination Weather Card
    const weatherCard = rightPanel.locator('.desktop-weather-card');
    await expect(weatherCard).toBeVisible();
    await expect(weatherCard).toContainText('Destination Weather');
    await expect(weatherCard.locator('.card-badge')).toContainText('SIMULATED');

    // Switch to away-lunch to verify Lunch Recommendations Section in right panel
    await selectDemoScene(page, 'away-lunch');
    await page.waitForTimeout(100);

    // Nearby Lunch Recommendations Section (in away-lunch scene)
    const placesSection = rightPanel.locator('.desktop-panel-section[data-panel-type="places"]');
    await expect(placesSection).toBeVisible();
    await expect(placesSection).toContainText('Nearby Options & Walking Times');
    await expect(placesSection.locator('.desktop-candidate-tile').first()).toBeVisible();

    // Candidate details check: name, walk time, cuisine chip, sparkle rationale
    const firstCandidate = placesSection.locator('.desktop-candidate-tile').first();
    await expect(firstCandidate.locator('.desktop-candidate-title')).toBeVisible();
    await expect(firstCandidate.locator('.desktop-candidate-dist')).toBeVisible();
    await expect(firstCandidate.locator('.sparkle-icon')).toBeVisible();
    await expect(firstCandidate.locator('.desktop-candidate-basis')).toBeVisible();

    await checkAxe(page, 'Right Panel at 1586x992');
  });

  test('Geometry & Bounding Box Non-Intersection: Strip does not overlap heading/subheading, and center content is not under nav', async ({
    page,
  }) => {
    const viewports = [
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1586, height: 992 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?ui=v2&dev=1');
      await page.waitForSelector('.app-layout[data-ui-version="v2"]');

      // Test before and after opening/closing demo controls to guarantee no horizontal scroll
      await selectDemoScene(page, 'rain');
      await page.waitForTimeout(100);

      const centerColumn = page.locator('.desktop-center-column');
      const scrollLeft = await centerColumn.evaluate(el => el.scrollLeft);
      expect(scrollLeft, `scrollLeft must be 0 at width ${vp.width}`).toBe(0);

      const navBox = await page.locator('.desktop-left-nav').boundingBox();
      const mainBox = await page.locator('.desktop-center-column .main-container').first().boundingBox();
      expect(navBox).not.toBeNull();
      expect(mainBox).not.toBeNull();

      // Center container must not sit under left nav
      expect(
        mainBox!.x,
        `center container x (${mainBox!.x}) must be >= nav right (${navBox!.x + navBox!.width}) at ${vp.width}`
      ).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);

      // Check heading, subtitle, and connector strip vertical bounding boxes
      const headingBox = await page.locator('#desktop-greeting-title').boundingBox();
      const subBox = await page.locator('.desktop-greeting-sub').boundingBox();
      const stripBox = await page.locator('#desktop-connector-strip').boundingBox();

      expect(headingBox).not.toBeNull();
      expect(subBox).not.toBeNull();
      expect(stripBox).not.toBeNull();

      // Heading must be above strip
      expect(
        headingBox!.y + headingBox!.height,
        `Heading bottom (${headingBox!.y + headingBox!.height}) must be <= strip top (${stripBox!.y}) at ${vp.width}`
      ).toBeLessThanOrEqual(stripBox!.y + 1);

      // Subtitle must be above strip
      expect(
        subBox!.y + subBox!.height,
        `Subtitle bottom (${subBox!.y + subBox!.height}) must be <= strip top (${stripBox!.y}) at ${vp.width}`
      ).toBeLessThanOrEqual(stripBox!.y + 1);

      await checkNoOverflow(page);
    }
  });

  test('390px Mobile Viewport: Hides desktop connector strip & panels, displays mobile bottom bar, zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Desktop connector strip hidden on mobile
    await expect(page.locator('#desktop-connector-strip')).toBeHidden();

    // Desktop sidebar and right panel hidden
    await expect(page.locator('.desktop-left-nav')).toBeHidden();
    await expect(page.locator('.desktop-right-panel')).toBeHidden();

    // Mobile bottom tab bar visible
    await expect(page.locator('.bottom-tab-bar')).toBeVisible();

    // Hero and sectioned feed adapt cleanly to single column
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('#v2-sectioned-feed')).toBeVisible();

    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile Viewport 390x844');
  });

  test('Matrix: Viewports (1586x992, 1440x900, 1280x800, 390x844) x Views (clear, rain, away-lunch, multi-candidate, for-you)', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const viewports = [
      { name: 'ref-1586x992', width: 1586, height: 992 },
      { name: 'wide-1440x900', width: 1440, height: 900 },
      { name: 'std-1280x800', width: 1280, height: 800 },
      { name: 'mob-390x844', width: 390, height: 844 },
    ];

    const views = ['clear', 'rain', 'away-lunch', 'multi-candidate', 'for-you'];
    const hashes = new Map<string, string>();

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const view of views) {
        if (view === 'for-you') {
          await page.goto('/?ui=v2&tab=for-you&dev=1');
          await page.waitForSelector('.app-layout[data-ui-version="v2"]');
          await page.waitForSelector('.v2-for-you-view');
        } else {
          await page.goto('/?ui=v2&dev=1');
          await page.waitForSelector('.app-layout[data-ui-version="v2"]');
          await selectDemoScene(page, view);

          if (view === 'clear') {
            await expect(page.locator('#now-title')).toContainText('leave by 2:25 PM');
          } else if (view === 'rain') {
            await expect(page.locator('#now-title')).toContainText('leave by 2:30 PM');
            await expect(page.locator('.now-card #chip-umbrella')).toBeVisible();
          } else if (view === 'away-lunch') {
            await expect(page.locator('.v2-candidates-hero, .now-card')).toBeVisible();
          } else if (view === 'multi-candidate') {
            await expect(page.locator('.v2-candidates-hero, .now-card')).toBeVisible();
          }
        }

        await checkNoOverflow(page);

        const filename = `parity-${view}-${vp.name}.png`;
        const filepath = path.join(EVIDENCE_DIR, filename);
        await page.screenshot({ path: filepath, fullPage: false });
        const content = fs.readFileSync(filepath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        hashes.set(filename, hash);
      }
    }

    // Assert that every screenshot in the matrix has a distinct SHA-256 hash
    const hashValues = Array.from(hashes.values());
    const uniqueHashes = new Set(hashValues);
    expect(
      uniqueHashes.size,
      `All ${hashValues.length} screenshot hashes must be distinct! Duplicate detected: ${hashValues.length - uniqueHashes.size} duplicates.`
    ).toBe(hashValues.length);
  });

  test('Side-by-side composite: Owner Reference vs Yori App Rain Scene (1586x992)', async ({
    page,
  }) => {
    const refPath = path.join(os.homedir(), 'Downloads', 'Yori Proactive AI Dashboard.png');
    const appRainPath = path.join(EVIDENCE_DIR, 'parity-rain-ref-1586x992.png');

    // First ensure app rain screenshot exists
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await selectDemoScene(page, 'rain');
    await page.waitForSelector('.now-card #chip-umbrella');
    await page.screenshot({ path: appRainPath, fullPage: false });

    if (fs.existsSync(refPath) && fs.existsSync(appRainPath)) {
      const refBase64 = fs.readFileSync(refPath).toString('base64');
      const appBase64 = fs.readFileSync(appRainPath).toString('base64');

      // Use page to composite onto a 3172x1032 canvas with labels
      const compositeBase64 = await page.evaluate(
        async ({ refData, appData }) => {
          const loadImg = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
            });

          const [imgRef, imgApp] = await Promise.all([
            loadImg(`data:image/png;base64,${refData}`),
            loadImg(`data:image/png;base64,${appData}`),
          ]);

          const canvas = document.createElement('canvas');
          canvas.width = 3172;
          canvas.height = 1032;
          const ctx = canvas.getContext('2d')!;

          // Dark banner header
          ctx.fillStyle = '#162824';
          ctx.fillRect(0, 0, 3172, 40);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 16px system-ui, sans-serif';
          ctx.fillText('Reference Design (1586x992)', 24, 26);
          ctx.fillText('Yori Implementation — Rain Scene (1586x992)', 1586 + 24, 26);

          // Divider line
          ctx.strokeStyle = '#3D5A50';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(1586, 0);
          ctx.lineTo(1586, 1032);
          ctx.stroke();

          // Draw images below header
          ctx.drawImage(imgRef, 0, 40, 1586, 992);
          ctx.drawImage(imgApp, 1586, 40, 1586, 992);

          return canvas.toDataURL('image/png').split(',')[1];
        },
        { refData: refBase64, appData: appBase64 }
      );

      if (compositeBase64) {
        const gitignoredDir = path.resolve('.yori-runtime/evidence/desktop-parity-1');
        if (!fs.existsSync(gitignoredDir)) {
          fs.mkdirSync(gitignoredDir, { recursive: true });
        }
        const compositePath = path.join(gitignoredDir, 'reference-vs-app-rain-1586x992.png');
        fs.writeFileSync(compositePath, Buffer.from(compositeBase64, 'base64'));
        expect(fs.existsSync(compositePath)).toBe(true);
        expect(fs.statSync(compositePath).size).toBeGreaterThan(100000);
      }
    }
  });

  test('Timing Adjustment: Changing buffer +15m drops countdowns by 15m and synchronizes Now row Arrive with Right Panel ARRIVE BY', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');
    await selectDemoScene(page, 'clear');

    // 1. Initial clear scene assertions
    const heroCountdown = page.locator('.now-card .now-relative-time');
    const feedCountdown = page.locator('#feed-section-now .feed-countdown-pill');
    const feedDesc = page.locator('#feed-section-now .feed-now-desc');
    const rightPanel = page.locator('#desktop-right-panel');

    const expectedInitialCountdown = derivePlanCountdown('2026-10-28T21:25:00.000Z', '2026-10-28T17:00:00.000Z')!;
    await expect(heroCountdown).toHaveText(expectedInitialCountdown);
    await expect(feedCountdown).toHaveText(expectedInitialCountdown);
    await expect(feedDesc).toContainText('Arrive 2:50 PM');
    await expect(feedDesc).toContainText('Starts 3:00 PM');

    const initialPanelLeave = await rightPanel.locator('.trip-stat-cell').nth(0).locator('.trip-stat-val').textContent();
    const initialPanelArrive = await rightPanel.locator('.trip-stat-cell').nth(1).locator('.trip-stat-val').textContent();
    expect(initialPanelLeave?.trim()).toBe('2:25 PM');
    expect(initialPanelArrive?.trim()).toBe('2:50 PM');

    // 2. Click Adjust button to open the timing dialog
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustDialog = page.locator('#adjust-dialog');
    await expect(adjustDialog).toBeVisible();

    // 3. Change buffer from 5 to 20 (+15 minutes earlier departure)
    const bufferInput = page.locator('#input-buffer-minutes');
    await bufferInput.fill('20');

    // 4. Submit with "For this time only"
    const forTodayBtn = page.locator('#btn-adjust-for-today');
    await forTodayBtn.click();
    await expect(adjustDialog).toBeHidden();

    // 5. Verify countdowns dropped by 15m (derived from new leaveAt: 2026-10-28T21:10:00.000Z)
    const expectedAdjustedCountdown = derivePlanCountdown('2026-10-28T21:10:00.000Z', '2026-10-28T17:00:00.000Z')!;
    await expect(heroCountdown).toHaveText(expectedAdjustedCountdown);
    await expect(feedCountdown).toHaveText(expectedAdjustedCountdown);

    // 6. Verify feed now subtitle updated with new computed arrive time and preserved starts time
    await expect(feedDesc).toContainText('Leave by 2:10 PM');
    await expect(feedDesc).toContainText('Arrive 2:35 PM');
    await expect(feedDesc).toContainText('Starts 3:00 PM');

    // 7. Verify right panel stats match exactly
    const updatedPanelLeave = await rightPanel.locator('.trip-stat-cell').nth(0).locator('.trip-stat-val').textContent();
    const updatedPanelArrive = await rightPanel.locator('.trip-stat-cell').nth(1).locator('.trip-stat-val').textContent();
    expect(updatedPanelLeave?.trim()).toBe('2:10 PM');
    expect(updatedPanelArrive?.trim()).toBe('2:35 PM');

    // 8. Equality check: feed Now row 'Arrive' matches panel 'ARRIVE BY'
    expect(await feedDesc.textContent()).toContain(`Arrive ${updatedPanelArrive?.trim()}`);
  });
});
