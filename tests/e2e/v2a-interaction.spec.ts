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

    // Assert V2 transit option cards verbatim in Rain scene (Part 2 of VIDEO_SCRIPT.md)
    const optionCards = page.locator('.v2-options-grid .v2-option-card');
    await expect(optionCards).toHaveCount(2);

    const driveCard = optionCards.first();
    await expect(driveCard.locator('.v2-option-label')).toHaveText('Drive · leave 2:30 PM');
    await expect(driveCard.locator('.v2-option-badge')).toHaveText('Recommended');
    await expect(driveCard.locator('.v2-option-meta')).toHaveText('25 min drive + 5m margin');
    await expect(driveCard.locator('.v2-option-basis')).toHaveText(
      'Ranked by habit: Rain travel habit (Demo profile · sample)'
    );

    const busCard = optionCards.nth(1);
    await expect(busCard.locator('.v2-option-label')).toHaveText('Bus · leave 2:15 PM');
    await expect(busCard.locator('.v2-option-badge')).toHaveText('Alternative');
    await expect(busCard.locator('.v2-option-meta')).toHaveText('40 min bus + 5m margin');

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

  test('V2a-2 model decision engine: "Can I leave later?" shows engine status chip, ranked recommendation, Why reason codes, and Undo', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    const askBar = page.locator('#ask-bar');
    await askBar.click();

    // Verify initial engine status chip is offline fallback before model runs
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    const statusChip = page.locator('#engine-status-chip');
    await expect(statusChip).toBeVisible();
    await expect(statusChip).toContainText('Offline fallback · deterministic');

    // Submit "Can I leave later?"
    const input = page.locator('#conversation-input');
    await input.fill('Can I leave later?');
    await page.locator('#conversation-send-btn').click();

    // After model decision engine runs under scripted fixtures, status updates truthfully (C6)
    await expect(statusChip).toContainText('Scripted model fixture · not a live model call');

    // Verify comparison box appears with both options and model recommendation badge
    const compBox = page.locator('.chat-comparison-box');
    await expect(compBox).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#conversation-transcript')).toContainText('You can leave up to 5 minutes later');
    await expect(page.locator('#conversation-transcript')).toContainText('arrive on time');

    // Recommendation badge with reason code is visible
    const recBadge = page.locator('.chat-comparison-recommendation');
    await expect(recBadge).toBeVisible();
    await expect(recBadge).toContainText('Recommended');

    // Status chip remains honestly labelled
    await expect(statusChip).toContainText('Scripted model fixture · not a live model call');

    // Capture model comparison screenshot while conversation overlay and status chip are open
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile
      ? 'v2-model-comparison-mobile.png'
      : 'v2-model-comparison-desktop.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });

    // Inspect Redacted Decision Log panel (C7)
    const toggleLogBtn = page.locator('#btn-toggle-decision-log');
    await expect(toggleLogBtn).toBeVisible();
    await toggleLogBtn.click();

    const drawer = page.locator('#decision-log-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Redacted Decision Log (C7)');
    await expect(drawer).toContainText('weather:2026-10-28T20:35:00.000Z');
    await expect(drawer).toContainText('weather_adjusted');

    const exportBtn = page.locator('#btn-export-decision-log');
    await expect(exportBtn).toBeVisible();

    // Close log drawer
    await toggleLogBtn.click();
    await expect(drawer).toBeHidden();

    // Click model-recommended safe option button (+5m)
    const safeBtn = page.locator('.btn-select-comparison[data-delta="5"]');
    await expect(safeBtn).toBeVisible();
    await safeBtn.click();

    // Auto-collapses to updated home on-time (2:35 PM leave)
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toContainText('2:35 PM');

    // Open Why sheet to verify model reason codes
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    const situationSection = page.locator('#why-situation-section');
    await expect(situationSection).toContainText('Situation Attribution');
    await expect(situationSection).toContainText('Weather Adjusted');
    await expect(situationSection).toContainText('Weather forecast · issued 1:35 PM');

    // Anti-jargon & human provenance invariants on Why sheet (Finding 2)
    const situationText = await situationSection.innerText();
    expect(situationText).not.toContain('weather:2026-10-28');
    expect(situationText).not.toContain('2026-10-28T20:35:00.000Z');
    expect(situationText).not.toContain('Weather forecast updated to rain');
    expect(situationText).toContain('Precipitation increased · travel buffer adjusted for rain');

    // Full Why sheet scan for zero engineering jargon
    const fullWhyText = await whySheet.innerText();
    expect(fullWhyText).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(fullWhyText).not.toContain('weather:2026');
    expect(fullWhyText).not.toContain('rain_transport_preference');
    expect(fullWhyText).not.toContain('fail-closed');

    // Close Why sheet
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);

    // Verify Undo restores prior plan (2:30 PM)
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
    await expect(nowCard).toContainText('2:30 PM');

    // Axe audit
    await checkAxe(page);
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

  test('Chat "Why?" produces human derivation with honest sample profile provenance and zero formulas (Finding 3)', async ({
    page,
  }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const input = page.locator('#conversation-input');
    await input.fill('Why this plan?');
    await page.locator('#conversation-send-btn').click();

    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('Piano lesson is scheduled at 3:00 PM');
    await expect(transcript).toContainText('Demo profile · sample preference');
    await expect(transcript).toContainText('Rain travel habit');

    // Anti-jargon invariants
    const text = await transcript.innerText();
    expect(text).not.toContain('14:30');
    expect(text).not.toContain('15:00 leave');
    expect(text).not.toContain('=');
    expect(text).not.toContain('rain_transport_preference');
    expect(text).not.toMatch(/confirmed\s+rain_transport/i);
    expect(text).not.toContain('derived from your schedule and travel estimate fixtures');
  });
});
