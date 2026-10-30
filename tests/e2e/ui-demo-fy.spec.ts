import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/ui-demo-fy');

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

  test('multi-candidate: Plans & For You populated, Confirm moves to Me, Axe WCAG2A/AA passes', async ({
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

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

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

    // Verify For You view is non-empty with pending routine proposal
    const forYouView = page.locator('.v2-for-you-view');
    await expect(forYouView).toBeVisible();
    const proposalCards = page.locator('.v2-for-you-list .v2-proposal-item-card');
    await expect(proposalCards).toHaveCount(1);

    const firstProposal = proposalCards.first();
    await expect(firstProposal.locator('.v2-proposal-title')).toHaveText('Remember departure prep & buffer routine?');
    await expect(firstProposal.locator('.card-badge')).toHaveText('PROPOSAL');
    await expect(firstProposal.locator('.v2-proposal-basis')).toHaveText('Derived from sample demo profile');

    const confirmBtn = firstProposal.locator('.btn-confirm-proposal');
    const rejectBtn = firstProposal.locator('.btn-reject-proposal');
    await expect(confirmBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // WCAG2A / WCAG2AA accessibility audit on For You view
    await checkAxeWcag(page, `For You View (${viewName})`);

    // Capture For You screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `for-you-${viewName}.png`),
    });

    // 4. Confirm the proposal on For You tab
    await confirmBtn.click();

    // For You view immediately transitions to empty state
    await expect(page.locator('.v2-empty-proposals')).toBeVisible();
    await expect(page.locator('.v2-empty-proposals')).toContainText('No pending proposals waiting right now');

    // 5. Navigate to Me Tab to verify confirmed persistence
    const meNav = isMobile ? page.locator('#tab-me') : page.locator('#desktop-nav-me');
    await expect(meNav).toBeVisible();
    await meNav.click();

    const confirmedList = page.locator('#confirmed-facts-list');
    await expect(confirmedList).toBeVisible();
    const confirmedRow = page.locator('#fact-prep_buffer_preference');
    await expect(confirmedRow).toBeVisible();
    await expect(confirmedRow.locator('.badge-confirmed')).toHaveText('Confirmed');
    await expect(confirmedRow.locator('.memory-meta')).toContainText('Source: you confirmed');

    // Verify pending proposals on Me tab is empty
    const pendingList = page.locator('#pending-proposals-list');
    await expect(pendingList.locator('.memory-empty')).toBeVisible();

    // Capture Me Confirmed screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `me-confirmed-${viewName}.png`),
    });
  });

  test('multi-candidate: Not true moves proposal to declined audit on Me page', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = testInfo.project.name;

    // Open V2 living context in test mode and select multi-candidate scene
    await page.goto('/?ui=v2&test=1&scene=multi-candidate');
    await page.waitForSelector('.app-layout');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/?ui=v2&test=1&scene=multi-candidate');
    await page.waitForSelector('.app-layout');

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

    // Navigate to For You Tab
    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    await expect(forYouNav).toBeVisible();
    await forYouNav.click();

    const proposalCard = page.locator('.v2-for-you-list .v2-proposal-item-card').first();
    await expect(proposalCard).toBeVisible();

    // Click Not true
    const rejectBtn = proposalCard.locator('.btn-reject-proposal');
    await rejectBtn.click();

    // For You view transitions to empty state
    await expect(page.locator('.v2-empty-proposals')).toBeVisible();

    // Navigate to Me Tab
    const meNav = isMobile ? page.locator('#tab-me') : page.locator('#desktop-nav-me');
    await expect(meNav).toBeVisible();
    await meNav.click();

    // Verify proposal appears under Declined Habits & Suggestions
    const rejectedList = page.locator('#rejected-proposals-list');
    await expect(rejectedList).toBeVisible();
    const rejectedRow = page.locator('#rejected-prep_buffer_preference');
    await expect(rejectedRow).toBeVisible();
    await expect(rejectedRow.locator('.memory-meta')).toContainText('Declined by user');

    // Capture Me Rejected screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `me-rejected-${viewName}.png`),
    });
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

    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');

    // 2. Check For You tab starts empty before interaction
    const forYouNav = isMobile ? page.locator('#tab-for-you') : page.locator('#desktop-nav-for-you');
    await forYouNav.click();
    await expect(page.locator('.v2-empty-proposals')).toBeVisible();

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

    // 4. Navigate to For You tab: proposal is now reliably present!
    await forYouNav.click();
    const proposalCard = page.locator('.v2-for-you-list .v2-proposal-item-card').first();
    await expect(proposalCard).toBeVisible();
    await expect(proposalCard.locator('.v2-proposal-title')).toHaveText('Remember departure prep & buffer routine?');

    // 5. Click Confirm on For You tab
    await proposalCard.locator('.btn-confirm-proposal').click();
    await expect(page.locator('.v2-empty-proposals')).toBeVisible();

    // 6. Return to Home: schedule recomputed to 2:00 PM ready, 2:25 PM leave
    await homeNav.click();
    await expect(page.locator('#now-title')).toContainText('Get ready at 2:00 PM, leave by 2:25 PM');
  });
});
