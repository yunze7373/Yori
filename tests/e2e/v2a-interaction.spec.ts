import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v2');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V2a-1: Deterministic Grammar, Late Shift Flow & Before-You-Ask Replay', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V2a-1 interaction: ask bar -> leave later -> late confirmation -> collapse -> Why provenance -> Undo', async ({
    page,
  }) => {
    // 1. Navigate to V2 UI with rain scenario
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Select rain scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');
    await expect(page.locator('.now-card')).toContainText('Piano lesson');
    await expect(page.locator('.now-card')).toContainText('2:30 PM');

    // 2. Open conversation via Ask bar
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    // Verify conversation overlay opens with honest header
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');

    // 3. Type "Can I leave 15 minutes later?" and submit
    const input = page.locator('#conversation-input');
    await input.fill('Can I leave 15 minutes later?');
    await page.locator('#conversation-send-btn').click();

    // 4. Verify late arrival confirmation appears in transcript
    const confirmBox = page.locator('.chat-confirm-box');
    await expect(confirmBox).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#conversation-transcript')).toContainText('arrive late');
    const confirmBtn = page.locator('#btn-chat-confirm');
    await expect(confirmBtn).toBeVisible();

    // 5. Confirm late shift for this time only
    await confirmBtn.click();

    // 6. Verify auto-collapse back to updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    // New leave time is 2:45 PM
    await expect(nowCard).toContainText('2:45 PM');
    await expect(nowCard).toContainText('2:25 PM'); // prepare time shifted equally (+15m from 2:10 PM)

    // 7. Verify Why sheet carries user_request provenance
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-order-text, .why-derivation-text')).toContainText(
      'Because you asked: leave 15 min later · this time only'
    );

    // C2: Distinct user request provenance without SIMULATED badge
    const userReqRow = page.locator('.why-item-user-request');
    await expect(userReqRow).toBeVisible();
    await expect(userReqRow).toContainText('Your request · this time only');
    await expect(userReqRow).toContainText('THIS SESSION');
    await expect(userReqRow.locator('.badge-simulated')).toHaveCount(0);

    // Close Why sheet
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);

    // 8. Verify Undo button restores prior plan
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // Prior plan restored: leave 2:30 PM
    await expect(nowCard).toContainText('2:30 PM');

    // 9. Axe accessibility audit
    await checkAxe(page);

    // 10. Capture screenshot evidence
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile
      ? 'v2-interaction-mobile-390x844.png'
      : 'v2-interaction-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('V2a-1 before-you-ask: replay button triggers clear -> rain transition with highlighted change', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Verify replay button exists
    const replayBtn = page.locator('#btn-replay-before-you-ask');
    await expect(replayBtn).toBeVisible();

    // Click replay Before You Ask
    await replayBtn.click();

    // Wait for transition to rain scene
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Take umbrella', { timeout: 5000 });
    await expect(nowCard.locator('#chip-umbrella')).toContainText('Umbrella');
    await expect(nowCard).toContainText('2:30 PM');

    // Axe audit
    await checkAxe(page);

    // Capture screenshot evidence
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile
      ? 'v2-before-you-ask-mobile.png'
      : 'v2-before-you-ask-desktop.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('V2a-1 comparison: "Can I leave later?" shows on-time vs late options comparison', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const input = page.locator('#conversation-input');
    await input.fill('Can I leave later?');
    await page.locator('#conversation-send-btn').click();

    // Verify comparison box appears with both options
    const compBox = page.locator('.chat-comparison-box');
    await expect(compBox).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#conversation-transcript')).toContainText('You can leave up to 5 minutes later');
    await expect(page.locator('#conversation-transcript')).toContainText('arrive on time');

    // Click safe option button
    const safeBtn = page.locator('.btn-select-comparison[data-delta="5"]');
    await expect(safeBtn).toBeVisible();
    await safeBtn.click();

    // Auto-collapses to updated home on-time (2:35 PM leave)
    await expect(page.locator('#conversation-overlay')).toHaveCount(0, { timeout: 5000 });
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toContainText('2:35 PM');
  });

  test('V2a-1 C1 non-resurrection: dismissed plan cannot be resurrected by chat', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    // Dismiss the plan
    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Confirm dismiss modal
    const confirmDismiss = page.locator('#btn-confirm-dismiss');
    await expect(confirmDismiss).toBeVisible();
    await confirmDismiss.click();

    // Now card is removed (quiet state)
    await expect(page.locator('.now-card')).toHaveCount(0);

    // Ask to leave later via chat
    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const input = page.locator('#conversation-input');
    await input.fill('Leave 3 minutes later');
    await page.locator('#conversation-send-btn').click();

    // Receives honest notice, no plan synthesized
    await expect(page.locator('#conversation-transcript')).toContainText(
      "There's no departure plan to adjust right now."
    );

    // Close conversation and verify home is still quiet (no NOW card resurrected)
    await page.locator('#conversation-close-btn').click();
    await expect(page.locator('.now-card')).toHaveCount(0);
  });
});
