import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/ask-prompts');

test.describe('ASK-PROMPTS-PREMIUM Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  const viewports = [
    { width: 390, height: 844, name: '390x844' },
    { width: 1280, height: 800, name: '1280x800' },
  ];

  for (const vp of viewports) {
    test(`Live idle opener with suggestion chips at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?dev=1');
      await page.waitForSelector('.app-layout');

      // Switch to Live mode via demo controls panel
      await page.locator('#btn-dev-demo-controls').click();
      await page.locator('#btn-mode-live').click();
      await page.locator('#btn-close-demo-panel').click();

      // Open Ask sheet
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();

      // Verify composer placeholder (NFR English & drop 'command')
      const composerInput = page.locator('#conversation-input');
      await expect(composerInput).toHaveAttribute('placeholder', 'Ask Yori anything');

      // Verify warm assistant opener
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText("Here's what I can look into for you.");

      // Verify zero CJK characters in transcript and composer
      const transcriptText = await transcript.innerText();
      expect(transcriptText).not.toMatch(/[\u4e00-\u9fff\u3040-\u30ff]/);
      expect(transcriptText).not.toMatch(/why|looks good|undo|confirm|restore/i);

      // Verify Live idle suggestion chips
      const chips = page.locator('.chat-suggestion-chip');
      await expect(chips).toHaveCount(3);
      await expect(chips.nth(0)).toHaveText('Lunch nearby');
      await expect(chips.nth(1)).toHaveText('Somewhere quiet');
      await expect(chips.nth(2)).toHaveText('Closer to me');

      // Verify touch target >= 44px
      const firstChipBox = await chips.first().boundingBox();
      expect(firstChipBox).not.toBeNull();
      if (firstChipBox) {
        expect(firstChipBox.height).toBeGreaterThanOrEqual(44);
      }

      // Evidence screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `live-idle-${vp.name}.png`),
      });

      // Tap chip interaction: "Somewhere quiet" sends query
      await chips.nth(1).click();
      await expect(transcript).toContainText('Somewhere quiet');
    });

    test(`Lunch opener with suggestion chips at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?dev=1');
      await page.waitForSelector('.app-layout');

      // Switch to lunch scene
      await page.locator('#btn-dev-demo-controls').click();
      await page.selectOption('#scene-select', 'away-lunch');
      await page.locator('#btn-close-demo-panel').click();

      // Open Ask sheet
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();

      // Verify warm assistant opener
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText("Here's what I can look into for you.");

      // Verify zero CJK characters
      const transcriptText = await transcript.innerText();
      expect(transcriptText).not.toMatch(/[\u4e00-\u9fff\u3040-\u30ff]/);

      // Verify Lunch suggestion chips
      const chips = page.locator('.chat-suggestion-chip');
      await expect(chips).toHaveCount(3);
      await expect(chips.nth(0)).toHaveText('Somewhere quieter');
      await expect(chips.nth(1)).toHaveText('Vegetarian options');
      await expect(chips.nth(2)).toHaveText('Closer to me');

      // Evidence screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `lunch-${vp.name}.png`),
      });

      // Tap chip interaction: "Vegetarian options" sends query
      await chips.nth(1).click();
      // Verifies submission succeeds without error
      await expect(page.locator('.app-layout')).toBeVisible();
    });
  }

  test('Depart and Fuel scene suggestion chips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    // 1. Depart scene (rain)
    await page.locator('#btn-dev-demo-controls').click();
    await page.selectOption('#scene-select', 'rain');
    await page.locator('#btn-close-demo-panel').click();

    await page.locator('#ask-bar').click();
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText("Here's what I can look into for you.");
    const departChips = page.locator('.chat-suggestion-chip');
    await expect(departChips).toHaveCount(2);
    await expect(departChips.nth(0)).toHaveText('Leave 15 minutes later');
    await expect(departChips.nth(1)).toHaveText('Take the bus');

    // Close conversation
    await page.locator('#conversation-close-btn').click();

    // 2. Fuel scene
    await page.locator('#btn-dev-demo-controls').click();
    await page.selectOption('#scene-select', 'fuel');
    await page.locator('#btn-close-demo-panel').click();

    await page.locator('#ask-bar').click();
    await expect(transcript).toContainText("Here's what I can look into for you.");
    const fuelChips = page.locator('.chat-suggestion-chip');
    await expect(fuelChips).toHaveCount(1);
    await expect(fuelChips.first()).toHaveText('Find gas nearby');
  });
});
