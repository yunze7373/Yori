import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('ui-demo-fy');

async function checkAxeWcag(page: Page, contextName: string) {
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const violations = axeResults.violations;
  if (violations.length > 0) {
    const summary = violations.map(v => `${v.id} (${v.impact}): ${v.description} - ${v.nodes.map(n => n.html).join(', ')}`);
    console.error(`Axe violations in ${contextName}:`, summary);
  }
  expect(violations).toEqual([]);
}

test.describe('UI-DEMO-FY: Deterministic For You & Plans / Ahead Loop', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('multi-candidate: Plans populated; For You and Me show what Yori learned with no confirm step; Axe WCAG2A/AA passes', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = testInfo.project.name;

    // 1. Open V2 living context in test mode and select multi-candidate scene
    await page.goto('/?ui=v2&test=1&scene=multi-candidate');
    await page.waitForSelector('.app-layout');

    // Reset storage to guarantee a clean slate
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/?ui=v2&test=1&scene=multi-candidate');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'multi-candidate');

    // Verify Home timeline: NOW is time-critical Piano lesson departure at 3:00 PM
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard.locator('.now-subject')).toContainText('Piano lesson at 3:00 PM');

    // 2. Navigate to Plans Tab (Ahead list)
    const plansNav = isMobile ? page.locator('#tab-plans') : page.locator('#desktop-nav-plans');
    await expect(plansNav).toBeVisible();
    await plansNav.click();

    // Verify Plans view is non-empty with upcoming Lunch recommendation matching Home
    const plansView = page.locator('.v2-plans-view');
    await expect(plansView).toBeVisible();
    const planCards = page.locator('.v2-plans-list .v2-plan-item-card');
    await expect(planCards).toHaveCount(1);

    const firstPlan = planCards.first();
    await expect(firstPlan.locator('.v2-plan-headline')).toContainText('Lunch options near you');
    await expect(firstPlan.locator('.card-badge')).toHaveText('SIMULATED');

    // WCAG2A / WCAG2AA accessibility audit on Plans view
    await checkAxeWcag(page, `Plans View (${viewName})`);

    // Capture Plans screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `plans-${viewName}.png`),
    });

    // 3. Navigate to For You Tab
    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    await expect(forYouNav).toBeVisible();
    await forYouNav.click();

    // HABIT-LEARN: For You lists what Yori has learned (read-only). This curated scene has none
    // yet, and the old sample "Remember …?" proposal is not shown: nothing waits for a confirm step.
    const forYouView = page.locator('.v2-for-you-view');
    await expect(forYouView).toBeVisible();
    await expect(page.locator('.v2-empty-proposals')).toContainText('Nothing learned yet');
    await expect(forYouView).not.toContainText('Remember departure prep & buffer routine?');
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    // WCAG2A / WCAG2AA accessibility audit on For You view
    await checkAxeWcag(page, `For You View (${viewName})`);

    // Capture For You screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `for-you-${viewName}.png`),
    });

    // Me: "What Yori has learned" replaces the confirmed / pending / rejected lists.
    const meNav = isMobile ? page.locator('#tab-me') : page.locator('#desktop-nav-me');
    await expect(meNav).toBeVisible();
    await meNav.click();
    await expect(page.locator('#learned-habits-list')).toBeVisible();
    await expect(page.locator('#pending-proposals-list, #rejected-proposals-list')).toHaveCount(0);
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);
    await checkAxeWcag(page, `Me View (${viewName})`);

    // Capture Me screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `me-confirmed-${viewName}.png`),
    });
  });

  test('lunch scene: the Demo shows a labelled sample habit in For You and Me, and Forget hides it (HABIT-LEARN item 8)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = testInfo.project.name;

    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/?ui=v2&test=1&scene=lunch');
    await page.waitForSelector('.app-layout');
    await selectDemoScene(page, 'lunch');

    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    await forYouNav.click();
    const card = page.locator('.v2-for-you-list .v2-proposal-item-card[data-proposal-key="learned_lunch_cuisine"]');
    await expect(card.locator('.v2-proposal-title')).toHaveText('You often pick ramen · 3 of your last 4 lunches');
    await expect(card.locator('.v2-proposal-basis')).toHaveText('Learned from sample choices · demo');
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    const meNav = isMobile ? page.locator('#tab-me') : page.locator('#desktop-nav-me');
    await meNav.click();
    const row = page.locator('#habit-learned_lunch_cuisine');
    await expect(row).toContainText('Lunch habit');
    await expect(row).toContainText('You often pick ramen · 3 of your last 4 lunches');
    await expect(row).toContainText('Learned from sample choices · demo');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `me-rejected-${viewName}.png`) });

    // Forget: the sample habit is tombstoned like any other and does not come back.
    await row.locator('.btn-forget-habit').click();
    await expect(page.locator('#habit-learned_lunch_cuisine')).toHaveCount(0);
    await forYouNav.click();
    await expect(page.locator('.v2-empty-proposals')).toContainText('Nothing learned yet');
    await page.reload();
    await page.waitForSelector('.app-layout');
    await selectDemoScene(page, 'lunch');
    await meNav.click();
    await expect(page.locator('#habit-learned_lunch_cuisine')).toHaveCount(0);
  });

  test('rain scene: 2-tap interaction (Adjust -> Save & Remember) reliably produces For You proposal', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';

    // 1. Open V2 living context in rain scene with clean storage
    await page.goto('/?ui=v2&test=1&scene=rain');
    await page.waitForSelector('.app-layout');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/?ui=v2&test=1&scene=rain');
    await page.waitForSelector('.app-layout');

    await selectDemoScene(page, 'rain');

    // 2. Check For You tab starts empty before interaction
    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    await forYouNav.click();
    await expect(page.locator('.v2-empty-proposals')).toBeVisible();
    await expect(page.locator('.v2-empty-proposals')).toContainText('Nothing learned yet');

    // 3. Return to Home tab
    const homeNav = isMobile ? page.locator('#tab-home') : page.locator('#desktop-nav-home');
    await homeNav.click();

    // Tap 1: Click Adjust timing
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    // Modal opens
    const adjustModal = page.locator('.modal-card');
    await expect(adjustModal).toBeVisible();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');

    // Update timing: 25m prep, 10m buffer
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');

    // Tap 2: Click Save & remember as preference
    const adjustRememberBtn = page.locator('#btn-adjust-remember');
    await expect(adjustRememberBtn).toBeVisible();
    await adjustRememberBtn.click();
    await expect(adjustModal).not.toBeVisible();

    // 4. HABIT-LEARN: the routine is remembered as stated straight away and shown in For You with its
    // basis; there is no Confirm step.
    await forYouNav.click();
    const proposalCard = page.locator('.v2-for-you-list .v2-proposal-item-card').first();
    await expect(proposalCard).toBeVisible();
    await expect(proposalCard.locator('.v2-proposal-title')).toHaveText('Get ready 25 min · Leave a 10 min buffer');
    await expect(proposalCard.locator('.v2-proposal-basis')).toHaveText('You told Yori');
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    // 6. Return to Home: schedule recomputed to 2:00 PM ready, 2:25 PM leave
    await homeNav.click();
    await expect(page.locator('#now-title')).toContainText('Get ready at 2:00 PM, leave by 2:25 PM');
  });
});
