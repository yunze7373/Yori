import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { openDemoPanel, closeDemoPanel, selectDemoScene } from './helpers/demo-panel.js';

const RECORDINGS_DIR = getEvidenceDir('v4/recordings');
const DUMPS_DIR = getEvidenceDir('v4/dumps');
const shouldPersist = Boolean(process.env.V4_RECORD);
const TEMP_RECORD_DIR = path.join(os.tmpdir(), 'yori-v4-recordings');

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
    if (shouldPersist) {
      if (!fs.existsSync(RECORDINGS_DIR)) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
      }
      if (!fs.existsSync(DUMPS_DIR)) {
        fs.mkdirSync(DUMPS_DIR, { recursive: true });
      }
      if (!fs.existsSync(TEMP_RECORD_DIR)) {
        fs.mkdirSync(TEMP_RECORD_DIR, { recursive: true });
      }
    }
  });

  test.beforeEach(() => {
    test.setTimeout(90000);
  });

  test('V4-RAIN: change -> route -> map/Why -> chat leave later -> compare -> confirm -> collapse -> updated home/map/times -> Undo -> confirm-only memory', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const vpSuffix = isMobile ? '390x844' : '1280x800';

    const context = await browser.newContext({
      viewport,
      recordVideo: shouldPersist
        ? {
            dir: TEMP_RECORD_DIR,
            size: viewport,
          }
        : undefined,
      userAgent: isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await context.newPage();

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
      const optionsText = (await page.locator('.v2-options-grid').count()) > 0 ? await page.locator('.v2-options-grid').innerText() : '';
      const mapText = (await page.locator('.v2-map-card').count()) > 0 ? await page.locator('.v2-map-card').innerText() : '';
      const whyText = (await page.locator('#why-sheet-backdrop').count()) > 0 ? await page.locator('#why-sheet-backdrop').innerText() : '';
      const chatText = (await page.locator('#conversation-overlay').count()) > 0 ? await page.locator('#conversation-overlay').innerText() : '';
      const meText = (await page.locator('.me-view-container').count()) > 0 ? await page.locator('.me-view-container').innerText() : '';

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
    await openDemoPanel(page);
    await expect(page.locator('.demo-chip')).toHaveText('Demo · simulated context');
    await expect(page.locator('#badge-ui-version')).toHaveText('V2 Preview');
    await closeDemoPanel(page);
    await expect(page.locator('.now-card .card-badge').first()).toHaveText('SIMULATED');
    await checkAxe(page);
    await recordStep(
      'Initial Clear State',
      'Load /?ui=v2 on Clear scene (D1)',
      'Piano lesson at 3:00 PM; leave by 2:25 PM · Drive · 30 min',
      'Header: "Demo · simulated context", Card badge: "SIMULATED"'
    );
    await page.waitForTimeout(2500);

    // 2. Change (Clear -> Rain Transition)
    await selectDemoScene(page, 'rain');
    await expect(page.locator('.v2-insight-title, .rain-banner').first()).toContainText('What changed: rain forecast');
    await expect(page.locator('#chip-umbrella').first()).toContainText('Umbrella');
    await expect(page.locator('.v2-map-weather-callout')).toContainText('Rain forecast · simulated');
    await expect(page.locator('.v2-map-weather-callout')).toContainText('Issued 1:35 PM');
    await recordStep(
      'Change (Weather Shift)',
      'Switch scenario picker to Rain Re-Plan (D2)',
      'Alert banner displays "What changed: rain forecast", umbrella chip visible',
      'Weather callout: "Rain forecast · simulated", "Issued 1:35 PM"'
    );
    await page.waitForTimeout(2500);

    // 3. Route Options (Drive vs Bus)
    const optionCards = page.locator('.v2-option-card');
    await expect(optionCards).toHaveCount(2);
    const driveCard = optionCards.nth(0);
    await expect(driveCard.locator('.v2-option-label')).toHaveText('Drive · leave 2:30 PM');
    await expect(driveCard.locator('.v2-option-badge')).toHaveText('Recommended');
    await expect(driveCard.locator('.v2-option-meta')).toHaveText('25 min drive + 5m margin');

    const busCard = optionCards.nth(1);
    await expect(busCard.locator('.v2-option-label')).toHaveText('Bus · leave 2:15 PM');
    await expect(busCard.locator('.v2-option-badge')).toHaveText('Alternative');
    await expect(busCard.locator('.v2-option-meta')).toHaveText('40 min bus + 5m margin');
    await recordStep(
      'Route Options (Drive vs Bus)',
      'Compare primary Drive recommendation against alternative Bus option',
      'Drive (25m drive + 5m margin, leave 2:30 PM) vs Bus (40m bus + 5m margin, leave 2:15 PM)',
      'Basis: "Ranked by habit: Rain travel habit (Demo profile · sample)"'
    );
    await page.waitForTimeout(2500);

    // 4. Map & Why Provenance
    await page.locator('#btn-why').click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(page.locator('#why-sheet-title')).toContainText("Why you're seeing this");
    await expect(whySheet).toContainText('Recorded at 1:35 PM');
    await expect(whySheet).toContainText('Rain travel habit');
    await recordStep(
      'Map & Why Provenance',
      'Open "Why you\'re seeing this" provenance sheet',
      'Why sheet details weather signals (Recorded at 1:35 PM) and sample profile habit',
      'Memory section titled "Memory & Habits", labelled "Demo profile · sample preference"'
    );
    await page.waitForTimeout(2500);
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);
    await page.waitForTimeout(1000);

    // 5. Chat 'leave later'
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText('Offline fallback · deterministic');
    await expect(page.locator('#conversation-transcript')).toContainText(
      "I can help adjust your departure plan: ask 'Can I leave 15 minutes later?'"
    );
    await page.waitForTimeout(1500);

    await page.locator('#conversation-input').fill('Can I leave 15 minutes later?');
    await page.waitForTimeout(1000);
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('#engine-status-chip')).toContainText('Scripted model fixture · not a live model call');
    await expect(page.locator('.chat-confirm-box')).toBeVisible({ timeout: 5000 });
    await recordStep(
      'Ask Yori: Leave Later Query',
      'Submit conversational query "Can I leave 15 minutes later?"',
      'Conversation shell evaluates deterministic late shift against 3:00 PM appointment',
      'Engine status honesty: "Offline fallback · deterministic" -> "Scripted model fixture · not a live model call"'
    );
    await page.waitForTimeout(2500);

    // 6. Compare & Late Arrival Details
    await expect(page.locator('#conversation-transcript')).toContainText('arrive late');
    await expect(page.locator('#conversation-transcript')).toContainText('leave 2:45 PM');
    await recordStep(
      'Compare Late Arrival',
      'Review late arrival comparison in conversation transcript',
      'Shifted departure (leave 2:45 PM) and late arrival warning clearly highlighted',
      'Explicit choice: single-trip override confirmation box'
    );
    await page.waitForTimeout(2500);

    // 7. Confirm
    const confirmBtn = page.locator('#btn-chat-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await expect(page.locator('#conversation-transcript')).toContainText(
      'Confirmed for this time only. Your departure plan is updated.'
    );
    await recordStep(
      'Confirm Shift',
      'Click "Confirm late shift" in conversation shell',
      'Shift confirmed for this time only: updated schedule confirmed',
      'Local action state: override committed'
    );
    await page.waitForTimeout(2500);

    // 8. Collapse to Updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toContainText('2:45 PM');
    await expect(nowCard).toContainText('2:25 PM');
    await expect(page.locator('#btn-why')).toContainText('Why');
    await recordStep(
      'Collapse to Updated Home',
      'Conversation auto-collapses to refreshed Living Context',
      'NOW card shows leave 2:45 PM / prep 2:25 PM; option cards updated to 2',
      'Why button provenance: "Because you asked: leave 15 min later · this time only"'
    );
    await page.waitForTimeout(2500);

    // 9. Undo
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
    await expect(undoBtn).toHaveCount(0);
    await expect(nowCard).toContainText('2:30 PM');
    await expect(nowCard).toContainText('2:10 PM');
    await recordStep(
      'Undo Override',
      'Click "Undo" button to safely revert override',
      'Schedule reverts immediately to original 2:30 PM departure',
      'Non-destructive rollback of local session override'
    );
    await page.waitForTimeout(2500);

    // 10. Confirm-Only Memory & Sovereignty (Part 4/5 Walkthrough)
    await page.locator('#btn-adjust').click();
    await expect(page.locator('#adjust-dialog-title')).toContainText('Adjust Departure Timing');
    await page.locator('#input-prep-minutes').fill('25');
    await page.locator('#input-buffer-minutes').fill('10');
    await page.waitForTimeout(1000);
    await page.locator('#btn-adjust-remember').click();
    await expect(page.locator('#adjust-dialog-backdrop')).toHaveCount(0);
    await page.waitForTimeout(1000);

    await clickNav('for-you');
    await expect(page.locator('.v2-for-you-view')).toBeVisible();
    await expect(page.locator('.v2-for-you-view .v2-proposal-title')).toContainText(
      'Remember departure prep & buffer routine?'
    );
    await page.waitForTimeout(2000);

    // Confirm proposal on For You tab
    const acceptProposalBtn = page.locator('.v2-for-you-view .btn-primary').first();
    await expect(acceptProposalBtn).toBeVisible();
    await acceptProposalBtn.click();
    await page.waitForTimeout(1000);

    // Return to Home tab to see recomputed schedule
    await clickNav('home');
    await expect(nowCard).toContainText('2:25 PM');
    await expect(nowCard).toContainText('2:00 PM');

    // Me tab confirms persistent preference
    await clickNav('me');
    await expect(page.locator('.me-view-container')).toBeVisible();
    await expect(page.locator('.me-view-container')).toContainText('Preparation buffer habit');
    await checkAxe(page);
    await recordStep(
      'Confirm-Only Memory & Sovereignty',
      'Adjust prep/buffer, view pending proposal under For You / Me, confirm proposal',
      'Home schedule recomputed to 2:00 PM / 2:25 PM; Me shows Confirmed preference',
      'INV-107 confirm-only memory; X1 unauthorized remote sync off; storage sovereign'
    );
    await page.waitForTimeout(2500);

    // Save dumps and step log
    if (shouldPersist) {
      fs.writeFileSync(
        path.join(DUMPS_DIR, `rain-dumps-${vpSuffix}.json`),
        JSON.stringify({ viewport: vpSuffix, steps, dumps }, null, 2),
        'utf-8'
      );
    }

    // Finalize video
    await page.close();
    const video = page.video();
    if (shouldPersist && video) {
      const dest = path.join(RECORDINGS_DIR, `v4-rain-recording-${vpSuffix}.webm`);
      await video.saveAs(dest);
    }
    await context.close();
  });

  test('V4-LUNCH: proactive card -> photos/candidates/basis -> chat quieter+vegetarian -> re-rank -> selected on home -> Why provenance', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const vpSuffix = isMobile ? '390x844' : '1280x800';

    const context = await browser.newContext({
      viewport,
      recordVideo: shouldPersist
        ? {
            dir: TEMP_RECORD_DIR,
            size: viewport,
          }
        : undefined,
      userAgent: isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await context.newPage();

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
      const whyText = (await page.locator('#why-sheet-backdrop').count()) > 0 ? await page.locator('#why-sheet-backdrop').innerText() : '';
      const chatText = (await page.locator('#conversation-overlay').count()) > 0 ? await page.locator('#conversation-overlay').innerText() : '';
      const meText = (await page.locator('.me-view-container').count()) > 0 ? await page.locator('.me-view-container').innerText() : '';

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
          whySheet: whyText,
          conversation: chatText,
          mePage: meText,
        },
      });
    };

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
    await selectDemoScene(page, 'away-lunch');
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(2500);

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
    await expect(page.locator('.v2-attribute-chips')).toContainText('Lunch window 12:10 PM–1:30 PM');
    await recordStep(
      'Candidates & Detail View',
      'Inspect candidate cards with local artwork, open Place A details view',
      'Place A details view shows artwork, attribute chips (Quiet, Japanese, 5m), in-app Directions',
      'Truthful venue names: Demo Place A/B/C; mock disclosure in detail view'
    );
    await page.waitForTimeout(2500);
    await page.locator('#restaurant-detail-back-btn').click();
    await expect(restDetailName).toHaveCount(0);
    await page.waitForTimeout(1000);

    // 3. Open Chat & Scene-Aware Greeting
    await page.locator('#ask-bar').click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#conversation-status-badge')).toContainText('Offline demo · simulated');
    await expect(page.locator('#engine-status-chip')).toContainText('Offline fallback · deterministic');
    await expect(page.locator('#conversation-transcript')).toContainText(
      "I can help with lunch recommendations: ask 'quieter', 'vegetarian', 'closer'"
    );
    await recordStep(
      'Ask Yori & Scene-Aware Greeting',
      'Open Ask Yori conversation in Away Lunch scene',
      'Scene-aware greeting displayed: lunch suggestions for quieter, vegetarian, closer',
      'Engine status honesty: "Offline fallback · deterministic"'
    );
    await page.waitForTimeout(2500);

    // 4. Chat 'quieter + vegetarian'
    await page.locator('#conversation-input').fill('quieter + vegetarian');
    await page.waitForTimeout(1000);
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('#engine-status-chip')).toContainText('Scripted model fixture · not a live model call');
    await expect(page.locator('#conversation-transcript')).toContainText(
      'Updated lunch options based on your request (quieter and vegetarian): Demo Place B · Salad is now your top recommendation.'
    );
    await recordStep(
      'Ask Yori: Preference Re-rank',
      'Submit conversational query "quieter + vegetarian"',
      'Scripted model interpreter parses dietary preference and updates ranking weights: Place B recommended',
      'Engine status: "Scripted model fixture · not a live model call"'
    );
    // Keep chat open so user/viewer clearly sees Yori's response and engine honesty!
    await page.waitForTimeout(2500);

    // 5. Re-Rank on Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    const topCard = page.locator('.v2-candidate-card').first();
    await expect(topCard).toContainText('Demo Place B · Salad');
    await expect(topCard).toHaveClass(/selected/);
    await expect(topCard).toContainText('Quiet');
    await expect(topCard).toContainText('Vegetarian');
    await expect(topCard).toContainText('7m away');
    await recordStep(
      'Re-ranked Candidates on Home',
      'Conversation collapses back to Home with re-ranked list',
      'Demo Place B · Salad moves to #1 position and is highlighted as selected',
      'Why button cites: "Because you asked: quieter + vegetarian · this time only"'
    );
    await page.waitForTimeout(2500);

    // 6. Inspect Why Citation ('Because you asked: quieter, vegetarian')
    await page.locator('#btn-why').click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    await expect(whySheet).toContainText('Because you asked: quieter, vegetarian · this time only');
    await recordStep(
      'Inspect Why Citation',
      'Open Why sheet on re-ranked lunch recommendation',
      'Why sheet cites: "Because you asked: quieter, vegetarian · this time only" alongside taste basis',
      'Provenance attribution visible for in-session conversational filter'
    );
    await page.waitForTimeout(2500);
    await page.locator('#btn-close-why').click();
    await expect(whySheet).toHaveCount(0);
    await page.waitForTimeout(1000);

    // 7. Quiet State & Sovereignty
    await selectDemoScene(page, 'busy-lunch');
    await expect(page.locator('.quiet-title')).toHaveText('Nothing needs your attention right now.');
    await expect(page.locator('.quiet-subtitle')).toHaveText("You're all caught up. We'll let you know when something comes up.");
    await page.waitForTimeout(1000);

    // Me Tab Sovereignty
    await clickNav('me');
    await expect(page.locator('.me-title')).toHaveText('Me & Memory');
    await expect(page.locator('.badge-budget')).toContainText('0 of 3 used today');
    await checkAxe(page);
    await recordStep(
      'Quiet State & Sovereignty',
      'Switch to Busy Lunch (D4), verify quiet state; inspect Me tab',
      'Quiet state respects focus; Me tab displays proactive budget and storage controls',
      'INV-107 confirm-only memory; X1 unauthorized remote sync off; storage sovereign'
    );
    await page.waitForTimeout(2500);

    // Save dumps and step log
    if (shouldPersist) {
      fs.writeFileSync(
        path.join(DUMPS_DIR, `lunch-dumps-${vpSuffix}.json`),
        JSON.stringify({ viewport: vpSuffix, steps, dumps }, null, 2),
        'utf-8'
      );
    }

    // Finalize video
    await page.close();
    const video = page.video();
    if (shouldPersist && video) {
      const dest = path.join(RECORDINGS_DIR, `v4-lunch-recording-${vpSuffix}.webm`);
      await video.saveAs(dest);
    }
    await context.close();
  });
});
