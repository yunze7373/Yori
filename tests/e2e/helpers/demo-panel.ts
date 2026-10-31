import { expect, type Page } from '@playwright/test';

/**
 * Shared E2E Helper for Demo Controls Panel
 * Governed by Architecture Rev3 Section 6 and UI-HOME-QUIET (TID: INBOX-20261031-24FF42).
 *
 * Allows Playwright specs that inspect or interact with presentation/demo controls
 * (#btn-mode-demo, #btn-mode-live, #scene-select, #btn-replay-before-you-ask, #badge-ui-version,
 * #pill-live-runtime, #chip-live-weather) to open the sheet/dialog cleanly.
 */

export async function openDemoPanel(page: Page): Promise<void> {
  const panel = page.locator('#demo-panel');
  if (await panel.isVisible()) {
    return;
  }
  const devBtn = page.locator('#btn-dev-demo-controls');
  if (await devBtn.isVisible()) {
    await devBtn.click();
    await expect(page.locator('#demo-panel')).toBeVisible();
    return;
  }
  // Enable dev session and dispatch open event
  await page.evaluate(() => {
    sessionStorage.setItem('yori_dev', '1');
    window.dispatchEvent(new CustomEvent('yori:open-demo-panel'));
  });
  await expect(page.locator('#demo-panel')).toBeVisible();
}

export async function closeDemoPanel(page: Page): Promise<void> {
  const panel = page.locator('#demo-panel');
  if (await panel.isVisible()) {
    const closeBtn = page.locator('#btn-close-demo-panel');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(page.locator('#demo-panel')).not.toBeVisible();
    }
  }
}

export async function selectDemoScene(page: Page, scene: string): Promise<void> {
  const pill = page.locator('#pill-context-status');
  if (await pill.isVisible()) {
    await openDemoPanel(page);
    await page.selectOption('#scene-select', scene);
    await closeDemoPanel(page);
  } else {
    // V1 legacy header fallback
    await page.selectOption('#scene-select', scene);
  }
}
