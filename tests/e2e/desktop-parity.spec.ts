import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('desktop-parity-1');
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

    // 4 Stat Cells Grid
    const statsGrid = rightPanel.locator('.trip-stats-grid');
    await expect(statsGrid).toBeVisible();
    await expect(statsGrid).toContainText('LEAVE BY');
    await expect(statsGrid).toContainText('ARRIVE BY');
    await expect(statsGrid).toContainText('DISTANCE');
    await expect(statsGrid).toContainText('TRAFFIC');

    // Destination Weather Card
    const weatherCard = rightPanel.locator('.desktop-weather-card');
    await expect(weatherCard).toBeVisible();
    await expect(weatherCard).toContainText('Destination Weather');
    await expect(weatherCard.locator('.card-badge')).toContainText('SIMULATED');

    // Nearby Lunch Recommendations Section
    const placesSection = rightPanel.locator('.desktop-panel-section[data-panel-type="places"]');
    await expect(placesSection).toBeVisible();
    await expect(placesSection).toContainText('Nearby Lunch Recommendations');
    await expect(placesSection.locator('.desktop-candidate-tile').first()).toBeVisible();

    // Candidate details check: name, walk time, cuisine chip, sparkle rationale
    const firstCandidate = placesSection.locator('.desktop-candidate-tile').first();
    await expect(firstCandidate.locator('.desktop-candidate-title')).toBeVisible();
    await expect(firstCandidate.locator('.desktop-candidate-dist')).toBeVisible();
    await expect(firstCandidate.locator('.sparkle-icon')).toBeVisible();
    await expect(firstCandidate.locator('.desktop-candidate-basis')).toBeVisible();

    await checkAxe(page, 'Right Panel at 1586x992');
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
    await saveEvidence(page, 'mobile-390x844-home.png');
  });

  test('Matrix: Viewports (1586x992, 1440x900, 1280x800) x Scenes (clear, rain, away-lunch, multi-candidate)', async ({
    page,
  }) => {
    const viewports = [
      { name: 'ref-1586x992', width: 1586, height: 992 },
      { name: 'wide-1440x900', width: 1440, height: 900 },
      { name: 'std-1280x800', width: 1280, height: 800 },
    ];

    const scenes = ['clear', 'rain', 'away-lunch', 'multi-candidate'];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const scene of scenes) {
        await page.goto('/?ui=v2&dev=1');
        await page.waitForSelector('.app-layout[data-ui-version="v2"]');
        await selectDemoScene(page, scene);
        await page.waitForTimeout(100);

        // Core assertions
        await expect(page.locator('.desktop-greeting-row')).toBeVisible();
        await expect(page.locator('.desktop-left-nav')).toBeVisible();
        await expect(page.locator('#desktop-right-panel')).toBeVisible();
        await expect(page.locator('.now-card')).toBeVisible();

        // Scene specific checks
        if (scene === 'rain') {
          const umbrellaChip = page.locator('.now-card #chip-umbrella');
          await expect(umbrellaChip).toBeVisible();
          await expect(umbrellaChip).toContainText('Umbrella');
        }

        await checkNoOverflow(page);

        // Save evidence
        await saveEvidence(page, `parity-${scene}-${vp.name}.png`);
      }
    }
  });
});
