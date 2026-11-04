import { test, expect } from '@playwright/test';
import { selectDemoScene } from './helpers/demo-panel.js';

/**
 * CLOSEOUT_REV3UI: Truthfulness & Provenance Audit
 * Governed by TID: INBOX-20261101-AA8081 and REV3_UI_CONNECTORS.plan.json.
 *
 * Requirements:
 * Crawls at 390x844 (mobile) and 1280x800 (desktop) in Live mode with all flags off and zero permissions:
 * - Home
 * - Plans
 * - For You
 * - Me / Memories
 * - Settings > Connectors
 * - Sources view
 * - Desktop right panel
 * - Ask overlay
 *
 * Asserts in Live mode:
 * 1. No element has data-provenance='fixture'.
 * 2. None of the forbidden demo strings appear:
 *    'SIMULATED', 'Demo Place', 'Piano lesson', 'Team Sync', 'Downtown',
 *    'Demo profile', 'Rain re-plan', 'Lunch options near you', 'Mission Dolores'.
 * 3. No 'Connected' text without matching ConnectorStatus 'connected'.
 * 4. Calendar row reads 'Not available yet'.
 * 5. Every data-provenance='live' element has data-source and data-fetched-at.
 *
 * Then crawls Demo mode (?dev=1):
 * - Every scene-derived surface is labelled simulated/fixture.
 */

