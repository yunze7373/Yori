import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';

/**
 * S3-MICRO: Microinteractions, Action Surfaces, Motion & State Patterns
 * Governed by TID: INBOX-20261031-09E001 and docs/architecture/REV3_UI_CONNECTORS.plan.md §Slice 3.
 *
 * Verifies:
 * (a) Ask Composer: Expand to context-aware chat with `#conversation-context-chip`
 *     ('Demo scene · simulated' vs 'Live context'), in-flight processing (`#btn-cancel-inflight`),
 *     smart collapse back to live-updating Home cards with visible plan diff (`#plan-diff-banner`,
 *     `.plan-diff-highlight`), aria-live announcement, and Undo restoration.
 * (b) Action Surfaces on approved action-state machine:
 *     - Accept: `#btn-accept` marks accepted with `.badge-accepted` and Undo.
 *     - Adjust: `#btn-adjust` opens dialog, adjusts prep/buffer, updates plan with `#plan-diff-banner`.
 *     - Why: removed (HABIT-LEARN addendum 2); the action surface has no Why action.
 *     - Dismiss: `#btn-dismiss` suppresses intent, transitions to quiet state ('Nothing needs you right now.').
 * (c) Motion tokens: `--motion-fast: 120ms;`, `--motion-base: 200ms;`. In `prefers-reduced-motion: reduce`,
 *     all transitions collapse to instant `0s` swap without motion-only information.
 * (d) Loading skeleton: `#loading-skeleton` rendered only while actually loading; disappears on fulfill.
 * (e) Error notice: fail-closed `#weather-error-notice` names degraded capability while keeping prior plan visible.
 * (f) Ergonomics & a11y: Touch targets >= 44x44px, zero horizontal overflow, Axe WCAG 2.1 AA passes.
 */

const EVIDENCE_DIR = getEvidenceDir('s3-micro');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.afterAll(() => {
  if (fs.existsSync(EVIDENCE_DIR)) {
    const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.png'));
    if (files.length > 0) {
      const lines = files
        .sort()
        .map(file => {
          const content = fs.readFileSync(path.join(EVIDENCE_DIR, file));
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          return `${hash}  ${file}`;
        });
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'MANIFEST.sha256'), lines.join('\n') + '\n');
    }
  }
});

async function checkAxe(page: Page, context = 'page'): Promise<void> {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label', 'region'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasOverflow, 'Page should have no horizontal scrollbar').toBe(false);
}

async function saveEvidence(page: Page, filename: string): Promise<void> {
  if (shouldUpdateEvidence) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: true,
    });
  }
}

