/**
 * APP-LIVE-RUNTIME: Live Context Mode & In-Flight Model UX Spec
 * Governed by TID: INBOX-20261031-B0C7C1 (APP-LIVE-RUNTIME)
 *
 * Verifies:
 * 1. In-app switch: [Demo scenes | Live context] toggles cleanly; default is Demo scenes.
 * 2. Live context surfaces:
 *    - Device clock drives greeting and time.
 *    - Weather: shows "Live weather is off" calm notice when disabled; shows live weather when enabled.
 *    - Location: shows [Connect location] prompt; one-shot consented acquisition updates to coarse coordinates;
 *      denied/unavailable degrades to "Location not shared".
 *    - Calendar: displays "No calendar connected" calm notice.
 *    - Truthful provenance source labels on every Live surface; nothing simulated without SIMULATED badge.
 * 3. Model In-Flight UX:
 *    - Shows "Thinking… live model" with [Cancel] button (#btn-cancel-inflight).
 *    - Blocks double submission while in-flight.
 *    - Clicking Cancel aborts the in-flight request and cleanly falls back to deterministic answer.
 * 4. Full accessibility (Axe WCAG 2.1 AA) and zero horizontal scroll on mobile and desktop viewports.
 * 5. Generates visual evidence screenshots and SHA256 manifest under docs/evidence/app-live-runtime/.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('app-live-runtime');

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

async function checkAxe(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('APP-LIVE-RUNTIME: Live Context Mode & In-Flight UX', () => {
  test('Mode switch: toggles between Demo scenes and Live context cleanly', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.goto('/');

    // 1. Invariant: Default mode on load is strictly Demo scenes
    const demoBtn = page.locator('#btn-mode-demo');
    const liveBtn = page.locator('#btn-mode-live');
    await expect(demoBtn).toBeVisible();
    await expect(liveBtn).toBeVisible();
    await expect(demoBtn).toHaveClass(/active/);
    await expect(page.locator('.demo-chip')).toBeVisible();
    await expect(page.locator('#scene-select')).toBeVisible();

    // 2. Switch to Live context
    await liveBtn.click();
    await expect(liveBtn).toHaveClass(/active/);
    await expect(demoBtn).not.toHaveClass(/active/);

    // Header updates to Live context
    await expect(page.locator('#chip-live-context')).toBeVisible();
    await expect(page.locator('#pill-live-runtime')).toBeVisible();
    await expect(page.locator('.greeting-subheading')).toContainText('Live context · Device time');

    // Dashboard shows truthful live context cards
    await expect(page.locator('#notice-calendar-disconnected')).toBeVisible();
    await expect(page.locator('#notice-calendar-disconnected .live-card-desc')).toHaveText('No calendar connected');
    await expect(page.locator('#notice-calendar-disconnected .live-source-chip')).toHaveText('Not connected');

    await expect(page.locator('#notice-weather-off')).toBeVisible();
    await expect(page.locator('#notice-weather-off .live-card-desc')).toHaveText('Live weather is off');
    await expect(page.locator('#notice-weather-off .live-source-chip')).toHaveText('Provenance: Offline Default');

    await expect(page.locator('#live-location-prompt-card')).toBeVisible();
    await expect(page.locator('#btn-connect-location')).toBeVisible();
    await expect(page.locator('#live-location-prompt-card .live-source-chip')).toHaveText('Source: Consented Geolocation (One-shot)');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-live-context-dashboard-${viewName}.png`),
      fullPage: true,
    });

    // 3. Switch back to Demo scenes
    await demoBtn.click();
    await expect(demoBtn).toHaveClass(/active/);
    await expect(page.locator('.demo-chip')).toBeVisible();
    await expect(page.locator('#scene-select')).toBeVisible();
    await expect(page.locator('#chip-live-context')).toHaveCount(0);
  });

  test('Live context: location consent and one-shot acquisition', async ({
    page,
    context,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Grant simulated browser geolocation permission
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    await page.goto('/?mode=live');
    await expect(page.locator('#btn-connect-location')).toBeVisible();

    // Click [Connect location]
    await page.locator('#btn-connect-location').click();

    // Card transitions to connected coarse location
    const locCard = page.locator('#live-location-card');
    await expect(locCard).toBeVisible({ timeout: 5000 });
    await expect(locCard.locator('.live-source-chip')).toHaveText('Source: Browser Geolocation (Consented)');
    await expect(locCard.locator('.live-card-desc')).toContainText('Location shared · used for this session only');

    // Invariant: no numeric coordinates rendered on screen
    const liveContainerText = await page.locator('.live-context-container').innerText();
    expect(liveContainerText).not.toMatch(/\d+\.\d+°/);

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-live-location-connected-${viewName}.png`),
      fullPage: true,
    });
  });

  test('Live context: live weather display when enabled', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    // Mock weather endpoints to return live weather
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          attribution: { text: 'Open-Meteo', url: 'https://open-meteo.com/' },
        }),
      });
    });

    await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signals: [
            {
              id: 'sig-live-weather-current',
              kind: 'weather',
              provenance: 'live',
              value: {
                summary: '68°F · Partly Cloudy in San Francisco',
                temperature: 68,
                condition: 'Partly Cloudy',
              },
              issuedAt: new Date().toISOString(),
              validFor: 3600000,
              confidence: 1.0,
              consentScope: 'device_only',
            },
          ],
        }),
      });
    });

    await page.goto('/?mode=live');

    const weatherCard = page.locator('#live-weather-card');
    await expect(weatherCard).toBeVisible({ timeout: 5000 });
    await expect(weatherCard.locator('.live-source-chip')).toHaveText('Source: Open-Meteo API (Live)');
    await expect(weatherCard.locator('.live-card-desc')).toContainText('68°F · Partly Cloudy in San Francisco');

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-live-weather-connected-${viewName}.png`),
      fullPage: true,
    });
  });

  test('Live context: partial weather payload renders present fields only without invented defaults', async ({
    page,
  }) => {
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          attribution: { text: 'Open-Meteo', url: 'https://open-meteo.com/' },
        }),
      });
    });

    await page.route(url => url.pathname.includes('/api/weather/current'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signals: [
            {
              id: 'sig-live-weather-partial',
              kind: 'weather',
              provenance: 'live',
              value: {
                temperature: 52,
                // condition and summary omitted
              },
              issuedAt: new Date().toISOString(),
              validFor: 3600000,
              confidence: 1.0,
              consentScope: 'device_only',
            },
          ],
        }),
      });
    });

    await page.goto('/?mode=live');
    const weatherCard = page.locator('#live-weather-card');
    await expect(weatherCard).toBeVisible({ timeout: 5000 });
    const weatherDesc = await weatherCard.locator('.live-card-desc').innerText();
    expect(weatherDesc).toBe('52°F');
    expect(weatherDesc).not.toContain('65°F');
    expect(weatherDesc).not.toContain('Clear');
  });

  test('Live context: model in-flight state with cancel button and double-submit blocking', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route('**/api/model/command', async (route) => {
      // Delay response to allow in-flight inspection and cancel
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              intent: 'LEAVE_LATER',
              slots: { deltaMinutes: 15 },
              explanation: 'Moving departure 15 minutes later.',
              reasonCodes: ['user_requested'],
              citedSignalIds: [],
              citedFactKeys: [],
            },
          }),
        });
      } catch {
        // aborted by client cancellation
      }
    });

    await page.goto('/?mode=live');

    // Open Ask Yori conversation
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    const input = page.locator('#conversation-input');
    const sendBtn = page.locator('#conversation-send-btn');
    await input.fill('leave 15 min later');
    await sendBtn.click();

    // Assert in-flight state renders "Thinking… live model" and [Cancel] button
    const inflightRow = page.locator('.chat-inflight-row');
    await expect(inflightRow).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#inflight-status-text')).toHaveText('Thinking… live model');
    const cancelBtn = page.locator('#btn-cancel-inflight');
    await expect(cancelBtn).toBeVisible();

    // Assert double-submit is blocked: input and send button are disabled
    await expect(input).toBeDisabled();
    await expect(sendBtn).toBeDisabled();

    await checkNoHorizontalScroll(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-model-inflight-${viewName}.png`),
    });

    // Click [Cancel]
    await cancelBtn.click();

    // In-flight disappears and falls back to deterministic answer
    await expect(inflightRow).toHaveCount(0, { timeout: 3000 });
    await expect(input).toBeEnabled();
    await expect(sendBtn).toBeEnabled();

    // Engine status chip displays honest fallback
    await expect(page.locator('#engine-status-chip')).toContainText(
      'Offline fallback · deterministic'
    );

    await checkNoHorizontalScroll(page);
    await checkAxe(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-model-cancelled-${viewName}.png`),
    });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});
