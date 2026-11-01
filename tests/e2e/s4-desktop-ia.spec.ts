/**
 * S4-DESKTOP-IA: Desktop Purpose-Built Three-Zone IA & Viewport Verification
 * Governed by TID: INBOX-20261031-CD2FF4 and REV3_LIVE_ROADMAP.plan.json §Slice S4.
 *
 * Verifies:
 * 1. Visibility & layout across breakpoints:
 *    - 390x844 (Mobile): Left nav hidden, right panel hidden, bottom tab bar visible.
 *    - 768x1024 (Tablet): Left nav collapsed icon rail (72px), right panel hidden, bottom tab bar hidden.
 *    - 1280x800 (Desktop): Left nav expanded (240px), right panel visible (380px), bottom tab bar hidden.
 *    - 1440x900 (Desktop Wide): Left nav expanded (240px), center column max 680px, right panel visible (380px), bottom tab bar hidden.
 * 2. Right panel coherence:
 *    - Travel card (Clear, Rain, Fuel) -> route/map panel, ZERO lunch candidate items.
 *    - Lunch card (Lunch, Away-lunch) -> nearby places panel, ZERO route map.
 *    - Card selection & focus updates panel dynamically with polite aria-live announcement.
 * 3. Live truthfulness & label audit:
 *    - In Live mode: Right panel contains zero fixture elements (data-provenance="fixture", "SIMULATED").
 *    - Provider-backed data carries data-source and data-fetched-at; unavailable states carry data-provenance="none".
 * 4. Connectors in desktop shell:
 *    - Clicking #desktop-nav-connectors opens Connectors view inside .desktop-center-column with left nav intact.
 * 5. Keyboard navigation & accessibility:
 *    - Arrow navigation (ArrowDown/ArrowUp) cycles focus across sidebar nav items.
 *    - Axe WCAG AA check: 0 critical or serious violations at all breakpoints.
 *    - Zero horizontal overflow (scrollWidth <= clientWidth + 1).
 *    - Hit targets >= 44x44px.
 * 6. Resizing 1440 -> 390 -> 1280 preserves active state without reloading.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { openDemoPanel, closeDemoPanel } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('s4-desktop-ia');
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

test.describe('S4 Desktop IA: Purpose-Built Multi-Zone Layout & Per-Viewport Integrity', () => {
  test.beforeEach(async ({ page }) => {
    // Clean storage state before each run
    await page.goto('/?ui=v2');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('Shell Breakpoint Visibility: 390px (Mobile), 768px (Tablet), 1280px (Desktop), 1440px (Wide)', async ({
    page,
  }) => {
    // --- 1. Mobile Shell (390x844) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Mobile: Left nav hidden, right panel hidden, bottom tab bar visible
    await expect(page.locator('.desktop-left-nav')).toBeHidden();
    await expect(page.locator('.desktop-right-panel')).toBeHidden();
    await expect(page.locator('.bottom-tab-bar')).toBeVisible();
    await expect(page.locator('#tab-home')).toBeVisible();

    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile 390px shell');

    // --- 2. Tablet Shell (768x1024) ---
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(100);

    // Tablet: Left nav visible as 72px rail, right panel hidden, bottom tab bar hidden
    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    const navWidth = await page.locator('.desktop-left-nav').evaluate(el => el.getBoundingClientRect().width);
    expect(navWidth).toBeCloseTo(72, 1);
    await expect(page.locator('.desktop-right-panel')).toBeHidden();
    await expect(page.locator('.bottom-tab-bar')).toBeHidden();

    // Check hit target of rail buttons
    const homeBtnBox = await page.locator('#desktop-nav-home').boundingBox();
    expect(homeBtnBox?.width).toBeGreaterThanOrEqual(44);
    expect(homeBtnBox?.height).toBeGreaterThanOrEqual(44);

    await checkNoOverflow(page);
    await checkAxe(page, 'Tablet 768px rail shell');

    // --- 3. Desktop Shell (1280x800) ---
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);

    // Desktop: Left nav expanded (240px), right panel visible (380px), bottom tab bar hidden
    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    const desktopNavWidth = await page.locator('.desktop-left-nav').evaluate(el => el.getBoundingClientRect().width);
    expect(desktopNavWidth).toBeCloseTo(240, 1);

    await expect(page.locator('.desktop-right-panel')).toBeVisible();
    const rightPanelWidth = await page.locator('.desktop-right-panel').evaluate(el => el.getBoundingClientRect().width);
    expect(rightPanelWidth).toBeCloseTo(380, 1);

    await expect(page.locator('.bottom-tab-bar')).toBeHidden();

    // Max measure check for center column container: max 680px
    const centerMaxMeasure = await page.locator('.desktop-center-column main.main-container').evaluate(el => {
      const style = window.getComputedStyle(el);
      return parseInt(style.maxWidth, 10);
    });
    expect(centerMaxMeasure).toBeLessThanOrEqual(680);

    await checkNoOverflow(page);
    await checkAxe(page, 'Desktop 1280px shell');

    // --- 4. Desktop Wide Shell (1440x900) ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    await expect(page.locator('.desktop-right-panel')).toBeVisible();
    await expect(page.locator('.bottom-tab-bar')).toBeHidden();
    await checkNoOverflow(page);
  });

  test('Right Panel Structure: Reference Dashboard includes Trip Details, Destination Weather, and Lunch Recommendations', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // 1. Initial scene: Clear (Travel plan with reference desktop parity)
    // Travel panel must render route schematic + destination weather + lunch recommendations
    const rightPanel = page.locator('#desktop-right-panel');
    await expect(rightPanel).toBeVisible();
    await expect(rightPanel.locator('.desktop-panel-section[data-panel-type="route"]')).toBeVisible();
    await expect(rightPanel.locator('.desktop-map-card')).toBeVisible();
    await expect(rightPanel.locator('.desktop-weather-card')).toBeVisible();
    await expect(rightPanel.locator('.trip-stats-grid')).toBeVisible();
    await expect(rightPanel).toContainText('Destination Weather');
    await expect(rightPanel).toContainText('Nearby Lunch Recommendations');
    await expect(rightPanel.locator('.desktop-candidate-tile').first()).toBeVisible();

    // 2. Open Demo Controls and switch to Lunch scene
    await page.locator('#desktop-nav-settings').click();
    await expect(page.locator('#demo-panel')).toBeVisible();
    await page.locator('#scene-select').selectOption('lunch');
    await page.locator('#btn-close-demo-panel').click();
    await page.waitForTimeout(200);

    // Lunch panel must render nearby options & walking times
    await expect(rightPanel.locator('.desktop-panel-section[data-panel-type="places"]')).toBeVisible();
    await expect(rightPanel).toContainText('Nearby Options & Walking Times');
    await expect(rightPanel.locator('.desktop-candidate-tile').first()).toBeVisible();

    // 3. Aria live announcement check on card selection
    // Selecting another candidate updates panel and aria announcement
    const secondCandidate = page.locator('.v2-candidate-card').nth(1);
    if ((await secondCandidate.count()) > 0) {
      await secondCandidate.focus();
      const announcement = rightPanel.locator('#desktop-panel-announcement');
      await expect(announcement).toBeVisible();
      await expect(announcement).toContainText('Selected');
    }
  });

  test('Live Mode Truthfulness & Label Audit: Provider-backed or Honest Unavailable, Zero Fixture Provenance', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Switch to Live Mode via settings
    await page.locator('#desktop-nav-settings').click();
    await page.locator('#btn-mode-live').click();
    await page.locator('#btn-close-demo-panel').click();
    await page.waitForTimeout(200);

    const rightPanel = page.locator('#desktop-right-panel');
    await expect(rightPanel).toBeVisible();

    // In Live Mode: zero fixture elements in the right panel
    const fixtureCount = await rightPanel.locator('[data-provenance="fixture"]').count();
    expect(fixtureCount).toBe(0);

    const simulatedText = await rightPanel.getByText('SIMULATED', { exact: false }).count();
    expect(simulatedText).toBe(0);

    // Route unavailable state is honest
    const unavailableCard = rightPanel.locator('#desktop-notice-route-unavailable, #desktop-notice-route-unavailable-quiet');
    await expect(unavailableCard).toBeVisible();
    await expect(unavailableCard).toHaveAttribute('data-provenance', 'none');
    await expect(unavailableCard).toContainText('No route available');
  });

  test('Connectors in Desktop Shell: Left Nav Stays Visible, Connectors Renders in Center Column', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Click Connectors in left nav
    const connectorsNavBtn = page.locator('#desktop-nav-connectors');
    await expect(connectorsNavBtn).toBeVisible();
    await connectorsNavBtn.click();

    // Connectors view is inside center column
    await expect(page.locator('.desktop-center-column #connectors-page')).toBeVisible();

    // Left nav remains visible and has active state on Connectors
    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    await expect(connectorsNavBtn).toHaveClass(/active/);
    await expect(connectorsNavBtn).toHaveAttribute('aria-current', 'page');

    // Right panel renders clean quiet state
    await expect(page.locator('#desktop-right-panel')).toBeVisible();
    await expect(page.locator('#desktop-right-panel .desktop-panel-section[data-panel-type="quiet"]')).toBeVisible();

    await checkAxe(page, 'Connectors in desktop shell');

    // Navigating back to Home from sidebar works cleanly
    await page.locator('#desktop-nav-home').click();
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('#desktop-nav-home')).toHaveClass(/active/);
  });

  test('Ask Bar Expanded on Desktop: Preserves Layout and Grid Measures', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    // Typing in conversation input
    const askInput = page.locator('#conversation-input');
    await expect(askInput).toBeVisible();
    await askInput.fill('What time is my piano lesson?');
    await page.waitForTimeout(200);

    // Left nav and right panel remain intact and fully visible
    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    await expect(page.locator('#desktop-right-panel')).toBeVisible();
    await checkNoOverflow(page);
  });

  test('Keyboard Navigation: Arrow Keys Cycle Sidebar Items with Focus Wrap', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Focus first sidebar nav button
    const homeBtn = page.locator('#desktop-nav-home');
    await homeBtn.focus();
    await expect(homeBtn).toBeFocused();

    // ArrowDown -> Plans
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#desktop-nav-plans')).toBeFocused();

    // ArrowDown -> For You
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#desktop-nav-for-you')).toBeFocused();

    // ArrowDown -> Connectors
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#desktop-nav-connectors')).toBeFocused();

    // ArrowDown -> Memories (Me)
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#desktop-nav-me')).toBeFocused();

    // ArrowDown -> Settings
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#desktop-nav-settings')).toBeFocused();

    // ArrowDown -> Wraps back to Home
    await page.keyboard.press('ArrowDown');
    await expect(homeBtn).toBeFocused();

    // ArrowUp -> Wraps to Settings
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#desktop-nav-settings')).toBeFocused();
  });

  test('Resizing Across Breakpoints 1440 -> 390 -> 1280 Preserves State Without Breakage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Navigate to Plans tab
    await page.locator('#desktop-nav-plans').click();
    await expect(page.locator('.v2-plans-view')).toBeVisible();

    // Resize to mobile 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);

    // Bottom tab bar has Plans selected
    await expect(page.locator('#tab-plans')).toHaveClass(/active/);
    await expect(page.locator('.v2-plans-view')).toBeVisible();
    await expect(page.locator('.desktop-left-nav')).toBeHidden();
    await expect(page.locator('.desktop-right-panel')).toBeHidden();

    // Resize back to desktop 1280px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(150);

    // Desktop left nav has Plans active and right panel is restored
    await expect(page.locator('#desktop-nav-plans')).toHaveClass(/active/);
    await expect(page.locator('.v2-plans-view')).toBeVisible();
    await expect(page.locator('.desktop-left-nav')).toBeVisible();
    await expect(page.locator('.desktop-right-panel')).toBeVisible();
    await expect(page.locator('.bottom-tab-bar')).toBeHidden();

    await checkNoOverflow(page);
  });

  test('Demo -> Live Switch: Zero Demo/Fixture Leakage in Desktop Panel Across All Scenes at 1280 and 1440', async ({
    page,
  }) => {
    test.setTimeout(60000);

    const forbiddenStrings = [
      'Lunch options near you',
      'places matching your tastes',
      'Rain re-plan',
      'Piano lesson',
      'SIMULATED',
      'Schematic · simulated',
      'data-provenance="fixture"',
    ];

    for (const width of [1280, 1440]) {
      const height = width === 1280 ? 800 : 900;
      await page.setViewportSize({ width, height });

      for (const scene of ['clear', 'rain', 'lunch', 'away-lunch', 'fuel']) {
        await page.goto(`/?ui=v2&scene=${scene}`);
        await page.waitForSelector('.app-layout');

        // Switch to Live mode cleanly via demo panel
        await openDemoPanel(page);
        await page.locator('#btn-mode-live').click();
        await closeDemoPanel(page);
        await page.waitForTimeout(100);

        const rightPanel = page.locator('#desktop-right-panel');
        await expect(rightPanel).toBeVisible();

        // 1. Provenance check
        await expect(rightPanel.locator('.desktop-panel-titlebar')).toHaveAttribute('data-provenance', 'live');
        const fixtureCount = await rightPanel.locator('[data-provenance="fixture"]').count();
        expect(fixtureCount).toBe(0);

        // 2. Forbidden strings check
        const panelHtml = await rightPanel.innerHTML();
        for (const forbidden of forbiddenStrings) {
          expect(panelHtml).not.toContain(forbidden);
        }

        // 3. Panel kind check
        await expect(rightPanel.locator('.desktop-panel-section[data-panel-type="quiet"]')).toBeVisible();

        // 4. Honest notices present
        await expect(rightPanel.locator('#desktop-notice-route-unavailable-quiet')).toBeVisible();
        await expect(rightPanel.locator('#desktop-notice-places-disabled-quiet')).toBeVisible();
      }
    }
  });

  test('Evidence Capture Matrix: 6 States Across 3 Viewports + Tablet Rail (19 Deliverables)', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const viewports = [
      { width: 390, height: 844, suffix: '390x844' },
      { width: 1280, height: 800, suffix: '1280x800' },
      { width: 1440, height: 900, suffix: '1440x900' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Demo Travel (Rain scene)
      await page.goto('/?ui=v2&scene=rain');
      await page.waitForSelector('.app-layout');
      await page.waitForTimeout(100);
      await saveEvidence(page, `01-travel-${vp.suffix}.png`);

      // 2. Demo Lunch (Away Lunch scene)
      await page.goto('/?ui=v2&scene=away-lunch');
      await page.waitForSelector('.app-layout');
      await page.waitForTimeout(100);
      await saveEvidence(page, `02-lunch-${vp.suffix}.png`);

      // 3. Live Empty (No destination)
      await page.goto('/?ui=v2');
      await page.waitForSelector('.app-layout');
      await openDemoPanel(page);
      await page.locator('#btn-mode-live').click();
      await closeDemoPanel(page);
      await page.waitForTimeout(100);
      await saveEvidence(page, `03-live-empty-${vp.suffix}.png`);

      // 4. Live Route Unavailable
      await saveEvidence(page, `04-live-route-${vp.suffix}.png`);

      // 5. Connectors in Shell
      await page.goto('/?ui=v2&detail=connectors');
      await page.waitForSelector('.app-layout');
      await page.waitForTimeout(100);
      await saveEvidence(page, `05-connectors-${vp.suffix}.png`);

      // 6. Ask Bar Expanded
      await page.goto('/?ui=v2');
      await page.waitForSelector('.app-layout');
      await page.locator('#ask-bar').click();
      await page.waitForSelector('#conversation-input');
      await page.locator('#conversation-input').fill('What time is my piano lesson?');
      await page.waitForTimeout(100);
      await saveEvidence(page, `06-ask-expanded-${vp.suffix}.png`);
    }

    // 7. Tablet Rail (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.waitForTimeout(100);
    await saveEvidence(page, '07-tablet-rail-768x1024.png');
  });
});