test.describe('S3-MICRO: Microinteractions and Action Surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('1. Ask Composer Flow: Expand -> In-Flight -> Smart Collapse with Plan Diff & Undo', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const suffix = isMobile ? 'mobile' : 'desktop';

    await page.goto('/?ui=v2&scene=clear&test=1');
    await page.waitForSelector('.now-card');

    // 1. Initial Home state
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('#now-title')).toBeVisible();
    await saveEvidence(page, `01-home-initial-${suffix}.png`);

    // 2. Expand Ask Composer
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    // Verify overlay opened and context chip shows simulated demo mode
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();
    const contextChip = page.locator('#conversation-context-chip');
    await expect(contextChip).toBeVisible();
    await expect(contextChip).toContainText('Demo scene · simulated');
    await saveEvidence(page, `02-ask-expanded-with-context-chip-${suffix}.png`);

    // 3. In-flight processing state
    await page.evaluate(() => {
      const store = (window as any).__YORI_ACTION_STORE__;
      if (store) {
        (store as any).transcriptList.push({
          id: 'msg-inflight-sample',
          sender: 'assistant',
          text: 'Thinking… checking departure options',
          timestamp: new Date().toISOString(),
          inFlight: true,
        });
        store.notify();
      }
    });

    const cancelBtn = page.locator('#btn-cancel-inflight');
    await expect(cancelBtn).toBeVisible();
    await saveEvidence(page, `03-ask-inflight-processing-${suffix}.png`);

    // Cancel in-flight sample
    await cancelBtn.click();
    await expect(cancelBtn).not.toBeVisible();

    // 4. Send message to shift departure time
    const input = page.locator('#conversation-input');
    await input.fill('Leave 15 minutes later');
    const sendBtn = page.locator('#conversation-send-btn');
    await sendBtn.click();

    // Arriving 15 min later moves arrival past appointment start, requiring confirmation
    const confirmBtn = page.locator('#btn-chat-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 5. Smart collapse back to Home
    // Auto-collapse occurs after 600ms determinate result
    await expect(overlay).not.toBeVisible({ timeout: 4000 });
    await expect(page.locator('.now-card')).toBeVisible();

    // Verify Now card updated with diff banner and highlight
    const diffBanner = page.locator('#plan-diff-banner');
    await expect(diffBanner).toBeVisible();
    await expect(diffBanner).toHaveAttribute('role', 'status');
    await expect(diffBanner).toHaveAttribute('aria-live', 'polite');
    await expect(diffBanner).toContainText('UPDATED');
    await expect(diffBanner).toContainText('Leave by');

    const leaveTimeEl = page.locator('.now-leave-time');
    await expect(leaveTimeEl).toBeVisible();
    await expect(leaveTimeEl).toHaveClass(/plan-diff-highlight/);
    await saveEvidence(page, `04-home-updated-with-diff-${suffix}.png`);

    // 6. Undo restoration
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // After undo, plan diff banner is removed and original time restored
    await expect(diffBanner).not.toBeVisible();
    await expect(page.locator('.now-leave-time')).not.toHaveClass(/plan-diff-highlight/);
  });

  test('2. Action Surfaces: Accept, Adjust (Dialog & Diff), no Why action, Dismiss (Quiet State)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const suffix = isMobile ? 'mobile' : 'desktop';

    await page.goto('/?ui=v2&scene=clear&test=1');
    await page.waitForSelector('.now-card');

    // (a) Accept and Undo Accept
    const acceptBtn = page.locator('#btn-accept');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    const acceptedBadge = page.locator('.badge-accepted');
    await expect(acceptedBadge).toBeVisible();
    const undoAcceptBtn = page.locator('#btn-undo-accept');
    await expect(undoAcceptBtn).toBeVisible();

    await undoAcceptBtn.click();
    await expect(acceptedBadge).not.toBeVisible();
    await expect(acceptBtn).toBeVisible();

    // (b) Adjust Dialog & Plan Diff
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustDialog = page.locator('#adjust-dialog');
    await expect(adjustDialog).toBeVisible();
    await saveEvidence(page, `05-action-adjust-dialog-${suffix}.png`);

    // Adjust buffer minutes from 5 to 15
    const bufferInput = page.locator('#input-buffer-minutes');
    await bufferInput.fill('15');
    const applyBtn = page.locator('#btn-adjust-for-today');
    await applyBtn.click();

    // Dialog closed, diff banner shown on Home
    await expect(adjustDialog).not.toBeVisible();
    const diffBanner = page.locator('#plan-diff-banner');
    await expect(diffBanner).toBeVisible();
    await expect(diffBanner).toContainText('UPDATED');

    // Undo adjust
    await undoAcceptBtn.click();
    await expect(diffBanner).not.toBeVisible();

    // (c) HABIT-LEARN addendum 2: no Why action or Why sheet on the action surface
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet')).toHaveCount(0);

    // (d) Dismiss Plan to Quiet Empty State (NOT-NOW-ONE-TAP: one tap dismisses without modal)
    const dismissBtn = page.locator('#btn-dismiss');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // View transitions to honest quiet state; dialog does not open
    await expect(page.locator('#dismiss-dialog-backdrop')).toHaveCount(0);
    const quietCard = page.locator('.quiet-card');
    await expect(quietCard).toBeVisible();
    await expect(page.locator('.quiet-title')).toContainText('Nothing needs your attention right now.');
    await saveEvidence(page, `07-action-dismiss-quiet-state-${suffix}.png`);
  });

  test('2b. Adjust with unchanged values produces no diff banner and no false update', async ({
    page,
  }) => {
    await page.goto('/?ui=v2&scene=rain&test=1');
    await page.waitForSelector('.now-card');

    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustDialog = page.locator('#adjust-dialog');
    await expect(adjustDialog).toBeVisible();

    // Default values in adjust dialog match current plan (prep 20, buffer 5)
    // Apply without changing values
    const applyBtn = page.locator('#btn-adjust-for-today');
    await applyBtn.click();

    await expect(adjustDialog).not.toBeVisible();

    // Invariant: no false UPDATED banner is rendered when timing is unchanged
    const diffBanner = page.locator('#plan-diff-banner');
    await expect(diffBanner).not.toBeVisible();

    // No undo button either since no history state was pushed
    const undoBtn = page.locator('#btn-undo-accept');
    await expect(undoBtn).not.toBeVisible();
  });

  test('3. Motion Tokens and Reduced-Motion Parity', async ({ page }) => {
    await page.goto('/?ui=v2&scene=clear&test=1');
    await page.waitForSelector('.now-card');

    // Check default motion tokens
    const motionTokens = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        fast: rootStyle.getPropertyValue('--motion-fast').trim(),
        base: rootStyle.getPropertyValue('--motion-base').trim(),
      };
    });
    expect(['120ms', '.12s', '0.12s']).toContain(motionTokens.fast);
    expect(['200ms', '.2s', '0.2s']).toContain(motionTokens.base);

    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Verify computed transition-duration is 0s
    const durations = await page.evaluate(() => {
      const card = document.querySelector('.now-card');
      const ask = document.querySelector('#ask-bar');
      return {
        cardTransition: card ? getComputedStyle(card).transitionDuration : null,
        askTransition: ask ? getComputedStyle(ask).transitionDuration : null,
      };
    });
    expect(durations.cardTransition).toBe('0s');
    expect(durations.askTransition).toBe('0s');
  });

  test('4. Honest Loading Skeleton Pattern', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const suffix = isMobile ? 'mobile' : 'desktop';

    // Delay /api/weather/status by 600ms so skeleton is observable
    await page.route('/api/weather/status', async route => {
      await new Promise(r => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, provider: 'open-meteo' }),
      });
    });

    await page.goto('/?ui=v2&scene=clear&test=1');

    // Skeleton should be visible while request is pending
    const skeleton = page.locator('#loading-skeleton');
    await expect(skeleton).toBeVisible();
    await saveEvidence(page, `08-loading-skeleton-${suffix}.png`);

    // Once request fulfills, skeleton disappears and normal card is visible
    await expect(skeleton).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('.now-card')).toBeVisible();
  });

  test('5. Fail-Closed Error Notice Pattern', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const suffix = isMobile ? 'mobile' : 'desktop';

    // Return HTTP 500 for weather status
    await page.route('/api/weather/status', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Weather provider internal server error' }),
      });
    });

    await page.goto('/?ui=v2&scene=clear&test=1');

    // Error notice must be displayed
    const errorNotice = page.locator('#weather-error-notice');
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText('Weather service unavailable · showing your last plan');

    // Invariant: prior plan card must remain visible (never hidden by error notice)
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await saveEvidence(page, `09-degraded-error-notice-${suffix}.png`);
  });

  test('6. Accessibility, Ergonomics & Zero Overflow', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const suffix = isMobile ? 'mobile' : 'desktop';

    await page.goto('/?ui=v2&scene=clear&test=1');
    await page.waitForSelector('.now-card');

    // Axe WCAG 2.1 AA check
    await checkAxe(page, `Home view ${suffix}`);

    // Zero horizontal scroll
    await checkNoHorizontalScroll(page);

    // Touch target sizes >= 44x44px for primary buttons
    const buttonsToCheck = ['#btn-accept', '#btn-adjust', '#btn-dismiss', '#ask-bar'];
    await expect(page.locator('#btn-why')).toHaveCount(0); // HABIT-LEARN addendum 2
    for (const selector of buttonsToCheck) {
      const btn = page.locator(selector);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box, `Button ${selector} should have a bounding box`).not.toBeNull();
        if (box) {
          expect(box.height, `Button ${selector} height >= 44px`).toBeGreaterThanOrEqual(44);
          expect(box.width, `Button ${selector} width >= 44px`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});
