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

test.describe('V-ANCHOR & V0: Action-State Store & Interaction Shell Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V1 approved home renders by default without ask bar and passes axe accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v1
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');

    // V2 badge is NOT rendered
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);

    // Ask bar is NOT rendered on v1
    await expect(page.locator('#ask-bar')).toHaveCount(0);

    // Standard demo chip is present
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');

    // Verify D1 clear departure scene
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');

    // Axe audit
    await checkAxe(page);

    // Capture screenshot evidence
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile ? 'v1-home-mobile-390x844.png' : 'v1-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('V2 shell renders with Ask bar, opens Conversation shell, manages focus, Esc, pin, and axe', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v2
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v2');

    // V2 badge IS rendered
    const v2Badge = page.locator('#badge-ui-version');
    await expect(v2Badge).toBeVisible();
    await expect(v2Badge).toHaveText('V2 Preview');

    // Ask bar is rendered at the bottom of the home screen
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await expect(askBar).toContainText('Ask Yori about your day...');

    // Capture Home state screenshot for V2
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const homeFilename = isMobile ? 'v2-home-mobile-390x844.png' : 'v2-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, homeFilename), fullPage: false });

    // 1. Open conversation overlay by tapping ask bar
    await askBar.click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // 2. Focus moves into the conversation input composer on open
    const composerInput = page.locator('#conversation-input');
    await expect(composerInput).toBeFocused();

    // 3. Transcript displays initial assistant greeting
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toBeVisible();
    await expect(transcript).toContainText('Hello! I am Yori');

    // 4. Send message: composer accepts input and presents honest V0 placeholder
    await composerInput.fill('Can I leave 15 minutes later?');
    await page.locator('#conversation-send-btn').click();

    await expect(transcript).toContainText('Can I leave 15 minutes later?');
    await expect(transcript).toContainText('Commands arrive in the next build (V2a)');

    // 5. Pin button toggles pin state
    const pinBtn = page.locator('#conversation-pin-btn');
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'false');
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(pinBtn).toHaveClass(/is-pinned/);

    // 6. Axe audit on open conversation dialog
    await checkAxe(page);

    // 7. Capture Conversation state screenshot for V2
    const conversationFilename = isMobile
      ? 'v2-conversation-mobile-390x844.png'
      : 'v2-conversation-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, conversationFilename), fullPage: false });

    // 8. Close via Close button -> focus returns to Ask bar
    const closeBtn = page.locator('#conversation-close-btn');
    await closeBtn.click();
    await expect(overlay).toHaveCount(0);
    await expect(askBar).toBeFocused();

    // 9. Reopen and test Esc key -> focus returns to Ask bar
    await askBar.click();
    await expect(overlay).toBeVisible();
    await expect(composerInput).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(askBar).toBeFocused();
  });

  test('V2 preserves full scenario switching and plan functionality', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Clear D1
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');

    // Switch to Rain D2
    await page.selectOption('#scene-select', 'rain');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    await expect(page.locator('.now-card')).toContainText('Umbrella');
    await expect(page.locator('.now-card')).toContainText('Drive · leave 2:30 PM');

    // Switch to Away Lunch D3
    await page.selectOption('#scene-select', 'away-lunch');
    await expect(page.locator('.now-card')).toContainText('Lunch options near you');
  });

  test('Invalid UI version tokens fail closed to v1 without crash', async ({ page }) => {
    await page.goto('/?ui=unknown-version-xyz');
    await page.waitForSelector('.app-layout');

    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);
    await expect(page.locator('#ask-bar')).toHaveCount(0);
  });
});
