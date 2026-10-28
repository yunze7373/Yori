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
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('away-lunch');

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

    // 9. Verify Why Sheet carries user_request provenance & honest sample fact attribution
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();

    const whyText = await page.locator('#why-order-text, .why-derivation-text').innerText();
    expect(whyText).toContain('Because you asked: quieter, vegetarian · this time only');

    // Situation Attribution: honest Sample Preference attribution, zero "confirmed" or "travel"
    const sitSection = page.locator('#why-situation-section');
    await expect(sitSection).toBeVisible();
    await expect(sitSection).toContainText('Sample Preference');
    await expect(sitSection).toContainText('Matches a sample preference from the demo profile');
    const sitText = await sitSection.innerText();
    expect(sitText.toLowerCase()).not.toContain('confirmed');
    expect(sitText.toLowerCase()).not.toContain('travel');

    // Derivation text: states sample taste preferences from the demo profile, zero "confirmed"
    const derivLocator = page.locator('.why-derivation-text');
    await expect(derivLocator).toContainText('sample taste preferences from the demo profile');
    const derivText = await derivLocator.innerText();
    expect(derivText.toLowerCase()).not.toContain('confirmed');

    // Memory facts: clearly labeled Demo profile · sample preference
    await expect(whySheet).toContainText('Demo profile · sample preference');

    // Anti-jargon: no raw ISO strings, raw keys, or mock places jargon in Why sheet
    expect(whyText).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(whyText).not.toMatch(/mock_places:\d{4}/);
    expect(whyText).not.toMatch(/taste_preference=/);
    await expect(whySheet).toContainText('Nearby places');
    await expect(whySheet).toContainText('Demo place list');
    const whySheetFullText = await whySheet.innerText();
    expect(whySheetFullText).not.toContain('mock places');
    expect(whySheetFullText).not.toContain('mock_places');

    // Close Why sheet
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);

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
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('away-lunch');

    // 2. Open conversation and pin it so it does not auto-collapse
    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

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
});
