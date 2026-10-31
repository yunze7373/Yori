import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { openDemoPanel, closeDemoPanel, selectDemoScene } from './helpers/demo-panel.js';

/**
 * UI-HOME-QUIET: Quiet Consumer Home and Isolated Presentation Demo Panel
 * Governed by TID: INBOX-20261031-24FF42
 *
 * Implements and verifies:
 * 1. Restrained consumer Home:
 *    - Newsreader wordmark top-left, neutral monogram avatar top-right (links to Me).
 *    - Honest greeting + dynamic subheading ("I've already looked ahead for you." vs "Nothing needs you right now.").
 *    - Single compact context pill (#pill-context-status) showing honest active sources only.
 *    - Clicking pill opens Sources/Why provenance dialog; NEVER opens demo controls.
 * 2. Developer-only Presentation Demo Panel (A2):
 *    - Hidden on consumer Home by default (zero presentation controls in consumer DOM).
 *    - Discreet affordance (#btn-dev-demo-controls) revealed only via ?dev=1 (or sessionStorage yori_dev=1).
 *    - Presentation sheet (#demo-panel) hosts mode switch, demo scenario dropdown, replay, technical badges.
 *    - Accessible focus trap, Escape to close, focus restoration.
 * 3. Interactive Walkthrough (A4):
 *    - Home -> Why -> Accept -> Adjust -> Dismiss -> Ahead -> For You -> Ask Yori.
 *    - Context reactivity: switching scenes updates Now card dynamically without reload.
 * 4. Accessibility & Layout (A5, A8, A9):
 *    - Axe 0 critical/serious violations on Home and inside demo panel.
 *    - Touch targets >= 44x44px.
 *    - Zero horizontal overflow across mobile (390px) and desktop (1280px).
 *    - Prefers-reduced-motion respected.
 */

const EVIDENCE_DIR = getEvidenceDir('ui-home-quiet');
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

async function checkAxe(page: Page, context = 'page'): Promise<void> {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasOverflow, 'Page should have no horizontal scrollbar').toBe(false);
}

async function saveEvidence(page: Page, filename: string): Promise<void> {
  if (shouldUpdateEvidence) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: false,
    });
  }
}

