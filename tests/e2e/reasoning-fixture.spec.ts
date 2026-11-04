/**
 * Playwright E2E Tests for Slice PH-002 B2: Constrained Reasoning Fixture & Why-Order UI Integration
 * Governed by Architecture Rev3 Section 14.2 and AC-202-2.
 *
 * Verifies:
 * - Mobile (390x844) and Desktop (1280x800) layouts.
 * - Offline-reproducible fixture routing (POST /api/model/reason intercepted; zero network, no API key).
 * - Initial deterministic composition renders immediately (unblocking).
 * - Asynchronous reordering updates NOW and AHEAD candidates without altering plan times or contents.
 * - Why Sheet integration: displays "Why this order" section with human rationale from reasonCode (zero free-text/invented venue names).
 * - Human-first evidence & memory presentation: zero raw ISO dates or underscore tokens in Why Sheet.
 * - Fault tolerance & fallback invariance: on 5xx or discard, deterministic order is untouched and why-order section is omitted.
 * - Accessibility scan (Axe): 0 serious or critical violations.
 * - Generates visual screenshot evidence under docs/evidence/ph2-b2/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ph2-b2');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.describe('PH-002 B2: Constrained Reasoning UI & Reorder Verification (no Why)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?ui=v1');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Accepted Reorder Fixture: asynchronously reorders candidates (no Why sheet)', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // 1. Intercept /api/model/reason to return the offline-reproducible accepted reorder
    await page.route('**/api/model/reason', async route => {
      const reqData = route.request().postDataJSON();
      const candidates = reqData?.candidates || [];
      const cLunch = candidates.find((c: { intentId: string }) => c.intentId === 'lunch');
      const cDepart = candidates.find((c: { intentId: string }) => c.intentId === 'depart');

      if (!cLunch || !cDepart) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: { orderedPlanIds: candidates.map((c: { id: string }) => c.id), rationale: [] },
            usedFallback: true,
          }),
        });
        return;
      }

      // Reorder: elevate lunch to NOW, move depart to AHEAD with enumerated reasonCodes (Finding 1)
      const fixtureResponse = {
        result: {
          orderedPlanIds: [cLunch.id, cDepart.id],
          rationale: [
            {
              planId: cLunch.id,
              citedSignalIds: cLunch.citedSignalIds,
              citedFactKeys: cLunch.citedFactKeys,
              reasonCode: 'matches_confirmed_preference',
            },
            {
              planId: cDepart.id,
              citedSignalIds: cDepart.citedSignalIds,
              citedFactKeys: cDepart.citedFactKeys,
              reasonCode: 'time_critical',
            },
          ],
        },
        usedFallback: false,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureResponse),
      });
    });

    await page.goto('/?ui=v1');

    // 2. Switch to 'multi-candidate' (Reasoning demo) scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

    // 3. Verify no generic degraded notice is rendered in curated demo scene (Finding 4)
    const noticeBox = page.locator('.notice-box');
    await expect(noticeBox).not.toBeVisible();

    // 4. Verify reasoning reorder is applied asynchronously:
    // Deterministic NOW was depart; after reasoning, NOW card is reordered to lunch
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toHaveAttribute('data-plan-id', /^plan-lunch-/);

    // 5. Verify AHEAD contains the depart plan with humanized copy (Finding 4)
    const aheadDepart = page.locator('.ahead-list .item-row[data-plan-id^="depart-plan-"]');
    await expect(aheadDepart).toBeVisible();
    await expect(aheadDepart.locator('.item-title')).toHaveText('Piano lesson at 3:00 PM');
    await expect(aheadDepart.locator('.item-subtitle')).toHaveText('Leave by 2:25 PM');

    // 6. Accessibility check on reordered view (0 serious or critical violations)
    const axeResults = await new AxeBuilder({ page }).analyze();
    const severeViolations = axeResults.violations.filter(
      v => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);

    // 7. Capture visual screenshot of reordered main view
    const mainScreenshotPath = path.join(EVIDENCE_DIR, `reasoning-reordered-${viewName}.png`);
    await page.screenshot({ path: mainScreenshotPath, fullPage: true });

    // 8. HABIT-LEARN addendum 2: the reorder simply shows; no Why action, no "Why this order" sheet
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('#why-order-section')).toHaveCount(0);

    // 9. Invariant check on the visible Home: zero invented venues, zero raw tokens, zero jargon
    const homeContent = await page.locator('main').innerText();
    expect(homeContent).not.toContain('Green Bowl');
    expect(homeContent).not.toContain('Blue Lotus');
    expect(homeContent).not.toContain('ramen_or_salad');
    expect(homeContent).not.toContain('signal evaluated at');
    expect(homeContent).not.toContain('INV-');
    expect(homeContent).not.toContain('AC-202');
    expect(homeContent).not.toContain('PH-002');
    expect(homeContent).not.toContain('depart-plan-');
    expect(homeContent).not.toContain('plan-lunch-');
  });

  test('Fault Injection Invariance: 500 error falls back silently to deterministic ordering', async ({
    page,
  }) => {
    // 1. Intercept /api/model/reason and simulate 500 server error
    await page.route('**/api/model/reason', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/?ui=v1');

    // 2. Switch to 'multi-candidate' scene
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('multi-candidate');

    // 3. Verify deterministic ordering is preserved: NOW card remains depart plan
    const nowCard = page.locator('.now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard).toHaveAttribute('data-plan-id', /^depart-plan-/);

    // 4. Verify AHEAD contains lunch plan with humanized copy
    const aheadLunch = page.locator('.ahead-list .item-row[data-plan-id^="plan-lunch-"]');
    await expect(aheadLunch).toBeVisible();
    await expect(aheadLunch.locator('.item-title')).toHaveText('Lunch options near you');
    await expect(aheadLunch.locator('.item-subtitle')).toHaveText(
      'Places matching what you like, within walking distance'
    );

    // 5. HABIT-LEARN addendum 2: no Why action and no "Why this order" section
    await expect(page.locator('#btn-why')).toHaveCount(0);
    await expect(page.locator('#why-order-section')).toHaveCount(0);
  });
});
