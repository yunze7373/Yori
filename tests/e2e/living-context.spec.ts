/**
 * Playwright E2E Tests for Slice 4 S4-1: Review Loop, Why Sheet, Me Page, and Persistence
 * Governed by Architecture Rev3 Section 6 and AC-105-2, AC-105-3, AC-105-4.
 *
 * Verifies:
 * - Mobile (390x844) and Desktop (1280x800) responsive layouts.
 * - Golden outcomes for Clear (D1), Rain (D2), Away Lunch (D3), Busy (D4), Missing Weather (D6), and Corrupt Storage (INV-110).
 * - Review loop actions: Accept (with Undo), Adjust (prep/buffer: today only vs remember preference), Dismiss (with reason -> same-day suppression).
 * - Why Sheet: human sentences from evidence signals, memory facts, and derivation without debug tokens.
 * - Me Page (Today/Me tabs): budget meter (default max 3/day), confirmed preferences, pending proposals (with Confirm/Not true), rejected audit.
 * - Persistence (AC-105-4): confirmed facts, pending proposals, same-day suppressions survive browser reload.
 * - Axe accessibility check: 0 serious or critical violations.
 * - Generates visual screenshot evidence under docs/evidence/s4-1/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : getEvidenceDir('s5-1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('Living Context UI E2E & Visual Verification (S5-1 Chapter Closeout)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test to ensure deterministic clean state
    await page.goto('/?ui=v1');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Clear Scene (D1): Piano lesson prepare 2:05 PM, leave 2:25 PM with morning greeting', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');

    // 1. Verify Demo status label is present (INV-102)
    const demoChip = page.locator('.demo-chip');
    await expect(demoChip).toBeVisible();
    await expect(demoChip).toContainText('Demo · simulated context');

    // 2. Select Clear (D1) scene
    const select = page.locator('#scene-select');
    await select.selectOption('clear');

    // 3. Verify context-aware dynamic greeting (10:00 AM local = morning)
    const greeting = page.locator('.greeting-title');
    await expect(greeting).toBeVisible();
    await expect(greeting).toContainText('Good morning.');

    // 4. Verify NOW card headline matches Golden D1 outcome
    const nowTitle = page.locator('#now-title');
    await expect(nowTitle).toBeVisible();
    await expect(nowTitle).toContainText('2:05 PM');
    await expect(nowTitle).toContainText('2:25 PM');

    // 5. Verify Map is rendered (spatial evidence exists)
    const mapCard = page.locator('.map-card');
    await expect(mapCard).toBeVisible();
    await expect(mapCard).toContainText('Piano Studio');

    // 6. Verify zero debug/internal strings on page (Finding 1)
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('appt -');
    expect(bodyText).not.toContain('rain_transport_preference');
    expect(bodyText).not.toContain('S4-1');
    expect(bodyText).not.toContain('INV-110');

    // 7. Verify no horizontal scrollbar on mobile
    if (isMobile) {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    }

    // 8. Accessibility scan (0 serious or critical violations)
    const axeResults = await new AxeBuilder({ page }).analyze();
    const severeViolations = axeResults.violations.filter(
      v => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);

    // 9. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `clear-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Rain Scene (D2): Umbrella checklist + Drive 2:30 / Bus 2:15 ranked options', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('rain');

    // 1. Verify Rain re-plan banner, umbrella chip, and engine-calculated timing (2:10 / 2:30)
    const nowTitle = page.locator('#now-title');
    await expect(nowTitle).toBeVisible();
    await expect(nowTitle).toContainText('2:10 PM');
    await expect(nowTitle).toContainText('2:30 PM');

    const rainBanner = page.locator('.rain-banner');
    await expect(rainBanner).toBeVisible();
    await expect(rainBanner).toContainText('What changed: rain forecast');

    const umbrellaChip = page.locator('#chip-umbrella');
    await expect(umbrellaChip).toBeVisible();
    await expect(umbrellaChip).toContainText('Umbrella');

    // 2. Verify Multi-modal options: Drive · leave 2:30 first, Bus · leave 2:15 second
    const options = page.locator('.option-tile');
    await expect(options.nth(0)).toContainText('Drive · leave 2:30');
    await expect(options.nth(1)).toContainText('Bus · leave 2:15');

    // 3. Verify plain language habit note without internal keys
    const habitNote = page.locator('.habit-note');
    await expect(habitNote).toBeVisible();
    await expect(habitNote).toContainText('You usually prefer driving when it rains.');
    await expect(habitNote).not.toContainText('rain_transport_preference');

    // 4. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `rain-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Review Loop: Accept and Undo functionality', async ({ page }) => {
    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('clear');

    // 1. Accept button is visible initially
    const acceptBtn = page.locator('#btn-accept');
    await expect(acceptBtn).toBeVisible();

    // 2. Click Accept
    await acceptBtn.click();

    // 3. Card now shows Accepted badge and Undo button
    const acceptedBadge = page.locator('.badge-accepted');
    await expect(acceptedBadge).toBeVisible();
    await expect(acceptedBadge).toContainText('Accepted');

    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();

    // 4. Click Undo -> restores normal actions
    await undoBtn.click();
    await expect(acceptBtn).toBeVisible();
    await expect(acceptedBadge).not.toBeVisible();
  });

  // HABIT-LEARN addendum 2: the Why sheet test was removed with the Why sheet itself.
  test('Review Loop: the NOW card has Accept and Adjust and no Why action (HABIT-LEARN addendum 2)', async ({ page }) => {
    await page.goto('/?ui=v1');
    await page.locator('#scene-select').selectOption('rain');
    await expect(page.locator('#btn-accept')).toBeVisible();
    await expect(page.locator('#btn-adjust')).toBeVisible();
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('.btn-ahead-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
  });

  test('Review Loop: Adjust "Remember" saves the routine directly, no confirm step (INV-107 learn-and-correct)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('clear');

    // 1. Click Adjust
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    // 2. Verify dialog appears
    const modal = page.locator('.modal-card');
    await expect(modal).toBeVisible();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');

    // Screenshot evidence of Adjust modal
    const screenshotPath = path.join(EVIDENCE_DIR, `adjust-dialog-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // 3. Edit prep time to 25m and buffer to 10m
    const prepInput = page.locator('#input-prep-minutes');
    await prepInput.fill('25');
    const bufferInput = page.locator('#input-buffer-minutes');
    await bufferInput.fill('10');

    // 4. Click Remember as preference
    const rememberBtn = page.locator('#btn-adjust-remember');
    await rememberBtn.click();
    await expect(modal).not.toBeVisible();

    // 5. HABIT-LEARN (INV-107 learn-and-correct): the routine is remembered as stated and shown in
    // FOR YOU with its basis; there is no Confirm / Not true step anywhere.
    const forYouRow = page.locator('#for-you-prep_buffer_preference');
    await expect(forYouRow).toBeVisible();
    await expect(forYouRow).toContainText('Get ready 25 min · Leave a 10 min buffer');
    await expect(forYouRow).toContainText('You told Yori');
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);
  });

  test('Review Loop: Dismiss with reason creates same-day suppression and removes plan', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('away-lunch');

    // 1. Verify lunch card is initially present
    const nowSubject = page.locator('.now-subject');
    await expect(nowSubject).toContainText('Lunch options');

    // 2. Click Dismiss
    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // 3. Confirm Dismiss dialog
    const modal = page.locator('.modal-card');
    await expect(modal).toBeVisible();
    const confirmBtn = page.locator('#btn-confirm-dismiss');
    await confirmBtn.click();
    await expect(modal).not.toBeVisible();

    // 4. Lunch card is now suppressed for today, view falls back to quiet state
    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Nothing needs your attention right now');

    // 5. Zero degradation notice on dismissed lunch scene (Finding 1)
    await expect(page.locator('.notice-box')).toHaveCount(0);

    // 6. HABIT-LEARN: the dismissal is the whole effect (same-day suppression above); Yori does not
    // follow up with a "Skip lunch suggestions for today?" question to confirm.
    await expect(page.locator('#for-you-suppress_lunch_recommendations')).toHaveCount(0);
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Skip lunch suggestions for today?');

    // Screenshot evidence after dismiss
    const screenshotPath = path.join(EVIDENCE_DIR, `after-dismiss-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Me Page: Proactive budget meter and "What Yori has learned" with the remembered routine', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');

    // 1. Adjust and Remember (saved as stated, no proposal)
    const select = page.locator('#scene-select');
    await select.selectOption('clear');
    await page.locator('#btn-adjust').click();
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#btn-adjust-remember').click();

    // 2. Navigate to Me page (desktop or mobile navigation)
    if (isMobile) {
      await page.locator('#tab-me').click();
    } else {
      await page.locator('#desktop-nav-me').click();
    }

    // 3. Verify Me page header and proactive budget (INV-105: 0 of 3 used today)
    const meTitle = page.locator('.me-title');
    await expect(meTitle).toBeVisible();
    await expect(meTitle).toContainText('Me & Memory');

    const budgetBadge = page.locator('.badge-budget');
    await expect(budgetBadge).toBeVisible();
    await expect(budgetBadge).toContainText('0 of 3 used today');

    // 4. The routine is listed under "What Yori has learned" with its basis; nothing to confirm.
    const learnedRow = page.locator('#habit-prep_buffer_preference');
    await expect(learnedRow).toBeVisible();
    await expect(learnedRow).toContainText('Preparation buffer habit');
    await expect(learnedRow).toContainText('Get ready 25 min');
    await expect(learnedRow).toContainText('You told Yori');
    await expect(learnedRow.locator('.btn-forget-habit')).toBeVisible();
    await expect(page.locator('.btn-confirm-proposal, .btn-reject-proposal')).toHaveCount(0);

    // Screenshot evidence of Me page with the learned list and budget
    const screenshotPath = path.join(EVIDENCE_DIR, `me-page-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Me Page: Forget removes the remembered routine and it stays gone after reload (INV-107)', async ({
    page,
  }) => {
    await page.goto('/?ui=v1');
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 600 : false;

    // 1. Remember a routine via Adjust (saved directly)
    await page.locator('#scene-select').selectOption('clear');
    await page.locator('#btn-adjust').click();
    await page.locator('#btn-adjust-remember').click();

    // 2. Go to Me page
    const openMe = async () => {
      if (isMobile) {
        await page.locator('#tab-me').click();
      } else {
        await page.locator('#desktop-nav-me').click();
      }
    };
    await openMe();
    const row = page.locator('#habit-prep_buffer_preference');
    await expect(row).toBeVisible();

    // 3. Forget it: gone from Me, and from storage (survives a reload)
    await row.locator('.btn-forget-habit').click();
    await expect(row).toHaveCount(0);
    await expect(page.locator('#learned-habits-list')).toContainText('Nothing yet');
    const stored = await page.evaluate(() => window.localStorage.getItem('yori_state_v1'));
    expect(stored ?? '').not.toContain('prep_buffer_preference');
    await page.reload();
    await page.locator('#scene-select').selectOption('clear');
    await openMe();
    await expect(page.locator('#habit-prep_buffer_preference')).toHaveCount(0);
  });

  test('Persistence Across Browser Reload (AC-105-4 & INV-110)', async ({ page }) => {
    await page.goto('/?ui=v1');
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 600 : false;

    // 1. Adjust prep time and Remember (saved directly as stated)
    await page.locator('#scene-select').selectOption('clear');
    await page.locator('#btn-adjust').click();
    await page.locator('#input-prep-minutes').fill('30');
    await page.locator('#btn-adjust-remember').click();

    // 2. It is listed on the Me page right away
    if (isMobile) {
      await page.locator('#tab-me').click();
    } else {
      await page.locator('#desktop-nav-me').click();
    }

    const confirmedFact = page.locator('#habit-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();

    // 3. Dismiss away lunch to record same-day suppression
    if (isMobile) {
      await page.locator('#tab-today').click();
    } else {
      await page.locator('#desktop-nav-today').click();
    }
    await page.locator('#scene-select').selectOption('away-lunch');
    await page.locator('#btn-dismiss').click();
    await page.locator('#btn-confirm-dismiss').click();

    // 4. RELOAD THE PAGE
    await page.reload();

    // 5. Verify same-day suppression survived reload (lunch is still suppressed)
    await page.locator('#scene-select').selectOption('away-lunch');
    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();

    // 6. Verify confirmed fact survived reload in Me page
    if (isMobile) {
      await page.locator('#tab-me').click();
    } else {
      await page.locator('#desktop-nav-me').click();
    }
    await expect(page.locator('#habit-prep_buffer_preference')).toBeVisible();
    await expect(page.locator('.badge-budget')).toContainText('1 of 3 used today');
  });

  test('Away-Lunch Scene (D3): <=3 lunch options with single distance and mock disclosure', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('away-lunch');

    // 1. Verify lunch card in NOW with options matching confirmed tastes
    const nowSubject = page.locator('.now-subject');
    await expect(nowSubject).toBeVisible();
    await expect(nowSubject).toContainText('Lunch options');

    const optionTiles = page.locator('.option-tile');
    const count = await optionTiles.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);

    // Assert placeholder name with Ramen from confirmed tastes
    const firstOption = await optionTiles.nth(0).innerText();
    expect(firstOption).toMatch(/Demo Place A.*Ramen/);

    // 2. Verify mock places notice is visible
    const mockNotice = page.locator('.mock-places-notice');
    await expect(mockNotice).toBeVisible();
    await expect(mockNotice).toContainText('Mock places for this demo');

    // 3. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `away-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Busy-Lunch Scene (D4): Honest quiet state with 0 lunch prompts', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('busy-lunch');

    // 1. Verify quiet state is rendered (no lunch card)
    const quietTitle = page.locator('.quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Nothing needs your attention right now');

    // 2. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `busy-lunch-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Missing-Weather Scene (D6): Visible fail-closed degraded notice', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('missing-weather');

    // 1. Verify fail-closed degraded notice is rendered
    const noticeBox = page.locator('.notice-box');
    await expect(noticeBox).toBeVisible();
    await expect(noticeBox).toContainText('weather');

    // 2. Save visual screenshot evidence
    const screenshotPath = path.join(EVIDENCE_DIR, `missing-weather-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Storage Error Scene (INV-110): Real Export & Reset recovery', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');
    await select.selectOption('corrupt-storage');

    // 1. Verify storage error alert box is rendered
    const errorBox = page.locator('.error-box');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText('Storage error detected');

    // 2. Save visual screenshot evidence of corrupted storage state
    const screenshotPath = path.join(EVIDENCE_DIR, `corrupt-storage-${viewName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // 3. Test Export action triggers feedback
    const exportBtn = page.locator('#btn-export-storage');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const feedback = page.locator('#storage-action-feedback');
    await expect(feedback).toContainText('Storage backup exported successfully');

    // 4. Test Reset action with confirmation step clears error and returns to fresh state
    const resetBtn = page.locator('#btn-reset-storage');
    await expect(resetBtn).toBeVisible();
    // First tap prompts for confirmation (P3 UX advisory)
    await resetBtn.click();
    await expect(resetBtn).toContainText('Confirm Reset');
    // Second tap executes reset
    await resetBtn.click();

    // Verify error box is now gone
    await expect(errorBox).not.toBeVisible();
    const nowTitle = page.locator('#now-title');
    await expect(nowTitle).toBeVisible();
  });

  test('Calm UI Invariants: No notice in clean scenes and zero engineering jargon across all scenes (Finding 1)', async ({
    page,
  }) => {
    await page.goto('/?ui=v1');
    const select = page.locator('#scene-select');

    // 1. Verify no notice in Clear, Rain, Away-lunch, Busy-lunch
    const cleanScenes = ['clear', 'rain', 'away-lunch', 'busy-lunch'];
    for (const scene of cleanScenes) {
      await select.selectOption(scene);
      await expect(page.locator('.notice-box')).toHaveCount(0);
    }

    // 2. Body-text scan across every scene finds zero engineering jargon
    const allScenes = ['clear', 'rain', 'away-lunch', 'busy-lunch', 'missing-weather', 'corrupt-storage'];
    const forbiddenPatterns = [
      /fail-closed/i,
      /\bplugin\b/i,
      /grocery_list/i,
      /grocery_status/i,
      /weather_forecast/i,
      /travel_estimate/i,
      /schedule_window/i,
      /nearby_places/i,
      /grocery-stub/i,
      /depart-plugin/i,
      /lunch-plugin/i,
      /user_confirmed/i,
      /user_feedback/i,
    ];

    for (const scene of allScenes) {
      await select.selectOption(scene);
      const text = await page.innerText('body');
      for (const pattern of forbiddenPatterns) {
        expect(text).not.toMatch(pattern);
      }
    }

    // 3. Extend zero-jargon scan to Me tab with a confirmed fact present (UI-POLISH-P3)
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?ui=v1');
    const freshSelect = page.locator('#scene-select');
    await freshSelect.selectOption('rain');
    await page.locator('#btn-adjust').click();
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.locator('#btn-adjust-remember').click();

    const isMobile = (page.viewportSize()?.width ?? 1280) < 600;
    if (isMobile) {
      await page.locator('#tab-me').click();
    } else {
      await page.locator('#desktop-nav-me').click();
    }

    const confirmedFact = page.locator('#habit-prep_buffer_preference');
    await expect(confirmedFact).toBeVisible();
    await expect(confirmedFact).toContainText('You told Yori');

    const meText = await page.innerText('body');
    for (const pattern of forbiddenPatterns) {
      expect(meText).not.toMatch(pattern);
    }
  });
});