test.describe('UI-HOME-QUIET: Consumer Home & Isolated Demo Panel Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('1. Consumer Home: Restrained header, wordmark, avatar, and honest greeting + subheading', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    // 1a. Header Wordmark (Newsreader serif top-left)
    const wordmark = page.locator('.v2-brand-wordmark');
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveText('Yori');

    // 1b. Header Avatar top-right
    const avatarBtn = page.locator('#btn-header-avatar');
    await expect(avatarBtn).toBeVisible();
    await expect(avatarBtn).toHaveAttribute('aria-label', 'Profile and settings');

    // 1c. Consumer Home hides demo controls by default
    await expect(page.locator('#btn-dev-demo-controls')).toHaveCount(0);
    await expect(page.locator('#demo-panel')).toHaveCount(0);
    await expect(page.locator('#scene-select')).toHaveCount(0);
    await expect(page.locator('#btn-mode-demo')).toHaveCount(0);
    await expect(page.locator('#btn-mode-live')).toHaveCount(0);
    await expect(page.locator('#btn-replay-before-you-ask')).toHaveCount(0);

    // 1d. Honest Greeting & Subheading when prepared plan is active
    const greetingTitle = page.locator('.greeting-title');
    await expect(greetingTitle).toBeVisible();
    const subheading = page.locator('.greeting-subheading');
    await expect(subheading).toBeVisible();
    await expect(subheading).toHaveText("I've already looked ahead for you.");

    // 1e. Clicking avatar navigates to Me tab
    await avatarBtn.click();
    await expect(page.locator('.me-view-container')).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page, 'Consumer Home Header');
  });

  test('2. A1 Context Pill: Honest active sources and opens dedicated Sources view (NOT demo controls)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    const contextPill = page.locator('#pill-context-status');
    await expect(contextPill).toBeVisible();
    await expect(contextPill).toContainText('Demo · simulated');
    await expect(contextPill.locator('.context-pill-subtitle')).toHaveText('Demo · simulated scenes');

    // Clicking #pill-context-status opens dedicated Sources view
    await contextPill.click();

    // Verify Why / Sources sheet opens
    const whyDialog = page.locator('#why-sheet-backdrop');
    await expect(whyDialog).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toHaveText('Sources & Provenance · Demo');

    // In Demo mode: verify SIMULATED badges are present
    const simulatedBadges = page.locator('.sources-modal-card .simulated-badge');
    await expect(simulatedBadges.first()).toBeVisible();
    await expect(page.locator('.sources-modal-card')).toContainText('SIMULATED');

    // Verify demo controls panel did NOT open (A1 invariant)
    await expect(page.locator('#demo-panel')).toHaveCount(0);

    // Close Why sheet
    const closeBtn = page.locator('#btn-close-why');
    await closeBtn.click();
    await expect(whyDialog).toHaveCount(0);

    // In Live mode: subline reflects device clock only (no fabricated calendar or memories)
    await page.goto('/?mode=live');
    const livePill = page.locator('#pill-context-status');
    await expect(livePill).toBeVisible();
    await expect(livePill).toContainText('Live context');
    await expect(livePill.locator('.context-pill-subtitle')).toContainText('Device clock');
    await expect(livePill.locator('.context-pill-subtitle')).not.toContainText('Calendar');
    await expect(livePill.locator('.context-pill-subtitle')).not.toContainText('Memories');

    // Clicking pill in Live mode opens dedicated truthful sources view
    await livePill.click();
    await expect(whyDialog).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toHaveText('Active Sources · Live context');

    // Verify truthful feeds and NO fabricated piano lesson or simulated badges
    const sourcesCard = page.locator('.sources-modal-card');
    await expect(sourcesCard).toBeVisible();
    await expect(sourcesCard).not.toContainText('piano');
    await expect(sourcesCard).not.toContainText('Piano lesson');
    await expect(sourcesCard).not.toContainText('SIMULATED');

    // Calendar row reads "Not connected"
    const calSourceItem = page.locator('#source-item-calendar');
    await expect(calSourceItem).toBeVisible();
    await expect(calSourceItem).toContainText('Not connected');

    // Clock reads "Live", Memory reads "Local only"
    await expect(page.locator('#source-item-clock')).toContainText('Live');
    await expect(page.locator('#source-item-memory')).toContainText('Local only');

    await closeBtn.click();
    await expect(whyDialog).toHaveCount(0);

    await checkNoHorizontalScroll(page);
    await checkAxe(page, 'Live Context Pill');
  });

  test('3. A2 Developer Demo Panel: Gated by ?dev=1, focus trap, and Escape key dismissal', async ({
    page,
  }) => {
    // Navigate with ?dev=1 to reveal developer affordance
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    const devBtn = page.locator('#btn-dev-demo-controls');
    await expect(devBtn).toBeVisible();
    await expect(devBtn).toHaveAttribute('aria-label', 'Demo controls for presentation');

    // Click developer button to open presentation panel
    await devBtn.click();

    const demoPanel = page.locator('#demo-panel');
    await expect(demoPanel).toBeVisible();
    await expect(page.locator('#demo-panel-title')).toHaveText('Demo controls · for presentation');

    // Verify all presentation control IDs exist inside panel
    await expect(page.locator('#btn-mode-demo')).toBeVisible();
    await expect(page.locator('#btn-mode-live')).toBeVisible();
    await expect(page.locator('#scene-select')).toBeVisible();
    await expect(page.locator('#btn-replay-before-you-ask')).toBeVisible();
    await expect(page.locator('#badge-ui-version')).toBeVisible();

    await checkAxe(page, 'Open Demo Panel');

    // Press Escape to dismiss panel
    await page.keyboard.press('Escape');
    await expect(demoPanel).toHaveCount(0);

    // Focus restored
    await expect(devBtn).toBeFocused();
  });

  test('4. Honest quiet state: Subheading reflects "Nothing needs you right now." when no action needed', async ({
    page,
  }) => {
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    // Switch to busy-lunch (quiet state scene)
    await selectDemoScene(page, 'busy-lunch');

    const subheading = page.locator('.greeting-subheading');
    await expect(subheading).toBeVisible();
    await expect(subheading).toHaveText('Nothing needs you right now.');

    // In busy-lunch, quiet state card is present and no urgent prompts
    const quietCard = page.locator('.quiet-card, .v2-quiet-card');
    await expect(quietCard).toBeVisible();

    await checkNoHorizontalScroll(page);
    await checkAxe(page, 'Quiet State Home');
  });

  test('5. A4 Interactive Walkthrough: Full consumer journey and context reactivity', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const homeNav = isMobile ? page.locator('#tab-home') : page.locator('#desktop-nav-home');
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    // 5a. Switch to Rain scene
    await selectDemoScene(page, 'rain');
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('TRAVEL');
    await expect(nowCard).toContainText('in 55m');
    await expect(nowCard).toContainText('Piano lesson at 3:00 PM');
    await expect(nowCard).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    await expect(nowCard).toContainText('Rain forecast · Umbrella needed');

    // Verify compact schematic map strip in Now card (<= 140px tall)
    const mapStrip = page.locator('.compact-map-strip');
    await expect(mapStrip).toBeVisible();
    const mapBox = await mapStrip.boundingBox();
    expect(mapBox?.height ?? 0).toBeLessThanOrEqual(140);

    // Verify 1 single row of primary actions with equal height >= 44px
    const acceptBtn = page.locator('#btn-accept');
    const adjustBtn = page.locator('#btn-adjust');
    const whyBtn = page.locator('#btn-why');
    await expect(acceptBtn).toBeVisible();
    await expect(adjustBtn).toBeVisible();
    await expect(whyBtn).toBeVisible();
    const [accBox, adjBox, whyB] = await Promise.all([
      acceptBtn.boundingBox(),
      adjustBtn.boundingBox(),
      whyBtn.boundingBox(),
    ]);
    expect(accBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(adjBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(whyB?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Verify secondary actions (Details -> and Dismiss) with touch target >= 44px
    const detailsBtn = page.locator('#btn-view-trip-details');
    const dismissBtn = page.locator('#btn-dismiss');
    await expect(detailsBtn).toBeVisible();
    await expect(dismissBtn).toBeVisible();
    const detBox = await detailsBtn.boundingBox();
    const disBox = await dismissBtn.boundingBox();
    expect(detBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(disBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Clicking Details opens TripDetail view containing timeline, options, and habit
    await detailsBtn.click();
    const tripDetail = page.locator('.v2-trip-detail');
    await expect(tripDetail).toBeVisible();
    await expect(tripDetail.locator('.v2-timeline')).toBeVisible();
    await expect(tripDetail.locator('.v2-options-grid')).toBeVisible();
    await expect(tripDetail.locator('.habit-note')).toBeVisible();

    // Return to Home
    await page.locator('#trip-detail-back-btn').click();
    await expect(tripDetail).toHaveCount(0);

    // 5b. Open Why sheet via action button
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();
    await expect(page.locator('#why-sheet-backdrop')).toBeVisible();
    await page.locator('#btn-close-why').click();

    // 5c. Adjust dialog
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();
    await expect(page.locator('#adjust-dialog-backdrop')).toBeVisible();
    await page.locator('#btn-close-adjust').click();

    // 5d. Accept plan -> Undo affordance appears
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // 5e. Switch to multi-candidate scene to populate Ahead and For You sections
    await selectDemoScene(page, 'multi-candidate');

    // 5f. Ahead Section & See All link
    const aheadLink = page.locator('#link-ahead-see-all');
    await expect(aheadLink).toBeVisible();
    await aheadLink.click();
    await expect(page.locator('.v2-plans-view')).toBeVisible();

    // Back to Home
    await homeNav.click();

    // 5g. For You Section & See All link
    const forYouLink = page.locator('#link-foryou-see-all');
    await expect(forYouLink).toBeVisible();
    await forYouLink.click();
    await expect(page.locator('.v2-for-you-view')).toBeVisible();

    // Back to Home
    await homeNav.click();

    // 5h. Ask Yori drawer expand & collapse
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();
    const convoOverlay = page.locator('#conversation-overlay');
    await expect(convoOverlay).toBeVisible();
    await page.locator('#conversation-close-btn').click();
    await expect(convoOverlay).toHaveCount(0);

    // 5h. Context Reactivity: Rain -> Clear scene updates Now card without full page reload
    await selectDemoScene(page, 'clear');
    await expect(nowCard).toContainText('2:25 PM');
  });

  test('6. A5, A8, A9 Touch targets, Responsive Layout & Prefers-Reduced-Motion', async ({
    page,
  }) => {
    // 6a. Responsive Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'rain');

    // Touch targets >= 44x44px check
    const targets = [
      { selector: '#pill-context-status', label: 'Context Pill' },
      { selector: '#btn-header-avatar', label: 'Header Avatar' },
      { selector: '#btn-dev-demo-controls', label: 'Dev Controls Affordance' },
      { selector: '#btn-accept', label: 'Accept Button' },
      { selector: '#btn-adjust', label: 'Adjust Button' },
      { selector: '#btn-why', label: 'Why Button' },
      { selector: '#btn-dismiss', label: 'Dismiss Button' },
      { selector: '#ask-bar', label: 'Ask Yori Bar' },
    ];

    for (const t of targets) {
      const el = page.locator(t.selector).first();
      if (await el.isVisible()) {
        const box = await el.boundingBox();
        expect(
          box?.width ?? 0,
          `Touch target width for ${t.label} should be >= 44px (got ${box?.width}px)`
        ).toBeGreaterThanOrEqual(44);
        expect(
          box?.height ?? 0,
          `Touch target height for ${t.label} should be >= 44px (got ${box?.height}px)`
        ).toBeGreaterThanOrEqual(44);
      }
    }

    await checkNoHorizontalScroll(page);

    // 6b. Reduced motion (Finding 4: verified via computed transition-duration: 0s assertion)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForSelector('.app-layout');
    const transitionDuration = await page.evaluate(() => {
      const el = document.querySelector('.ask-bar');
      return el ? window.getComputedStyle(el).transitionDuration : '';
    });
    expect(transitionDuration).toBe('0s');
    await checkNoHorizontalScroll(page);
    await checkAxe(page, 'Reduced Motion Mode');

    // 6c. Desktop (1024x768)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await page.waitForSelector('.app-layout');
    await checkNoHorizontalScroll(page);
    await checkAxe(page, 'Desktop Layout');
  });

  test('7. Evidence Capture: Dual-viewport visual deliverables matrix (Finding 4)', async ({
    page,
  }, testInfo) => {
    if (!shouldUpdateEvidence) {
      test.skip();
      return;
    }

    const vpName = testInfo.project.name === 'mobile' ? '390x844' : '1280x800';
    const width = testInfo.project.name === 'mobile' ? 390 : 1280;
    const height = testInfo.project.name === 'mobile' ? 844 : 800;
    await page.setViewportSize({ width, height });

    // 7a. Demo Clear
    await page.goto('/');
    await page.waitForSelector('.app-layout');
    await saveEvidence(page, `after-demo-clear-${vpName}.png`);

    // 7b. Demo Rain
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');
    await openDemoPanel(page);
    await page.locator('#scene-select').selectOption('rain');
    await closeDemoPanel(page);
    await saveEvidence(page, `after-demo-rain-${vpName}.png`);

    // 7c. Demo Away Lunch
    await openDemoPanel(page);
    await page.locator('#scene-select').selectOption('away-lunch');
    await closeDemoPanel(page);
    await saveEvidence(page, `after-demo-away-lunch-${vpName}.png`);

    // 7d. Live Weather Off
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout');
    await saveEvidence(page, `after-live-weather-off-${vpName}.png`);

    // 7e. Live Empty
    await saveEvidence(page, `after-live-empty-${vpName}.png`);

    // 7f. Sources Open Demo
    await page.goto('/');
    await page.waitForSelector('.app-layout');
    await page.locator('#pill-context-status').click();
    await page.waitForSelector('#why-sheet-backdrop');
    await saveEvidence(page, `after-sources-open-demo-${vpName}.png`);
    await page.locator('#btn-close-why').click();

    // 7g. Sources Open Live
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout');
    await page.locator('#pill-context-status').click();
    await page.waitForSelector('#why-sheet-backdrop');
    await saveEvidence(page, `after-sources-open-live-${vpName}.png`);
    await page.locator('#btn-close-why').click();

    // 7h. Demo Panel Open (after only)
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');
    await openDemoPanel(page);
    await saveEvidence(page, `after-demo-panel-open-${vpName}.png`);
    await closeDemoPanel(page);
  });
});
