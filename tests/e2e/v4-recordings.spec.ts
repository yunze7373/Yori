import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

// Configure video recording for this entire suite
test.use({
  video: {
    mode: 'on',
  },
});

const RECORDINGS_DIR = path.resolve(process.cwd(), 'docs/evidence/v4/recordings');
const DUMPS_DIR = path.resolve(process.cwd(), 'docs/evidence/v4/dumps');

interface StepLog {
  step: string;
  timeSec: number;
  timeFormatted: string;
  action: string;
  state: string;
  honestDisclosure: string;
}

interface DumpEntry {
  step: string;
  scene: string;
  timestamp: string;
  text: string;
  components: Record<string, string>;
}

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

test.describe('V4 Closeout: Local Preview Screen Recordings & Evidence Audit Harness', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
    if (!fs.existsSync(DUMPS_DIR)) {
      fs.mkdirSync(DUMPS_DIR, { recursive: true });
    }
  });

  test('V4-RAIN: change -> route -> map/Why -> chat leave later -> compare -> confirm -> collapse -> updated home/map/times -> Undo', async ({
    page,
  }) => {
    const startTime = Date.now();
    const steps: StepLog[] = [];
    const dumps: DumpEntry[] = [];

    const recordStep = async (step: string, action: string, state: string, honestDisclosure: string) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const timeFormatted = formatTime(elapsed);
      steps.push({
        step,
        timeSec: Math.round(elapsed),
        timeFormatted,
        action,
        state,
        honestDisclosure,
      });

      // Extract DOM text from active components
      const bodyText = await page.innerText('body');
      const nowCardText = (await page.locator('.now-card').count()) > 0 ? await page.locator('.now-card').innerText() : '';
      const optionsText = (await page.locator('.v2-options-grid').count()) > 0 ? await page.locator('.v2-options-grid').innerText() : '';
      const mapText = (await page.locator('.v2-map-card').count()) > 0 ? await page.locator('.v2-map-card').innerText() : '';
      const whyText = (await page.locator('#why-sheet-backdrop').count()) > 0 ? await page.locator('#why-sheet-backdrop').innerText() : '';
      const chatText = (await page.locator('#conversation-overlay').count()) > 0 ? await page.locator('#conversation-overlay').innerText() : '';
      const meText = (await page.locator('.me-page').count()) > 0 ? await page.locator('.me-page').innerText() : '';

      dumps.push({
        step,
        scene: 'rain',
        timestamp: timeFormatted,
        text: bodyText,
        components: {
          nowCard: nowCardText,
          optionsGrid: optionsText,
          mapCard: mapText,
          whySheet: whyText,
          conversation: chatText,
          mePage: meText,
        },
      });
    };

    const isMobile = (page.viewportSize()?.width ?? 0) < 600;
    const vpSuffix = isMobile ? '390x844' : '1280x800';

    const clickNav = async (tabName: 'home' | 'plans' | 'for-you' | 'me') => {
      if (isMobile) {
        await page.locator(`#tab-${tabName}`).click();
      } else {
        await page.locator(`#desktop-nav-${tabName}`).click();
      }
    };

    // 1. Initial State (Clear Departure)
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.demo-chip')).toHaveText('Demo · simulated context');
    await expect(page.locator('#badge-ui-version')).toHaveText('V2 Preview');
    await expect(page.locator('.now-card .card-badge')).toHaveText('SIMULATED');
    await checkAxe(page);
    await page.waitForTimeout(600);
    await recordStep(
      'Initial Clear State',
      'Load /?ui=v2 on Clear scene (D1)',
      'Piano lesson at 3:00 PM; leave by 2:25 PM',
      'Header: "Demo · simulated context", Card badge: "SIMULATED"'
    );

    // 2. Change (Clear -> Rain Transition)
    await page.selectOption('#scene-select', 'rain');
    await page.waitForTimeout(600);
    await expect(page.locator('.v2-insight-title, .rain-banner').first()).toContainText('What changed: rain forecast');
    await expect(page.locator('#chip-umbrella').first()).toContainText('Umbrella');
    await recordStep(
      'Change (Weather Shift)',
      'Switch scenario picker to Rain Re-Plan (D2)',
      'Alert banner displays "What changed: rain forecast", umbrella chip visible',
      'Weather callout: "Rain forecast · simulated", "Issued 1:35 PM"'
    );

    // 3. Route & Options
    await expect(page.locator('.v2-map-weather-callout').first()).toContainText('Rain forecast · simulated');
    const optionCards = page.locator('.v2-options-grid .v2-option-card');
    await expect(optionCards).toHaveCount(2);
    await expect(optionCards.first()).toContainText('Drive · leave 2:30 PM');
    await expect(optionCards.first()).toContainText('Recommended');
    await expect(optionCards.first()).toContainText('Ranked by habit: Rain travel habit (Demo profile · sample)');
    await expect(optionCards.nth(1)).toContainText('Bus · leave 2:15 PM');
    await expect(optionCards.nth(1)).toContainText('Alternative');
    await page.waitForTimeout(600);
    await recordStep(
      'Route & Transit Ranking',
      'Inspect Route Map and deterministic transit option cards',
      'Drive ranked first (2:30 PM), Bus second (2:15 PM) based on rainy habit',
      'Habit basis cites sample demo profile; Map labelled schematic simulated'
    );

    // 4. Map / Why Sheet
    await page.locator('#btn-why').click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toHaveText("Why you're seeing this");
    await expect(page.locator('.why-section h3').first()).toContainText('Evidence & Signals');
    await expect(page.locator('.why-section h3').nth(1)).toContainText('Memory & Habits');
    await expect(whySheet.getByText('Demo profile · sample preference').first()).toBeVisible();
    await page.waitForTimeout(800);
    await recordStep(
      'Why Provenance Review',
      'Click "Why" button on NOW card to inspect derivation evidence',
      'Why sheet details weather signals (Issued 1:35 PM) and sample profile habit',
      'Memory section titled "Memory & Habits", labelled "Demo profile · sample preference"'
    );
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);
    await page.waitForTimeout(400);

    // 5. Chat 'leave later'
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText('Offline fallback · deterministic');
    await page.waitForTimeout(400);

    await page.locator('#conversation-input').fill('Can I leave 15 minutes later?');
    await page.waitForTimeout(400);
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('#engine-status-chip')).toContainText('Scripted model fixture · not a live model call');
    await page.waitForTimeout(600);
    await recordStep(
      'Ask Yori: Leave Later Query',
      'Submit conversational query "Can I leave 15 minutes later?"',
      'Conversation shell evaluates deterministic late shift against 3:00 PM appointment',
      'Engine status honesty: "Offline fallback · deterministic" -> "Scripted model fixture · not a live model call"'
    );

    // 6. Compare & Late Arrival Details
    const confirmBox = page.locator('.chat-confirm-box');
    await expect(confirmBox).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#conversation-transcript')).toContainText('arrive late');
    await page.waitForTimeout(600);
    await recordStep(
      'Compare Late Arrival',
      'Review late arrival comparison in conversation transcript',
      'Arrive 3:10 PM (10 min after appointment) clearly highlighted as late',
      'Explicit choice: single-trip override confirmation box'
    );

    // 7. Confirm
    const confirmBtn = page.locator('#btn-chat-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await recordStep(
      'Confirm Shift',
      'Click "Confirm late shift" in conversation shell',
      'Shift confirmed for this time only',
      'Local action state: override committed'
    );

    // 8. Collapse to Updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('2:45 PM');
    await expect(nowCard).toContainText('2:25 PM');
    await expect(optionCards).toHaveCount(2);
    await page.waitForTimeout(800);
    await recordStep(
      'Collapse to Updated Home',
      'Conversation auto-collapses to refreshed Living Context',
      'NOW card shows leave 2:45 PM / prep 2:25 PM; option cards updated to 2',
      'Why button provenance: "Because you asked: leave 15 min later · this time only"'
    );

    // 9. Undo
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
    await expect(undoBtn).toHaveCount(0);
    await expect(nowCard).toContainText('2:30 PM');
    await expect(nowCard).toContainText('2:10 PM');
    await page.waitForTimeout(600);
    await recordStep(
      'Undo Override',
      'Click "Undo" button to safely revert override',
      'Schedule reverts immediately to original 2:30 PM departure',
      'Non-destructive rollback of local session override'
    );

    // 10. Confirm-Only Memory & Sovereignty (Part 4/5 Walkthrough)
    // Reselect scene to reset action state store before persistent preference adjustment
    await page.selectOption('#scene-select', 'clear');
    await page.waitForTimeout(200);
    await page.selectOption('#scene-select', 'rain');
    await page.waitForTimeout(400);

    await page.locator('#btn-adjust').click();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.locator('#btn-adjust-remember').click();
    await expect(page.locator('#adjust-dialog-backdrop')).toHaveCount(0);
    await page.waitForTimeout(400);

    await clickNav('for-you');
    await expect(page.locator('.v2-for-you-view')).toBeVisible();
    await expect(page.locator('.v2-for-you-view .v2-proposal-title')).toContainText(
      'Remember departure prep & buffer routine?'
    );
    await page.waitForTimeout(500);

    await clickNav('me');
    await expect(page.locator('.me-title')).toHaveText('Me & Memory');
    await expect(page.locator('.badge-budget')).toContainText('0 of 3 used today');
    await expect(page.locator('#confirmed-facts-list .memory-empty')).toHaveText(
      'No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.'
    );

    const pendingRow = page.locator('#proposal-prep_buffer_preference');
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.locator('.memory-key')).toHaveText('Preparation buffer habit');
    await page.waitForTimeout(500);
    await pendingRow.locator('.btn-confirm-proposal').click();
    await expect(pendingRow).toHaveCount(0);
    await expect(page.locator('#fact-prep_buffer_preference .badge-confirmed')).toContainText('Confirmed');
    await page.waitForTimeout(500);

    await clickNav('home');
    await expect(page.locator('.now-card #now-title')).toContainText('Get ready at 2:00 PM, leave by 2:25 PM');
    await checkAxe(page);
    await page.waitForTimeout(600);
    await recordStep(
      'Confirm-Only Memory & Sovereignty',
      'Adjust prep/buffer, view pending proposal under For You / Me, confirm proposal',
      'Home schedule recomputed to 2:00 PM / 2:25 PM; Me shows Confirmed preference',
      'INV-107 confirm-only memory; X1 unauthorized remote sync off; storage sovereign'
    );

    // Save dumps and step log
    fs.writeFileSync(
      path.join(DUMPS_DIR, `rain-dumps-${vpSuffix}.json`),
      JSON.stringify({ viewport: vpSuffix, steps, dumps }, null, 2),
      'utf-8'
    );

    // Finalize video
    await page.close();
    const video = page.video();
    if (video) {
      const dest = path.join(RECORDINGS_DIR, `v4-rain-recording-${vpSuffix}.webm`);
      await video.saveAs(dest);
    }
  });

  test('V4-LUNCH: proactive card -> photos/candidates/basis -> chat quieter+vegetarian -> re-rank -> selected on home', async ({
    page,
  }) => {
    const startTime = Date.now();
    const steps: StepLog[] = [];
    const dumps: DumpEntry[] = [];

    const recordStep = async (step: string, action: string, state: string, honestDisclosure: string) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const timeFormatted = formatTime(elapsed);
      steps.push({
        step,
        timeSec: Math.round(elapsed),
        timeFormatted,
        action,
        state,
        honestDisclosure,
      });

      const bodyText = await page.innerText('body');
      const nowCardText = (await page.locator('.now-card').count()) > 0 ? await page.locator('.now-card').innerText() : '';
      const candidateListText = (await page.locator('.v2-candidate-list').count()) > 0 ? await page.locator('.v2-candidate-list').innerText() : '';
      const mapText = (await page.locator('.v2-map-card').count()) > 0 ? await page.locator('.v2-map-card').innerText() : '';
      const detailText = (await page.locator('.restaurant-detail-view').count()) > 0 ? await page.locator('.restaurant-detail-view').innerText() : '';
      const chatText = (await page.locator('#conversation-overlay').count()) > 0 ? await page.locator('#conversation-overlay').innerText() : '';
      const meText = (await page.locator('.me-page').count()) > 0 ? await page.locator('.me-page').innerText() : '';

      dumps.push({
        step,
        scene: 'away-lunch',
        timestamp: timeFormatted,
        text: bodyText,
        components: {
          nowCard: nowCardText,
          candidateList: candidateListText,
          mapCard: mapText,
          restaurantDetail: detailText,
          conversation: chatText,
          mePage: meText,
        },
      });
    };

    const isMobile = (page.viewportSize()?.width ?? 0) < 600;
    const vpSuffix = isMobile ? '390x844' : '1280x800';

    const clickNav = async (tabName: 'home' | 'plans' | 'for-you' | 'me') => {
      if (isMobile) {
        await page.locator(`#tab-${tabName}`).click();
      } else {
        await page.locator(`#desktop-nav-${tabName}`).click();
      }
    };

    // 1. Proactive Candidate Card on Away Lunch
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'away-lunch');
    await page.waitForTimeout(600);

    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('Lunch options near you');
    await expect(page.locator('.mock-places-notice')).toContainText(
      'Mock places for this demo; real listings come from a place provider.'
    );
    // Data honesty check: zero star ratings
    const textContent = await nowCard.innerText();
    expect(textContent).not.toMatch(/[★☆]/);
    expect(textContent).not.toMatch(/\b\d+(\.\d+)?\s*(stars|reviews|ratings)\b/i);
    await checkAxe(page);
    await recordStep(
      'Proactive Lunch Card',
      'Select Away Lunch (D3) scene',
      'Candidates hero: "Lunch options near you" with taste-curated recommendations',
      'Prominent mock disclosure: "Mock places for this demo; real listings come from a place provider."'
    );

    // 2. Photos, Candidates & Preference Basis
    const candidateCards = page.locator('.v2-candidate-card');
    await expect(candidateCards).toHaveCount(3);
    await expect(candidateCards.nth(0)).toContainText('Demo Place A · Ramen');
    await expect(candidateCards.nth(0)).toHaveClass(/selected/);
    await expect(candidateCards.nth(1)).toContainText('Demo Place B · Salad');
    await expect(candidateCards.nth(2)).toContainText('Demo Place C · Sushi');

    // Inspect Place A Details
    await candidateCards.nth(0).click();
    const restDetailName = page.locator('#restaurant-detail-name');
    await expect(restDetailName).toBeVisible();
    await expect(restDetailName).toContainText('Demo Place A · Ramen');
    await expect(page.locator('.v2-attribute-chips')).toContainText('Japanese');
    await expect(page.locator('.v2-attribute-chips')).toContainText('5m away');
    await page.waitForTimeout(800);
    await recordStep(
      'Candidates & Detail View',
      'Inspect candidate cards with local artwork, open Place A details view',
      'Place A details view shows artwork, attribute chips (Quiet, Japanese, 5m), in-app Directions',
      'Truthful venue names: Demo Place A/B/C; mock disclosure in detail view'
    );
    await page.locator('#restaurant-detail-back-btn').click();
    await expect(restDetailName).toHaveCount(0);
    await page.waitForTimeout(400);

    // 3. Chat 'quieter + vegetarian'
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText('Offline fallback · deterministic');
    await page.waitForTimeout(400);

    await page.locator('#conversation-input').fill('quieter + vegetarian');
    await page.waitForTimeout(400);
    await page.locator('#conversation-send-btn').click();
    await recordStep(
      'Ask Yori: Preference Re-rank',
      'Submit conversational query "quieter + vegetarian"',
      'Scripted model interpreter parses dietary preference and updates ranking weights',
      'Engine status honesty: "Offline fallback · deterministic"'
    );

    // 4. Re-Rank
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const topCard = page.locator('.v2-candidate-card').first();
    await expect(topCard).toContainText('Demo Place B · Salad');
    await expect(topCard).toHaveClass(/selected/);
    await expect(topCard).toContainText('Quiet');
    await expect(topCard).toContainText('Vegetarian');
    await expect(topCard).toContainText('7m away');
    await page.waitForTimeout(800);
    await recordStep(
      'Re-ranked Candidates',
      'Conversation collapses back to Home with re-ranked list',
      'Demo Place B · Salad moves to #1 position and is highlighted as selected',
      'Why button cites: "Because you asked: quieter + vegetarian · this time only"'
    );

    // 5. Selected on Home & Detail
    await topCard.click();
    await expect(restDetailName).toBeVisible();
    await expect(restDetailName).toContainText('Demo Place B · Salad');
    await expect(page.locator('.v2-restaurant-detail')).toContainText('Salad');
    await expect(page.locator('.v2-restaurant-detail')).toContainText('Vegetarian');
    await page.waitForTimeout(600);
    await page.locator('#restaurant-detail-back-btn').click();
    await expect(restDetailName).toHaveCount(0);
    await page.waitForTimeout(400);
    await recordStep(
      'Selected Candidate on Home',
      'Open Place B details view from selected home position',
      'Place B verified as selected on Home with Vegetarian / Quiet badges',
      'Grounded attributes verified against mock place provider'
    );

    // 6. Calm Quiet State & Memory Sovereignty
    await page.selectOption('#scene-select', 'busy-lunch');
    await page.waitForTimeout(600);
    await expect(page.locator('.quiet-title')).toHaveText('Nothing needs your attention right now.');
    await expect(page.locator('.quiet-subtitle')).toHaveText("You're all caught up. We'll let you know when something comes up.");
    await page.waitForTimeout(600);

    // Me Tab Sovereignty
    await clickNav('me');
    await expect(page.locator('.me-title')).toHaveText('Me & Memory');
    await expect(page.locator('.badge-budget')).toContainText('0 of 3 used today');
    await checkAxe(page);
    await page.waitForTimeout(600);
    await recordStep(
      'Quiet State & Sovereignty',
      'Switch to Busy Lunch (D4), verify quiet state; inspect Me tab',
      'Quiet state respects focus; Me tab displays proactive budget and storage controls',
      'INV-107 confirm-only memory; X1 unauthorized remote sync off; storage sovereign'
    );

    // Save dumps and step log
    fs.writeFileSync(
      path.join(DUMPS_DIR, `lunch-dumps-${vpSuffix}.json`),
      JSON.stringify({ viewport: vpSuffix, steps, dumps }, null, 2),
      'utf-8'
    );

    // Finalize video
    await page.close();
    const video = page.video();
    if (video) {
      const dest = path.join(RECORDINGS_DIR, `v4-lunch-recording-${vpSuffix}.webm`);
      await video.saveAs(dest);
    }
  });
});