const FORBIDDEN_DEMO_STRINGS = [
  'SIMULATED',
  'Demo Place',
  'Piano lesson',
  'Team Sync',
  'Downtown',
  'Demo profile',
  'Rain re-plan',
  'Lunch options near you',
  'Mission Dolores',
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

test.describe('CLOSEOUT_REV3UI: Truthfulness & Provenance Audit', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      test('Live mode: Home surface truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const bodyText = await page.locator('.app-layout').innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(bodyText).not.toContain(forbidden);
        }

        // 3. No 'Connected' text without matching ConnectorStatus 'connected'
        const connectedLocators = page.locator('.status-pill:has-text("Connected"), .card-badge:has-text("Connected")');
        const count = await connectedLocators.count();
        expect(count).toBe(0);

        // 4. Every data-provenance='live' element has data-source and data-fetched-at
        const liveElements = page.locator('[data-provenance="live"]');
        const liveCount = await liveElements.count();
        for (let i = 0; i < liveCount; i++) {
          const el = liveElements.nth(i);
          await expect(el).toHaveAttribute('data-source');
          await expect(el).toHaveAttribute('data-fetched-at');
          const source = await el.getAttribute('data-source');
          const fetchedAt = await el.getAttribute('data-fetched-at');
          expect(source?.trim().length).toBeGreaterThan(0);
          expect(fetchedAt?.trim().length).toBeGreaterThan(0);
        }
      });

      test('Live mode: Plans surface truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-plans').click();
        } else {
          await page.locator('#tab-plans').click();
        }
        await page.waitForSelector('.v2-plans-view');

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const bodyText = await page.locator('.app-layout').innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(bodyText).not.toContain(forbidden);
        }

        // Verify honest empty plans
        const emptyPlans = page.locator('.v2-empty-plans');
        await expect(emptyPlans).toBeVisible();
        await expect(emptyPlans).toHaveAttribute('data-provenance', 'none');
      });

      test('Live mode: For You surface truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-for-you').click();
        } else {
          await page.locator('#tab-for-you').click();
        }
        await page.waitForSelector('.v2-for-you-view');

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const bodyText = await page.locator('.app-layout').innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(bodyText).not.toContain(forbidden);
        }

        // Verify honest empty proposals
        const emptyProposals = page.locator('.v2-empty-proposals');
        await expect(emptyProposals).toBeVisible();
        await expect(emptyProposals).toHaveAttribute('data-provenance', 'none');
      });

      test('Live mode: Me / Memories surface truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-me').click();
        } else {
          await page.locator('#tab-me').click();
        }
        await page.waitForSelector('.me-view-container');

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const bodyText = await page.locator('.app-layout').innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(bodyText).not.toContain(forbidden);
        }
      });

      test('Live mode: Settings > Connectors truthfulness and Calendar availability', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-connectors').click();
        } else {
          await page.locator('#tab-me').click();
          await page.locator('#btn-me-connectors').click();
        }
        await page.waitForSelector('#connectors-page');

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const bodyText = await page.locator('.app-layout').innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(bodyText).not.toContain(forbidden);
        }

        // 3. Calendar row reads 'Not available yet'
        const calendarRow = page.locator('#connector-row-calendar');
        await expect(calendarRow).toBeVisible();
        await expect(calendarRow).toContainText('Not available yet');

        // 4. No 'Connected' text without matching ConnectorStatus 'connected'
        const exactConnectedPills = page.locator('.connector-status-badge, .status-pill').filter({ hasText: /^Connected$/i });
        await expect(exactConnectedPills).toHaveCount(0);
      });

      test('Live mode: Sources view truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        // Open Sources modal via context pill
        const statusPill = page.locator('#pill-context-status');
        await expect(statusPill).toBeVisible();
        await statusPill.click();

        const sourcesDialog = page.locator('.sources-modal-card');
        await expect(sourcesDialog).toBeVisible();

        // 1. No element has data-provenance='fixture'
        const fixtureElements = page.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent
        const sourcesText = await sourcesDialog.innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(sourcesText).not.toContain(forbidden);
        }

        // 3. Calendar status in sources view is honest unavailable
        const calSourceItem = sourcesDialog.locator('#source-item-calendar');
        if (await calSourceItem.count() > 0) {
          await expect(calSourceItem).toContainText('Not available yet');
        }

        // Close dialog
        await page.locator('#btn-close-why').click();
        await expect(sourcesDialog).toHaveCount(0);
      });

      if (vp.width >= 1024) {
        test('Live mode: Desktop right panel neutral quiet state and truthfulness', async ({ page }) => {
          await page.goto('/?mode=live');
          await page.waitForSelector('.app-layout');

          const rightPanel = page.locator('#desktop-right-panel');
          await expect(rightPanel).toBeVisible();

          // 1. No element has data-provenance='fixture'
          const fixtureElements = rightPanel.locator('[data-provenance="fixture"]');
          await expect(fixtureElements).toHaveCount(0);

          // 2. Forbidden demo strings absent
          const panelText = await rightPanel.innerText();
          for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
            expect(panelText).not.toContain(forbidden);
          }

          // 3. In Live mode without destination/route, right panel is neutral quiet
          await expect(rightPanel.locator('[data-panel-type="quiet"]')).toBeVisible();
          await expect(rightPanel.locator('#desktop-live-quiet-summary')).toContainText('Nothing selected. Select a card to see details.');
        });
      }

      test('Live mode: Ask overlay truthfulness and zero leaks', async ({ page }) => {
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout');

        const askBar = page.locator('#ask-bar');
        await expect(askBar).toBeVisible();
        await askBar.click();

        const askOverlay = page.locator('#conversation-overlay');
        await expect(askOverlay).toBeVisible();

        // 1. No element has data-provenance='fixture'
        const fixtureElements = askOverlay.locator('[data-provenance="fixture"]');
        await expect(fixtureElements).toHaveCount(0);

        // 2. Forbidden demo strings absent in initial overlay
        const overlayText = await askOverlay.innerText();
        for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
          expect(overlayText).not.toContain(forbidden);
        }

        // Close Ask overlay
        const closeBtn = page.locator('#btn-close-ask');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await expect(askOverlay).toHaveCount(0);
      });

      test('Demo mode (?dev=1): Every scene-derived surface is labelled simulated/fixture', async ({ page }) => {
        // Multi-candidate scene populates both upcoming plans and for-you proposals
        await page.goto('/?mode=demo&dev=1&scene=multi-candidate');
        await page.waitForSelector('.app-layout');
        await selectDemoScene(page, 'multi-candidate');

        // Home Now Card: labelled fixture and contains SIMULATED badge
        const demoNowCard = page.locator('.now-card');
        await expect(demoNowCard).toBeVisible();
        await expect(demoNowCard).toHaveAttribute('data-provenance', 'fixture');
        await expect(demoNowCard).toContainText('SIMULATED');

        // Sources modal in Demo: labelled simulated
        await page.locator('#pill-context-status').click();
        const sourcesDialog = page.locator('.sources-modal-card');
        await expect(sourcesDialog).toBeVisible();
        await expect(sourcesDialog).toContainText('SIMULATED');
        await expect(sourcesDialog.locator('.simulated-badge').first()).toBeVisible();
        await page.locator('#btn-close-why').click();

        // For You in Demo: labelled fixture and references sample demo profile
        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-for-you').click();
        } else {
          await page.locator('#tab-for-you').click();
        }
        await page.waitForSelector('.v2-for-you-view');
        // HABIT-LEARN: For You lists only what Yori learned (read-only). In Demo every learned item
        // is the labelled sample habit (provenance fixture, "· demo"); with none, the empty state
        // claims nothing; and nothing waits for a confirm step.
        const learnedItems = page.locator('.v2-proposal-item-card');
        const n = await learnedItems.count();
        if (n === 0) {
          await expect(page.locator('.v2-empty-proposals')).toHaveAttribute('data-provenance', 'none');
        }
        for (let i = 0; i < n; i++) {
          await expect(learnedItems.nth(i)).toHaveAttribute('data-provenance', 'fixture');
          await expect(learnedItems.nth(i)).toContainText('demo');
        }
        await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

        // Plans in Demo: labelled fixture and contains SIMULATED badge
        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-plans').click();
        } else {
          await page.locator('#tab-plans').click();
        }
        await page.waitForSelector('.v2-plans-view');
        const planItem = page.locator('.v2-plan-item-card').first();
        await expect(planItem).toBeVisible();
        await expect(planItem).toHaveAttribute('data-provenance', 'fixture');
        await expect(planItem).toContainText('SIMULATED');

        // Desktop right panel in Demo (desktop only)
        if (vp.width >= 1024) {
          await page.locator('#desktop-nav-home').click();
          await page.waitForSelector('.now-card');
          const rightPanel = page.locator('#desktop-right-panel');
          await expect(rightPanel).toBeVisible();
          // The route or places panel derives from fixture
          const fixtureInPanel = rightPanel.locator('[data-provenance="fixture"]');
          await expect(fixtureInPanel.first()).toBeVisible();
        }
      });
    });
  }
});
