import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('v2');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V2b: Lunch Loop, Fixture Attributes & Request Override Re-Rank', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V2b lunch loop: candidate cards -> quieter + vegetarian -> re-rank -> RestaurantDetail -> negative storage -> Undo', async ({
    page,
  }) => {
    const vp = page.viewportSize();
    const vpSuffix = `${vp?.width ?? 390}x${vp?.height ?? 844}`;

    // 1. Navigate to V2 UI
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Select away-lunch scene
    await selectDemoScene(page, 'away-lunch');

    // 2. Initial Home Verification
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Lunch options near you');

    // Top candidate is initially Place A (Ramen)
    const initialTopCard = page.locator('.v2-candidate-card').first();
    await expect(initialTopCard).toContainText('Demo Place A · Ramen');
    await expect(initialTopCard).toHaveClass(/selected/);

    // Verify fixture attribute chips are rendered on candidate cards
    await expect(page.locator('.v2-candidate-list')).toContainText('Quiet');
    await expect(page.locator('.v2-candidate-list')).toContainText('Vegetarian');
    await expect(page.locator('.v2-candidate-list')).toContainText('5m away');

    // Data honesty: assert zero star ratings or review counts
    const textContent = await page.locator('.now-card').innerText();
    expect(textContent).not.toMatch(/[★☆]/);
    expect(textContent).not.toMatch(/\b\d+(\.\d+)?\s*(stars|reviews|ratings)\b/i);

    // Save initial state screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v2b-lunch-home-initial-${vpSuffix}.png`),
    });

    // Accessibility audit on initial state
    await checkAxe(page);

    // 3. Open conversation via Ask bar
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Scene-aware greeting for lunch scene
    await expect(page.locator('#conversation-transcript')).toContainText(
      "Here's what I can look into for you."
    );

    // Truthful engine status: offline fallback initially before model call runs
    const engineStatusChip = page.locator('#engine-status-chip');
    await expect(engineStatusChip).toBeVisible();
    await expect(engineStatusChip).toContainText('Offline fallback · deterministic');

    // 4. Type "quieter + vegetarian" and submit
    const input = page.locator('#conversation-input');
    await input.fill('quieter + vegetarian');
    await page.locator('#conversation-send-btn').click();

    // 5. Verify auto-collapse back to updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });

    // 6. Verify updated Home with re-ranked candidates
    // Demo Place B · Salad is now #1 and selected!
    const updatedTopCard = page.locator('.v2-candidate-card').first();
    await expect(updatedTopCard).toContainText('Demo Place B · Salad');
    await expect(updatedTopCard).toHaveClass(/selected/);
    await expect(updatedTopCard).toContainText('Salad');
    await expect(updatedTopCard).toContainText('7m away');
    await expect(updatedTopCard).toContainText('Quiet');
    await expect(updatedTopCard).toContainText('Vegetarian');

    // Save re-ranked home screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v2b-lunch-home-reranked-${vpSuffix}.png`),
    });

    // Accessibility audit on re-ranked state
    await checkAxe(page);

    // 7. Open RestaurantDetail for Demo Place B · Salad
    await updatedTopCard.click();

    const restDetailName = page.locator('#restaurant-detail-name');
    await expect(restDetailName).toBeVisible();
    await expect(restDetailName).toContainText('Demo Place B · Salad');

    // Verify attribute chips inside RestaurantDetail
    const attrChips = page.locator('.v2-attribute-chips');
    await expect(attrChips).toContainText('Salad');
    await expect(attrChips).toContainText('7m away');
    await expect(attrChips).toContainText('Quiet');
    await expect(attrChips).toContainText('Vegetarian');

    // Verify Save button toggles UI state only (never writes memory)
    const saveBtn = page.locator('#btn-restaurant-save');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText('Save');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Saved');

    // Screenshot RestaurantDetail
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v2b-restaurant-detail-${vpSuffix}.png`),
    });

    // Back navigation returns focus to the originating candidate card
    const backBtn = page.locator('#restaurant-detail-back-btn');
    await backBtn.click();
    await expect(page.locator('#restaurant-detail-name')).toHaveCount(0);
    await expect(updatedTopCard).toBeVisible();

    // 8. Negative Storage Test: Verify zero new or changed confirmed facts
    const storageRaw = await page.evaluate(() => localStorage.getItem('yori_storage_envelope_v1'));
    if (storageRaw) {
      const envelope = JSON.parse(storageRaw);
      const confirmedFacts = envelope.payload?.memoryFacts?.filter(
        (f: any) => f.status === 'confirmed'
      ) ?? [];
      // Zero synthetic facts added
      expect(confirmedFacts.every((f: any) => f.key !== 'user_request')).toBe(true);
      expect(confirmedFacts.every((f: any) => f.key !== 'lunch_filter')).toBe(true);
    }

    // 9. HABIT-LEARN addendum 2: no Why action or Why sheet; the re-ranked cards state no reason
    // and the Home text stays free of engineering jargon.
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.v2-candidate-basis')).toHaveCount(0);
    const homeText = await page.locator('main').innerText();
    expect(homeText).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(homeText).not.toMatch(/mock_places:\d{4}/);
    expect(homeText).not.toMatch(/taste_preference=/);
    expect(homeText).not.toContain('mock_places');

    // 10. Undo restores prior plan
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // Prior plan restored: Demo Place A · Ramen is #1 again
    const restoredTopCard = page.locator('.v2-candidate-card').first();
    await expect(restoredTopCard).toContainText('Demo Place A · Ramen');

    // Save Undo state screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `v2b-lunch-undo-${vpSuffix}.png`),
    });
  });

  test('V2b pinned conversation: asserts truthful engine status chip after model call', async ({
    page,
  }) => {
    // 1. Navigate to V2 UI
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Select away-lunch scene
    await selectDemoScene(page, 'away-lunch');

    // 2. Open conversation and pin it so it does not auto-collapse
    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Scene-aware greeting for lunch scene
    await expect(page.locator('#conversation-transcript')).toContainText(
      "Here's what I can look into for you."
    );

    const pinBtn = page.locator('#conversation-pin-btn');
    await pinBtn.click();

    const statusChip = page.locator('#engine-status-chip');
    await expect(statusChip).toContainText('Offline fallback · deterministic');

    // 3. Submit "quieter + vegetarian"
    const input = page.locator('#conversation-input');
    await input.fill('quieter + vegetarian');
    await page.locator('#conversation-send-btn').click();

    // 4. Assert engine status updates to scripted fixture truthfully (C6)
    await expect(statusChip).toContainText('Scripted model fixture · not a live model call');
    await expect(page.locator('#conversation-transcript')).toContainText('Demo Place B · Salad');

    // 5. Ask "Why?" in chat and verify honest sample preference wording with zero "confirmed"
    await input.fill('Why?');
    await page.locator('#conversation-send-btn').click();

    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('sample taste preferences from the demo profile');
    await expect(transcript).toContainText('Demo profile · sample preference');

    // The assistant's latest response must NOT contain "confirmed"
    const lastAssistantMsg = page.locator('.chat-bubble-assistant').last();
    const lastMsgText = await lastAssistantMsg.innerText();
    expect(lastMsgText.toLowerCase()).not.toContain('confirmed');
  });

  test('V2b surface sweep: no false confirmed or live claims with demo facts across Away lunch and Rain', async ({
    page,
  }) => {
    function assertNoFalseConfirmedOrLive(text: string, surfaceName: string) {
      const sanitized = text
        .replace(/\bnot confirmed\b/gi, '')
        .replace(/\bscripted model fixture · not a live model call\b/gi, '')
        .replace(/\blive context\b/gi, '');

      const confirmedMatches = sanitized.match(/\bconfirmed\b/i);
      expect(
        confirmedMatches,
        `Unexpected 'confirmed' found on surface '${surfaceName}':\n${text}`
      ).toBeNull();

      const liveMatches = sanitized.match(/\blive\b/i);
      expect(
        liveMatches,
        `Unexpected 'live' found on surface '${surfaceName}':\n${text}`
      ).toBeNull();
    }

    // 1. Away Lunch Sweep
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await selectDemoScene(page, 'away-lunch');

    // (1a) Home surface
    let text = await page.locator('.app-layout').innerText();
    assertNoFalseConfirmedOrLive(text, 'away-lunch:home');

    // (1b) Detail surface (RestaurantDetail)
    await page.locator('.v2-candidate-card').first().click();
    await page.waitForSelector('#restaurant-detail-name');
    text = await page.locator('.v2-restaurant-detail').innerText();
    assertNoFalseConfirmedOrLive(text, 'away-lunch:detail');
    await page.locator('#restaurant-detail-back-btn').click();
    await page.waitForSelector('.now-card');

    // HABIT-LEARN addendum 2: there is no Why sheet surface to sweep
    await expect(page.locator('#btn-why')).toHaveCount(0);

    // (1d) Chat Why
    await page.locator('#ask-bar').click();
    await page.waitForSelector('#conversation-overlay');
    await page.locator('#conversation-input').fill('Why?');
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('.chat-bubble-assistant').last()).toBeVisible();
    text = await page.locator('#conversation-transcript').innerText();
    assertNoFalseConfirmedOrLive(text, 'away-lunch:chat-why');

    // (1e) After filter
    await page.locator('#conversation-input').fill('quieter + vegetarian');
    await page.locator('#conversation-send-btn').click();
    // Auto-collapses to home
    await expect(page.locator('#conversation-overlay')).toHaveCount(0, { timeout: 5000 });
    await page.waitForSelector('.now-card');
    text = await page.locator('.app-layout').innerText();
    assertNoFalseConfirmedOrLive(text, 'away-lunch:after-filter:home');

    // HABIT-LEARN addendum 2: there is no Why sheet surface to sweep
    await expect(page.locator('#btn-why')).toHaveCount(0);

    // (1f) After Undo
    await page.locator('#btn-undo-accept').click();
    text = await page.locator('.app-layout').innerText();
    assertNoFalseConfirmedOrLive(text, 'away-lunch:after-undo:home');

    // 2. Rain Scene Sweep
    await selectDemoScene(page, 'rain');
    await page.waitForSelector('.now-card');

    // (2a) Rain Home
    text = await page.locator('.app-layout').innerText();
    assertNoFalseConfirmedOrLive(text, 'rain:home');

    // (2b) Rain Detail
    await page.locator('#btn-view-trip-details').click();
    await page.waitForSelector('.v2-trip-detail');
    text = await page.locator('.v2-trip-detail').innerText();
    assertNoFalseConfirmedOrLive(text, 'rain:detail');
    await page.locator('#trip-detail-back-btn').click();
    await page.waitForSelector('.now-card');

    // HABIT-LEARN addendum 2: there is no Why sheet surface to sweep
    await expect(page.locator('#btn-why')).toHaveCount(0);

    // (2d) Rain Chat Why
    await page.locator('#ask-bar').click();
    await page.waitForSelector('#conversation-overlay');
    await page.locator('#conversation-input').fill('Why this plan?');
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('.chat-bubble-assistant').last()).toBeVisible();
    text = await page.locator('#conversation-transcript').innerText();
    assertNoFalseConfirmedOrLive(text, 'rain:chat-why');
  });
});
